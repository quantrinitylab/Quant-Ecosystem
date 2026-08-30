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
      {/* Was `&#128269;` — a raw magnifier emoji, which greps for the character
       * never found because it was written as an HTML entity. It also rendered
       * in the platform emoji font, so the one glyph in the field changed shape
       * and colour per OS and ignored `text-*` entirely. */}
      <span
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6E76]"
        aria-hidden="true"
      >
        <svg
          className="size-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </span>
      <input
        type="search"
        defaultValue={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className="quant-field w-full py-2 pl-9 pr-9 text-sm disabled:cursor-not-allowed disabled:opacity-50 [@media(pointer:coarse)]:min-h-11"
        aria-label={ariaLabel}
        role="searchbox"
      />
      {loading && (
        <span
          className={`absolute right-3 top-1/2 -translate-y-1/2${prefersReducedMotion ? '' : ' animate-spin'} size-4 rounded-full border-2 border-[#FF8C42] border-t-transparent`}
          aria-label="Loading search results"
        />
      )}
      {!loading && value && (
        <button
          onClick={handleClear}
          className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-[#6B6E76] transition-colors hover:text-[#F5F5F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] [@media(pointer:coarse)]:size-11"
          aria-label="Clear search"
          type="button"
        >
          <svg
            className="size-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
};
