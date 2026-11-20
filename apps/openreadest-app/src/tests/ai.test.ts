import { describe, expect, it, vi } from 'vitest';
import {
  AiTranslationError,
  ANTHROPIC_API_VERSION,
  __testing,
  detectAiProtocol,
  isAiConfigured,
  listAiModels,
  parseJsonObject,
  resolveAiProtocol,
  resolveChatCompletionsUrl,
  resolveMaxTokens,
  resolveMessagesUrl,
  resolveModelsUrl,
  resolveTimeoutMs,
  toContextTranslation,
  toWordMeaning,
  translateWithContext,
  translateWordInContext,
} from '@/services/translators/ai';

const settings = {
  enabled: true,
  baseUrl: 'https://api.deepseek.com',
  apiKey: 'test-key',
  model: 'deepseek-chat',
};

const context = {
  word: 'bank',
  sentence: 'He sat on the bank of the river.',
  previousSentence: 'The old man was tired.',
  paragraph: 'The old man was tired. He sat on the bank of the river.',
};

type FakeResponseInit = { status?: number; body?: unknown; text?: string };

const fakeResponse = ({ status = 200, body, text }: FakeResponseInit) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => text ?? JSON.stringify(body ?? {}),
  }) as unknown as Response;

const completion = (content: string) =>
  fakeResponse({ body: { choices: [{ message: { content } }] } });

