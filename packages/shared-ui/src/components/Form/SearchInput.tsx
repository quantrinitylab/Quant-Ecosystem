'use client';

// ============================================================================
// Shared UI - SearchInput Component
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { SearchClearButton } from './SearchClearButton';

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
  const inputRef = useRef<HTMLInputElement>(null);

  /*
   * The field is controlled by `draft`, not by `value`, and that is the whole
   * fix. It used to be `defaultValue={value}` — a genuinely uncontrolled input —
   * so `handleClear` calling `onChange('')` emptied the *parent's* state and left
   * the text sitting in the DOM. The results list cleared, the query you were
   * looking at did not, and the button that had just "worked" unmounted because
   * its own gate read the prop. Every consumer passes `value={state}
   * onChange={setState}`, so all five of them had a clear button that visibly
   * did nothing.
   *
   * `value={value}` is not the fix either: `onChange` is debounced by 300ms, so
   * the prop lags the keystrokes, and feeding a lagging prop back into the field
   * rewrites what you are typing mid-word. `draft` is what you typed, `value` is
   * what the parent has heard about, and they are allowed to differ for exactly
   * one debounce interval.
   */
  const [draft, setDraft] = useState(value);

  // What we last handed to `onChange`. A controlled parent echoes that value
  // straight back as a new `value` prop, and adopting the echo is what would
  // fight the typist. Anything *else* arriving in `value` is the parent changing
  // the query on its own — a "clear all filters" button, a restored URL query —
  // and that has to win.
  const lastEmittedRef = useRef(value);

  const emit = useCallback(
    (next: string) => {
      lastEmittedRef.current = next;
      onChange?.(next);
    },
    [onChange],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setDraft(newValue);
      if (debounceMs > 0) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          emit(newValue);
        }, debounceMs);
      } else {
        emit(newValue);
      }
    },
    [emit, debounceMs],
  );

  const handleClear = useCallback(() => {
    /*
     * Cancelling the pending timer is not tidiness. Clearing within `debounceMs`
     * of the last keystroke leaves a timer holding the old text, and it fires
     * *after* the clear — so the query the user just deleted comes back a quarter
     * of a second later with an empty field to explain it.
     */
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setDraft('');
    // Emitted immediately, not debounced: a clear is one deliberate act, not a
    // keystroke that might be followed by another.
    emit('');
    // The button unmounts the moment the field is empty, so without this focus
    // lands on `document.body` and a keyboard user has to tab back in from the
    // top of the page to retype.
    inputRef.current?.focus();
  }, [emit]);

  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    setDraft(value);
  }, [value]);

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
        ref={inputRef}
        type="search"
        value={draft}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className="quant-field w-full py-2 pl-9 pr-10 text-sm disabled:cursor-not-allowed disabled:opacity-50 [@media(pointer:coarse)]:min-h-11"
        aria-label={ariaLabel}
        role="searchbox"
      />
      {loading && (
        <span
          className={`absolute right-3 top-1/2 -translate-y-1/2${prefersReducedMotion ? '' : ' animate-spin'} size-4 rounded-full border-2 border-[#FF8C42] border-t-transparent`}
          aria-hidden="true"
        />
      )}
      {/*
        The spinner used to carry `aria-label="Loading search results"` and be the
        only thing that said so. Two failures in one: it has no content, so it
        maps to `role="generic"` where ARIA 1.2 prohibits `aria-label` and the
        browser drops it; and even if it had stuck, a name on a decorative span
        is not an announcement — nothing tells a screen reader the results are
        being fetched, and search is precisely where the delay needs narrating.

        So the spinner becomes what it looks like — decoration — and the state
        moves into a live region that is mounted on every render and empty when
        idle. `role="status"` inserted at the same moment it first has text is
        the case readers most often miss; `sr-only` is `position: absolute`, so
        the quiet version costs no layout inside the `relative` wrapper.
      */}
      <span role="status" className="sr-only">
        {loading ? 'Loading search results' : ''}
      </span>
      {/*
        Gated on `draft`, not on `value`. The prop is one debounce behind, so the
        old gate meant the ✕ took 300ms to appear after you started typing and
        300ms to leave after you finished deleting.

        `SearchClearButton` replaces a hand-drawn 32px disc that grew to
        `size-11` on coarse pointers — 44px of button inside a ~38px field, which
        overflowed it. `ghost` keeps the 44px *pointer* target on a
        pseudo-element and leaves the disc at 28px, so the target no longer
        depends on the field being tall enough to hold it. The field's right
        padding goes 36px → 40px to clear the disc's 38px extent.
      */}
      {!loading && draft && <SearchClearButton onClear={handleClear} variant="ghost" />}
    </div>
  );
};
