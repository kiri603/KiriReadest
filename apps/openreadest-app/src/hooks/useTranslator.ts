import { useState, useCallback, useEffect } from 'react';
import { ErrorCodes, getTranslator, getTranslators, TranslatorName } from '@/services/translators';
import { getFromCache, storeInCache, UseTranslatorOptions } from '@/services/translators';
import { polish, preprocess } from '@/services/translators';
import { eventDispatcher } from '@/utils/event';
import { getLocale } from '@/utils/misc';
import { useTranslation } from './useTranslation';

// 本 fork 已移除账号系统：所有翻译源都是免登录的公共接口，只保留配额判断
const getAvailableTranslator = (provider?: TranslatorName) => {
  const availableTranslators = getTranslators().filter((translator) => !translator.quotaExceeded);

  return (
    availableTranslators.find((translator) => translator.name === provider) ||
    availableTranslators[0]
  );
};

export function useTranslator({
  provider = 'google',
  sourceLang = 'AUTO',
  targetLang = 'EN',
  enablePolishing = true,
  enablePreprocessing = true,
}: UseTranslatorOptions = {}) {
  const _ = useTranslation();
  const initialTranslator = getAvailableTranslator(provider);
  const [loading, setLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<TranslatorName>(
    initialTranslator?.name as TranslatorName,
  );
  const [translator, setTransltor] = useState(() => initialTranslator);
  const [translators] = useState(() => getTranslators());

  useEffect(() => {
    setLoading(false);
  }, [provider, sourceLang, targetLang]);

  useEffect(() => {
    const selectedTranslator = getAvailableTranslator(provider);
    if (!selectedTranslator) {
      return;
    }
    const selectedProviderName = selectedTranslator.name as TranslatorName;
    setTransltor(getTranslator(selectedProviderName));
    setSelectedProvider(selectedProviderName);
  }, [provider]);

  const translate = useCallback(
    async (
      input: string[],
      options?: { source?: string; target?: string; useCache?: boolean },
    ): Promise<string[]> => {
      const sourceLanguage = options?.source || sourceLang;
      const targetLanguage = options?.target || targetLang || getLocale();
      const useCache = options?.useCache ?? false;
      const textsToTranslate = enablePreprocessing ? preprocess(input) : input;

      if (textsToTranslate.length === 0 || textsToTranslate.every((t) => !t?.trim())) {
        return textsToTranslate;
      }

      const textsNeedingTranslation: string[] = [];
      const indicesNeedingTranslation: number[] = [];

      await Promise.all(
        textsToTranslate.map(async (text, index) => {
          if (!text?.trim()) return;

          const cachedTranslation = await getFromCache(
            text,
            sourceLanguage,
            targetLanguage,
            selectedProvider,
          );
          if (cachedTranslation) return;

          textsNeedingTranslation.push(text);
          indicesNeedingTranslation.push(index);
        }),
      );

      if (textsNeedingTranslation.length === 0) {
        const results = await Promise.all(
          textsToTranslate.map((text) =>
            getFromCache(text, sourceLanguage, targetLanguage, selectedProvider).then(
              (cached) => cached || text,
            ),
          ),
        );

        return enablePolishing ? polish(results, targetLanguage) : results;
      }

      setLoading(true);

      try {
        const translator = translators.find((t) => t.name === selectedProvider);
        if (!translator) {
          throw new Error(`No translator found for provider: ${selectedProvider}`);
        }

        // 选中的翻译源报错或被网络拦掉时，自动换下一个可用源，
        // 而不是直接把「无法获取翻译」甩给用户
        const candidates = [
          translator,
          ...translators.filter((t) => t.name !== translator.name && !t.quotaExceeded),
        ];

        let translatedTexts: string[] | null = null;
        let usedProvider = selectedProvider;
        let lastError: unknown = null;

        for (const candidate of candidates) {
          try {
            translatedTexts = await candidate.translate(
              textsNeedingTranslation,
              sourceLanguage,
              targetLanguage,
              useCache,
            );
            usedProvider = candidate.name as TranslatorName;
            break;
          } catch (candidateError) {
            lastError = candidateError;
            console.warn(
              `Translation provider ${candidate.name} failed, trying the next one:`,
              candidateError,
            );
          }
        }

        if (!translatedTexts) {
          throw lastError instanceof Error ? lastError : new Error(String(lastError));
        }

        if (usedProvider !== selectedProvider) {
          const usedTranslator = translators.find((t) => t.name === usedProvider);
          eventDispatcher.dispatch('toast', {
            timeout: 5000,
            message: _('{{from}} is unavailable; using {{to}} instead.', {
              from: translator.label,
              to: usedTranslator?.label ?? usedProvider,
            }),
            type: 'warning',
          });
          setSelectedProvider(usedProvider);
        }

        await Promise.all(
          textsNeedingTranslation.map(async (text, index) => {
            return storeInCache(
              text,
              translatedTexts![index] || '',
              sourceLanguage,
              targetLanguage,
              selectedProvider,
            );
          }),
        );

        const results = [...textsToTranslate];
        indicesNeedingTranslation.forEach((originalIndex, translationIndex) => {
          results[originalIndex] = translatedTexts[translationIndex] || '';
        });

        await Promise.all(
          results.map(async (_, index) => {
            if (!indicesNeedingTranslation.includes(index)) {
              const originalText = textsToTranslate[index];
              if (!originalText?.trim()) return;

              const cachedTranslation = await getFromCache(
                originalText,
                sourceLanguage,
                targetLanguage,
                selectedProvider,
              );

              if (cachedTranslation) {
                results[index] = cachedTranslation;
              }
            }
          }),
        );

        setLoading(false);
        return enablePolishing ? polish(results, targetLanguage) : results;
      } catch (err) {
        if (err instanceof Error && err.message.includes(ErrorCodes.DAILY_QUOTA_EXCEEDED)) {
          const fallbackTranslator = getAvailableTranslator();
          eventDispatcher.dispatch('toast', {
            timeout: 5000,
            message: _('Selected translation service is temporarily unavailable.'),
            type: 'warning',
          });
          if (fallbackTranslator) {
            setSelectedProvider(fallbackTranslator.name as TranslatorName);
          }
        }
        setLoading(false);
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedProvider, sourceLang, targetLang, translator],
  );

  return {
    translate,
    translator,
    translators,
    loading,
  };
}
