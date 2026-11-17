import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TTSPanel from '@/app/reader/components/tts/TTSPanel';

const state = vi.hoisted(() => ({
  viewSettings: { ttsTargetLang: '', ttsRate: 1, ttsVoice: '', showTTSBar: false },
  settings: { globalViewSettings: { ttsTargetLang: '' } },
  saveSettings: vi.fn(),
}));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ envConfig: {} }) }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (text: string) => text }));
vi.mock('@/hooks/useResponsiveSize', () => ({
  useDefaultIconSize: () => 24,
  useResponsiveSize: (size: number) => size,
}));
vi.mock('@/utils/misc', () => ({ getLocale: () => 'zh-CN' }));
vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getViewSettings: () => state.viewSettings,
    setViewSettings: (_key: string, settings: typeof state.viewSettings) => {
      state.viewSettings = settings;
    },
  }),
}));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: state.settings,
    setSettings: vi.fn(),
    saveSettings: state.saveSettings,
  }),
}));

const props = () => ({
  bookKey: 'test-view',
  ttsLang: 'zh',
  isPlaying: false,
  timeoutOption: 0,
  timeoutTimestamp: 0,
  onTogglePlay: vi.fn(),
  onBackward: vi.fn(),
  onForward: vi.fn(),
  onSetRate: vi.fn(),
  onGetVoices: vi.fn(async () => []),
  onSetVoice: vi.fn(),
  onGetVoiceId: () => '',
  onSelectTimeout: vi.fn(),
  onToogleTTSBar: vi.fn(),
});

beforeEach(() => {
  state.viewSettings.ttsTargetLang = '';
  state.settings.globalViewSettings.ttsTargetLang = '';
  state.saveSettings.mockClear();
});
afterEach(cleanup);

describe('TTS language setting', () => {
  it('saves the selected language and offers voices for that language', async () => {
    const callbacks = props();
    const { unmount } = render(<TTSPanel {...callbacks} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Read Aloud Language' }), {
      target: { value: 'ja' },
    });
    expect(state.viewSettings.ttsTargetLang).toBe('ja');
    expect(state.settings.globalViewSettings.ttsTargetLang).toBe('ja');
    expect(state.saveSettings).toHaveBeenCalledOnce();
    await waitFor(() => expect(callbacks.onGetVoices).toHaveBeenLastCalledWith('ja'));
    unmount();
    render(<TTSPanel {...callbacks} />);
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('ja');
    expect(screen.getByRole('option', { name: '日语' })).toBeTruthy();
  });

  it('can select all languages while keeping voice selection on the speaking language', async () => {
    const callbacks = props();
    state.viewSettings.ttsTargetLang = 'ja';
    render(<TTSPanel {...callbacks} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'all' } });
    expect(state.viewSettings.ttsTargetLang).toBe('all');
    await waitFor(() => expect(callbacks.onGetVoices).toHaveBeenLastCalledWith('zh'));
  });
});
