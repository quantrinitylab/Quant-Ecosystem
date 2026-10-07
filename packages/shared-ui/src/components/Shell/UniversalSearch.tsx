'use client';

// ============================================================================
// Shared UI - Universal Search Component (Cmd+K or /)
// ============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface SearchResult {
  id: string;
  title: string;
  description?: string;
  app: string;
  icon?: string;
  href?: string;
  meta?: Record<string, unknown>;
}

export interface SearchResultGroup {
  app: string;
  results: SearchResult[];
}

export interface UniversalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  onSearch: (query: string) => Promise<SearchResult[]> | SearchResult[];
  recentSearches?: string[];
  onSelectResult?: (result: SearchResult) => void;
  placeholder?: string;
}

export const UniversalSearch: React.FC<UniversalSearchProps> = ({
  isOpen,
  onClose,
  onOpen,
  onSearch,
  recentSearches = [],
  onSelectResult,
  placeholder = 'Search across all apps...',
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGenerationRef = useRef(0);

  // Keyboard shortcut listener (Cmd+K / Ctrl+K or /)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          onOpen();
        }
      }
      if (
        e.key === '/' &&
        !isOpen &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        onOpen();
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onOpen, onClose]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Increment generation to detect stale responses
    const generation = ++searchGenerationRef.current;

    debounceRef.current = setTimeout(async () => {
      const searchResults = await onSearch(query);
      // Only update state if this is still the latest request
      if (searchGenerationRef.current === generation) {
        setResults(searchResults);
        setIsLoading(false);
        setActiveIndex(0);
      }
    }, 200);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, onSearch]);

  // Group results by app
  const groupedResults: SearchResultGroup[] = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};
    for (const result of results) {
      if (!groups[result.app]) groups[result.app] = [];
      groups[result.app]!.push(result);
    }
    return Object.entries(groups).map(([app, items]) => ({ app, results: items }));
  }, [results]);

  const flatResults = useMemo(() => results, [results]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = flatResults[activeIndex];
        if (selected) {
          onSelectResult?.(selected);
          onClose();
        }
      }
    },
    [flatResults, activeIndex, onSelectResult, onClose],
  );

  if (!isOpen) return null;

  let itemIndex = -1;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 sm:pt-[20vh]"
        role="dialog"
        aria-modal="true"
        aria-label="Universal search"
      >
        <motion.div
          className="fixed inset-0 bg-black/50"
          onClick={onClose}
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />
        <motion.div
          className="relative w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden"
          style={{
            background: 'var(--quant-surface, #ffffff)',
            border: '1px solid var(--quant-border, #e5e7eb)',
          }}
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          <div
            className="flex items-center px-4"
            style={{ borderBottom: '1px solid var(--quant-border, #e5e7eb)' }}
          >
            <svg
              className="w-5 h-5 flex-shrink-0"
              style={{ color: 'var(--quant-text-secondary, #6b7280)' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="flex-1 px-3 py-4 text-sm bg-transparent border-0 focus:outline-none"
              style={{ color: 'var(--quant-text, #111827)' }}
              aria-label="Search input"
            />
            <kbd
              className="hidden sm:inline-flex items-center px-2 py-0.5 text-xs font-mono rounded"
              style={{
                color: 'var(--quant-text-secondary, #6b7280)',
                background: 'var(--quant-surface-hover, #f3f4f6)',
              }}
            >
              Esc
            </kbd>
          </div>

          <div className="max-h-80 overflow-y-auto py-2" role="listbox" aria-label="Search results">
            {isLoading && (
              <div
                className="px-4 py-3 text-sm"
                style={{ color: 'var(--quant-text-secondary, #6b7280)' }}
              >
                Searching...
              </div>
            )}

            {!isLoading && !query && recentSearches.length > 0 && (
              <div>
                <div
                  className="px-4 py-1 text-xs font-semibold uppercase"
                  style={{ color: 'var(--quant-text-secondary, #6b7280)' }}
                >
                  Recent searches
                </div>
                {recentSearches.map((term) => (
                  <button
                    key={term}
                    onClick={() => setQuery(term)}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-left hover:opacity-80"
                    style={{
                      color: 'var(--quant-text, #111827)',
                      background: 'transparent',
                    }}
                  >
                    <span aria-hidden="true">&#128337;</span>
                    <span>{term}</span>
                  </button>
                ))}
              </div>
            )}

            {!isLoading && query && results.length === 0 && (
              <div
                className="px-4 py-8 text-center text-sm"
                style={{ color: 'var(--quant-text-secondary, #6b7280)' }}
              >
                No results found for &ldquo;{query}&rdquo;
              </div>
            )}

            {!isLoading &&
              groupedResults.map((group) => (
                <div key={group.app}>
                  <div
                    className="px-4 py-1 text-xs font-semibold uppercase"
                    style={{ color: 'var(--quant-text-secondary, #6b7280)' }}
                  >
                    {group.app}
                  </div>
                  {group.results.map((result) => {
                    itemIndex++;
                    const isActive = itemIndex === activeIndex;
                    return (
                      <button
                        key={result.id}
                        onClick={() => {
                          onSelectResult?.(result);
                          onClose();
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2 text-sm text-left focus:outline-none"
                        style={{
                          background: isActive
                            ? 'var(--quant-surface-hover, #f3f4f6)'
                            : 'transparent',
                          color: 'var(--quant-text, #111827)',
                        }}
                        role="option"
                        aria-selected={isActive}
                      >
                        {result.icon && <span aria-hidden="true">{result.icon}</span>}
                        <div className="flex-1 min-w-0">
                          <div className="truncate">{result.title}</div>
                          {result.description && (
                            <div
                              className="text-xs truncate"
                              style={{ color: 'var(--quant-text-secondary, #6b7280)' }}
                            >
                              {result.description}
                            </div>
                          )}
                        </div>
                        <span
                          className="text-xs flex-shrink-0"
                          style={{ color: 'var(--quant-text-secondary, #6b7280)' }}
                        >
                          {result.app}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