describe('AI translation configuration', () => {
  it('requires an enabled provider with endpoint, key and model', () => {
    expect(isAiConfigured(undefined)).toBe(false);
    expect(isAiConfigured(null)).toBe(false);
    expect(isAiConfigured({ ...settings, enabled: false })).toBe(false);
    expect(isAiConfigured({ ...settings, apiKey: '  ' })).toBe(false);
    expect(isAiConfigured({ ...settings, baseUrl: '' })).toBe(false);
    expect(isAiConfigured(settings)).toBe(true);
  });

  it('resolves base URLs into a chat/completions endpoint', () => {
    expect(resolveChatCompletionsUrl('https://api.deepseek.com')).toBe(
      'https://api.deepseek.com/chat/completions',
    );
    expect(resolveChatCompletionsUrl('https://api.deepseek.com///')).toBe(
      'https://api.deepseek.com/chat/completions',
    );
    expect(resolveChatCompletionsUrl('https://api.openai.com/v1/chat/completions')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
    expect(resolveChatCompletionsUrl('  ')).toBe('');
  });
});

describe('protocol detection', () => {
  it('only switches to Anthropic when the endpoint clearly says so', () => {
    expect(detectAiProtocol('https://api.anthropic.com')).toBe('anthropic');
    expect(detectAiProtocol('https://api.anthropic.com/v1')).toBe('anthropic');
    expect(detectAiProtocol('https://proxy.example.com/anthropic')).toBe('anthropic');
    expect(detectAiProtocol('https://relay.example.com/v1/messages')).toBe('anthropic');
    // 中性域名一律保持 OpenAI，避免猜测猜错把原有配置打挂
    expect(detectAiProtocol('https://api.deepseek.com')).toBe('openai');
    expect(detectAiProtocol('https://www.dmxapi.cn')).toBe('openai');
    expect(detectAiProtocol('http://127.0.0.1:11434/v1')).toBe('openai');
    expect(detectAiProtocol('')).toBe('openai');
  });

  it('lets an explicit protocol override what the URL suggests', () => {
    expect(resolveAiProtocol(undefined)).toBe('openai');
    expect(resolveAiProtocol({ baseUrl: 'https://api.anthropic.com' })).toBe('anthropic');
    expect(resolveAiProtocol({ baseUrl: 'https://www.dmxapi.cn', protocol: 'anthropic' })).toBe(
      'anthropic',
    );
    expect(resolveAiProtocol({ baseUrl: 'https://api.anthropic.com', protocol: 'openai' })).toBe(
      'openai',
    );
  });

  it('resolves base URLs into a messages endpoint', () => {
    expect(resolveMessagesUrl('https://api.anthropic.com')).toBe(
      'https://api.anthropic.com/v1/messages',
    );
    expect(resolveMessagesUrl('https://api.anthropic.com/v1')).toBe(
      'https://api.anthropic.com/v1/messages',
    );
    expect(resolveMessagesUrl('https://api.anthropic.com/v1/messages')).toBe(
      'https://api.anthropic.com/v1/messages',
    );
    expect(resolveMessagesUrl('https://www.dmxapi.cn')).toBe('https://www.dmxapi.cn/v1/messages');
    expect(resolveMessagesUrl('https://relay.example.com/v1/chat/completions')).toBe(
      'https://relay.example.com/v1/messages',
    );
    expect(resolveMessagesUrl('   ')).toBe('');
  });
});

describe('Anthropic requests', () => {
  const anthropicSettings = {
    enabled: true,
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'test-key',
    model: 'claude-sonnet-4-5',
  };

  const anthropicCompletion = (text: string) =>
    fakeResponse({
      body: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '先看搭配' },
          { type: 'text', text },
        ],
      },
    });

  it('posts to /v1/messages with x-api-key, anthropic-version and a top-level system', async () => {
    const fetchImpl = vi.fn(async () =>
      anthropicCompletion('{"word":"bank","meaning":"河岸"}'),
    );

    const meaning = await translateWordInContext(
      anthropicSettings,
      { text: 'bank', context, sourceLang: 'en', targetLang: 'zh-CN' },
      { fetchImpl },
    );

    expect(meaning.meaning).toBe('河岸');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('test-key');
    expect(headers['anthropic-version']).toBe(ANTHROPIC_API_VERSION);
    expect(headers['Authorization']).toBeUndefined();
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('claude-sonnet-4-5');
    expect(typeof body.system).toBe('string');
    expect(body.system).toContain('词典');
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[0].content).toContain('所在句子');
    expect(body.max_tokens).toBe(600);
    expect(body.stream).toBeUndefined();
  });

  it('honours an explicitly forced Anthropic protocol on a neutral relay domain', async () => {
    const fetchImpl = vi.fn(async () => anthropicCompletion('{"translation":"他坐在河岸上。"}'));

    const result = await translateWithContext(
      { ...anthropicSettings, baseUrl: 'https://www.dmxapi.cn', protocol: 'anthropic' },
      {
        text: 'He sat on the bank of the river.',
        context,
        sourceLang: 'en',
        targetLang: 'zh-CN',
      },
      { fetchImpl },
    );

    expect(result.translation).toBe('他坐在河岸上。');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://www.dmxapi.cn/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('test-key');
  });

  it('keeps sending the old OpenAI shape for neutral endpoints', async () => {
    const fetchImpl = vi.fn(async () => completion('{"meaning":"河岸"}'));

    await translateWordInContext(
      { ...settings, baseUrl: 'https://www.dmxapi.cn', protocol: 'openai' },
      { text: 'bank', context, sourceLang: 'en', targetLang: 'zh-CN' },
      { fetchImpl },
    );

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://www.dmxapi.cn/chat/completions');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-key');
    expect(headers['x-api-key']).toBeUndefined();
    const body = JSON.parse(init.body as string);
    expect(body.messages[0].role).toBe('system');
    expect(body.system).toBeUndefined();
    expect(body.stream).toBe(false);
  });

  it('reads the Anthropic error body instead of dumping raw JSON', async () => {
    const fetchImpl = vi.fn(async () =>
      fakeResponse({
        status: 401,
        text: JSON.stringify({
          type: 'error',
          error: { type: 'authentication_error', message: 'invalid x-api-key' },
        }),
      }),
    );

    const error = await translateWordInContext(
      anthropicSettings,
      { text: 'bank', context, sourceLang: 'en', targetLang: 'zh-CN' },
      { fetchImpl },
    ).catch((caught: unknown) => caught);

    expect((error as AiTranslationError).code).toBe('http');
    expect((error as Error).message).toContain('401');
    expect((error as Error).message).toContain('authentication_error: invalid x-api-key');
  });

  it('lists models from the Anthropic endpoint with its own headers', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['x-api-key']).toBe('test-key');
      expect((init?.headers as Record<string, string>)['anthropic-version']).toBe(
        ANTHROPIC_API_VERSION,
      );
      return fakeResponse({ body: { data: [{ id: 'claude-sonnet-4-5' }] } });
    });

    const models = await listAiModels(anthropicSettings, { fetchImpl });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.anthropic.com/v1/models');
    expect(models).toEqual(['claude-sonnet-4-5']);
  });

  it('joins only the text blocks of an Anthropic reply', () => {
    expect(
      __testing.extractAnthropicContent({
        content: [
          { type: 'thinking', thinking: '略' },
          { type: 'text', text: '{"meaning":' },
          { type: 'text', text: '"河岸"}' },
        ],
      }),
    ).toBe('{"meaning":"河岸"}');
    expect(__testing.extractAnthropicContent({ content: [] })).toBe('');
    expect(__testing.extractAnthropicContent({})).toBe('');
  });
});

