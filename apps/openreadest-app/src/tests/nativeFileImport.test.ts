import { beforeEach, describe, expect, it, vi } from 'vitest';
import { basename, join } from '@tauri-apps/api/path';
import { type as osType } from '@tauri-apps/plugin-os';
import { open } from '@tauri-apps/plugin-fs';
import { copyURIToPath } from '@/utils/bridge';
import { getFilename } from '@/utils/path';

vi.mock('@tauri-apps/api/path', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/path')>()),
  basename: vi.fn(),
  join: vi.fn(async (...parts: string[]) => parts.join('/')),
  appCacheDir: vi.fn(async () => '/app/cache/'),
}));

vi.mock('@tauri-apps/plugin-os', () => ({ type: vi.fn() }));

vi.mock('@tauri-apps/plugin-fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/plugin-fs')>()),
  open: vi.fn(async () => ({ stat: async () => ({ size: 42, mtime: null }) })),
}));

vi.mock('@/utils/bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/bridge')>()),
  copyURIToPath: vi.fn(async () => ({ success: true })),
}));

describe('native file import', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.mocked(osType).mockReturnValue('android');
  });

  it.each(['100%.epub', '%FF.epub', 'A%2FB.epub', 'A%20B.epub', '中文#&+.epub'])(
    'preserves the provider display name %s',
    async (filename) => {
      const uri = 'content://com.android.providers.media.documents/document/document%3A24';
      vi.mocked(basename).mockResolvedValue(filename);
      const { nativeFileSystem } = await import('@/services/nativeAppService');

      const file = await nativeFileSystem.openFile(uri, 'None');

      expect(file.name).toBe(filename);
      expect(file.size).toBe(42);
      expect(copyURIToPath).toHaveBeenCalledWith({
        uri,
        dst: expect.stringMatching(/^\/app\/cache\/[^/]+$/),
      });
    },
  );

  it('uses separate temporary paths for two sources with the same display name', async () => {
    const { nativeFileSystem } = await import('@/services/nativeAppService');
    vi.mocked(basename).mockResolvedValue('Book.epub');

    await nativeFileSystem.openFile('content://provider-a/document/42', 'None');
    await nativeFileSystem.openFile('content://provider-b/document/42', 'None');

    const destinations = vi.mocked(copyURIToPath).mock.calls.map(([request]) => request.dst);
    expect(new Set(destinations).size).toBe(2);
  });

  it('continues to open external storage URIs directly', async () => {
    const uri = 'content://com.android.externalstorage.documents/document/primary%3A100%25.epub';
    vi.mocked(basename).mockResolvedValue('100%.epub');
    const { nativeFileSystem } = await import('@/services/nativeAppService');

    const file = await nativeFileSystem.openFile(uri, 'None');

    expect(file.name).toBe('100%.epub');
    expect(open).toHaveBeenCalledWith(uri, undefined);
    expect(copyURIToPath).not.toHaveBeenCalled();
  });

  it('still decodes an iOS file URI basename for the cache copy', async () => {
    const uri = 'file:///private/Inbox/100%25%20complete.epub';
    vi.mocked(osType).mockReturnValue('ios');
    vi.mocked(basename).mockResolvedValue('100%25%20complete.epub');
    const { nativeFileSystem } = await import('@/services/nativeAppService');

    await nativeFileSystem.openFile(uri, 'None');

    expect(join).toHaveBeenCalledWith('/app/cache', '100% complete.epub');
    expect(copyURIToPath).toHaveBeenCalledWith({
      uri,
      dst: '/app/cache/100% complete.epub',
    });
  });
});

describe('filename extraction for import', () => {
  it.each([
    ['/home/reader/A?B.txt', 'A?B.txt'],
    ['C:\\Books\\100% complete.epub', '100% complete.epub'],
    ['100%25#&+.epub', '100%25#&+.epub'],
    ['https://example.com/100%25%20complete.epub?token=123', '100% complete.epub'],
  ])('extracts the filename from %s', (source, expected) => {
    expect(getFilename(source)).toBe(expected);
  });
});
