import React from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import Notebook from '@/app/reader/components/notebook/Notebook';
import { saveWordNote } from '@/helpers/wordNotes';
import type { BookDoc } from '@/libs/document';
import type { EnvConfigType } from '@/services/environment';
import { useBookDataStore } from '@/store/bookDataStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useSidebarStore } from '@/store/sidebarStore';

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (key: string) => key }));
vi.mock('@/hooks/useResponsiveSize', () => ({ useResponsiveSize: (size: number) => size }));
vi.mock('@/i18n/i18n', () => ({ default: { changeLanguage: vi.fn() } }));
vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ updateAppTheme: vi.fn() }),
}));
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig, appService: null }),
}));

const envConfig = {
  getAppService: async () => ({ saveSettings: vi.fn().mockResolvedValue(undefined) }),
} as unknown as EnvConfigType;

dayjs.extend(relativeTime);

beforeEach(() => {
  const { settings } = useSettingsStore.getState();
  useSettingsStore.setState({
    settings: {
      ...settings,
      globalReadSettings: { ...settings.globalReadSettings, isNotebookPinned: true },
      wordNotes: [],
      wordNoteTombstones: [],
    },
  });
  useBookDataStore.setState({
    booksData: {
      book: {
        id: 'book',
        book: null,
        file: null,
        config: { booknotes: [], updatedAt: 1 },
        bookDoc: { metadata: { language: 'ja' } } as BookDoc,
        isFixedLayout: false,
      },
    },
  });
  useSidebarStore.getState().setSideBarBookKey('book-reader');
});

afterEach(cleanup);

describe('word notes in the notebook', () => {
  it('shows previously saved translations and updates when another translation is saved', async () => {
    await saveWordNote(envConfig, '装う', 'よそおう\n装作');
    render(<Notebook />);

    expect(screen.getByText('装う')).toBeTruthy();
    expect(screen.getByText('よそおう 装作')).toBeTruthy();

    await act(async () => {
      await saveWordNote(envConfig, 'すすり', '啜饮');
    });
    expect(screen.getByText('啜饮')).toBeTruthy();
  });

  it('searches by source word and translation and refreshes an open search after saving', async () => {
    await saveWordNote(envConfig, '装う', '装作');
    await saveWordNote(envConfig, 'すすり', '啜饮');
    render(<Notebook />);

    fireEvent.click(screen.getByRole('button', { name: 'Show Search Bar' }));
    const search = screen.getByPlaceholderText('Search notes and excerpts...');
    fireEvent.change(search, { target: { value: '装う' } });
    expect(await screen.findByText('装作')).toBeTruthy();
    expect(screen.queryByText('啜饮')).toBeNull();

    fireEvent.change(search, { target: { value: '喝' } });
    expect(await screen.findByText('No notes match your search')).toBeTruthy();

    await act(async () => {
      await saveWordNote(envConfig, 'すすり', '小口喝');
    });
    expect(screen.getByText('小口喝')).toBeTruthy();
    expect(screen.queryByText('装作')).toBeNull();
  });

  it('uses the linked annotation once and ignores deleted links when displaying shared notes', () => {
    useSettingsStore.setState(({ settings }) => ({
      settings: {
        ...settings,
        wordNotes: [
          {
            id: 'shared',
            aliases: ['alias'],
            word: '装う',
            note: '装作',
            createdAt: 1,
            updatedAt: 2,
          },
          { id: 'other', word: 'すすり', note: '啜饮', createdAt: 1, updatedAt: 2 },
        ],
      },
    }));
    useBookDataStore.getState().updateBooknotes('book-reader', [
      {
        type: 'annotation',
        id: 'linked',
        wordNoteId: 'alias',
        cfi: 'epubcfi(/6/2)',
        text: '装う',
        note: '旧释义',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        type: 'annotation',
        id: 'deleted',
        wordNoteId: 'other',
        cfi: 'epubcfi(/6/4)',
        text: 'すすり',
        note: '已删除',
        createdAt: 1,
        updatedAt: 2,
        deletedAt: 2,
      },
    ]);
    render(<Notebook />);

    expect(screen.getAllByText('装作')).toHaveLength(1);
    expect(screen.getByText('啜饮')).toBeTruthy();
    expect(screen.queryByText('已删除')).toBeNull();
  });
});
