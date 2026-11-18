import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import TranslatorPopup from '@/app/reader/components/annotator/TranslatorPopup';
import { extractSelectionContext, type SelectionContext } from '@/utils/translationContext';
import { getTextFromRange } from '@/utils/sel';
import { clearContextMeaningCache } from '@/hooks/useContextMeaning';

// 稳定的引用很重要：translators 数组每次渲染都换新会把弹窗的 provider 列表 effect 变成死循环
const h = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  translate: vi.fn(),
  translators: [{ name: 'google', label: 'Google Translate' }],
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: (selector?: (state: unknown) => unknown) => {
    const state = { settings: h.settings, setSettings: vi.fn() };
    return selector ? selector(state) : state;
  },
}));

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

// 弹窗本体和下拉框只关心内容与文案，测试里用最简替身
vi.mock('@/components/Popup', () => ({
  default: (props: { children?: React.ReactNode }) => props.children ?? null,
}));

vi.mock('@/components/Select', () => ({
  default: () => null,
}));

import { translateWordInContext } from '@/services/translators/ai';

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
    vi.mocked(translateWordInContext).mockReset();
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
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('shows network and proxy troubleshooting when translation fails', async () => {
    h.translate.mockRejectedValue(new Error('google translate is unreachable'));

    renderPopup();

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Google Translate failed. Check your network and proxy. If you use rule mode, try global mode.',
    );
  });

  it('sends only base text to machine translation and AI when selecting ruby', async () => {
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
    await waitFor(() => expect(h.translate).toHaveBeenCalledWith(['装っていた']));
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
    expect(screen.queryByText(/よそお/)).toBeNull();
  });
});
