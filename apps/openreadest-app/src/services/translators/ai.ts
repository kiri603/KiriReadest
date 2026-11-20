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
import {
  DEFAULT_AI_MAX_TOKENS,
  DEFAULT_AI_TIMEOUT_MS,
  TRANSLATOR_LANGS,
} from '@/services/constants';
import type { AiProtocol, AiTranslationSettings } from '@/types/settings';
import type { SelectionContext } from '@/utils/translationContext';

export type AiErrorCode = 'not-configured' | 'network' | 'http' | 'parse' | 'timeout';

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

/**
 * 用户在设置里填的输出预算：留空/非法值回退到默认 600，并限制在 [64, 8192]。
 * 推理模型的思考 token 与正文共用这个预算，因此复杂句子上需要比 600 大得多。
 */
export function resolveMaxTokens(settings?: Partial<AiTranslationSettings> | null): number {
  const raw = Number(settings?.maxTokens);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_AI_MAX_TOKENS;
  return Math.min(Math.max(Math.round(raw), 64), 8192);
}

/** 用户在设置里填的超时：留空/非法值回退到默认 20 秒，并限制在 [1s, 10min]。 */
export function resolveTimeoutMs(settings?: Partial<AiTranslationSettings> | null): number {
  const raw = Number(settings?.timeoutMs);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_AI_TIMEOUT_MS;
  return Math.min(Math.max(Math.round(raw), 1000), 600000);
}

/** 接口协议：openai = /chat/completions，anthropic = /v1/messages（定义在 settings 里，这里转出便于调用方只 import 一处） */
export type { AiProtocol };

/** Anthropic 要求显式声明 API 版本，固定用当前稳定版 */
export const ANTHROPIC_API_VERSION = '2023-06-01';

/** 把用户填的 baseUrl 解析成 chat/completions 完整地址；宽容处理尾斜杠与完整路径 */
export function resolveChatCompletionsUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) return '';
  if (/\/chat\/completions$/i.test(base)) return base;
  return `${base}/chat/completions`;
}

/** 把用户填的 baseUrl 解析成 Anthropic 的 messages 完整地址；同样宽容处理各种写法 */
export function resolveMessagesUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) return '';
  if (/\/messages$/i.test(base)) return base;
  if (/\/chat\/completions$/i.test(base)) return base.replace(/\/chat\/completions$/i, '/messages');
  if (/\/v1$/i.test(base)) return `${base}/messages`;
  return `${base}/v1/messages`;
}

/**
 * 仅凭 baseUrl 无法可靠判断协议，所以这里只在地址「明确指向 Anthropic」时才切换，
 * 其余一律退回 OpenAI 兼容 —— 这样现有 DeepSeek / OpenAI / Ollama / 中转站地址
 * 的请求格式一个字节都不会变。
 *
 * 猜不准的情况（自建反代、同时支持两种协议的网关）由设置里的 protocol 手动覆盖。
 */
export function detectAiProtocol(baseUrl: string): AiProtocol {
  const raw = baseUrl.trim();
  if (!raw) return 'openai';
  const lower = raw.toLowerCase();
  // 已经写全 .../v1/messages 的地址不用再猜
  if (/\/messages\/?$/.test(lower)) return 'anthropic';
  let host = '';
  let path = '';
  try {
    const parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(lower) ? lower : `https://${lower}`);
    host = parsed.hostname;
    path = parsed.pathname;
  } catch {
    host = lower;
  }
  if (host === 'anthropic.com' || host.endsWith('.anthropic.com')) return 'anthropic';
  // 中转站常把 anthropic 写进域名或路径（例如 https://api.example.com/anthropic）
  if (host.includes('anthropic') || path.includes('anthropic')) return 'anthropic';
  return 'openai';
}

/** 显式配置优先；未填（含升级前保存的老设置）时按 baseUrl 推断 */
export function resolveAiProtocol(settings?: Partial<AiTranslationSettings> | null): AiProtocol {
  const explicit = settings?.protocol;
  if (explicit === 'anthropic' || explicit === 'openai') return explicit;
  return detectAiProtocol(settings?.baseUrl ?? '');
}

/** 同样的 baseUrl 解析成模型列表地址（OpenAI 兼容的 GET /models，Anthropic 为 /v1/models） */
export function resolveModelsUrl(baseUrl: string, protocol: AiProtocol = 'openai'): string {
  const base = baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/messages$/i, '');
  if (!base) return '';
  if (protocol === 'anthropic') {
    return /\/v1$/i.test(base) ? `${base}/models` : `${base}/v1/models`;
  }
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

/**
 * Anthropic /v1/messages 的回复结构：{ content: [{ type: 'text', text: '...' }] }。
 * 只拼 text 块，thinking / tool_use 之类的块直接跳过。
 */
function extractAnthropicContent(payload: unknown): string {
  const data = payload as {
    content?: ({ type?: string; text?: string } | string)[];
  };
  const content = data?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (!part) return '';
      if (part.type && part.type !== 'text') return '';
      return part.text ?? '';
    })
    .join('')
    .trim();
}