describe('prompt building', () => {
  it('puts the word, its sentence and the surrounding paragraph in the prompt', () => {
    const prompt = __testing.buildUserPrompt(
      { text: 'bank', context, sourceLang: 'en', targetLang: 'zh-CN' },
      'word',
    );

    expect(prompt).toContain('目标词：bank');
    expect(prompt).toContain('所在句子：He sat on the bank of the river.');
    expect(prompt).toContain('上一句：The old man was tired.');
    expect(prompt).toContain('所在段落：');
    expect(prompt).toMatch(/输出语言：/);
  });

  it('falls back to Chinese when the target language is auto', () => {
    const prompt = __testing.buildUserPrompt(
      { text: 'bank', sourceLang: 'en', targetLang: 'AUTO' },
      'word',
    );
    expect(prompt).toContain('输出语言：中文');
  });
});

describe('response parsing', () => {
  it('extracts JSON from code fences and surrounding prose', () => {
    expect(parseJsonObject('好的：\n```json\n{"meaning":"河岸"}\n```')).toEqual({
      meaning: '河岸',
    });
    expect(parseJsonObject('{"translation":"他坐在河岸上。"}')).toEqual({
      translation: '他坐在河岸上。',
    });
  });

  it('rejects responses without a JSON object', () => {
    expect(() => parseJsonObject('对不起，我无法回答。')).toThrow(AiTranslationError);
    expect(() => parseJsonObject('[1,2,3]')).toThrow(/JSON object/);
  });

  it('normalizes alternate field names into a WordMeaning', () => {
    expect(toWordMeaning({ word: 'bank', definition: '河岸', pos: 'n.' }, 'bank')).toEqual({
      word: 'bank',
      meaning: '河岸',
      partOfSpeech: 'n.',
      reading: undefined,
      sentenceTranslation: undefined,
      why: undefined,
    });
    expect(() => toWordMeaning({}, 'bank')).toThrow(/contextual meaning/);
    expect(() => toContextTranslation({})).toThrow(/translation/);
  });

  it('reads content from OpenAI array-style messages', () => {
    expect(
      __testing.extractMessageContent({
        choices: [
          {
            message: {
              content: [
                { type: 'text', text: '{"meaning":' },
                { type: 'text', text: '"河岸"}' },
              ],
            },
          },
        ],
      }),
    ).toBe('{"meaning":"河岸"}');
    expect(__testing.extractMessageContent({})).toBe('');
  });
});

