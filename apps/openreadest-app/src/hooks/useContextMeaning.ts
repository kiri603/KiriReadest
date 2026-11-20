/**
 * 查词弹窗的「语境释义 + 主译文」状态机：
 * 1) 配置了 AI → 把词和句子一起发给模型，得到该词在此句中的义项（或整句精译）；
 * 2) 没配置或调用失败 → 降级为免费机器翻译。AI 成功时不会再请求机器翻译。
 */
import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import {
  isAiConfigured,
  translateWithContext,
  translateWordInContext,
} from '@/services/translators/ai';
import type { WordMeaning } from '@/services/translators/ai';
import type { AiTranslationSettings } from '@/types/settings';
import type { SelectionContext } from '@/utils/translationContext';

export interface ContextMeaningState {
  loading: boolean;
  /** ai = 模型给出语境义/精译；sentence = 机器翻译 */
  mode: 'ai' | 'sentence' | null;
  wordMeaning: WordMeaning | null;
  /** 整句（或整段）译文：AI 模式来自模型，降级模式来自机器翻译 */
  sentenceTranslation: string | null;
  /** AI 对整句/整段的精译（仅文本模式） */
  contextTranslation: string | null;
  note: string | null;
  /** 弹窗「译文」区域的主译文：AI 结果优先，没有 AI 时来自机器翻译 */
  mainTranslation: string | null;
  error: string | null;
  aiConfigured: boolean;
  /** 配置了 AI 但请求失败（网络/余额/key 无效），已降级为机翻 */
  aiFailed: boolean;
}

type TranslateFn = (
  input: string[],
  options?: { source?: string; target?: string },
) => Promise<string[]>;

interface UseContextMeaningOptions {
  text: string;
  context: SelectionContext | null;
  sourceLang: string;
  targetLang: string;
  translate: TranslateFn;
  /** 是否词/短语模式（true 走语境释义，false 走带上下文的整句精译） */
  wordMode: boolean;
}

/** 同一句话反复查同一个词时不必再请求一次模型 */
const meaningCache = new Map<
  string,
  { wordMeaning: WordMeaning | null; sentence: string | null }
>();

const CACHE_LIMIT = 100;

const remember = (
  key: string,
  value: { wordMeaning: WordMeaning | null; sentence: string | null },
) => {
  if (meaningCache.size >= CACHE_LIMIT) {
    const oldest = meaningCache.keys().next().value;
    if (oldest !== undefined) meaningCache.delete(oldest);
  }
  meaningCache.set(key, value);
};

// 缓存按「同一个模型配置」隔离：换了 provider/key 或关掉 AI 之后，
// 不会把旧的模型释义当成新配置下的结果展示。
const cacheKey = (word: string, sentence: string, mode: string, target: string, aiKey: string) =>
  [mode, target, aiKey, word, sentence].join('\u0001').toLowerCase();

const aiCacheTag = (settings?: Partial<AiTranslationSettings> | null) =>
  isAiConfigured(settings)
    ? `ai:${(settings?.baseUrl ?? '').trim().toLowerCase()}|${(settings?.model ?? '')
        .trim()
        .toLowerCase()}|${settings?.protocol ?? 'auto'}`
    : 'mt';

const emptyState = (aiConfigured: boolean): ContextMeaningState => ({
  loading: false,
  mode: null,
  wordMeaning: null,
  sentenceTranslation: null,
  contextTranslation: null,
  note: null,
  mainTranslation: null,
  error: null,
  aiConfigured,
  aiFailed: false,
});

