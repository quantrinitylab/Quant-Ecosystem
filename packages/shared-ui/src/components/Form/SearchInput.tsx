'use client';

// ============================================================================
// Shared UI - SearchInput Component
// ============================================================================

import React, { useCallback, useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

export interface SearchInputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value = '',
  onChange,
  placeholder = 'Search...',
  debounceMs = 300,
  loading = false,
  disabled = false,
  className = '',
  'aria-label': ariaLabel = 'Search',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      if (debounceMs > 0) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => {
          onChange?.(newValue);
        }, debounceMs);
      } else {
        onChange?.(newValue);
      }
    },
    [onChange, debounceMs],
  );

  const handleClear = useCallback(() => {
    onChange?.('');
  }, [onChange]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true">
        &#128269;
      </span>
      <input
        type="search"
        defaultValue={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-9 pr-9 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label={ariaLabel}
        role="searchbox"
      />
      {loading && (
        <span
          className={`absolute right-3 top-1/2 -translate-y-1/2${prefersReducedMotion ? '' : ' animate-spin'} h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full`}
          aria-label="Loading search results"
        />
      )}
      {!loading && value && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Clear search"
          type="button"
        >
          &#10005;
        </button>
      )}
    </div>
  );
};
