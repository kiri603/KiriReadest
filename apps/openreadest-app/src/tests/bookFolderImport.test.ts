import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canSelectBookFolder, selectBookFolder } from '@/app/library/utils/bookFolderImport';
import { SUPPORTED_BOOK_EXTS } from '@/services/constants';
import { isTauriAppPlatform } from '@/services/environment';
import type { AppService } from '@/types/system';
import { selectDirectory as selectAndroidDirectory } from '@/utils/bridge';

vi.mock('@/services/environment', () => ({ isTauriAppPlatform: vi.fn() }));
vi.mock('@/utils/bridge', () => ({ selectDirectory: vi.fn() }));
vi.mock('@/utils/path', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/path')>()),
  joinPaths: async (...parts: string[]) => parts.join('\\'),
}));

describe('book folder scanning', () => {
  const selectDirectory = vi.fn();
  const readDirectory = vi.fn();
  const appService = { selectDirectory, readDirectory } as unknown as AppService;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('prepares supported books at any depth with their folder groups', async () => {
    vi.mocked(isTauriAppPlatform).mockReturnValue(true);
    selectDirectory.mockResolvedValue('C:\\Downloads\\Books');
    readDirectory.mockResolvedValue([
      { path: 'Guide.EPUB' },
      { path: 'Fiction\\Classics\\Guide.PDF' },
      { path: 'Notes.dll' },
      { path: 'Data\\epub' },
      { path: 'book.epub.bak' },
    ]);

    const books = await selectBookFolder(appService);

    expect(readDirectory).toHaveBeenCalledWith('C:\\Downloads\\Books', 'None');
    expect(books).toEqual([
      {
        relativePath: 'Fiction\\Classics\\Guide.PDF',
        path: 'C:\\Downloads\\Books\\Fiction\\Classics\\Guide.PDF',
        groupName: 'Books/Fiction/Classics',
      },
      {
        relativePath: 'Guide.EPUB',
        path: 'C:\\Downloads\\Books\\Guide.EPUB',
        groupName: 'Books',
      },
    ]);
  });

  it('handles cancellation without reading any directory', async () => {
    vi.mocked(isTauriAppPlatform).mockReturnValue(true);
    selectDirectory.mockResolvedValue(null);

    await expect(selectBookFolder(appService)).resolves.toBeNull();
    expect(readDirectory).not.toHaveBeenCalled();
  });

  it('imports Android documents from the selected directory tree using their content URI', async () => {
    vi.mocked(isTauriAppPlatform).mockReturnValue(true);
    const androidService: AppService = {
      ...appService,
      isAndroidApp: true,
      canReadExternalDir: false,
    };
    const uri = 'content://com.android.externalstorage.documents/tree/primary%3ABooks/document/42';
    vi.mocked(selectAndroidDirectory).mockResolvedValue({
      cancelled: false,
      directoryName: 'Books',
      files: [{ relativePath: 'Novels/100%.EPUB', uri }],
    });

    expect(canSelectBookFolder(androidService)).toBe(true);
    await expect(selectBookFolder(androidService)).resolves.toEqual([
      { relativePath: 'Novels/100%.EPUB', groupName: 'Books/Novels', path: uri },
    ]);
    expect(selectAndroidDirectory).toHaveBeenCalledWith(SUPPORTED_BOOK_EXTS);
    expect(readDirectory).not.toHaveBeenCalled();
  });

  it('distinguishes cancellation from a failed Android directory scan', async () => {
    vi.mocked(isTauriAppPlatform).mockReturnValue(true);
    const androidService = { ...appService, isAndroidApp: true };
    vi.mocked(selectAndroidDirectory)
      .mockResolvedValueOnce({ cancelled: true })
      .mockResolvedValueOnce({ error: 'Directory unavailable' });

    await expect(selectBookFolder(androidService)).resolves.toBeNull();
    await expect(selectBookFolder(androidService)).rejects.toThrow('Directory unavailable');
  });

  it('uses browser files from nested folders and ignores unsupported formats', async () => {
    const book = new File(['book'], 'Novel.EPUB');
    Object.defineProperty(book, 'webkitRelativePath', { value: 'Books/Novels/Novel.EPUB' });
    const otherFile = new File(['image'], 'Cover.png');
    Object.defineProperty(otherFile, 'webkitRelativePath', { value: 'Books/Novels/Cover.png' });
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement,
    ) {
      expect(this.hasAttribute('webkitdirectory')).toBe(true);
      Object.defineProperty(this, 'files', { value: [otherFile, book] });
      this.dispatchEvent(new Event('change'));
    });

    try {
      await expect(selectBookFolder(appService)).resolves.toEqual([
        { relativePath: 'Novels/Novel.EPUB', groupName: 'Books/Novels', file: book },
      ]);
    } finally {
      click.mockRestore();
    }
  });
});
