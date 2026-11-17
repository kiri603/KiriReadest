import { describe, expect, it } from 'vitest';
import { getTextFromRange } from '@/utils/sel';

const select = (html: string, selector = 'p') => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const range = doc.createRange();
  range.selectNodeContents(doc.querySelector(selector)!);
  return range;
};

describe('reading text from selections with ruby', () => {
  it('keeps the base text and ordinary kana, excluding readings and fallback parentheses', () => {
    const range = select('<p><ruby>装<rp>（</rp><rt>よそお</rt><rp>）</rp></ruby>っていた</p>');
    expect(getTextFromRange(range)).toBe('装っていた');
  });

  it('excludes nested readings and secondary ruby annotations', () => {
    const range = select(
      '<p><ruby><rb>装</rb><rt><span>よそお</span></rt><rtc>よそおう</rtc></ruby>っていた</p>',
    );
    expect(getTextFromRange(range)).toBe('装っていた');
  });

  it('returns no text when the selection is entirely inside a reading', () => {
    const range = select('<p><ruby>装<rt><span>よそお</span></rt></ruby></p>', 'rt span');
    expect(getTextFromRange(range)).toBe('');
  });

  it('ignores formatting whitespace around ruby base text in EPUB markup', () => {
    const range = select('<p><ruby>\n    装\n    <rt>よそお</rt></ruby>っていた</p>');
    expect(getTextFromRange(range)).toBe('装っていた');
  });

  it('preserves selected offsets across base text and inline tags', () => {
    const range = select('<p>前<ruby>装<rt>よそお</rt></ruby><em>って</em>いた後</p>');
    const p = range.startContainer;
    range.setStart(p.childNodes[1]!.firstChild!, 0);
    range.setEnd(p.childNodes[3]!, 2);
    expect(getTextFromRange(range)).toBe('装っていた');
  });
});
