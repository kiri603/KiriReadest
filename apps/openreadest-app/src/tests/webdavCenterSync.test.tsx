import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  setWebDavCenterVisible,
  WebDavCenterWindow,
} from '@/app/library/components/WebDavCenterWindow';
import type { WebDavSyncLogItem } from '@/services/webdav/models';
import { getRemoteSyncStatePath } from '@/services/webdav/sync/paths';
import { useWebDavStore } from '@/store/webdavStore';

const mock = vi.hoisted(() => ({ dispatch: vi.fn(), sync: vi.fn() }));
const book = { hash: 'book', title: 'Test book', format: 'EPUB' };

vi.mock('@/components/Dialog', () => ({
  default: ({ id, children }: { id: string; children: ReactNode }) => <div id={id}>{children}</div>,
}));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: {}, envConfig: {} }) }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (text: string) => text }));
vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: (select: (state: { getVisibleLibrary: () => (typeof book)[] }) => unknown) =>
    select({ getVisibleLibrary: () => [book] }),
}));
vi.mock('@/services/webdav/sync/fingerprint', () => ({
  computeLocalFingerprint: async () => ({ md5: 'same' }),
}));
vi.mock('@/services/webdav/sync/engine', () => ({ syncWebDavSelection: mock.sync }));
vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch: mock.dispatch } }));
vi.mock('@/services/webdav/client/WebDavClient', () => ({
  WebDavClient: class {
    async mkcol() {
      return { ok: true };
    }
    async propfind() {
      return { ok: true, data: [] };
    }
    async get() {
      return { ok: true, data: new TextEncoder().encode('[]') };
    }
    async put() {
      return { ok: true };
    }
  },
}));

beforeEach(() => {
  const profile = {
    id: 'profile',
    name: 'Test WebDAV',
    serverUrl: 'https://test.invalid',
    remotePath: '',
    username: 'test',
    password: 'test',
    conflictStrategy: 'manual',
  } as const;
  useWebDavStore.getState().upsertProfile(profile);
  useWebDavStore.getState().setActiveProfileId(profile.id);
  useWebDavStore.getState().setActiveTab('upload');
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  useWebDavStore.setState(useWebDavStore.getInitialState(), true);
  vi.resetAllMocks();
});

describe('manual WebDAV sync feedback', () => {
  it.each([
    ['an isolated state read timeout', 'temporary-state-read', '同步状态暂未更新，可稍后重试'],
    ['an authorization failure', undefined, null],
  ] as const)('handles %s', async (_scenario, code, notice) => {
    const failure: WebDavSyncLogItem = {
      id: 'state-failure',
      timestamp: Date.now(),
      direction: 'download',
      path: getRemoteSyncStatePath(),
      status: 'failed',
      code,
    };
    mock.sync.mockImplementation(async (_app, _profile, _options, { onLog }) => {
      onLog(failure);
      return { conflicts: [], failures: [failure] };
    });
    render(<WebDavCenterWindow />);
    act(() => setWebDavCenterVisible(true));
    fireEvent.click(screen.getByRole('option', { name: /Test book/ }));
    fireEvent.click(screen.getByRole('button', { name: '上传选中书籍' }));

    await waitFor(() => expect(useWebDavStore.getState().activeTab).toBe('logs'));
    expect(screen.getByText(failure.path)).toBeTruthy();
    expect(useWebDavStore.getState().lastSuccessAt).toBeNull();
    if (notice) {
      expect(screen.getByRole('status').textContent).toBe(notice);
      expect(mock.dispatch).not.toHaveBeenCalled();
    } else {
      expect(screen.queryByRole('status')).toBeNull();
      expect(mock.dispatch).toHaveBeenCalledWith('toast', { message: '同步失败', type: 'error' });
    }
  });
});
