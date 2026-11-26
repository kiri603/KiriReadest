import { useState } from 'react';
import Dialog from '@/components/Dialog';
import { useTranslation } from '@/hooks/useTranslation';
import type { FolderBook } from '../utils/bookFolderImport';

interface BookFolderImportDialogProps {
  books: FolderBook[];
  onImport: (books: FolderBook[]) => void;
  onClose: () => void;
}

const BookFolderImportDialog = ({ books, onImport, onClose }: BookFolderImportDialogProps) => {
  const _ = useTranslation();
  const [selectedBooks, setSelectedBooks] = useState(() => new Set(books));

  const toggleBook = (book: FolderBook, checked: boolean) => {
    setSelectedBooks((previous) => {
      const next = new Set(previous);
      if (checked) next.add(book);
      else next.delete(book);
      return next;
    });
  };

  const invertSelection = () => {
    setSelectedBooks((previous) => new Set(books.filter((book) => !previous.has(book))));
  };

  return (
    <Dialog
      id='book-folder-import-dialog'
      isOpen
      title={_('Import Books')}
      onClose={onClose}
      contentClassName='flex min-h-0 flex-col !overflow-hidden !px-4 sm:!px-6'
    >
      <div className='flex flex-wrap items-center gap-2 py-2'>
        <button
          type='button'
          className='btn btn-sm btn-ghost'
          onClick={() => setSelectedBooks(new Set(books))}
        >
          {_('Select All')}
        </button>
        <button type='button' className='btn btn-sm btn-ghost' onClick={invertSelection}>
          {_('Invert Selection')}
        </button>
        <span className='text-base-content/70 ms-auto text-sm' aria-live='polite'>
          {_('{{count}} selected', { count: selectedBooks.size })}
        </span>
      </div>
      <ul className='divide-base-300 border-base-300 min-h-0 flex-1 divide-y overflow-y-auto border-y'>
        {books.map((book) => (
          <li key={book.path ?? book.relativePath}>
            <label className='hover:bg-base-200 flex cursor-pointer items-start gap-3 px-2 py-3'>
              <input
                type='checkbox'
                className='checkbox checkbox-sm shrink-0'
                checked={selectedBooks.has(book)}
                onChange={(event) => toggleBook(book, event.target.checked)}
              />
              <span className='min-w-0 break-all text-sm' dir='auto'>
                {book.relativePath}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className='flex flex-wrap justify-end gap-2 py-2'>
        <button type='button' className='btn btn-ghost' onClick={onClose}>
          {_('Cancel')}
        </button>
        <button
          type='button'
          className='btn btn-primary'
          disabled={selectedBooks.size === 0}
          onClick={() => onImport(books.filter((book) => selectedBooks.has(book)))}
        >
          {_('Import')}
        </button>
      </div>
    </Dialog>
  );
};

export default BookFolderImportDialog;
