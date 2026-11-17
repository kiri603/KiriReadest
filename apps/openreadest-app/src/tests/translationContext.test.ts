import { describe, expect, it } from 'vitest';
import { extractSelectionContext, isWordLikeSelection } from '@/utils/translationContext';

const doc = (html: string) => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

/** 在文档里找到第 occurrence 次出现的 text，并返回选中它的 Range */
function selectText(document: Document, text: string, occurrence = 0): Range {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let node = walker.nextNode();
  while (node) {
    const data = node.textContent || '';
    let index = data.indexOf(text);
    while (index !== -1) {
      if (seen === occurrence) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + text.length);
        return range;
      }
      seen += 1;
      index = data.indexOf(text, index + 1);
    }
    node = walker.nextNode();
  }
  throw new Error(`text not found in document: ${text}`);
}

describe('extractSelectionContext', () => {
  it('returns the sentence that contains the selected word', () => {
    const document = doc('<p>He went to the bank to deposit money. She waited outside.</p>');
    const context = extractSelectionContext(selectText(document, 'bank'));

    expect(context).not.toBeNull();
    expect(context!.word).toBe('bank');
    expect(context!.sentence).toBe('He went to the bank to deposit money.');
    expect(context!.previousSentence).toBeUndefined();
    expect(context!.paragraph).toContain('She waited outside.');
  });

  it('returns the previous sentence so pronouns in the current sentence stay resolvable', () => {
    const document = doc('<p>The old man was tired. He sat on the bank of the river.</p>');
    const context = extractSelectionContext(selectText(document, 'bank'), 'bank');

    expect(context!.sentence).toBe('He sat on the bank of the river.');
    expect(context!.previousSentence).toBe('The old man was tired.');
  });

  it('does not split sentences at common abbreviations', () => {
    const document = doc('<p>Mr. Smith went to the bank. She stayed at home.</p>');
    expect(extractSelectionContext(selectText(document, 'bank'))!.sentence).toBe(
      'Mr. Smith went to the bank.',
    );
  });

  it('handles CJK sentence punctuation', () => {
    const document = doc('<p>他去银行办理业务。然后回家了。</p>');
    const context = extractSelectionContext(selectText(document, '银行'));

    expect(context!.sentence).toBe('他去银行办理业务。');
    expect(context!.previousSentence).toBeUndefined();
  });

  it('measures offsets across inline markup instead of only the text node', () => {
    const document = doc('<p>He sat on the <em>ba</em>nk of the river.</p>');
    const em = document.querySelector('em')!;
    const range = document.createRange();
    range.setStart(em.firstChild!, 0);
    range.setEnd(em.nextSibling!, 2);

    const context = extractSelectionContext(range);
    expect(context!.word).toBe('bank');
    expect(context!.sentence).toBe('He sat on the bank of the river.');
  });

  it('keeps context inside the block that owns the selection', () => {
    const document = doc('<p>First paragraph.</p><p>Second paragraph with a bank.</p>');
    const context = extractSelectionContext(selectText(document, 'bank'));

    expect(context!.sentence).toBe('Second paragraph with a bank.');
    expect(context!.previousSentence).toBeUndefined();
    expect(context!.paragraph).not.toContain('First paragraph');
  });

  it('excludes ruby readings from the word, sentence, previous sentence and paragraph', () => {
    const document = doc(
      '<p><ruby>前<rt>まえ</rt></ruby>の話。' +
        'それまで無関係を<ruby>装<rp>（</rp><rt><span>よそお</span></rt><rp>）</rp></ruby>' +
        'っていた八奈見が、興味深そうに画面を<ruby>覗<rt>のぞ</rt></ruby>きこむ。</p>',
    );
    const range = document.createRange();
    range.setStart(document.querySelectorAll('ruby')[1]!.firstChild!, 0);
    range.setEnd(selectText(document, 'っていた').endContainer, 4);
    const context = extractSelectionContext(range);
    expect(context).toEqual({
      word: '装っていた',
      sentence: 'それまで無関係を装っていた八奈見が、興味深そうに画面を覗きこむ。',
      previousSentence: '前の話。',
      paragraph: '前の話。それまで無関係を装っていた八奈見が、興味深そうに画面を覗きこむ。',
    });
  });

  it('locates a repeated word using offsets after removing preceding ruby readings', () => {
    const document = doc(
      '<p><ruby>装<rt>よそお</rt></ruby>っていた。今も<ruby>装<rt>よそお</rt></ruby>っていた。</p>',
    );
    const range = selectText(document, 'っていた', 1);
    const context = extractSelectionContext(range);
    expect(context!.word).toBe('っていた');
    expect(context!.sentence).toBe('今も装っていた。');
    expect(context!.previousSentence).toBe('装っていた。');
  });

  it('truncates very long paragraphs and marks both cut sides', () => {
    const long = `${'A sentence before. '.repeat(60)}The bank stood there. ${'More filler. '.repeat(80)}`;
    const document = doc(`<p>${long}</p>`);
    const context = extractSelectionContext(selectText(document, 'bank'));

    expect(context!.paragraph.startsWith('…')).toBe(true);
    expect(context!.paragraph.endsWith('…')).toBe(true);
    expect(context!.paragraph.length).toBeLessThanOrEqual(1201);
  });

  it('returns null for collapsed ranges, empty blocks, and detached nodes', () => {
    const document = doc('<p>bank</p>');
    const collapsed = document.createRange();
    collapsed.setStart(document.querySelector('p')!.firstChild!, 1);
    expect(extractSelectionContext(collapsed)).toBeNull();

    const blank = doc('<p>   </p>');
    const blankRange = blank.createRange();
    blankRange.setStart(blank.querySelector('p')!.firstChild!, 0);
    blankRange.setEnd(blank.querySelector('p')!.firstChild!, 3);
    expect(extractSelectionContext(blankRange)).toBeNull();

    const detached = document.createElement('p');
    detached.textContent = 'bank';
    const detachedRange = document.createRange();
    detachedRange.setStart(detached.firstChild!, 0);
    detachedRange.setEnd(detached.firstChild!, 4);
    expect(extractSelectionContext(detachedRange)).toBeNull();
  });
});

describe('isWordLikeSelection', () => {
  it('accepts single words and short phrases', () => {
    expect(isWordLikeSelection('bank')).toBe(true);
    expect(isWordLikeSelection('  Bank  ')).toBe(true);
    expect(isWordLikeSelection('bank of the river', 3)).toBe(false);
    expect(isWordLikeSelection('give up')).toBe(true);
    expect(isWordLikeSelection("can't")).toBe(true);
    expect(isWordLikeSelection('well-known')).toBe(true);
    expect(isWordLikeSelection('河岸')).toBe(true);
    expect(isWordLikeSelection('café')).toBe(true);
  });

  it('rejects sentences, numbers, punctuation and overly long input', () => {
    expect(isWordLikeSelection('He sat on the bank of the river.')).toBe(false);
    expect(isWordLikeSelection('123')).toBe(false);
    expect(isWordLikeSelection('...')).toBe(false);
    expect(isWordLikeSelection('')).toBe(false);
    expect(isWordLikeSelection('a'.repeat(41))).toBe(false);
    expect(isWordLikeSelection('bank!')).toBe(false);
  });
});
