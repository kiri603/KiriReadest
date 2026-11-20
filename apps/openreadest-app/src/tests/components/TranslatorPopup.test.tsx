import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TranslatorPopup from '@/app/reader/components/annotator/TranslatorPopup';
import { extractSelectionContext, type SelectionContext } from '@/utils/translationContext';
import { getTextFromRange } from '@/utils/sel';
import { clearContextMeaningCache } from '@/hooks/useContextMeaning';

// 稳定的引用很重要：translators 数组每次渲染都换新会把弹窗的 provider 列表 effect 变成死循环
const h = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  envConfig: { getAppService: vi.fn() },
  translate: vi.fn(),
  translators: [{ name: 'google', label: 'Google Translate' }],
  writeText: vi.fn(),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: h.envConfig, appService: null }),
}));

vi.mock('@/store/settingsStore', () => {
  const useSettingsStore = (selector?: (state: unknown) => unknown) => {
    const state = { settings: h.settings, setSettings: vi.fn() };
    return selector ? selector(state) : state;
  };
  return {
    useSettingsStore: Object.assign(useSettingsStore, {
      getState: () => ({ settings: h.settings }),
    }),
  };
});

vi.mock('@/hooks/useTranslator', () => ({
  useTranslator: () => ({
    translate: h.translate,
    translators: h.translators,
    loading: false,
  }),
}));

vi.mock('@/services/translators', () => ({
  getTranslators: () => h.translators,
}));

vi.mock('@/services/translators/ai', () => ({
  isAiConfigured: (settings?: { apiKey?: string } | null) => Boolean(settings?.apiKey),
  translateWordInContext: vi.fn(),
  translateWithContext: vi.fn(),
}));

vi.mock('@/helpers/wordNotes', () => ({
  saveWordNote: vi.fn(async () => ({ id: 'note-1' })),
}));

// 弹窗本体和下拉框只关心内容与文案，测试里用最简替身
vi.mock('@/components/Popup', () => ({
  default: (props: { children?: React.ReactNode }) => props.children ?? null,
}));

vi.mock('@/components/Select', () => ({
  default: () => null,
}));

import { translateWordInContext } from '@/services/translators/ai';
import { saveWordNote } from '@/helpers/wordNotes';

const context: SelectionContext = {
  word: '違って',
  sentence: '誰かと違って、猫耳なんて付けさせない。',
  previousSentence: 'そうだ。',
  paragraph: 'そうだ。誰かと違って、猫耳なんて付けさせない。',
};

const aiSettings = {
  enabled: true,
  baseUrl: 'https://api.deepseek.com',
  apiKey: 'test-key',
  model: 'deepseek-chat',
};

const globalReadSettings = {
  translateTargetLang: 'zh-CN',
  translationProvider: 'google',
};

const renderPopup = () =>
  render(
    <TranslatorPopup
      text='違って'
      context={context}
      position={{ point: { x: 0, y: 0 } }}
      trianglePosition={{ point: { x: 0, y: 0 } }}
      popupWidth={480}
      popupHeight={430}
    />,
  );

