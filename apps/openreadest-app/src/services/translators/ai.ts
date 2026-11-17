/**
 * 语境翻译（AI）服务：把「词 + 它所在的句子/段落」一起交给大模型，
 * 让模型回答「这个词在这里是什么意思」，而不是给出一个脱离语境的词典义项。
 *
 * 只依赖 OpenAI 兼容的 /chat/completions 接口，因此 DeepSeek、Kimi、硅基流动、
 * 通义、OpenAI，以及本地 Ollama / LM Studio 都能直接用。
 * 没有配置时调用方会自动降级到免费机器翻译（见比以前 TranslatorPopup 的行为）。
 */
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isTauriAppPlatform } from '@/services/environment';
import { TRANSLATOR_LANGS } from '@/services/constants';
import type { AiTranslationSettings } from '@/types/settings';
import type { SelectionContext } from '@/utils/translationContext';

export type AiErrorCode = 'not-configured' | 'network' | 'http' | 'parse';

export class AiTranslationError extends Error {
  readonly code: AiErrorCode;

  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = 'AiTranslationError';
    this.code = code;
  }
}

/** 单词/短语在上下文中的义项 */
export interface WordMeaning {
  word: string;
  /** 音标或读音，模型不确定时为空 */
  reading?: string;
  /** 词性，如 n. / v. / adj. */
  partOfSpeech?: string;
  /** 语境义（目标语言） */
  meaning: string;
  /** 整句译文 */
  sentenceTranslation?: string;
  /** 一句话说明为什么取这个义项 */
  why?: string;
}

/** 整句/整段在上下文中的译文 */
export interface ContextTranslation {
  translation: string;
  note?: string;
}

export interface AiTranslateRequest {
  /** 选中的文本 */
  text: string;
  /** 上下文（可以只有句子） */
  context?: SelectionContext | null;
  sourceLang: string;
  targetLang: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const systemFetch = (): FetchLike => {
  const impl = isTauriAppPlatform() ? tauriFetch : window.fetch;
  return impl as unknown as FetchLike;
};

export const isAiConfigured = (settings?: Partial<AiTranslationSettings> | null): boolean => {
  if (!settings) return false;
  if (settings.enabled === false) return false;
  return Boolean(settings.baseUrl?.trim() && settings.apiKey?.trim() && settings.model?.trim());
};

/** 把用户填的 baseUrl 解析成 chat/completions 完整地址；宽容处理尾斜杠与完整路径 */
export function resolveChatCompletionsUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) return '';
  if (/\/chat\/completions$/i.test(base)) return base;
  return `${base}/chat/completions`;
}

/** 同样的 baseUrl 解析成模型列表地址（OpenAI 兼容的 GET /models） */
export function resolveModelsUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) return '';
  if (/\/chat\/completions$/i.test(base)) return base.replace(/\/chat\/completions$/i, '/models');
  return `${base}/models`;
}

const targetLanguageName = (targetLang: string): string => {
  if (!targetLang || targetLang === 'AUTO') return '中文';
  return TRANSLATOR_LANGS[targetLang] || targetLang;
};

const SYSTEM_WORD_PROMPT = [
  '你是一部双语词典的编纂者，也是一个熟悉语用学的翻译。',
  '用户会给你一个目标词（或短语），以及它所在的句子、可选的上一句和所在段落。',
  '你的任务是判断这个目标词**在当前句子中的那一个义项**，并且只输出该义项，不要罗列其它含义。',
  '注意：同一个词在不同语境下可能完全不同（例如 bank 可以是“银行”，也可以是“河岸”），',
  '必须依据句子里的搭配、主语、介词结构来判断。',
  '只输出一个 JSON 对象，不要输出任何解释性文字，也不要使用代码块标记。JSON 字段：',
  '{"word": "目标词原文", "reading": "音标或读音，不确定就留空", "partOfSpeech": "词性，如 n./v./adj.", ',
  '"meaning": "该词在此句中的释义（不超过 30 字）", "sentenceTranslation": "整句译文", ',
  '"why": "一句话说明为什么取这个义项（不超过 40 字）"}',
].join('\n');

