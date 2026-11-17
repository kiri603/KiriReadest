/**
 * 从选区（DOM Range）中提取「上下文」：目标词所在的句子、前一句、所在段落。
 *
 * 翻译一个词时，孤立的一个词必然一词多义（bank = 银行 / 河岸），
 * 只有把它放回句子和段落里才能判断到底取哪个义项。
 *
 * 该文件只做纯 DOM 读取，不发起任何网络请求，方便单元测试。
 */

import { getTextFromRange } from './sel';

export interface SelectionContext {
  /** 用户选中的文本（已折叠空白） */
  word: string;
  /** 目标词所在的句子（包含目标词本身） */
  sentence: string;
  /** 紧挨着的上一句，用于回指、时态等语境判断 */
  previousSentence?: string;
  /** 目标词所在的段落（围绕目标词截断，避免过长） */
  paragraph: string;
}

/** 视为「段落级」的标签；选区所在的最近一个块级元素就是上下文段落 */
const BLOCK_TAGS = [
  'p',
  'li',
  'dd',
  'dt',
  'blockquote',
  'figcaption',
  'td',
  'th',
  'caption',
  'section',
  'article',
  'aside',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'div',
].join(',');

/** 句末标点（含中日文标点与换行） */
const SENTENCE_END = /[.!?。！？…\n\u2028\u2029]/;

/** 常见缩写，避免把 "Mr. Smith" 切成两句 */
const ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'st',
  'jr',
  'sr',
  'vs',
  'etc',
  'no',
  'fig',
  'al',
  'inc',
  'ltd',
  'u.s',
  'a.m',
  'p.m',
  'e.g',
  'i.e',
]);

const PARAGRAPH_BEFORE = 400;
const PARAGRAPH_AFTER = 800;
const PARAGRAPH_LIMIT = 1200;

/** 折叠空白，便于展示与提示词拼接 */
export function normalizeContextText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** 判断句点是否属于缩写而不是句末 */
function isAbbreviationDot(text: string, index: number): boolean {
  if (text[index] !== '.') return false;
  const before = text.slice(Math.max(0, index - 8), index).toLowerCase();
  const token = before.split(/[^a-z.]/).pop() || '';
  // 单字母缩写（如 "J. K. Rowling"）也按缩写处理
  return ABBREVIATIONS.has(token) || /^[a-z]$/.test(token);
}

function isSentenceBoundary(text: string, index: number): boolean {
  const char = text[index];
  if (!char) return false;
  if (!SENTENCE_END.test(char)) return false;
  return !isAbbreviationDot(text, index);
}

/** 向左找句子起点（跳过缩写句点） */
function findSentenceStart(text: string, from: number): number {
  let start = from;
  while (start > 0) {
    if (isSentenceBoundary(text, start - 1)) break;
    start -= 1;
  }
  return start;
}

/** 向右找句子终点（含句末标点） */
function findSentenceEnd(text: string, from: number): number {
  let end = from;
  while (end < text.length) {
    if (isSentenceBoundary(text, end)) {
      end += 1;
      break;
    }
    end += 1;
  }
  return end;
}

/**
 * 计算 Range 起点/终点在 root 文本中的字符偏移。
 * 与正文使用同样的注音过滤，保证字符偏移不会被 rt/rp/rtc 文本挤偏。
 */
function measureOffsets(range: Range, root: Element): { start: number; end: number } | null {
  const doc = root.ownerDocument;
  if (!doc) return null;
  const prefix = doc.createRange();
  prefix.setStart(root, 0);
  prefix.setEnd(range.startContainer, range.startOffset);
  const start = getTextFromRange(prefix).length;
  prefix.setEnd(range.endContainer, range.endOffset);
  const end = getTextFromRange(prefix).length;
  return { start, end };
}

/**
 * 提取与选区相关的上下文。任何异常都返回 null，调用方按「无上下文」处理，
 * 绝不能让查词弹窗因为上下文提取失败而崩溃。
 */
export function extractSelectionContext(
  range: Range,
  selectedText?: string,
): SelectionContext | null {
  try {
    if (!range || range.collapsed) return null;
    const anchor =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : (range.startContainer as HTMLElement | null);
    if (!anchor) return null;
    const block = (anchor.closest(BLOCK_TAGS) as HTMLElement | null) || anchor;
    if (!block.isConnected) return null;

    const paragraphRange = block.ownerDocument.createRange();
    paragraphRange.selectNodeContents(block);
    const raw = getTextFromRange(paragraphRange);
    if (!raw.trim()) return null;

    const offsets = measureOffsets(range, block);
    if (!offsets) return null;

    const word = normalizeContextText(selectedText ?? getTextFromRange(range));
    if (!word) return null;
    const sentenceStart = findSentenceStart(raw, offsets.start);
    const sentenceEnd = findSentenceEnd(raw, Math.max(offsets.end, offsets.start));
    const sentence = normalizeContextText(raw.slice(sentenceStart, sentenceEnd)) || word;

    // 上一句：先跳过本句起点前的空白，再从上一句句末标点处往回找句首
    let trimmedEnd = sentenceStart;
    while (trimmedEnd > 0 && /\s/.test(raw[trimmedEnd - 1] || '')) trimmedEnd -= 1;
    const previousStart = trimmedEnd > 0 ? findSentenceStart(raw, trimmedEnd - 1) : trimmedEnd;
    const previousRaw = trimmedEnd > 0 ? raw.slice(previousStart, trimmedEnd) : '';
    const previousSentence = normalizeContextText(previousRaw) || undefined;

    const windowStart = Math.max(0, sentenceStart - PARAGRAPH_BEFORE);
    const windowEnd = Math.min(raw.length, sentenceEnd + PARAGRAPH_AFTER);
    let paragraph = normalizeContextText(raw.slice(windowStart, windowEnd));
    if (windowStart > 0) paragraph = `…${paragraph}`;
    if (windowEnd < raw.length) paragraph = `${paragraph}…`;
    if (paragraph.length > PARAGRAPH_LIMIT) paragraph = `${paragraph.slice(0, PARAGRAPH_LIMIT)}…`;

    return { word, sentence, previousSentence, paragraph };
  } catch (error) {
    console.warn('Failed to extract translation context:', error);
    return null;
  }
}

/**
 * 判断选区是否「像单词/词组」，从而值得做语境释义。
 * 整句、整段的选择直接走普通翻译，不需要逐词辨析。
 */
export function isWordLikeSelection(text: string, maxWords = 3): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 40) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > maxWords) return false;
  // 纯数字不算单词
  if (/^[\p{N}\p{P}\s]+$/u.test(trimmed)) return false;
  // 只允许文字、数字、连字符、撇号这类词内符号
  return words.every((word) => /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}'’‘\-]*$/u.test(word));
}
