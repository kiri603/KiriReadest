const combinedAttribute = 'data-reader-combined-text';
const skipSelector = `[${combinedAttribute}], script, style, pre, code, kbd, samp, textarea, svg, math, rt, rp, rtc`;
// Keep English phrases, hyphenated words, and formatted numbers together.
const westernRun =
  /[\p{Script=Latin}\p{Mark}0-9０-９]+(?:(?:['’‑-]|[ \t]+)[\p{Script=Latin}\p{Mark}0-9０-９]+|[.,．，:：/][0-9０-９]+)*/gu;
const shortRun = /^(?:[0-9０-９]{1,2}|[A-Za-z]|[A-Z]{2,3})$/;

export const applyVerticalTypography = (root: HTMLElement) => {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  if (!view) return;

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const runsToCombine: { text: Text; matches: RegExpExecArray[] }[] = [];
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    const matches = [...text.data.matchAll(westernRun)].filter(([run]) => shortRun.test(run));
    const parent = text.parentElement;
    if (!matches.length || !parent || parent.closest(skipSelector)) continue;

    const style = view.getComputedStyle(parent);
    if (
      !style.writingMode.startsWith('vertical-') ||
      (style.textCombineUpright && style.textCombineUpright !== 'none') ||
      style.textOrientation === 'upright' ||
      style.textOrientation === 'sideways'
    ) {
      continue;
    }
    runsToCombine.push({ text, matches });
  }

  for (const { text, matches } of runsToCombine) {
    const content = doc.createDocumentFragment();
    let offset = 0;
    for (const { 0: run, index } of matches) {
      if (index > offset) content.append(text.data.slice(offset, index));
      const combined = doc.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      combined.setAttribute(combinedAttribute, '');
      combined.setAttribute('cfi-skip', '');
      combined.style.textCombineUpright = 'all';
      combined.textContent = run;
      content.append(combined);
      offset = index + run.length;
    }
    if (offset < text.length) content.append(text.data.slice(offset));
    text.replaceWith(content);
  }
};
