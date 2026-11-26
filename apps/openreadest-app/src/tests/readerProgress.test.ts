import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReaderStore } from '@/store/readerStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useLibraryStore } from '@/store/libraryStore';
import type { FoliateView } from '@/types/view';

vi.mock('@/utils/toc', () => ({ updateToc: vi.fn() }));

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(100);
  useBookDataStore.setState({
    booksData: {
      book: {
        id: 'book',
        book: null,
        file: null,
        bookDoc: null,
        isFixedLayout: false,
        config: { location: 'saved-range', progressUpdatedAt: 10, updatedAt: 20 },
      },
    },
  });
  useLibraryStore.setState({ library: [] });
  useReaderStore.setState({
    viewStates: {
      'book-view': {
        key: 'book-view',
        view: null,
        viewerKey: '',
        isPrimary: true,
        loading: false,
        inited: false,
        error: null,
        progress: null,
        ribbonVisible: false,
        ttsEnabled: false,
        syncing: false,
        gridInsets: null,
        viewSettings: null,
      },
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  useReaderStore.setState({ viewStates: {} });
  useBookDataStore.setState({ booksData: {} });
});

const relocate = (location = 'page-normalized-range', reason?: string) =>
  useReaderStore
    .getState()
    .setProgress(
      'book-view',
      location,
      { id: 1, href: 'chapter', label: 'Chapter' },
      { current: 1, total: 5 },
      { current: 9, total: 100 },
      { section: 1, total: 10 },
      document.createRange(),
      reason,
    );

describe('reading position versions', () => {
  it('retains the legacy reading time before periodic saves change updatedAt', () => {
    delete useBookDataStore.getState().getConfig('book-view')!.progressUpdatedAt;
    relocate();
    expect(useBookDataStore.getState().getConfig('book-view')?.progressUpdatedAt).toBe(20);
  });

  it('preserves the saved position and version when opening a book on a different page size', () => {
    relocate();
    expect(useBookDataStore.getState().getConfig('book-view')).toMatchObject({
      location: 'saved-range',
      progressUpdatedAt: 10,
      progress: [10, 100],
    });
  });

  it('records a new reading action when the initialized reader turns a page', () => {
    useReaderStore.getState().setViewInited('book-view', true);
    relocate();
    expect(useBookDataStore.getState().getConfig('book-view')).toMatchObject({
      location: 'page-normalized-range',
      progressUpdatedAt: 100,
    });
  });

  it('preserves the reading version when only the visible EPUB range end changes', () => {
    const config = useBookDataStore.getState().getConfig('book-view')!;
    config.location = 'epubcfi(/6/50!/4,/2,/28/1:27)';
    useReaderStore.getState().setViewInited('book-view', true);
    relocate('epubcfi(/6/50!/4,/2,/8/5:28)', 'page');
    expect(useBookDataStore.getState().getConfig('book-view')).toMatchObject({
      location: 'epubcfi(/6/50!/4,/2,/28/1:27)',
      progressUpdatedAt: 10,
    });
  });

  it('ignores a delayed anchor relocation but records the next explicit navigation', () => {
    useReaderStore.getState().setViewInited('book-view', true);
    relocate('settled-range', 'anchor');
    relocate('browser-scroll-range', 'container-scroll');
    expect(useBookDataStore.getState().getConfig('book-view')?.progressUpdatedAt).toBe(10);
    relocate('new-chapter', 'navigation');
    expect(useBookDataStore.getState().getConfig('book-view')).toMatchObject({
      location: 'new-chapter',
      progressUpdatedAt: 100,
    });
  });

  it('does not turn applying a synced location into a new local reading action', async () => {
    useReaderStore.getState().setViewInited('book-view', true);
    useReaderStore
      .getState()
      .setView('book-view', { goTo: async () => relocate() } as unknown as FoliateView);
    await useReaderStore.getState().applySyncedProgress('book', 'saved-range');
    expect(useBookDataStore.getState().getConfig('book-view')).toMatchObject({
      location: 'saved-range',
      progressUpdatedAt: 10,
    });
    relocate();
    expect(useBookDataStore.getState().getConfig('book-view')?.progressUpdatedAt).toBe(100);
  });

  it('records reading actions again after a synced navigation fails', async () => {
    useReaderStore.getState().setViewInited('book-view', true);
    useReaderStore.getState().setView('book-view', {
      goTo: async () => {
        throw new Error('navigation failed');
      },
    } as unknown as FoliateView);
    await expect(
      useReaderStore.getState().applySyncedProgress('book', 'saved-range'),
    ).rejects.toThrow('navigation failed');
    relocate();
    expect(useBookDataStore.getState().getConfig('book-view')?.progressUpdatedAt).toBe(100);
  });
});
