import React, { useEffect, useRef } from 'react';
import { FaSearch, FaTimes } from 'react-icons/fa';

import { useTranslation } from '@/hooks/useTranslation';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';

interface SearchBarProps {
  isVisible: boolean;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ isVisible, searchTerm, onSearchTermChange }) => {
  const _ = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const iconSize16 = useResponsiveSize(16);
  const iconSize12 = useResponsiveSize(12);

  useEffect(() => {
    if (isVisible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isVisible]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && inputRef.current) {
        inputRef.current.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleClearSearch = () => {
    onSearchTermChange('');
    inputRef.current?.focus();
  };

  return (
    <div className='relative px-3 py-2'>
      <div className='bg-base-100 flex h-8 items-center rounded-lg'>
        <div className='pl-3'>
          <FaSearch size={iconSize16} className='text-base-content/50' />
        </div>

        <input
          ref={inputRef}
          type='text'
          value={searchTerm}
          spellCheck={false}
          onChange={(event) => onSearchTermChange(event.target.value)}
          placeholder={_('Search notes and excerpts...')}
          className='w-full bg-transparent p-2 font-sans text-sm font-light focus:outline-none'
        />

        {searchTerm && (
          <div className='bg-base-300 flex h-8 w-8 items-center rounded-r-lg'>
            <button
              onClick={handleClearSearch}
              className='btn btn-ghost h-8 min-h-8 w-8 rounded-none rounded-r-lg p-0'
            >
              <FaTimes size={iconSize12} className='text-base-content/50' />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchBar;
