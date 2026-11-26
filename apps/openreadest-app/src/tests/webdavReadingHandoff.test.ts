import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';
import { useWebDavStore } from '@/store/webdavStore';
import {
  flushWebDavReadingProgress,
  pullWebDavReadingProgress,
} from '@/services/webdav/sync/readingProgress';

vi.mock('@/services/environment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/environment')>()),
  isTauriAppPlatform: () => false,
}));

const book = { hash: 'book', title: 'Book', format: 'EPUB' } as Book;
const previousPosition = { location: 'previous', progressUpdatedAt: 10, updatedAt: 10 };
const nextPosition = { location: 'next', progressUpdatedAt: 20, updatedAt: 20 };
const fetch = vi.fn<typeof globalThis.fetch>();

const configResponse = (body: object, etag = '"v1"') =>
  new Response(JSON.stringify(body), { headers: { ETag: etag } });

beforeEach(() => {
  localStorage.clear();
  fetch.mockReset();
  vi.stubGlobal('fetch', fetch);
  useWebDavStore.setState({
    hydrated: true,
    autoSyncEnabled: true,
    activeProfileId: 'profile',
    logs: [],
    profiles: [
      {
        id: 'profile',
        name: 'Profile',
        serverUrl: 'https://dav.example.test',
        remotePath: '/',
        username: 'user',
        password: 'test',
        conflictStrategy: 'manual',
      },
    ],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('WebDAV reading handoff', () => {
  it('waits for the book config upload to complete and preserves remote notes', async () => {
    let finishUpload!: (response: Response) => void;
    fetch.mockResolvedValueOnce(
      configResponse({ ...previousPosition, booknotes: [{ id: 'remote-note' }] }),
    );
    fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishUpload = resolve;
        }),
    );
    const completion = flushWebDavReadingProgress(book, nextPosition);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const [url, upload] = fetch.mock.calls[1]!;
    expect(url).toBe('https://dav.example.test/OpenReadest/Books/book/config.json');
    expect(new Headers(upload?.headers).get('If-Match')).toBe('"v1"');
    expect(JSON.parse(upload?.body as string)).toMatchObject({
      location: 'next',
      progressUpdatedAt: 20,
      booknotes: [{ id: 'remote-note' }],
    });
    expect(useWebDavStore.getState().logs).toHaveLength(0);
    finishUpload(new Response(null, { status: 204 }));
    await completion;
    expect(useWebDavStore.getState().logs[0]).toMatchObject({
      path: 'Books/book/config.json',
      status: 'completed',
    });
  });

  it('rereads the config after a conflicting write and retains the newer remote position', async () => {
    fetch
      .mockResolvedValueOnce(configResponse(previousPosition))
      .mockResolvedValueOnce(new Response(null, { status: 412 }))
      .mockResolvedValueOnce(
        configResponse({ location: 'other-device', progressUpdatedAt: 30, updatedAt: 30 }, '"v2"'),
      );

    await flushWebDavReadingProgress(book, nextPosition);

    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual(['GET', 'PUT', 'GET']);
    expect(useWebDavStore.getState().logs[0]).toMatchObject({ status: 'skipped' });
  });

  it('preserves local notes while restoring a newer legacy cloud position on open', async () => {
    const local = { ...previousPosition, booknotes: [] };
    fetch.mockResolvedValueOnce(
      configResponse({ location: 'legacy-cloud', updatedAt: 30, booknotes: [{ id: 'remote' }] }),
    );

    await expect(pullWebDavReadingProgress(book, local)).resolves.toMatchObject({
      location: 'legacy-cloud',
      progressUpdatedAt: 30,
      updatedAt: 10,
      booknotes: [],
    });
  });

  it('hands off the latest location in both directions through the same cloud config', async () => {
    let cloud = previousPosition;
    let revision = 0;
    fetch.mockImplementation(async (_url, request) => {
      const etag = `"${revision}"`;
      if (request?.method === 'GET') return configResponse(cloud, etag);
      if (new Headers(request?.headers).get('If-Match') !== etag) {
        return new Response(null, { status: 412 });
      }
      cloud = JSON.parse(request?.body as string);
      revision += 1;
      return new Response(null, { status: 204 });
    });

    await flushWebDavReadingProgress(book, nextPosition);
    const pc = await pullWebDavReadingProgress(book, previousPosition);
    expect(pc.location).toBe('next');

    await flushWebDavReadingProgress(book, { ...pc, location: 'later', progressUpdatedAt: 30 });
    const phone = await pullWebDavReadingProgress(book, nextPosition);
    expect(phone.location).toBe('later');
  });

  it('keeps the local position and records a failure when the server cannot be reached', async () => {
    fetch.mockRejectedValue(new Error('offline'));

    await expect(pullWebDavReadingProgress(book, nextPosition)).resolves.toBe(nextPosition);
    await expect(flushWebDavReadingProgress(book, nextPosition)).resolves.toBeUndefined();
    expect(useWebDavStore.getState().logs[0]).toMatchObject({ status: 'failed' });
  });

  it('does not transfer progress when WebDAV auto sync is disabled', async () => {
    useWebDavStore.setState({ autoSyncEnabled: false });

    await expect(pullWebDavReadingProgress(book, nextPosition)).resolves.toBe(nextPosition);
    await flushWebDavReadingProgress(book, nextPosition);

    expect(fetch).not.toHaveBeenCalled();
    expect(useWebDavStore.getState().logs).toHaveLength(0);
  });
});
