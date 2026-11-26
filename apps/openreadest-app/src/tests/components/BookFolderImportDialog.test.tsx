import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import BookFolderImportDialog from '@/app/library/components/BookFolderImportDialog';

vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: null }) }));
vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ systemUIVisible: false, statusBarHeight: 0, safeAreaInsets: null }),
}));
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, options?: { count: number }) =>
    options ? key.replace('{{count}}', String(options.count)) : key,
}));

const books = [
  { relativePath: 'Book.epub', path: '/books/Book.epub' },
  { relativePath: 'Subfolder/Book.epub', path: '/books/Subfolder/Book.epub' },
];

afterEach(cleanup);

describe('book folder import selection', () => {
  it('starts with all files selected and imports only the inverse of a partial selection', () => {
    const onImport = vi.fn();
    render(<BookFolderImportDialog books={books} onImport={onImport} onClose={vi.fn()} />);

    expect((screen.getByRole('checkbox', { name: 'Book.epub' }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(
      (screen.getByRole('checkbox', { name: 'Subfolder/Book.epub' }) as HTMLInputElement).checked,
    ).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Book.epub' }));
    fireEvent.click(screen.getByRole('button', { name: 'Invert Selection' }));
    expect(onImport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(onImport).toHaveBeenCalledExactlyOnceWith([books[0]]);
  });

  it('disables import for an empty selection and can select every file again', () => {
    const onImport = vi.fn();
    render(<BookFolderImportDialog books={books} onImport={onImport} onClose={vi.fn()} />);
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'Import' });

    fireEvent.click(screen.getByRole('button', { name: 'Invert Selection' }));
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(onImport).toHaveBeenCalledExactlyOnceWith(books);
  });

  it('closes without importing when cancelled', () => {
    const onImport = vi.fn();
    const onClose = vi.fn();
    render(<BookFolderImportDialog books={books} onImport={onImport} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onImport).not.toHaveBeenCalled();
  });

  it('keeps Android documents with the same display path independently selectable', () => {
    const onImport = vi.fn();
    const documents = [
      { relativePath: 'Book.epub', path: 'content://provider/tree/books/document/1' },
      { relativePath: 'Book.epub', path: 'content://provider/tree/books/document/2' },
    ];
    render(<BookFolderImportDialog books={documents} onImport={onImport} onClose={vi.fn()} />);

    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Book.epub' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(onImport).toHaveBeenCalledExactlyOnceWith([documents[1]]);
  });
});
