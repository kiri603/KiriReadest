/**
 * 查词弹窗里的「语境释义」卡片。
 *
 * 只负责展示：数据由 useContextMeaning 统一获取，避免卡片和弹窗各自
 * 请求一次翻译（配置了 AI 时更不应该再走机器翻译）。
 */
import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import type { ContextMeaningState } from '@/hooks/useContextMeaning';
import type { SelectionContext } from '@/utils/translationContext';

interface ContextMeaningCardProps {
  text: string;
  context: SelectionContext | null;
  /** 目标文本是否是词/短语（词模式才有「义项」概念） */
  wordMode: boolean;
  state: ContextMeaningState;
  /** 打开「设置 → 语言 → AI Context Meaning」面板，让用户在界面里填 key，而不是改文件 */
  onConfigureAi?: () => void;
}

const HighlightedSentence: React.FC<{ sentence: string; word: string }> = ({ sentence, word }) => {
  const needle = word.trim();
  if (!needle) return <>{sentence}</>;
  const index = sentence.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, index)}
      <mark className='not-eink:bg-yellow-300/90 not-eink:text-gray-900 rounded px-1'>
        {sentence.slice(index, index + needle.length)}
      </mark>
      {sentence.slice(index + needle.length)}
    </>
  );
};

const ContextMeaningCard: React.FC<ContextMeaningCardProps> = ({
  text,
  context,
  wordMode,
  state,
  onConfigureAi,
}) => {
  const _ = useTranslation();

  // 整句选择且没有配置 AI，或上下文提取失败时，普通翻译已经覆盖了需求
  if (!context) return null;
  if (!wordMode && !state.aiConfigured) return null;

  const { wordMeaning, sentenceTranslation, contextTranslation, note, error, loading } = state;

  return (
    <div
      className='not-eink:bg-white/10 eink:bg-base-200 mb-3 select-text rounded-md px-3 py-2'
      data-testid='context-meaning-card'
    >
      <div className='mb-1 flex items-center justify-between'>
        <h3 className='text-xs font-medium'>
          {wordMode ? _('Meaning in context') : _('Translation with context')}
        </h3>
        <span className='text-[10px] uppercase tracking-wide opacity-50'>
          {state.aiConfigured && !state.aiFailed ? 'AI' : _('Machine Translation')}
        </span>
      </div>

      {loading ? (
        <p className='text-sm italic opacity-60'>{_('Reading the context...')}</p>
      ) : error ? (
        <p className='text-sm text-red-400'>{_('Unable to read the context.')}</p>
      ) : wordMode ? (
        wordMeaning ? (
          <div className='space-y-1 text-sm'>
            <div className='flex flex-wrap items-baseline gap-x-2'>
              <span className='font-semibold'>{wordMeaning.word}</span>
              {wordMeaning.reading && (
                <span className='text-xs opacity-60'>{wordMeaning.reading}</span>
              )}
              {wordMeaning.partOfSpeech && (
                <span className='rounded bg-white/15 px-1 text-[11px]'>
                  {wordMeaning.partOfSpeech}
                </span>
              )}
            </div>
            <p className='not-eink:text-yellow-200 eink:text-primary text-base font-medium'>
              {wordMeaning.meaning}
            </p>
            {wordMeaning.why && <p className='text-xs opacity-70'>{wordMeaning.why}</p>}
            {wordMeaning.sentenceTranslation && (
              <p className='text-xs opacity-80'>
                <span className='opacity-60'>{_('Sentence')}: </span>
                {wordMeaning.sentenceTranslation}
              </p>
            )}
          </div>
        ) : (
          <div className='space-y-1 text-sm'>
            <p className='opacity-80'>
              <HighlightedSentence sentence={context.sentence} word={text} />
            </p>
            {sentenceTranslation && (
              <p className='not-eink:text-white/90 font-medium'>{sentenceTranslation}</p>
            )}
            {!state.aiConfigured && (
              <p className='text-[11px] leading-snug opacity-60'>
                {_(
                  'Configure an AI service in Settings → Language to pin down the exact sense in this sentence.',
                )}
              </p>
            )}
            {state.aiConfigured && state.aiFailed && (
              <p className='text-[11px] leading-snug opacity-60'>
                {_('AI request failed; showing machine translation instead.')}
              </p>
            )}
          </div>
        )
      ) : (
        <div className='space-y-1 text-sm'>
          {contextTranslation ? (
            <p className='not-eink:text-yellow-200 eink:text-primary text-base font-medium'>
              {contextTranslation}
            </p>
          ) : (
            <p className='text-sm opacity-70'>{_('Unable to read the context.')}</p>
          )}
          {note && <p className='text-xs opacity-70'>{note}</p>}
        </div>
      )}

      {onConfigureAi && (!state.aiConfigured || state.aiFailed) && (
        <div className='mt-2'>
          <button
            type='button'
            className='not-eink:bg-white/15 not-eink:hover:bg-white/25 eink:border eink:border-primary eink:text-primary rounded px-2 py-0.5 text-[11px] font-medium'
            onClick={onConfigureAi}
          >
            {_('Configure AI')}
          </button>
        </div>
      )}
    </div>
  );
};

export default ContextMeaningCard;
