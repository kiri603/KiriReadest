import { v4 as uuidv4 } from 'uuid';
import type { Book, BookConfig } from '@/types/book';
import { loadWebDavStoreFromStorage, useWebDavStore } from '@/store/webdavStore';
import { WebDavClient } from '../client/WebDavClient';
import type { WebDavSyncLogItem } from '../models';
import { mergeWebDavJsonContent } from './contentMerge';
import { getRemoteBookPaths, READEST_WEBDAV_ROOT_DIRNAME } from './paths';

const OPEN_TIMEOUT_MS = 2_000;
const CLOSE_TIMEOUT_MS = 6_000;

const withDeadline = async <T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
};

const createClient = (book: Book, timeoutMs: number) => {
  if (book.deletedAt) return;
  const store = useWebDavStore.getState();
  const state = store.hydrated ? store : loadWebDavStoreFromStorage();
  if (!state.autoSyncEnabled) return;
  const profile = state.profiles.find((p) => p.id === state.activeProfileId) ?? state.profiles[0];
  if (!profile?.serverUrl || !profile.username) return;
  return new WebDavClient({
    ...profile,
    rootPath: profile.remotePath,
    defaultTimeoutMs: timeoutMs,
  });
};

const withProgress = (base: BookConfig, source: BookConfig): BookConfig => ({
  ...base,
  location: source.location,
  progress: source.progress,
  xpointer: source.xpointer,
  progressUpdatedAt: source.progressUpdatedAt ?? source.updatedAt,
});

const sameProgress = (a: BookConfig, b: BookConfig) =>
  a.location === b.location &&
  a.xpointer === b.xpointer &&
  (a.progressUpdatedAt ?? a.updatedAt) === (b.progressUpdatedAt ?? b.updatedAt) &&
  a.progress?.[0] === b.progress?.[0] &&
  a.progress?.[1] === b.progress?.[1];

const readProgress = async (
  client: WebDavClient,
  path: string,
  book: Book,
  local: BookConfig,
  signal: AbortSignal,
) => {
  const response = await client.get(path, { signal, revalidate: true });
  if (!response.ok || !response.data) return null;
  const text = new TextDecoder().decode(response.data);
  const merged = mergeWebDavJsonContent(path, JSON.stringify(local), text);
  if (!merged) return null;
  const remote = JSON.parse(text) as BookConfig;
  if (remote.bookHash && remote.bookHash !== book.hash) return null;
  return { remote, latest: merged.value as BookConfig, etag: response.headers.get('ETag') };
};

export async function pullWebDavReadingProgress(
  book: Book,
  local: BookConfig,
): Promise<BookConfig> {
  if (typeof navigator === 'undefined' || !navigator.onLine) return local;
  try {
    const client = createClient(book, OPEN_TIMEOUT_MS);
    if (!client) return local;
    const { configFile } = getRemoteBookPaths(book);
    const result = await withDeadline(OPEN_TIMEOUT_MS, (signal) =>
      readProgress(client, configFile, book, local, signal),
    );
    return result && result.latest.location && !sameProgress(local, result.latest)
      ? withProgress(local, result.latest)
      : local;
  } catch {
    return local;
  }
}

export async function flushWebDavReadingProgress(book: Book, local: BookConfig): Promise<void> {
  if (!local.location) return;
  const { configFile } = getRemoteBookPaths(book);
  const log = (status: WebDavSyncLogItem['status'], message: string) => {
    useWebDavStore.getState().addLog({
      id: uuidv4(),
      timestamp: Date.now(),
      direction: 'upload',
      path: configFile.slice(READEST_WEBDAV_ROOT_DIRNAME.length + 1),
      status,
      message,
    });
  };

  try {
    const client = createClient(book, CLOSE_TIMEOUT_MS);
    if (!client) return;
    if (typeof navigator === 'undefined' || !navigator.onLine) {
      log('failed', '阅读进度已保存在本机，WebDAV 尚未确认同步');
      return;
    }
    const outcome = await withDeadline(CLOSE_TIMEOUT_MS, async (signal) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await readProgress(client, configFile, book, local, signal);
        if (!result) break;
        const { remote, latest, etag } = result;
        if (sameProgress(remote, latest)) return sameProgress(remote, local) ? 'synced' : 'newer';
        // Full sync handles initial backups and servers without a strong ETag.
        if (!etag || etag.startsWith('W/')) break;
        const response = await client.put(
          configFile,
          JSON.stringify(withProgress(remote, latest)),
          {
            contentType: 'application/json; charset=utf-8',
            ifMatch: etag,
            signal,
          },
        );
        if (response.ok) return 'synced';
        if (response.status !== 412) break;
      }
      return 'unconfirmed';
    });
    if (outcome === 'synced') {
      log('completed', '阅读进度已同步');
      return;
    }
    if (outcome === 'newer') {
      log('skipped', '云端已有更新的阅读进度');
      return;
    }
  } catch (error) {
    console.warn('[WebDAV] Could not sync reading progress on close', error);
  }
  log('failed', '阅读进度已保存在本机，WebDAV 尚未确认同步');
}
