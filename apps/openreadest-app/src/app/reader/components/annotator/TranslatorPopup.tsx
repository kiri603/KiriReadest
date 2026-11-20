import React, { useCallback, useEffect, useState } from 'react';
import { LuCheck, LuCopy, LuNotebookPen } from 'react-icons/lu';
import Popup from '@/components/Popup';
import Select from '@/components/Select';
import { useEnv } from '@/context/EnvContext';
import { Position } from '@/utils/sel';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useTranslator } from '@/hooks/useTranslator';
import { useContextMeaning } from '@/hooks/useContextMeaning';
import { TRANSLATOR_LANGS } from '@/services/constants';
import { UseTranslatorOptions, getTranslators } from '@/services/translators';
import { isWordLikeSelection } from '@/utils/translationContext';
import type { SelectionContext } from '@/utils/translationContext';
import { normalizeWord } from '@/utils/wordNotes';
import { saveWordNote } from '@/helpers/wordNotes';
import { eventDispatcher } from '@/utils/event';
import ContextMeaningCard from './ContextMeaningCard';

const notSupportedLangs = [''];

const generateTranslatorLangs = () => {
  return Object.fromEntries(
    Object.entries(TRANSLATOR_LANGS).filter(([code]) => !notSupportedLangs.includes(code)),
  );
};

const translatorLangs = generateTranslatorLangs();

const actionButtonClass =
  'not-eink:bg-white/15 not-eink:hover:bg-white/25 eink:border eink:border-primary eink:text-primary flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-40';

// 复制按钮在 Tauri WebView / 非安全上下文里 navigator.clipboard 可能不可用，
// 退化到临时 textarea + execCommand，保证「译文可复制」不是一句空话。
const copyToClipboard = async (value: string) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // 继续走下面的兜底方案
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, value.length);
  const succeeded = document.execCommand ? document.execCommand('copy') : false;
  document.body.removeChild(textarea);
  if (!succeeded) {
    throw new Error('Copy failed');
  }
};

interface TranslatorPopupProps {
  text: string;
  /** 选区所在的句子/段落，用于消除一词多义；提取失败时为 null */
  context?: SelectionContext | null;
  /** 打开设置里的 AI 面板（在弹窗里就能配置 key，不用改文件） */
  onConfigureAi?: () => void;
  position: Position;
  trianglePosition: Position;
  popupWidth: number;
  /** 调用方给的期望高度；这里不再写死高度，仅保留入参以兼容既有调用 */
  popupHeight: number;
  onDismiss?: () => void;
}

interface TranslatorType {
  name: string;
  label: string;
}

