'use client';

// ============================================================================
// Search typeahead — the as-you-type dropdown for AppShell's search boxes.
//
// Before this, every shell search input (desktop sidebar, mobile pillar bar,
// mobile fallback row) was a bare input: typing showed nothing until the
// query was committed. This wires one shared dropdown into all three.
//
// Data (all real, nothing invented — see lib/searchSuggestions.ts for the
// honesty boundary): the user's own recent searches (account-scoped
// localStorage, lib/searchHistory — unknown account fails closed to "no
// recents", never a shared key) plus the user's own frequent contacts
// (hooks/useContactSuggestions, sessionStorage-cached, silent on failure).
// Selecting a row applies its query to the box and records it as a recent
// search; pressing Enter with no row selected also records the typed query
// (an explicit commit), but live-filter keystrokes are never recorded.
//
// Keyboard contract (parents must delegate their input's onKeyDown through
// handleKeyDown FIRST and skip their own handling when it returns true):
// ArrowDown/ArrowUp move the active row, Enter picks it, Escape closes the
// dropdown only. Rows use onMouseDown + preventDefault (same pattern as
// ContactAutocomplete) so picking a row never fires the input's blur first.
// ============================================================================

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useAuth } from '../providers/auth-provider';
import { useContactSuggestions } from '../hooks/useContactSuggestions';
import {
  getRecentSearches,
  saveRecentSearch,
  searchHistoryAccountKey,
  windowSearchHistoryStorage,
} from '../lib/searchHistory';
import {
  buildSearchSuggestions,
  type SearchSuggestion,
} from '../lib/searchSuggestions';

export type { SearchSuggestion } from '../lib/searchSuggestions';

export interface UseSearchTypeaheadOptions {
  /** Current search box value (controlled by the parent). */
  value: string;
  /** Applied when a suggestion is picked. */
  onChange: (value: string) => void;
  /**
   * When false, the frequent-contacts fetch is skipped (pages with no search
   * box). Defaults to true.
   */
  enabled?: boolean;
  /**
   * Called after a suggestion is picked, when the parent treats Enter as a
   * submit (the pillar bar's onSearchSubmit). Shell inputs that live-filter
   * omit this — picking a row just filters.
   */
  onSelectSubmit?: (value: string) => void;
}

export interface UseSearchTypeaheadResult {
  suggestions: SearchSuggestion[];
  activeIndex: number;
  /** True when the dropdown should be visible. */
  open: boolean;
  /** Stable id for the listbox; parents wire it to aria-controls. */
  listboxId: string;
  handleFocus: () => void;
  handleBlur: () => void;
  /**
   * Parent key handler: returns true when the key was consumed by the
   * dropdown (active-row navigation, pick, or close) and the parent must
   * skip its own handling for that key.
   */
  handleKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => boolean;
  handleSelect: (suggestion: SearchSuggestion) => void;
}

