import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const h = vi.hoisted(() => {
  const google = {
    name: 'google',
    label: 'Google Translate',
    translate: vi.fn(async (): Promise<string[]> => {
      throw new Error('network unreachable');
    }),
  };
  const azure = {
    name: 'azure',
    label: 'Azure Translator',
    translate: vi.fn(async () => ['你好']),
  };
  return {
    providers: [google, azure],
    dispatch: vi.fn(),
    storeInCache: vi.fn(async () => {}),
  };
});

vi.mock('@/services/translators', () => ({
  ErrorCodes: {
    UNAUTHORIZED: 'Unauthorized',
    DAILY_QUOTA_EXCEEDED: 'Daily Quota Exceeded',
    INTERNAL_SERVER_ERROR: 'Internal Server Error',
  },
  getTranslator: (name: string) => h.providers.find((provider) => provider.name === name),
  getTranslators: () => h.providers,
  getFromCache: vi.fn(async () => null),
  storeInCache: h.storeInCache,
  polish: (translations: string[]) => translations,
  preprocess: (texts: string[]) => texts,
}));

vi.mock('@/utils/event', () => ({
  eventDispatcher: { dispatch: h.dispatch },
}));

vi.mock('@/utils/misc', () => ({
  getLocale: () => 'zh-CN',
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

import { useTranslator } from '@/hooks/useTranslator';

describe('useTranslator fallback', () => {
  it('uses Google when a saved provider is no longer available', async () => {
    const google = h.providers[0]!;
    google.translate.mockResolvedValueOnce(['你好']);
    const savedSettings = JSON.parse('{"provider":"yandex","targetLang":"zh-CN"}');
    const { result } = renderHook(() => useTranslator(savedSettings));

    await act(async () => {
      await expect(result.current.translate(['hello'])).resolves.toEqual(['你好']);
    });
    expect(result.current.translator?.name).toBe('google');
  });

  it('uses another translator when the selected one fails and tells the user', async () => {
    const { result } = renderHook(() =>
      useTranslator({ provider: 'google', sourceLang: 'en', targetLang: 'zh-CN' }),
    );

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let translated: string[] = [];
    await act(async () => {
      translated = await result.current.translate(['hello']);
    });
    warn.mockRestore();

    expect(translated).toEqual(['你好']);
    expect(h.dispatch).toHaveBeenCalledWith(
      'toast',
      expect.objectContaining({
        message: '{{from}} is unavailable; using {{to}} instead.',
        type: 'warning',
      }),
    );
    expect(h.storeInCache).toHaveBeenCalledWith('hello', '你好', 'en', 'zh-CN', 'google');
  });
});