/** Anthropic 的错误体是 { type: 'error', error: { type, message } }，比 OpenAI 的更好读 */
export function describeAnthropicError(payload: unknown): string {
  const data = payload as { error?: { type?: string; message?: string }; message?: string };
  const detail = data?.error;
  if (detail?.message) return detail.type ? `${detail.type}: ${detail.message}` : detail.message;
  return data?.message ?? '';
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

const isAnthropicHost = (url: string): boolean => {
  try {
    const { hostname } = new URL(url);
    return hostname === 'anthropic.com' || hostname.endsWith('.anthropic.com');
  } catch {
    return false;
  }
};

interface PreparedRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/**
 * 按协议生成请求。OpenAI 分支保持原样（Authorization: Bearer + messages 里带 system），
 * Anthropic 分支把 system 提到顶层、用 x-api-key 认证，并要求 max_tokens 必填。
 */
function prepareChatRequest(
  settings: Partial<AiTranslationSettings>,
  protocol: AiProtocol,
  systemPrompt: string,
  userPrompt: string,
): PreparedRequest {
  const maxTokens = resolveMaxTokens(settings);

  if (protocol === 'anthropic') {
    const url = resolveMessagesUrl(settings.baseUrl || '');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey ?? '',
      'anthropic-version': ANTHROPIC_API_VERSION,
    };
    // 浏览器直连官方端点必须显式声明，否则会被 CORS 层拒绝；Tauri 走原生 HTTP 不需要
    if (!isTauriAppPlatform() && isAnthropicHost(url)) {
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }
    return {
      url,
      headers,
      body: {
        model: settings.model,
        max_tokens: maxTokens,
        temperature: 0.2,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      },
    };
  }

  return {
    url: resolveChatCompletionsUrl(settings.baseUrl || ''),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: {
      model: settings.model,
      temperature: 0.2,
      max_tokens: maxTokens,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    },
  };
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
  const protocol = resolveAiProtocol(settings);
  const { url, headers, body } = prepareChatRequest(settings, protocol, systemPrompt, userPrompt);
  if (!url) {
    throw new AiTranslationError('not-configured', 'AI base URL is empty');
  }
  const fetchImpl = options.fetchImpl ?? systemFetch();
  const timeoutMs = options.timeoutMs ?? resolveTimeoutMs(settings);
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => {
        controller.abort();
      }, timeoutMs)
    : null;

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
    if (!response.ok) {
      const rawDetail = await response.text().catch(() => '');
      let detail = rawDetail;
      if (protocol === 'anthropic' && rawDetail) {
        try {
          const parsed = JSON.parse(rawDetail) as unknown;
          detail = describeAnthropicError(parsed) || rawDetail;
        } catch {
          // 不是 JSON 就按原文显示
        }
      }
      throw new AiTranslationError(
        'http',
        `AI request failed with status ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
      );
    }
    const payload = await response.json().catch(() => null);
    const content =
      protocol === 'anthropic' ? extractAnthropicContent(payload) : extractMessageContent(payload);
    if (!content) {
      throw new AiTranslationError('parse', 'AI response was empty');
    }
    return content;
  } catch (error) {
    if (error instanceof AiTranslationError) throw error;
    // 超时由上面的 AbortController 触发，单独归类，便于设置页提示「超时」而不是笼统的网络错误
    if (controller?.signal.aborted) {
      throw new AiTranslationError(
        'timeout',
        `AI request timed out after ${Math.round(timeoutMs / 1000)}s`,
      );
    }
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
 * 拉取该端点 + 该 Key 可用的模型列表（OpenAI 兼容 GET /models；Anthropic 为 GET /v1/models）。
 * 中转站/多模型网关常用它辅助选择；不支持 /models 的端点会报错，手填模型名即可。
 */
export async function listAiModels(
  settings: Partial<AiTranslationSettings> | undefined,
  options: ChatRequestOptions = {},
): Promise<string[]> {
  if (!settings || !settings.baseUrl?.trim() || !settings.apiKey?.trim()) {
    throw new AiTranslationError('not-configured', 'AI endpoint or API key is missing');
  }
  const protocol = resolveAiProtocol(settings);
  const url = resolveModelsUrl(settings.baseUrl, protocol);
  const fetchImpl = options.fetchImpl ?? systemFetch();
  const timeoutMs = options.timeoutMs ?? resolveTimeoutMs(settings);
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const headers: Record<string, string> =
    protocol === 'anthropic'
      ? {
          'x-api-key': settings.apiKey,
          'anthropic-version': ANTHROPIC_API_VERSION,
          ...(!isTauriAppPlatform() && isAnthropicHost(url)
            ? { 'anthropic-dangerous-direct-browser-access': 'true' }
            : {}),
        }
      : { Authorization: `Bearer ${settings.apiKey}` };

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers,
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
  extractAnthropicContent,
  prepareChatRequest,
  isAnthropicHost,
  SYSTEM_WORD_PROMPT,
  SYSTEM_SENTENCE_PROMPT,
};
