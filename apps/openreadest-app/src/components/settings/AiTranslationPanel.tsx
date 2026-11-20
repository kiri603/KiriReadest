/**
 * 设置 → 语言 → AI 语境释义。
 *
 * 本 fork 已移除账号系统，翻译本身免登录；这里额外配置一个 AI 接口，
 * 就能让查词结果从「孤立的词典义项」变成「这个词在这句话里到底是什么意思」。
 * 不填 Key 时一切照旧，只是降级为免费机器翻译的整句参考。
 *
 * 协议支持两种：OpenAI 兼容的 /chat/completions（DeepSeek、OpenAI、Ollama、多数中转站）
 * 与 Anthropic 的 /v1/messages（Claude 官方及兼容 Messages API 的中转站）。
 */
import React, { useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { isAiConfigured, listAiModels, translateWordInContext } from '@/services/translators/ai';
import {
  DEFAULT_AI_MAX_TOKENS,
  DEFAULT_AI_TIMEOUT_MS,
  DEFAULT_AI_TRANSLATION_SETTINGS,
} from '@/services/constants';
import type { AiProtocol, AiTranslationSettings } from '@/types/settings';

const PRESETS: { label: string; baseUrl: string; model: string; protocol: AiProtocol }[] = [
  {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    protocol: 'openai',
  },
  {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    protocol: 'openai',
  },
  {
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    protocol: 'anthropic',
  },
  {
    label: 'Ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'llama3.1',
    protocol: 'openai',
  },
];

/** 空字符串 = 不写入配置，交给 detectAiProtocol 按地址推断 */
const PROTOCOL_OPTIONS: { value: '' | AiProtocol; label: string }[] = [
  { value: '', label: 'Auto-detect' },
  { value: 'openai', label: 'OpenAI-compatible' },
  { value: 'anthropic', label: 'Anthropic' },
];

/** 留空表示「用默认值」：不要把 0 或 NaN 写进配置 */
const parseOptionalNumber = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const AiTranslationPanel: React.FC = () => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { settings, setSettings, saveSettings } = useSettingsStore();
  const stored = settings.aiTranslation ?? DEFAULT_AI_TRANSLATION_SETTINGS;
  const [draft, setDraft] = useState<AiTranslationSettings>(stored);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const update = (patch: Partial<AiTranslationSettings>) => {
    setDraft((previous) => ({ ...previous, ...patch }));
    setSaved(false);
  };

  const persist = async (next: AiTranslationSettings) => {
    const nextSettings = { ...settings, aiTranslation: next };
    setSettings(nextSettings);
    await saveSettings(envConfig, nextSettings);
    setSaved(true);
  };

  const handleSave = async () => {
    setFeedback(null);
    // 留空即视为「不用 AI」，避免把空字符串写进配置后仍被认为是已配置
    await persist({
      ...draft,
      baseUrl: draft.baseUrl.trim(),
      apiKey: draft.apiKey.trim(),
      model: draft.model.trim(),
    });
  };

  const handleFetchModels = async () => {
    if (loadingModels) return;
    setFeedback(null);
    if (!draft.baseUrl.trim() || !draft.apiKey.trim()) {
      setFeedback({ ok: false, message: _('Fill in the endpoint and API key first.') });
      return;
    }
    setLoadingModels(true);
    try {
      const list = await listAiModels({
        ...draft,
        baseUrl: draft.baseUrl.trim(),
        apiKey: draft.apiKey.trim(),
      });
      setModels(list);
      const [only] = list;
      if (only) update({ model: only });
      setFeedback({ ok: true, message: `${_('Models loaded')}: ${list.length}` });
    } catch (error) {
      setModels([]);
      setFeedback({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoadingModels(false);
    }
  };

  const handleTest = async () => {
    if (testing) return;
    setFeedback(null);
    if (!isAiConfigured(draft)) {
      setFeedback({ ok: false, message: _('Fill in the endpoint, API key and model first.') });
      return;
    }
    setTesting(true);
    try {
      const result = await translateWordInContext(draft, {
        text: 'bank',
        context: {
          word: 'bank',
          sentence: 'The bank of the river was steep and muddy.',
          paragraph: 'The bank of the river was steep and muddy. We walked along it.',
        },
        sourceLang: 'en',
        targetLang: 'zh-CN',
      });
      setFeedback({ ok: true, message: `${_('Connected')}: ${result.meaning}` });
    } catch (error) {
      setFeedback({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className='w-full'>
      <h2 className='mb-2 font-medium'>{_('AI Context Meaning')}</h2>
      <div className='card border-base-200 bg-base-100 border shadow'>
        <div className='divide-base-200 divide-y'>
          <div className='config-item'>
            <div className='flex flex-col gap-1'>
              <span>{_('Enable AI Context Meaning')}</span>
              <span className='text-base-content/60 text-xs'>
                {_('When off, only machine translation is used.')}
              </span>
            </div>
            <input
              type='checkbox'
              className='toggle'
              checked={draft.enabled}
              onChange={() => update({ enabled: !draft.enabled })}
            />
          </div>

          <div className='flex flex-col gap-1 px-4 py-3'>
            <span className='text-base-content/60 text-xs'>{_('Endpoint')}</span>
            <input
              type='url'
              className='input input-bordered input-sm w-full'
              value={draft.baseUrl}
              placeholder='https://api.deepseek.com'
              spellCheck={false}
              onChange={(event) => update({ baseUrl: event.target.value })}
            />
            <div className='flex flex-wrap items-center gap-1'>
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type='button'
                  className='btn btn-ghost btn-xs'
                  onClick={() =>
                    update({
                      baseUrl: preset.baseUrl,
                      model: preset.model,
                      protocol: preset.protocol,
                    })
                  }
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <span className='text-[11px] opacity-60'>
              {_(
                'Base URL only; the chat path (/chat/completions or /v1/messages) is appended by the protocol below.',
              )}
            </span>
          </div>

          <div className='flex flex-col gap-1 px-4 py-3'>
            <span className='text-base-content/60 text-xs'>{_('API protocol')}</span>
            <select
              aria-label='API protocol'
              className='select select-bordered select-sm w-full'
              value={draft.protocol ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                update({ protocol: value ? (value as AiProtocol) : undefined });
              }}
            >
              {PROTOCOL_OPTIONS.map((option) => (
                <option key={option.value || 'auto'} value={option.value}>
                  {_(option.label)}
                </option>
              ))}
            </select>
            <span className='text-[11px] opacity-60'>
              {_(
                'Auto-detect switches to Anthropic only when the endpoint clearly points at Anthropic. Pick a protocol explicitly for relays that support both.',
              )}
            </span>
          </div>

          <div className='flex flex-col gap-1 px-4 py-3'>
            <span className='text-base-content/60 text-xs'>{_('API Key')}</span>
            <input
              type='password'
              className='input input-bordered input-sm w-full'
              value={draft.apiKey}
              placeholder='sk-...'
              autoComplete='off'
              spellCheck={false}
              onChange={(event) => update({ apiKey: event.target.value })}
            />
            <span className='text-[11px] opacity-60'>
              {_(
                'The key is stored in this app’s local settings and is only sent to the endpoint you configure.',
              )}
            </span>
          </div>

          <div className='flex flex-col gap-1 px-4 py-3'>
            <div className='flex items-center justify-between gap-2'>
              <span className='text-base-content/60 text-xs'>{_('Model')}</span>
              <button
                type='button'
                className='btn btn-ghost btn-xs'
                onClick={() => void handleFetchModels()}
                disabled={loadingModels}
              >
                {loadingModels ? _('Fetching...') : _('Fetch models')}
              </button>
            </div>
            <input
              type='text'
              className='input input-bordered input-sm w-full'
              value={draft.model}
              placeholder='deepseek-chat'
              spellCheck={false}
              onChange={(event) => update({ model: event.target.value })}
            />
            {models.length > 0 && (
              <select
                aria-label='Model list'
                className='select select-bordered select-sm w-full'
                value={models.includes(draft.model) ? draft.model : ''}
                onChange={(event) => update({ model: event.target.value })}
              >
                <option value=''>{_('Select a model')}</option>
                {models.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            )}
            <span className='text-[11px] opacity-60'>
              {_(
                'Any model id the endpoint accepts works; relays may use their own names.',
              )}
            </span>
          </div>

          <div className='flex flex-col gap-1 px-4 py-3'>
            <span className='text-base-content/60 text-xs'>
              {_('Max output tokens (max_tokens)')}
            </span>
            <input
              type='number'
              min={64}
              max={8192}
              step={64}
              className='input input-bordered input-sm w-full'
              value={draft.maxTokens ?? ''}
              placeholder={String(DEFAULT_AI_MAX_TOKENS)}
              onChange={(event) => update({ maxTokens: parseOptionalNumber(event.target.value) })}
            />
            <span className='text-[11px] opacity-60'>
              {_(
                'Reasoning models spend this budget on thinking too; complex sentences may need 2048–4096. Leave empty to use 600.',
              )}
            </span>
          </div>

          <div className='flex flex-col gap-1 px-4 py-3'>
            <span className='text-base-content/60 text-xs'>{_('Request timeout (ms)')}</span>
            <input
              type='number'
              min={1000}
              max={600000}
              step={1000}
              className='input input-bordered input-sm w-full'
              value={draft.timeoutMs ?? ''}
              placeholder={String(DEFAULT_AI_TIMEOUT_MS)}
              onChange={(event) => update({ timeoutMs: parseOptionalNumber(event.target.value) })}
            />
            <span className='text-[11px] opacity-60'>
              {_(
                'Long passages on reasoning models can take more than 20 seconds. Leave empty to use 20000.',
              )}
            </span>
          </div>
        </div>
      </div>

      <div className='mt-2 flex items-center gap-2'>
        <button type='button' className='btn btn-primary btn-sm' onClick={() => void handleSave()}>
          {saved ? _('Saved') : _('Save')}
        </button>
        <button
          type='button'
          className='btn btn-ghost btn-sm'
          onClick={() => void handleTest()}
          disabled={testing}
        >
          {testing ? _('Testing...') : _('Test connection')}
        </button>
      </div>

      {feedback && (
        <p className={`mt-2 text-sm ${feedback.ok ? 'text-success' : 'text-error'}`}>
          {feedback.message}
        </p>
      )}
      {!isAiConfigured(draft) && !feedback && (
        <p className='text-base-content/60 mt-2 text-xs'>
          {_('AI is not configured; translation falls back to machine translation.')}
        </p>
      )}
    </div>
  );
};

export default AiTranslationPanel;