const TranslatorPopup: React.FC<TranslatorPopupProps> = ({
  text,
  context,
  onConfigureAi,
  position,
  trianglePosition,
  popupWidth,
  onDismiss,
}) => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { settings, setSettings } = useSettingsStore();
  const [providers, setProviders] = useState<TranslatorType[]>([]);
  const [sourceLang, setSourceLang] = useState('AUTO');
  const [targetLang, setTargetLang] = useState(settings.globalReadSettings.translateTargetLang);
  const [provider, setProvider] = useState(settings.globalReadSettings.translationProvider);
  const [copied, setCopied] = useState(false);
  const [noteStatus, setNoteStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const wordMode = isWordLikeSelection(text);
  const noteWord = normalizeWord(text);

  const { translate, translators } = useTranslator({
    provider,
    sourceLang,
    targetLang,
  } as UseTranslatorOptions);

  // 译文、语境释义和「什么时候该调用谷歌翻译」全部由这个 hook 统一决定：
  // 配置了 AI 且调用成功时，不会再发任何机器翻译请求。
  const state = useContextMeaning({
    text,
    context: context ?? null,
    sourceLang,
    targetLang,
    translate,
    wordMode,
  });

  useEffect(() => {
    setCopied(false);
    setNoteStatus('idle');
  }, [text]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleSourceLangChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSourceLang(event.target.value);
  };

  const handleTargetLangChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    settings.globalReadSettings.translateTargetLang = event.target.value;
    setSettings(settings);
    setTargetLang(event.target.value);
  };

  const handleProviderChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const requestedProvider = event.target.value;
    const availableTranslators = getTranslators().filter((t) => !t.quotaExceeded);
    const selectedTranslator =
      availableTranslators.find((t) => t.name === requestedProvider) || availableTranslators[0]!;
    if (selectedTranslator) {
      settings.globalReadSettings.translationProvider = selectedTranslator.name;
      setSettings(settings);
      setProvider(selectedTranslator.name);
    }
  };

  useEffect(() => {
    const availableProviders = translators.map((t) => {
      let label = t.label;
      if (t.quotaExceeded) {
        label = `${label} (${_('Quota Exceeded')})`;
      }
      return { name: t.name, label };
    });
    setProviders(availableProviders);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translators]);

  const handleCopy = useCallback(async () => {
    const value = state.mainTranslation?.trim();
    if (!value) return;
    try {
      await copyToClipboard(value);
      setCopied(true);
      await eventDispatcher.dispatch('toast', {
        type: 'success',
        message: _('Copied to clipboard'),
        timeout: 2000,
      });
    } catch (error) {
      console.error('Failed to copy translation:', error);
      await eventDispatcher.dispatch('toast', {
        type: 'error',
        message: _('Failed to copy text'),
        timeout: 3000,
      });
    }
  }, [state.mainTranslation, _]);

  const handleAddToWordNote = useCallback(async () => {
    if (!noteWord || noteStatus !== 'idle') return;
    const reading = state.wordMeaning?.reading?.trim();
    const meaning = (state.wordMeaning?.meaning || state.mainTranslation || '').trim();
    const piece = [reading, meaning].filter(Boolean).join('\n');
    if (!piece) return;

    // 单词笔记是跨书的；已有内容时追加而不是覆盖用户的笔记。
    const existing =
      useSettingsStore.getState().settings.wordNotes?.find((note) => note.word === noteWord)
        ?.note ?? '';
    const compact = (value: string) => value.replace(/\s+/g, ' ').trim();
    const content =
      existing.trim() && !compact(existing).includes(compact(piece))
        ? `${existing.trim()}\n${piece}`
        : existing.trim() || piece;

    setNoteStatus('saving');
    try {
      await saveWordNote(envConfig, noteWord, content);
      setNoteStatus('saved');
      await eventDispatcher.dispatch('toast', {
        type: 'success',
        message: _('Added to word notes for all books'),
        timeout: 2500,
      });
    } catch (error) {
      console.error('Failed to save word note:', error);
      setNoteStatus('idle');
      await eventDispatcher.dispatch('toast', {
        type: 'error',
        message: _('Failed to save note. Please try again.'),
        timeout: 3000,
      });
    }
  }, [envConfig, noteWord, noteStatus, state.mainTranslation, state.wordMeaning, _]);

  const hasTranslation = Boolean(
    state.wordMeaning ||
      state.contextTranslation ||
      state.mainTranslation ||
      state.sentenceTranslation,
  );
  // AI 已经给出释义/精译时，卡片本身就是译文，不再重复显示一行相同的文字；
  // 没有上下文时卡片不渲染，主译文必须顶上，否则弹窗会是空的。
  const showMainTranslation = !context || (!state.wordMeaning && !state.contextTranslation);
  const canAddToNote = Boolean(noteWord) && Boolean(state.wordMeaning || state.mainTranslation);

  return (
    <div>
      <Popup
        trianglePosition={trianglePosition}
        width={popupWidth}
        // 不写死高度：Popup 会按「选区到窗口边缘的剩余空间」算出 max-height，
        // 内容再高也只在内部滚动，不会把弹窗撑出窗口、把底部工具条切掉。
        position={position}
        // 上下两块内容放进同一个滚动区，底部工具条固定在弹窗底部：
        // 这样无论可用高度多小，footer 都不会被挤出弹窗（之前用两段独立高度+绝对定位，
        // 可用空间不足时 footer 会跑到弹窗外面被裁掉）。
        className='not-eink:text-white flex select-text flex-col overflow-hidden bg-gray-600'
        triangleClassName='text-gray-600'
        onDismiss={onDismiss}
      >
        <div className='scrollbar-subtle min-h-0 flex-1 overflow-y-auto font-sans'>
          {/* 原文区自己也能滚（限高 max-h-40），但它在外层滚动区里面：
              两个都画滚动条就会并排出现两条轨道，看着很脏。
              所以内层不画条，只保留滚轮/触摸板滚动，视觉上整个弹窗只有一根滚动条。 */}
          <div className='scrollbar-hidden max-h-40 overflow-y-auto p-4'>
            <div className='mb-2 flex items-center justify-between'>
              <h1 className='text-sm font-normal'>{_('Original Text')}</h1>
              <Select
                className='not-eink:bg-gray-600 not-eink:text-white eink:bg-base-100'
                value={sourceLang}
                onChange={handleSourceLangChange}
                options={[
                  { value: 'AUTO', label: _('Auto Detect') },
                  ...Object.entries(translatorLangs)
                    .sort((a, b) => a[1].localeCompare(b[1]))
                    .map(([code, name]) => ({ value: code, label: name })),
                ]}
              />
            </div>
            <p className='not-eink:text-white/90 select-text text-base'>{text}</p>
          </div>

          <div className='mx-4 border-t border-gray-500/30'></div>

          <div className='px-4 pb-2 pt-4'>
            <div className='mb-2 flex items-center justify-between'>
              <h2 className='text-sm font-normal'>{_('Translated Text')}</h2>
              <Select
                className='not-eink:bg-gray-600 not-eink:text-white eink:bg-base-100'
                value={targetLang}
                onChange={handleTargetLangChange}
                options={[
                  { value: '', label: _('System Language') },
                  ...Object.entries(translatorLangs)
                    .sort((a, b) => a[1].localeCompare(b[1]))
                    .map(([code, name]) => ({ value: code, label: name })),
                ]}
              />
            </div>

            {state.loading ? (
              <p className='text-base italic text-gray-500'>{_('Loading...')}</p>
            ) : state.error ? (
              <p className='text-base text-red-600'>
                {_('Unable to fetch the translation. Try again later.')}
              </p>
            ) : (
              <>
                {showMainTranslation && (
                  <p className='not-eink:text-white/90 select-text text-base'>
                    {state.mainTranslation || _('No translation available.')}
                  </p>
                )}

                <ContextMeaningCard
                  text={text}
                  context={context ?? null}
                  wordMode={wordMode}
                  state={state}
                  onConfigureAi={onConfigureAi}
                />

                {hasTranslation && (
                  <div className='mt-1 flex flex-wrap items-center justify-end gap-2'>
                    <button
                      type='button'
                      className={actionButtonClass}
                      onClick={() => void handleCopy()}
                      disabled={!state.mainTranslation}
                      title={_('Copy')}
                    >
                      {copied ? <LuCheck size={12} /> : <LuCopy size={12} />}
                      <span>{copied ? _('Copied') : _('Copy')}</span>
                    </button>
                    {canAddToNote && (
                      <button
                        type='button'
                        className={actionButtonClass}
                        onClick={() => void handleAddToWordNote()}
                        disabled={noteStatus !== 'idle'}
                        title={_('Add to word note')}
                      >
                        {noteStatus === 'saved' ? (
                          <LuCheck size={12} />
                        ) : (
                          <LuNotebookPen size={12} />
                        )}
                        <span>
                          {noteStatus === 'saved'
                            ? _('Saved')
                            : noteStatus === 'saving'
                              ? _('Saving...')
                              : _('Add to word note')}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        {/* shrink-0：空间不足时只压缩上面的滚动区，工具条本身不被压扁 */}
        <div className='flex h-8 w-full shrink-0 items-center justify-between border-t border-gray-500/30 px-4'>
          <div className='line-clamp-1 text-xs opacity-60'>
            {provider &&
              !state.loading &&
              !state.error &&
              (state.mode === 'ai'
                ? _('Translated by AI')
                : _('Translated by {{provider}}.', {
                    provider: providers.find((p) => p.name === provider)?.label,
                  }))}
          </div>
          <Select
            className='not-eink:bg-gray-600 not-eink:text-white eink:bg-base-100'
            value={provider}
            onChange={handleProviderChange}
            options={providers.map(({ name: value, label }) => ({ value, label }))}
          />
        </div>
      </Popup>
    </div>
  );
};

export default TranslatorPopup;
