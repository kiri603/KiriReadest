import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookConfig, ViewSettings } from '@/types/book';
import type { EnvConfigType } from '@/services/environment';
import { saveReadingLayout } from '@/helpers/readingLayout';

const state = vi.hoisted(() => ({
  global: { writingMode: 'auto', vertical: false, rtl: false } as ViewSettings,
  current: { writingMode: 'auto', vertical: false, rtl: false } as ViewSettings,
  disk: null as BookConfig | null,
  save: vi.fn(),
  recreate: vi.fn(),
}));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      settings: { globalViewSettings: state.global },
      saveSettings: state.save,
      setSettings: (settings: { globalViewSettings: ViewSettings }) => {
        state.global = settings.globalViewSettings;
      },
    }),
  },
}));
vi.mock('@/store/readerStore', () => ({
  useReaderStore: {
    getState: () => ({
      getViewSettings: () => state.current,
      setViewSettings: (_key: string, settings: ViewSettings) => {
        state.current = settings;
      },
      recreateViewer: state.recreate,
    }),
  },
}));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: {
    getState: () => ({
      getConfig: () => ({
        viewSettings: state.current,
        booknotes: [{ id: 'note' }],
        location: 'here',
      }),
      saveConfig: async (_env: unknown, _key: string, config: BookConfig) => {
        state.disk = structuredClone(config);
      },
    }),
  },
}));
const env = {} as EnvConfigType;

beforeEach(() => {
  state.global = { writingMode: 'auto', vertical: false, rtl: false } as ViewSettings;
  state.current = { ...state.global };
  state.disk = null;
  state.save.mockReset().mockResolvedValue(undefined);
  state.recreate.mockReset();
});

describe('reading layout persistence', () => {
  it('saves a vertical default from the library without recreating an empty book', async () => {
    await saveReadingLayout(env, '', { writingMode: 'vertical-rl' });
    const saved = state.save.mock.calls[0]![1];
    expect(saved.globalViewSettings).toMatchObject({
      writingMode: 'vertical-rl',
      vertical: true,
      rtl: true,
    });
    expect(state.global.writingMode).toBe('vertical-rl');
    expect(state.recreate).not.toHaveBeenCalled();
  });

  it('persists book layout before reloading the viewer, retaining progress and notes', async () => {
    state.recreate.mockImplementation(() => {
      expect(state.disk?.viewSettings?.writingMode).toBe('vertical-rl');
    });
    await saveReadingLayout(env, 'book-view', { writingMode: 'vertical-rl' });
    expect(state.disk).toMatchObject({
      location: 'here',
      booknotes: [{ id: 'note' }],
      viewSettings: { writingMode: 'vertical-rl', rtl: true },
    });
    expect(state.global.writingMode).toBe('auto');
  });

  it('saves page-turn preference without changing text layout or recreating a book', async () => {
    state.current = { writingMode: 'vertical-rl', vertical: true, rtl: true } as ViewSettings;
    await saveReadingLayout(env, 'book-view', { pageTurnDirection: 'ltr' });
    expect(state.disk?.viewSettings).toMatchObject({
      writingMode: 'vertical-rl',
      rtl: true,
      pageTurnDirection: 'ltr',
    });
    expect(state.recreate).not.toHaveBeenCalled();
  });

  it('keeps the old global setting when disk persistence fails', async () => {
    state.save.mockRejectedValue(new Error('Disk full'));
    await expect(saveReadingLayout(env, '', { writingMode: 'vertical-rl' })).rejects.toThrow(
      'Disk full',
    );
    expect(state.global.writingMode).toBe('auto');
  });
});
