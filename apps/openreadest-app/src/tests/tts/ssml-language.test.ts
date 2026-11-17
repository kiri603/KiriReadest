import { describe, expect, it } from 'vitest';
import { filterSSMLWithLang, parseSSMLMarks } from '@/utils/ssml';

describe('TTS language filtering', () => {
  const mixed =
    '<speak xml:lang="zh"><mark name="a"/>这是中文。<mark name="b"/>これは日本語です。<lang xml:lang="en"><mark name="c"/>Hello.</lang></speak>';

  it('reads only Chinese sentences without keeping Japanese or English', () => {
    const result = parseSSMLMarks(filterSSMLWithLang(mixed, 'zh-CN'));
    expect(result.marks.map((mark) => mark.text)).toEqual(['这是中文。']);
  });

  it('finds Japanese sentences even when the book language is Chinese', () => {
    const result = parseSSMLMarks(filterSSMLWithLang(mixed, 'ja'));
    expect(result.marks.map((mark) => [mark.name, mark.text, mark.language])).toEqual([
      ['b', 'これは日本語です。', 'ja'],
    ]);
  });

  it('keeps an empty speak container when no language matches', () => {
    const result = filterSSMLWithLang(mixed, 'fr');
    expect(result).toContain('<speak');
    expect(parseSSMLMarks(result).marks).toEqual([]);
    expect(parseSSMLMarks(result).plainText).toBe('');
  });

  it('uses the book language for ambiguous Han-only text', () => {
    const result = filterSSMLWithLang('<speak><mark name="a"/>東京</speak>', 'ja', 'ja');
    expect(parseSSMLMarks(result, 'ja').marks[0]?.language).toBe('ja');
  });

  it('respects explicit and nested language tags and preserves marks', () => {
    const ssml =
      '<speak xml:lang="en"><lang xml:lang="ja"><mark name="a"/>東京<lang xml:lang="zh-TW"><mark name="b"/>學生</lang><mark name="c"/>大阪</lang></speak>';
    const result = parseSSMLMarks(filterSSMLWithLang(ssml, 'jpn'));
    expect(result.marks.map((mark) => [mark.name, mark.text, mark.language])).toEqual([
      ['a', '東京', 'ja'],
      ['c', '大阪', 'ja'],
    ]);
  });

  it('does not filter when all languages are selected', () => {
    expect(filterSSMLWithLang(mixed, '')).toBe(mixed);
  });

  it('does not apply a nested language tag to the rest of the paragraph', () => {
    const ssml =
      '<speak><lang xml:lang="ja"><mark name="a"/>東京</lang><mark name="b"/>中文</speak>';
    expect(parseSSMLMarks(filterSSMLWithLang(ssml, 'zh')).marks.map((mark) => mark.text)).toEqual([
      '中文',
    ]);
  });
});