export function useContextMeaning({
  text,
  context,
  sourceLang,
  targetLang,
  translate,
  wordMode,
}: UseContextMeaningOptions): ContextMeaningState {
  const settings = useSettingsStore((state) => state.settings);
  const aiSettings = settings.aiTranslation;
  const aiConfigured = isAiConfigured(aiSettings);
  const aiTag = aiCacheTag(aiSettings);
  const [state, setState] = useState<ContextMeaningState>(() => ({
    ...emptyState(aiConfigured),
    // 首帧就显示 loading，避免先闪一下「没有译文」再出现结果
    loading: Boolean(text.trim()),
  }));

  const sentence = context?.sentence ?? '';

  useEffect(() => {
    let cancelled = false;
    const trimmed = text.replaceAll('\n', '').trim();
    if (!trimmed) {
      setState(emptyState(aiConfigured));
      return;
    }

    const hasContext = Boolean(context && sentence.trim());
    const key = cacheKey(
      trimmed,
      sentence,
      wordMode ? 'word' : 'sentence',
      targetLang,
      aiTag,
    );
    // 缓存里只会有 AI 结果；关掉 AI 后 aiTag 变成 mt，自然不会再命中旧释义。
    const cached = aiConfigured ? meaningCache.get(key) : undefined;
    let aiFailed = false;

    const run = async () => {
      if (cached) {
        if (!cancelled) {
          setState({
            loading: false,
            mode: 'ai',
            wordMeaning: cached.wordMeaning,
            sentenceTranslation: cached.sentence,
            contextTranslation: cached.wordMeaning ? null : cached.sentence,
            note: null,
            mainTranslation: cached.wordMeaning?.meaning ?? cached.sentence,
            error: null,
            aiConfigured,
            aiFailed: false,
          });
        }
        return;
      }

      setState({ ...emptyState(aiConfigured), loading: true });

      // —— 优先 AI ——
      // 即使上下文提取失败（例如 PDF 里拿不到整句），单词本身仍可交给模型，
      // 这样「配置了 AI 就不走谷歌翻译」在各种选区形态下都成立。
      if (aiConfigured) {
        try {
          if (wordMode) {
            const meaning = await translateWordInContext(aiSettings, {
              text: trimmed,
              context,
              sourceLang,
              targetLang,
            });
            if (cancelled) return;
            const sentenceTranslation = meaning.sentenceTranslation ?? null;
            remember(key, { wordMeaning: meaning, sentence: sentenceTranslation });
            setState({
              loading: false,
              mode: 'ai',
              wordMeaning: meaning,
              sentenceTranslation,
              contextTranslation: null,
              note: null,
              mainTranslation: meaning.meaning,
              error: null,
              aiConfigured,
              aiFailed: false,
            });
            return;
          }
          const result = await translateWithContext(aiSettings, {
            text: trimmed,
            context,
            sourceLang,
            targetLang,
          });
          if (cancelled) return;
          remember(key, { wordMeaning: null, sentence: result.translation });
          setState({
            loading: false,
            mode: 'ai',
            wordMeaning: null,
            sentenceTranslation: result.translation,
            contextTranslation: result.translation,
            note: result.note ?? null,
            mainTranslation: result.translation,
            error: null,
            aiConfigured,
            aiFailed: false,
          });
          return;
        } catch (error) {
          console.warn('AI contextual translation failed, falling back to MT:', error);
          if (cancelled) return;
          // AI 失败（网络、配额、key 失效）时不要卡住用户，继续走免费机翻
          aiFailed = true;
        }
      }

      // —— 降级：机器翻译 ——
      // 主译文和语境参考句合并成一次调用，避免重复请求。
      try {
        const inputs = [trimmed];
        if (hasContext && sentence.trim() !== trimmed) inputs.push(sentence);
        const results = await translate(inputs, {
          source: sourceLang,
          target: targetLang,
        });
        if (cancelled) return;
        const mainTranslation = results[0]?.trim() || null;
        if (!mainTranslation) {
          throw new Error('No translation found');
        }
        setState({
          loading: false,
          mode: 'sentence',
          wordMeaning: null,
          sentenceTranslation: inputs.length > 1 ? results[1]?.trim() || null : null,
          contextTranslation: null,
          note: null,
          mainTranslation,
          error: null,
          aiConfigured,
          aiFailed,
        });
      } catch (error) {
        if (cancelled) return;
        setState({
          loading: false,
          mode: null,
          wordMeaning: null,
          sentenceTranslation: null,
          contextTranslation: null,
          note: null,
          mainTranslation: null,
          error: error instanceof Error ? error.message : String(error),
          aiConfigured,
          aiFailed,
        });
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    text,
    sentence,
    context?.previousSentence,
    context?.paragraph,
    sourceLang,
    targetLang,
    aiConfigured,
    aiTag,
    wordMode,
    translate,
  ]);

  return state;
}

/** 测试用：清空进程内的释义缓存 */
export const clearContextMeaningCache = () => {
  meaningCache.clear();
};