describe('TranslatorPopup', () => {
  beforeEach(() => {
    cleanup();
    clearContextMeaningCache();
    h.translate.mockReset();
    h.writeText.mockReset();
    h.writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: h.writeText },
      configurable: true,
    });
    vi.mocked(translateWordInContext).mockReset();
    vi.mocked(saveWordNote).mockClear();
    h.settings = { globalReadSettings };
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not show the machine-translation error when the AI context card succeeded', async () => {
    h.settings = { globalReadSettings, aiTranslation: aiSettings };
    vi.mocked(translateWordInContext).mockResolvedValue({ word: '違って', meaning: '与……不同' });
    h.translate.mockRejectedValue(new Error('google translate is unreachable'));

    renderPopup();

    await waitFor(() => expect(screen.getByText('与……不同')).toBeTruthy());
    expect(h.translate).not.toHaveBeenCalled();
    expect(screen.queryByText('Unable to fetch the translation. Try again later.')).toBeNull();
  });

  it('uses AI even when the selection context could not be extracted', async () => {
    h.settings = { globalReadSettings, aiTranslation: aiSettings };
    vi.mocked(translateWordInContext).mockResolvedValue({ word: '違って', meaning: '与……不同' });
    h.translate.mockRejectedValue(new Error('google translate is unreachable'));

    render(
      <TranslatorPopup
        text='違って'
        context={null}
        position={{ point: { x: 0, y: 0 } }}
        trianglePosition={{ point: { x: 0, y: 0 } }}
        popupWidth={480}
        popupHeight={430}
      />,
    );

    await waitFor(() => expect(screen.getByText('与……不同')).toBeTruthy());
    expect(h.translate).not.toHaveBeenCalled();
  });

  it('still reports the failure when nothing else could translate the text', async () => {
    h.translate.mockRejectedValue(new Error('google translate is unreachable'));

    renderPopup();

    await waitFor(() =>
      expect(screen.getByText('Unable to fetch the translation. Try again later.')).toBeTruthy(),
    );
  });

  it('uses machine translation as the main translation when AI is not configured', async () => {
    h.translate.mockResolvedValue(['不同', '谁和你不一样。']);

    renderPopup();

    await waitFor(() => expect(screen.getByText('不同')).toBeTruthy());
    expect(screen.getByText('谁和你不一样。')).toBeTruthy();
    expect(h.translate).toHaveBeenCalledWith(['違って', context.sentence], {
      source: 'AUTO',
      target: 'zh-CN',
    });
  });

  it('falls back to machine translation when the AI request fails', async () => {
    h.settings = { globalReadSettings, aiTranslation: aiSettings };
    vi.mocked(translateWordInContext).mockRejectedValue(new Error('boom'));
    h.translate.mockResolvedValue(['不同', '谁和你不一样。']);

    renderPopup();

    await waitFor(() =>
      expect(screen.getByText('AI request failed; showing machine translation instead.')).toBeTruthy(),
    );
    expect(screen.getByText('不同')).toBeTruthy();
    expect(screen.getByText('Machine Translation')).toBeTruthy();
  });

  it('sends only base text to AI when selecting ruby', async () => {
    h.settings = { globalReadSettings, aiTranslation: aiSettings };
    h.translate.mockResolvedValue(['装作']);
    vi.mocked(translateWordInContext).mockResolvedValue({ word: '装っていた', meaning: '装作' });
    const doc = new DOMParser().parseFromString(
      '<p>それまで無関係を<ruby>装<rt><span>よそお</span></rt></ruby>っていた。</p>',
      'text/html',
    );
    const range = doc.createRange();
    range.setStart(doc.querySelector('ruby')!.firstChild!, 0);
    range.setEnd(doc.querySelector('ruby')!.nextSibling!, 4);
    render(
      <TranslatorPopup
        text={getTextFromRange(range)}
        context={extractSelectionContext(range)}
        position={{ point: { x: 0, y: 0 } }}
        trianglePosition={{ point: { x: 0, y: 0 } }}
        popupWidth={480}
        popupHeight={430}
      />,
    );
    await waitFor(() =>
      expect(translateWordInContext).toHaveBeenCalledWith(
        aiSettings,
        expect.objectContaining({
          text: '装っていた',
          context: expect.objectContaining({
            word: '装っていた',
            sentence: 'それまで無関係を装っていた。',
            paragraph: 'それまで無関係を装っていた。',
          }),
        }),
      ),
    );
    expect(h.translate).not.toHaveBeenCalled();
    expect(screen.queryByText(/よそお/)).toBeNull();
  });

  it('copies the translated text to the clipboard', async () => {
    h.settings = { globalReadSettings, aiTranslation: aiSettings };
    vi.mocked(translateWordInContext).mockResolvedValue({ word: '違って', meaning: '与……不同' });

    renderPopup();
    await screen.findByText('与……不同');

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(h.writeText).toHaveBeenCalledWith('与……不同'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy());
  });

  it('saves reading and meaning as a word note for all books', async () => {
    h.settings = { globalReadSettings, aiTranslation: aiSettings };
    vi.mocked(translateWordInContext).mockResolvedValue({
      word: '違って',
      reading: 'しつ',
      meaning: '与……不同',
    });

    renderPopup();
    await screen.findByText('与……不同');

    fireEvent.click(screen.getByRole('button', { name: 'Add to word note' }));

    await waitFor(() =>
      expect(saveWordNote).toHaveBeenCalledWith(h.envConfig, '違って', 'しつ\n与……不同'),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy());
  });

  it('appends to an existing word note instead of overwriting it', async () => {
    h.settings = {
      globalReadSettings,
      aiTranslation: aiSettings,
      wordNotes: [{ id: 'n1', word: '違って', note: '旧笔记', createdAt: 1, updatedAt: 1 }],
    };
    vi.mocked(translateWordInContext).mockResolvedValue({
      word: '違って',
      reading: 'しつ',
      meaning: '与……不同',
    });

    renderPopup();
    await screen.findByText('与……不同');

    fireEvent.click(screen.getByRole('button', { name: 'Add to word note' }));

    await waitFor(() =>
      expect(saveWordNote).toHaveBeenCalledWith(h.envConfig, '違って', '旧笔记\nしつ\n与……不同'),
    );
  });
});
