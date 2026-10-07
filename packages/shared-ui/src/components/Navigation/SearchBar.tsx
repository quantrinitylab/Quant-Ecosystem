'use client';
// ============================================================================
// Shared UI - Search Bar Component
// ============================================================================

import React, { useState, useRef, useCallback } from 'react';
import { SearchClearButton } from '../Form/SearchClearButton';

export interface SearchBarProps {
  value?: string;
  placeholder?: string;
  onSearch: (query: string) => void;
  onChange?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onClear?: () => void;
  suggestions?: string[];
  recentSearches?: string[];
  showCancelButton?: boolean;
  autoFocus?: boolean;
  debounceMs?: number;
  className?: string;
  /**
   * `placeholder` is not a label. Browsers do fall back to it when computing an
   * accessible name, but it is the last resort in that algorithm and it vanishes
   * the moment there is text in the field — so a reader that re-reads the input
   * mid-query gets nothing. `SearchInput` in this package takes the same prop
   * with the same default; a caller with two search fields on one screen needs to
   * be able to tell them apart.
   */
  'aria-label'?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value: controlledValue,
  placeholder = 'Search...',
  onSearch,
  onChange,
  onFocus,
  onBlur,
  onClear,
  suggestions,
  recentSearches,
  showCancelButton = false,
  autoFocus = false,
  debounceMs = 300,
  className = '',
  'aria-label': ariaLabel = 'Search',
}) => {
  const [internalValue, setInternalValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const value = controlledValue !== undefined ? controlledValue : internalValue;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInternalValue(newValue);
      onChange?.(newValue);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (newValue.trim()) {
          onSearch(newValue.trim());
        }
      }, debounceMs);
    },
    [onChange, onSearch, debounceMs],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (value.trim()) {
        onSearch(value.trim());
        setShowSuggestions(false);
      }
    },
    [value, onSearch],
  );

  const handleClear = useCallback(() => {
    setInternalValue('');
    onChange?.('');
    onClear?.();
    inputRef.current?.focus();
  }, [onChange, onClear]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setShowSuggestions(true);
    onFocus?.();
  }, [onFocus]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    setTimeout(() => setShowSuggestions(false), 200);
    onBlur?.();
  }, [onBlur]);

  return (
    <div className={`relative ${className}`}>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div
          className={`flex-1 relative flex items-center bg-gray-100 rounded-full transition-all ${isFocused ? 'ring-2 ring-blue-200 bg-white border border-blue-300' : ''}`}
        >
          <svg
            className="w-4 h-4 text-gray-400 ml-3 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
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
            value={value}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            autoFocus={autoFocus}
            className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
            role="searchbox"
            aria-label={ariaLabel}
          />
          {/*
            Was a hand-drawn ✕ with no accessible name at all — a `<button>`
            whose only child is an SVG is announced as the empty string, so the
            one control that undoes a search was unreachable by name and
            invisible in a rotor listing. It was also a 24px target.

            `SearchClearButton` is the package's own answer to exactly this, and
            using it here is the point of having it: `bare` keeps the glyph in
            flow where this flex row already put it, and moves the 44px pointer
            target onto a pseudo-element so the field does not have to grow to
            hold it. `mr-2` is preserved because it is this field's spacing, not
            the button's.
          */}
          {value && <SearchClearButton onClear={handleClear} className="mr-2" />}
        </div>
        {showCancelButton && isFocused && (
          <button
            type="button"
            onClick={() => {
              handleClear();
              inputRef.current?.blur();
            }}
            className="text-sm text-blue-600 font-medium"
          >
            Cancel
          </button>
        )}
      </form>

      {/* Suggestions dropdown */}
      {/*
        `&&` on a `.length` renders the number when it is 0. With
        `recentSearches={[]}` and no `suggestions`, `(undefined || 0)` is `0`,
        `true && 0` is `0`, and React prints a bare "0" under the field. Comparing
        to 0 keeps the whole chain boolean.
      */}
      {showSuggestions && ((suggestions?.length ?? 0) > 0 || (recentSearches?.length ?? 0) > 0) && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          {recentSearches && recentSearches.length > 0 && !value && (
            <div className="px-4 py-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Recent</h3>
              {recentSearches.slice(0, 5).map((search, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInternalValue(search);
                    onSearch(search);
                  }}
                  className="block w-full text-left px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded"
                >
                  {search}
                </button>
              ))}
            </div>
          )}
          {suggestions && suggestions.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100">
              {suggestions.slice(0, 5).map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInternalValue(suggestion);
                    onSearch(suggestion);
                  }}
                  className="block w-full text-left px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
