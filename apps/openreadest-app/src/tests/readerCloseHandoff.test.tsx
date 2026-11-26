import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReaderContent from '@/app/reader/components/ReaderContent';
import type { SystemSettings } from '@/types/settings';

const mock = vi.hoisted(() => ({
  config: { location: 'current-page', progressUpdatedAt: 20, updatedAt: 20 },
  bookKeys: ['book-key'],
  saveConfig: vi.fn(),
  flush: vi.fn(),
  saveSettings: vi.fn(),
  navigate: vi.fn(),
  dismiss: vi.fn(),
  clearViewState: vi.fn(),
  registerWindowClose: vi.fn(),
  isTauri: false,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({}),
  useSearchParams: () => ({ get: () => 'book' }),
}));
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {}, appService: { hasWindow: false, isDesktopApp: false } }),
}));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (value: string) => value }));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: Object.assign(() => ({ saveSettings: mock.saveSettings }), {
    getState: () => ({ settings: { lastOpenBooks: ['book'] } }),
  }),
}));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getBookData: () => ({ book: { hash: 'book' }, bookDoc: {} }),
    getConfig: () => mock.config,
    saveConfig: mock.saveConfig,
  }),
}));
vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    setBookKeys: vi.fn(),
    getViewState: () => ({ isPrimary: true }),
    getViewSettings: () => ({}),
    clearViewState: mock.clearViewState,
    getView: () => null,
  }),
}));
vi.mock('@/store/sidebarStore', () => ({ useSidebarStore: () => ({}) }));
vi.mock('@/store/themeStore', () => ({ useThemeStore: () => ({}) }));
vi.mock('@/helpers/openWith', () => ({ parseOpenWithFiles: async () => [] }));
vi.mock('@/utils/window', () => ({
  tauriHandleOnCloseWindow: mock.registerWindowClose,
  tauriHandleClose: vi.fn(),
}));
vi.mock('@/utils/nav', () => ({ navigateToLibrary: mock.navigate }));
vi.mock('@/utils/discord', () => ({ clearDiscordPresence: vi.fn() }));
vi.mock('@/services/environment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/environment')>()),
  isTauriAppPlatform: () => mock.isTauri,
}));
vi.mock('@/services/webdav/sync/readingProgress', () => ({
  flushWebDavReadingProgress: mock.flush,
}));
vi.mock('@/components/metadata', () => ({ BookDetailModal: () => null }));
vi.mock('@/components/settings/SettingsDialog', () => ({ default: () => null }));
vi.mock('@/app/reader/hooks/useBooksManager', () => ({
  default: () => ({ bookKeys: mock.bookKeys, dismissBook: mock.dismiss }),
}));
vi.mock('@/app/reader/hooks/useBookShortcuts', () => ({ default: () => {} }));
vi.mock('@/app/reader/components/sidebar/SideBar', () => ({ default: () => null }));
vi.mock('@/app/reader/components/notebook/Notebook', () => ({ default: () => null }));
vi.mock('@/app/reader/components/BooksGrid', () => ({
  default: ({ onCloseBook }: { onCloseBook: (key: string) => void }) => (
    <button onClick={() => onCloseBook('book-key')}>Close book</button>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mock.isTauri = false;
  mock.saveConfig.mockResolvedValue(undefined);
  mock.registerWindowClose.mockResolvedValue(() => {});
});

afterEach(cleanup);

describe('closing the reader after a reading handoff', () => {
  it('saves locally and waits for WebDAV before returning from the book to the library', async () => {
    let finishUpload!: () => void;
    mock.flush.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishUpload = resolve;
        }),
    );
    render(<ReaderContent settings={{} as SystemSettings} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close book' }));
    await waitFor(() => expect(mock.flush).toHaveBeenCalledWith({ hash: 'book' }, mock.config));
    expect(mock.saveConfig).toHaveBeenCalledWith({}, 'book-key', mock.config, expect.anything());
    expect(mock.navigate).not.toHaveBeenCalled();
    await act(async () => finishUpload());

    expect(mock.navigate).toHaveBeenCalledOnce();
  });

  it('returns a pending promise to the native window close handler until the upload finishes', async () => {
    mock.isTauri = true;
    let finishUpload!: () => void;
    mock.flush.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishUpload = resolve;
        }),
    );
    render(<ReaderContent settings={{} as SystemSettings} />);
    const nativeClose = mock.registerWindowClose.mock.calls[0]![0] as () => Promise<void>;

    const completion = nativeClose();
    const repeatedClose = nativeClose();
    await waitFor(() => expect(mock.flush).toHaveBeenCalledOnce());
    expect(repeatedClose).toBe(completion);
    expect(mock.saveSettings).not.toHaveBeenCalled();
    await act(async () => {
      finishUpload();
      await completion;
    });

    expect(mock.saveSettings).toHaveBeenCalledOnce();
  });
});