describe('translateWordInContext', () => {
  it('posts an OpenAI-compatible chat request and returns the contextual meaning', async () => {
    const fetchImpl = vi.fn(async () =>
      completion('{"word":"bank","partOfSpeech":"n.","meaning":"河岸","why":"与 river 搭配"}'),
    );

    const meaning = await translateWordInContext(
      settings,
      {
        text: 'bank',
        context,
        sourceLang: 'en',
        targetLang: 'zh-CN',
      },
      { fetchImpl },
    );

    expect(meaning).toEqual({
      word: 'bank',
      meaning: '河岸',
      partOfSpeech: 'n.',
      reading: undefined,
      sentenceTranslation: undefined,
      why: '与 river 搭配',
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-key');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('deepseek-chat');
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].content).toContain('所在句子');
  });

  it('falls back to the selected text when the model omits the word field', async () => {
    const fetchImpl = vi.fn(async () => completion('{"meaning":"河岸"}'));
    const meaning = await translateWordInContext(
      settings,
      {
        text: 'bank',
        context,
        sourceLang: 'en',
        targetLang: 'zh-CN',
      },
      { fetchImpl },
    );
    expect(meaning.word).toBe('bank');
  });

  it('reports HTTP failures with the status code', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ status: 401, text: 'invalid key' }));
    const error = await translateWordInContext(
      settings,
      {
        text: 'bank',
        context,
        sourceLang: 'en',
        targetLang: 'zh-CN',
      },
      { fetchImpl },
    ).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(AiTranslationError);
    expect((error as AiTranslationError).code).toBe('http');
    expect((error as Error).message).toContain('401');
  });

  it('maps network errors and empty responses to typed errors', async () => {
    const networkError = await translateWordInContext(
      settings,
      {
        text: 'bank',
        context,
        sourceLang: 'en',
        targetLang: 'zh-CN',
      },
      {
        fetchImpl: vi.fn(async () => {
          throw new TypeError('Failed to fetch');
        }),
      },
    ).catch((error: unknown) => error);
    expect((networkError as AiTranslationError).code).toBe('network');

    const emptyError = await translateWordInContext(
      settings,
      {
        text: 'bank',
        context,
        sourceLang: 'en',
        targetLang: 'zh-CN',
      },
      {
        fetchImpl: vi.fn(async () => completion('  ')),
      },
    ).catch((error: unknown) => error);
    expect((emptyError as AiTranslationError).code).toBe('parse');
  });

  it('refuses to send a request when the provider is not configured', async () => {
    const fetchImpl = vi.fn();
    const error = await translateWordInContext(
      { ...settings, apiKey: '' },
      {
        text: 'bank',
        context,
        sourceLang: 'en',
        targetLang: 'zh-CN',
      },
      { fetchImpl },
    ).catch((error: unknown) => error);

    expect((error as AiTranslationError).code).toBe('not-configured');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('request budget', () => {
  it('sends 600 output tokens by default and the configured value when set', async () => {
    const fetchImpl = vi.fn(async () => completion('{"meaning":"河岸"}'));
    await translateWordInContext(
      settings,
      { text: 'bank', context, sourceLang: 'en', targetLang: 'zh-CN' },
      { fetchImpl },
    );
    const defaultBody = JSON.parse(
      (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(defaultBody.max_tokens).toBe(600);

    const raised = vi.fn(async () => completion('{"meaning":"河岸"}'));
    await translateWordInContext(
      { ...settings, maxTokens: 4096, timeoutMs: 60000 },
      { text: 'bank', context, sourceLang: 'en', targetLang: 'zh-CN' },
      { fetchImpl: raised },
    );
    const raisedBody = JSON.parse(
      (raised.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(raisedBody.max_tokens).toBe(4096);
  });

  it('reports a timeout instead of a network error when the request is aborted', async () => {
    const hanging = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
          });
        }),
    );

    const error = await translateWordInContext(
      { ...settings, timeoutMs: 30 },
      { text: 'bank', context, sourceLang: 'en', targetLang: 'zh-CN' },
      { fetchImpl: hanging, timeoutMs: 30 },
    ).catch((caught: unknown) => caught);

    expect((error as AiTranslationError).code).toBe('timeout');
    expect((error as Error).message).toContain('timed out');
  });

  it('falls back to the defaults and clamps out-of-range values', () => {
    expect(resolveMaxTokens(undefined)).toBe(600);
    expect(resolveMaxTokens({ maxTokens: 0 })).toBe(600);
    expect(resolveMaxTokens({ maxTokens: 10 })).toBe(64);
    expect(resolveMaxTokens({ maxTokens: 4096 })).toBe(4096);
    expect(resolveMaxTokens({ maxTokens: 99999 })).toBe(8192);

    expect(resolveTimeoutMs(undefined)).toBe(20000);
    expect(resolveTimeoutMs({ timeoutMs: 0 })).toBe(20000);
    expect(resolveTimeoutMs({ timeoutMs: 5 })).toBe(1000);
    expect(resolveTimeoutMs({ timeoutMs: 60000 })).toBe(60000);
    expect(resolveTimeoutMs({ timeoutMs: 1e9 })).toBe(600000);
  });
});

describe('translateWithContext', () => {
  it('returns a context-aware translation and note', async () => {
    const fetchImpl = vi.fn(async () =>
      completion('{"translation":"他坐在河岸上。","note":"bank 与 river 搭配取河岸义"}'),
    );

    const result = await translateWithContext(
      settings,
      {
        text: 'He sat on the bank of the river.',
        context,
        sourceLang: 'en',
        targetLang: 'zh-CN',
      },
      { fetchImpl },
    );

    expect(result).toEqual({ translation: '他坐在河岸上。', note: 'bank 与 river 搭配取河岸义' });
    const body = JSON.parse(
      (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.messages[1].content).toContain('待翻译文本：He sat on the bank of the river.');
  });
});

describe('listAiModels', () => {
  it('resolves the models endpoint from any base URL shape', () => {
    expect(resolveModelsUrl('https://api.deepseek.com')).toBe('https://api.deepseek.com/models');
    expect(resolveModelsUrl('https://relay.example.com/v1///')).toBe(
      'https://relay.example.com/v1/models',
    );
    expect(resolveModelsUrl('https://api.openai.com/v1/chat/completions')).toBe(
      'https://api.openai.com/v1/models',
    );
    expect(resolveModelsUrl('   ')).toBe('');
  });

  it('lists the models behind a relay key with a bearer token', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe('GET');
      expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer test-key');
      return fakeResponse({
        body: {
          data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }, { id: 'deepseek-chat' }],
        },
      });
    });

    const models = await listAiModels(
      { ...settings, baseUrl: 'https://relay.example.com/v1' },
      { fetchImpl },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [requestedUrl] = fetchImpl.mock.calls[0] ?? [];
    expect(requestedUrl).toBe('https://relay.example.com/v1/models');
    expect(models).toEqual(['deepseek-chat', 'deepseek-reasoner']);
  });

  it('understands the Ollama-style models payload', async () => {
    const fetchImpl = vi.fn(async () =>
      fakeResponse({ body: { models: [{ name: 'llama3.1' }, { name: 'qwen2.5' }] } }),
    );

    const models = await listAiModels({ ...settings, apiKey: 'local' }, { fetchImpl });
    expect(models).toEqual(['llama3.1', 'qwen2.5']);
  });

  it('surfaces HTTP failures and empty model lists', async () => {
    const httpError = await listAiModels(settings, {
      fetchImpl: vi.fn(async () => fakeResponse({ status: 401, text: 'bad key' })),
    }).catch((error: unknown) => error);
    expect((httpError as AiTranslationError).code).toBe('http');
    expect((httpError as Error).message).toContain('401');

    const emptyError = await listAiModels(settings, {
      fetchImpl: vi.fn(async () => fakeResponse({ body: { data: [] } })),
    }).catch((error: unknown) => error);
    expect((emptyError as AiTranslationError).code).toBe('parse');
  });

  it('does not call the endpoint without an API key', async () => {
    const fetchImpl = vi.fn();
    const error = await listAiModels({ ...settings, apiKey: '' }, { fetchImpl }).catch(
      (error: unknown) => error,
    );
    expect((error as AiTranslationError).code).toBe('not-configured');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