export function useSearchTypeahead(options: UseSearchTypeaheadOptions): UseSearchTypeaheadResult {
  const { value, onChange, enabled = true, onSelectSubmit } = options;
  const listboxId = useId();
  const { contacts } = useContactSuggestions({ enabled });

  // Defensive: AppShell is normally inside AuthProvider, but tests and some
  // hosts render it standalone — useAuth() throws there (same pattern as
  // AppShell itself). An unknown account means no recent searches at all
  // (fail closed), never a shared fallback key.
  let accountKey = '';
  try {
    const { user } = useAuth();
    accountKey = searchHistoryAccountKey(user?.id);
  } catch {
    accountKey = '';
  }

  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // The query the dropdown was last dismissed for. After a pick, the box
  // value becomes the picked query — without this, the recomputed rows for
  // that query (e.g. `from:alice@…` re-matching alice) would pop straight
  // back open. Any new keystroke changes the value and re-arms the dropdown.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  // Recents live in localStorage and change when a search is committed;
  // re-read them on focus so a just-saved search shows up immediately.
  const [recentTick, setRecentTick] = useState(0);

  const recent = useMemo(
    () => getRecentSearches(windowSearchHistoryStorage(), accountKey),
    // Re-read on focus (recentTick) as well as on account change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountKey, recentTick],
  );

  const suggestions = useMemo(
    () => (enabled ? buildSearchSuggestions(value, { recent, contacts }) : []),
    [enabled, value, recent, contacts],
  );

  const open = focused && dismissedFor !== value && suggestions.length > 0;

  useEffect(() => {
    setActiveIndex(-1);
  }, [value]);

  const saveAsRecent = useCallback(
    (query: string) => {
      if (saveRecentSearch(windowSearchHistoryStorage(), accountKey, query)) {
        setRecentTick((t) => t + 1);
      }
    },
    [accountKey],
  );

  const handleSelect = useCallback(
    (suggestion: SearchSuggestion) => {
      onChange(suggestion.query);
      saveAsRecent(suggestion.query);
      setDismissedFor(suggestion.query);
      setActiveIndex(-1);
      onSelectSubmit?.(suggestion.query);
    },
    [onChange, saveAsRecent, onSelectSubmit],
  );

  const handleFocus = useCallback(() => {
    setRecentTick((t) => t + 1);
    setFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setFocused(false);
    setActiveIndex(-1);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>): boolean => {
      if (!open) return false;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
        return true;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
        return true;
      }
      if (event.key === 'Enter') {
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          event.preventDefault();
          handleSelect(suggestions[activeIndex]);
          return true;
        }
        // Explicit commit with no row picked: record it, then let the
        // parent's own Enter handling (e.g. submit) run.
        const trimmed = value.trim();
        if (trimmed) saveAsRecent(trimmed);
        setDismissedFor(value);
        setActiveIndex(-1);
        return false;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setDismissedFor(value);
        setActiveIndex(-1);
        return true;
      }
      return false;
    },
    [open, suggestions, activeIndex, handleSelect, value, saveAsRecent],
  );

  return {
    suggestions,
    activeIndex,
    open,
    listboxId,
    handleFocus,
    handleBlur,
    handleKeyDown,
    handleSelect,
  };
}

export interface SearchTypeaheadDropdownProps {
  /** Rendered only when open — parents pass the hook's `open` through. */
  open: boolean;
  suggestions: SearchSuggestion[];
  activeIndex: number;
  listboxId: string;
  onSelect: (suggestion: SearchSuggestion) => void;
  /**
   * Absolute (sidebar, pillar bar) vs in-flow (AppShell mobile fallback row,
   * whose grid-rows animation container clips absolutely positioned content).
   * Defaults to absolute.
   */
  layout?: 'absolute' | 'in-flow';
}

function kindGlyph(kind: SearchSuggestion['kind']): string {
  if (kind === 'recent') return '↺';
  if (kind === 'operator') return '⌕';
  return '◎';
}

/**
 * Pure-black dropdown, no divider lines between rows (rows are separated by
 * padding + hover background only, per the QuantMail UI rules). Renders
 * nothing when closed so hidden rows never reach the accessibility tree.
 */
export function SearchTypeaheadDropdown({
  open,
  suggestions,
  activeIndex,
  listboxId,
  onSelect,
  layout = 'absolute',
}: SearchTypeaheadDropdownProps) {
  if (!open || suggestions.length === 0) return null;
  return (
    <div
      id={listboxId}
      role="listbox"
      aria-label="Search suggestions"
      className={
        layout === 'absolute'
          ? 'absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-2xl border border-[#3A404D]/80 bg-black p-1.5 shadow-2xl'
          : 'mt-1 max-h-64 overflow-y-auto rounded-2xl border border-[#3A404D]/80 bg-black p-1.5 shadow-2xl'
      }
    >
      {suggestions.map((suggestion, index) => {
        const active = index === activeIndex;
        return (
          <div
            key={suggestion.id}
            id={`${listboxId}-${index}`}
            role="option"
            aria-selected={active}
            onMouseDown={(e) => {
              // preventDefault keeps focus in the input (no blur before pick).
              e.preventDefault();
              onSelect(suggestion);
            }}
            className={`flex cursor-pointer items-center gap-2.5 rounded-xl p-2 text-xs transition-colors hover:bg-[var(--quant-primary)]/15 ${
              active ? 'bg-[var(--quant-primary)]/20 text-white' : 'text-[#94A3B8]'
            }`}
          >
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--quant-primary)]/40 bg-[var(--quant-primary)]/15 text-[11px] text-[var(--quant-primary)]"
            >
              {kindGlyph(suggestion.kind)}
            </span>
            <span className="min-w-0 flex flex-col">
              <span className="truncate font-medium text-white">{suggestion.label}</span>
              {suggestion.detail && (
                <span className="truncate text-[11px] text-[#64748B]">{suggestion.detail}</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