const SYSTEM_SENTENCE_PROMPT = [
  '你是一个翻译，擅长结合上下文消除歧义。',
  '用户会给你一段待翻译文本，以及它所在的段落和上一句。',
  '请在上下文的约束下翻译，保持原文的语气与人称，不要扩写、不要解释。',
  '只输出一个 JSON 对象，不要输出任何解释性文字，也不要使用代码块标记。JSON 字段：',
  '{"translation": "译文", "note": "可选的语境说明（不超过 40 字），没有就留空"}',
].join('\n');

function buildUserPrompt(request: AiTranslateRequest, mode: 'word' | 'sentence'): string {
  const { text, context } = request;
  const target = targetLanguageName(request.targetLang);
  const lines = [
    `输出语言：${target}`,
    `原文语言：${request.sourceLang === 'AUTO' ? '自动判断' : request.sourceLang}`,
    '',
  ];
  if (mode === 'word') {
    lines.push(`目标词：${text}`);
    if (context?.sentence) lines.push(`所在句子：${context.sentence}`);
  } else {
    lines.push(`待翻译文本：${text}`);
  }
  if (context?.previousSentence) lines.push(`上一句：${context.previousSentence}`);
  if (context?.paragraph) lines.push(`所在段落：${context.paragraph}`);
  lines.push('', `请用 ${target} 输出 JSON。`);
  return lines.join('\n');
}

function extractMessageContent(payload: unknown): string {
  const data = payload as {
    choices?: { message?: { content?: string | { type?: string; text?: string }[] } }[];
  };
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : (part?.text ?? '')))
      .join('')
      .trim();
  }
  return '';
}

/** 从模型回复里抠出 JSON：兼容 ```json 代码块、前后多余文字 */
export function parseJsonObject(content: string): Record<string, unknown> {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new AiTranslationError('parse', 'AI response did not contain a JSON object');
  }
  const candidate = cleaned.slice(start, end + 1);
  try {
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new AiTranslationError('parse', 'AI response JSON was not an object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AiTranslationError) throw error;
    throw new AiTranslationError('parse', `Failed to parse AI response: ${String(error)}`);
  }
}

const pickString = (source: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
};

/** 把模型返回的 JSON 归一化成 WordMeaning；缺释义视为解析失败 */
export function toWordMeaning(payload: Record<string, unknown>, fallbackWord: string): WordMeaning {
  const meaning = pickString(payload, ['meaning', 'contextualMeaning', 'definition', '释义']);
  if (!meaning) {
    throw new AiTranslationError('parse', 'AI response did not include a contextual meaning');
  }
  return {
    word: pickString(payload, ['word', 'target', 'text']) || fallbackWord,
    reading: pickString(payload, ['reading', 'phonetic', 'pronunciation', '音标']),
    partOfSpeech: pickString(payload, ['partOfSpeech', 'pos', 'part_of_speech', '词性']),
    meaning,
    sentenceTranslation: pickString(payload, [
      'sentenceTranslation',
      'translation',
      'sentence_translation',
      '整句译文',
    ]),
    why: pickString(payload, ['why', 'reason', 'explanation', 'note', '依据']),
  };
}

export function toContextTranslation(payload: Record<string, unknown>): ContextTranslation {
  const translation = pickString(payload, ['translation', 'text', 'meaning', '译文']);
  if (!translation) {
    throw new AiTranslationError('parse', 'AI response did not include a translation');
  }
  return { translation, note: pickString(payload, ['note', 'why', 'reason', 'explanation']) };
}

interface ChatRequestOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

