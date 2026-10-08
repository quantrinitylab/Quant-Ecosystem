'use client';

// ============================================================================
// QuantMail — Local-First SQLite FTS5 SearchBar (Task M15)
// Instant local search with concurrent background server query.
// Note: the local index query time is NOT end-to-end search latency —
// results are hydrated from the server. No latency figures are shown.
// ============================================================================

import React, { useState, useEffect, useRef, useTransition, useCallback } from 'react';
import { getFts5Indexer, type Fts5SearchResult } from '../lib/sqlite-fts5';
import { SearchClearButton } from './SearchClearButton';
import { IconSearch } from './icons';

export interface SearchBarProps {
  value?: string;
  onChange?: (value: string) => void;
  onSelectResult?: (result: Fts5SearchResult) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export function SearchBar({
  value: controlledValue,
  onChange,
  onSelectResult,
  placeholder = 'Search in QuantMail (sender, subject, keyword)…',
  className = '',
  autoFocus = false,
}: SearchBarProps) {
  const [internalValue, setInternalValue] = useState(controlledValue || '');
  const [localResults, setLocalResults] = useState<Fts5SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [, startTransition] = useTransition();

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = controlledValue !== undefined ? controlledValue : internalValue;

  // Execute instant local SQLite FTS5 search on keystroke.
  // The local index query is fast, but displayed results are hydrated from
  // the server — so no latency figure is shown (it would mislead).
  const executeLocalSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) {
      setLocalResults([]);
      setIsOpen(false);
      return;
    }

    const hits = getFts5Indexer().search(trimmed, { limit: 8 });

    startTransition(() => {
      setLocalResults(hits);
      setIsOpen(hits.length > 0);
      setSelectedIndex(0);
    });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (controlledValue === undefined) {
      setInternalValue(val);
    }
    onChange?.(val);
    executeLocalSearch(val);
  };

  const handleClear = () => {
    if (controlledValue === undefined) {
      setInternalValue('');
    }
    onChange?.('');
    setLocalResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || localResults.length === 0) {
      if (e.key === 'Escape') {
        handleClear();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % localResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + localResults.length) % localResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = localResults[selectedIndex];
      if (selected) {
        onSelectResult?.(selected);
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative w-full max-w-2xl ${className}`}>
      <div className="relative flex items-center w-full">
        {/* Search icon */}
        <span
          className="absolute left-3 text-neutral-400 pointer-events-none select-none flex items-center"
          aria-hidden="true"
        >
          <IconSearch size={15} />
        </span>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (localResults.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full pl-9 pr-20 py-2 text-sm bg-neutral-900 border border-neutral-700/80 rounded-lg text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          aria-label="Search emails"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
        />

        <div className="absolute right-2 flex items-center space-x-1">
          {query.length > 0 && <SearchClearButton onClear={handleClear} />}
        </div>
      </div>

      {/* Instant Results Dropdown */}
      {isOpen && localResults.length > 0 && (
        <div
          className="absolute z-50 left-0 right-0 mt-1 bg-neutral-900/95 backdrop-blur-md border border-neutral-700/80 rounded-lg shadow-2xl max-h-96 overflow-y-auto divide-y divide-neutral-800"
          role="listbox"
        >
          <div className="px-3 py-1.5 text-[11px] font-medium text-neutral-400 flex justify-between items-center bg-neutral-950/40">
            <span>Local FTS5 Matches</span>
            <span className="text-[10px] text-neutral-400 font-mono">
              {localResults.length} hit{localResults.length === 1 ? '' : 's'}
            </span>
          </div>

          {localResults.map((hit, idx) => (
            <button
              key={hit.id}
              type="button"
              className={`w-full text-left px-3 py-2 text-xs transition-colors flex flex-col gap-0.5 ${
                selectedIndex === idx
                  ? 'bg-indigo-950/60 text-indigo-100'
                  : 'text-neutral-300 hover:bg-neutral-800/60'
              }`}
              onClick={() => {
                onSelectResult?.(hit);
                setIsOpen(false);
              }}
              role="option"
              aria-selected={selectedIndex === idx}
            >
              <div className="flex justify-between items-center w-full">
                <span className="font-semibold text-neutral-100 truncate pr-2">
                  {hit.subject || '(No Subject)'}
                </span>
                {hit.fromAddress && (
                  <span className="text-[10px] text-neutral-400 shrink-0 font-mono">
                    {hit.fromAddress}
                  </span>
                )}
              </div>

              {/* Match snippet with <mark> tags */}
              <div
                className="text-[11px] text-neutral-400 truncate [&_mark]:bg-amber-400/30 [&_mark]:text-amber-200 [&_mark]:px-0.5 [&_mark]:rounded-sm"
                dangerouslySetInnerHTML={{ __html: hit.matchSnippet || hit.snippet }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default SearchBar;
