import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import ContextMeaningCard from '@/app/reader/components/annotator/ContextMeaningCard';
import type { SelectionContext } from '@/utils/translationContext';

const store = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: (selector: (state: { settings: unknown }) => unknown) =>
    selector({ settings: store.settings }),
}));

vi.mock('@/services/translators/ai', () => ({
  isAiConfigured: (settings?: { apiKey?: string } | null) => Boolean(settings?.apiKey),
  translateWordInContext: vi.fn(),
  translateWithContext: vi.fn(),
}));

import { translateWithContext, translateWordInContext } from '@/services/translators/ai';
import { clearContextMeaningCache } from '@/hooks/useContextMeaning';

const context: SelectionContext = {
  word: 'bank',
  sentence: 'He sat on the bank of the river.',
  previousSentence: 'The old man was tired.',
  paragraph: 'The old man was tired. He sat on the bank of the river.',
};

const aiSettings = {
  enabled: true,
  baseUrl: 'https://api.deepseek.com',
  apiKey: 'test-key',
  model: 'deepseek-chat',
};

const mtTranslate = vi.fn(async () => ['他坐在河岸上。']);

const renderCard = (
  textValue: string,
  contextValue: SelectionContext | null = context,
  onConfigureAi?: () => void,
  onResult?: (hasResult: boolean) => void,
) =>
  render(
    <ContextMeaningCard
      text={textValue}
      context={contextValue}
      sourceLang='en'
      targetLang='zh-CN'
      translate={mtTranslate}
      onConfigureAi={onConfigureAi}
      onResult={onResult}
    />,
  );

describe('ContextMeaningCard', () => {
  beforeEach(() => {
    cleanup();
    clearContextMeaningCache();
    store.settings = {};
    mtTranslate.mockClear();
    vi.mocked(translateWordInContext).mockReset();
    vi.mocked(translateWithContext).mockReset();
  });

  it('renders the AI sense of the word in its sentence', async () => {
    store.settings = { aiTranslation: aiSettings };
    vi.mocked(translateWordInContext).mockResolvedValue({
      word: 'bank',
      partOfSpeech: 'n.',
      meaning: '河岸',
      why: '与 river 搭配',
      sentenceTranslation: '他坐在河岸上。',
    });

    renderCard('bank');

    await waitFor(() => expect(screen.getByText('河岸')).toBeTruthy());
    expect(screen.getByText('Meaning in context')).toBeTruthy();
    expect(screen.getByText('n.')).toBeTruthy();
    expect(screen.getByText('与 river 搭配')).toBeTruthy();
    expect(screen.getByText('他坐在河岸上。')).toBeTruthy();
    expect(mtTranslate).not.toHaveBeenCalled();
    expect(vi.mocked(translateWordInContext)).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'test-key' }),
      expect.objectContaining({ text: 'bank', context, sourceLang: 'en', targetLang: 'zh-CN' }),
    );
  });

  it('falls back to a machine-translated sentence when the AI request fails', async () => {
    store.settings = { aiTranslation: aiSettings };
    vi.mocked(translateWordInContext).mockRejectedValue(new Error('network down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    renderCard('bank');

    await waitFor(() => expect(screen.getByText('他坐在河岸上。')).toBeTruthy());
    expect(screen.getByText('bank')).toBeTruthy();
    expect(mtTranslate).toHaveBeenCalledWith([context.sentence], {
      source: 'en',
      target: 'zh-CN',
    });
    expect(screen.queryByText('Unable to read the context.')).toBeNull();
    expect(screen.getByText('Machine Translation')).toBeTruthy();
    expect(
      screen.getByText('AI request failed; showing machine translation instead.'),
    ).toBeTruthy();
    warn.mockRestore();
  });

  it('uses machine translation and invites configuring AI when none is set', async () => {
    renderCard('bank');

    await waitFor(() => expect(screen.getByText('他坐在河岸上。')).toBeTruthy());
    expect(screen.getByText('Machine Translation')).toBeTruthy();
    expect(
      screen.getByText(
        'Configure an AI service in Settings → Language to pin down the exact sense in this sentence.',
      ),
    ).toBeTruthy();
    expect(vi.mocked(translateWordInContext)).not.toHaveBeenCalled();
  });

  it('opens the in-app AI settings from the card instead of asking for a file edit', async () => {
    const onConfigureAi = vi.fn();
    renderCard('bank', context, onConfigureAi);

    await waitFor(() => expect(screen.getByText('他坐在河岸上。')).toBeTruthy());
    const button = screen.getByRole('button', { name: 'Configure AI' });
    button.click();
    expect(onConfigureAi).toHaveBeenCalledTimes(1);
  });

  it('translates longer selections with context instead of giving a sense', async () => {
    store.settings = { aiTranslation: aiSettings };
    vi.mocked(translateWithContext).mockResolvedValue({
      translation: '他坐在河岸上。',
      note: 'bank 取河岸义',
    });

    renderCard('He sat on the bank of the river.');

    await waitFor(() => expect(screen.getByText('Translation with context')).toBeTruthy());
    expect(screen.getByText('他坐在河岸上。')).toBeTruthy();
    expect(screen.getByText('bank 取河岸义')).toBeTruthy();
    expect(vi.mocked(translateWithContext)).toHaveBeenCalledTimes(1);
  });

  it('reports whether it produced a usable result, so the popup can drop a failing MT error', async () => {
    store.settings = { aiTranslation: aiSettings };
    vi.mocked(translateWordInContext).mockResolvedValue({
      word: 'bank',
      meaning: '河岸',
    });
    const onResult = vi.fn();
    mtTranslate.mockRejectedValue(new Error('machine translation is down'));

    renderCard('bank', context, undefined, onResult);

    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith(true));
  });

  it('reports no result when both the AI request and machine translation fail', async () => {
    const onResult = vi.fn();
    mtTranslate.mockRejectedValue(new Error('machine translation is down'));

    renderCard('bank', context, undefined, onResult);

    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith(false));
  });

  it('renders nothing without context', () => {
    const { container } = renderCard('bank', null);
    expect(container.innerHTML).toBe('');
  });
});