async function requestChatCompletion(
  settings: Partial<AiTranslationSettings> | undefined,
  systemPrompt: string,
  userPrompt: string,
  options: ChatRequestOptions = {},
): Promise<string> {
  if (!settings || !isAiConfigured(settings)) {
    throw new AiTranslationError('not-configured', 'AI translation is not configured');
  }
  const url = resolveChatCompletionsUrl(settings.baseUrl || '');
  if (!url) {
    throw new AiTranslationError('not-configured', 'AI base URL is empty');
  }
  const fetchImpl = options.fetchImpl ?? systemFetch();
  const timeoutMs = options.timeoutMs ?? settings.timeoutMs ?? 20000;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => {
        controller.abort();
      }, timeoutMs)
    : null;

  const body = {
    model: settings.model,
    temperature: 0.2,
    max_tokens: 600,
    stream: false,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  };

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new AiTranslationError(
        'http',
        `AI request failed with status ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
      );
    }
    const payload = await response.json().catch(() => null);
    const content = extractMessageContent(payload);
    if (!content) {
      throw new AiTranslationError('parse', 'AI response was empty');
    }
    return content;
  } catch (error) {
    if (error instanceof AiTranslationError) throw error;
    throw new AiTranslationError(
      'network',
      `AI request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const extractModelIds = (payload: unknown): string[] => {
  const data = payload as {
    data?: { id?: string }[];
    models?: ({ id?: string; name?: string } | string)[];
  };
  const ids: string[] = [];
  if (Array.isArray(data?.data)) {
    for (const item of data.data) {
      if (item && typeof item.id === 'string' && item.id.trim()) ids.push(item.id.trim());
    }
  }
  if (!ids.length && Array.isArray(data?.models)) {
    for (const item of data.models) {
      const id = typeof item === 'string' ? item : (item?.id ?? item?.name);
      if (typeof id === 'string' && id.trim()) ids.push(id.trim());
    }
  }
  return Array.from(new Set(ids));
};

/**
 * 拉取该端点 + 该 Key 可用的模型列表（OpenAI 兼容 GET /models）。
 * 中转站/多模型网关常用它辅助选择；不支持 /models 的端点会报错，手填模型名即可。
 */
export async function listAiModels(
  settings: Partial<AiTranslationSettings> | undefined,
  options: ChatRequestOptions = {},
): Promise<string[]> {
  if (!settings || !settings.baseUrl?.trim() || !settings.apiKey?.trim()) {
    throw new AiTranslationError('not-configured', 'AI endpoint or API key is missing');
  }
  const url = resolveModelsUrl(settings.baseUrl);
  const fetchImpl = options.fetchImpl ?? systemFetch();
  const timeoutMs = options.timeoutMs ?? settings.timeoutMs ?? 20000;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${settings.apiKey}` },
      signal: controller?.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new AiTranslationError(
        'http',
        `Model list request failed with status ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
      );
    }
    const payload = await response.json().catch(() => null);
    const models = extractModelIds(payload);
    if (!models.length) {
      throw new AiTranslationError(
        'parse',
        'The endpoint returned no models; type the model name manually',
      );
    }
    return models;
  } catch (error) {
    if (error instanceof AiTranslationError) throw error;
    throw new AiTranslationError(
      'network',
      `Model list request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 单词/短语的语境释义。模型不可用或返回不合法时抛 AiTranslationError，
 * 调用方据此降级到机器翻译。
 */
export async function translateWordInContext(
  settings: Partial<AiTranslationSettings> | undefined,
  request: AiTranslateRequest,
  options: ChatRequestOptions = {},
): Promise<WordMeaning> {
  const content = await requestChatCompletion(
    settings,
    SYSTEM_WORD_PROMPT,
    buildUserPrompt(request, 'word'),
    options,
  );
  return toWordMeaning(parseJsonObject(content), request.text);
}

/** 整句/整段带上下文的翻译 */
export async function translateWithContext(
  settings: Partial<AiTranslationSettings> | undefined,
  request: AiTranslateRequest,
  options: ChatRequestOptions = {},
): Promise<ContextTranslation> {
  const content = await requestChatCompletion(
    settings,
    SYSTEM_SENTENCE_PROMPT,
    buildUserPrompt(request, 'sentence'),
    options,
  );
  return toContextTranslation(parseJsonObject(content));
}

export const __testing = {
  buildUserPrompt,
  extractMessageContent,
  SYSTEM_WORD_PROMPT,
  SYSTEM_SENTENCE_PROMPT,
};
