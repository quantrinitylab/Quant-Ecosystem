'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { browserApiRequest } from '../../services/browser-api-request';
import {
  parseDriveSearchQuery,
  removeDriveSearchOperator,
  type DriveSearchFilters,
} from './drive-search-operators';

export interface AISearchResultItem {
  fileId: string;
  fileName: string;
  mimeType: string;
  /**
   * Backend-provided relevance score (0..1). Null when the backend did not
   * report one — the UI hides the match badge instead of inventing a score
   * (QM-M39-013: a missing score must never render as "95% Match").
   */
  score: number | null;
  snippet: string;
  matchedLine?: number;
}

export interface DriveAISearchState {
  query: string;
  isSemantic: boolean;
  results: AISearchResultItem[];
  isSearching: boolean;
  selectedIndex: number;
  error: string | null;
}

export interface DriveAISearchManagerOptions {
  apiFetch?: typeof browserApiRequest;
  initialQuery?: string;
  initialSemantic?: boolean;
  debounceMs?: number;
}

/**
 * Headless Manager orchestrating in-file semantic search, query debouncing,
 * keyboard result selection, and semantic mode toggling.
 */
export class DriveAISearchManager {
  private state: DriveAISearchState;
  private listeners: Set<(state: DriveAISearchState) => void> = new Set();
  private apiFetch: typeof browserApiRequest;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceMs: number;

  constructor(options?: DriveAISearchManagerOptions) {
    this.apiFetch = options?.apiFetch ?? browserApiRequest;
    this.debounceMs = options?.debounceMs ?? 250;
    this.state = {
      query: options?.initialQuery ?? '',
      isSemantic: options?.initialSemantic ?? true,
      results: [],
      isSearching: false,
      selectedIndex: -1,
      error: null,
    };
  }

  public getState(): DriveAISearchState {
    return { ...this.state, results: [...this.state.results] };
  }

  public subscribe(listener: (state: DriveAISearchState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const currentState = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(currentState);
      } catch {
        // Silently ignore listener errors
      }
    });
  }

  public setQuery(query: string): void {
    this.state.query = query;
    this.state.selectedIndex = -1;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      this.state.results = [];
      this.state.isSearching = false;
      this.state.error = null;
      this.notify();
      return;
    }

    if (this.debounceMs > 0) {
      this.debounceTimer = setTimeout(() => {
        void this.search(trimmed);
      }, this.debounceMs);
      this.notify();
    } else {
      void this.search(trimmed);
    }
  }

  public toggleSemantic(): void {
    this.state.isSemantic = !this.state.isSemantic;
    this.notify();

    if (this.state.query.trim()) {
      void this.search(this.state.query.trim());
    }
  }

  /**
   * Remove one operator family (e.g. 'type') from the current query and
   * re-run the search. Backs the removable operator chips in the bar UI.
   */
  public removeSearchOperator(operator: string): void {
    this.setQuery(removeDriveSearchOperator(this.state.query, operator));
  }

  /**
   * Build the `/api/drive/search` query string from a parsed query: residual
   * free text plus any structured operator filters.
   */
  private buildNameSearchUrl(query: string): string {
    const parsed = parseDriveSearchQuery(query);
    const params = new URLSearchParams();
    if (parsed.text) params.set('q', parsed.text);
    const f = parsed.filters;
    if (f.type) params.set('type', f.type);
    if (f.name) params.set('name', f.name);
    if (f.owner) params.set('owner', f.owner);
    if (f.before) params.set('before', f.before);
    if (f.after) params.set('after', f.after);
    return `/api/drive/search?${params.toString()}`;
  }

  /**
   * Map `/api/drive/search` file rows onto AI-search result items. The name
   * search reports no relevance score, so the badge stays hidden (QM-M39-013:
   * a missing score must never render as an invented match percentage).
   */
  private mapNameSearchResults(data: any): AISearchResultItem[] {
    const files = data.files || [];
    return files.map((file: any) => ({
      fileId: file.id || file.fileId || '',
      fileName: file.name || file.fileName || 'Untitled File',
      mimeType: file.mimeType || 'application/octet-stream',
      score: null,
      snippet: `Matching file name: ${file.name || ''}`,
    }));
  }

  public setResults(results: AISearchResultItem[]): void {
    this.state.results = [...results];
    this.state.selectedIndex = results.length > 0 ? 0 : -1;
    this.state.isSearching = false;
    this.state.error = null;
    this.notify();
  }

  public selectIndex(index: number): void {
    const count = this.state.results.length;
    if (count === 0) {
      this.state.selectedIndex = -1;
    } else {
      if (index < 0) {
        this.state.selectedIndex = count - 1;
      } else if (index >= count) {
        this.state.selectedIndex = 0;
      } else {
        this.state.selectedIndex = index;
      }
    }
    this.notify();
  }

  public getSelectedResult(): AISearchResultItem | null {
    const { results, selectedIndex } = this.state;
    if (selectedIndex >= 0 && selectedIndex < results.length) {
      return results[selectedIndex];
    }
    return null;
  }

  public async search(customQuery?: string): Promise<AISearchResultItem[]> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const query = customQuery !== undefined ? customQuery : this.state.query;
    const trimmed = query.trim();

    if (!trimmed) {
      this.state.results = [];
      this.state.selectedIndex = -1;
      this.state.isSearching = false;
      this.state.error = null;
      this.notify();
      return [];
    }

    this.state.isSearching = true;
    this.state.error = null;
    this.notify();

    // Google-Drive-style operators (`type:` / `name:` / `owner:` / `before:` /
    // `after:`) are parsed out of the query BEFORE any search runs. The
    // semantic-NL default keeps working: operators ride along as structured
    // filters and the residual free text is what gets searched semantically.
    const parsed = parseDriveSearchQuery(trimmed);
    const filters: DriveSearchFilters = parsed.filters;
    const hasFilters = parsed.hasOperators;

    // The semantic content index covers the user's own files only, so an
    // `owner:shared` / `owner:<email>` operator cannot be honored there —
    // route those through the metadata search endpoint, which understands
    // share scoping. A filter-only query (e.g. `type:pdf`, no free text) has
    // nothing to match semantically and takes the same path.
    const ownerScoped = filters.owner !== undefined && filters.owner !== 'me';
    const useNameSearch = !this.state.isSemantic || !parsed.text || ownerScoped;

    try {
      if (!useNameSearch) {
        const body: { query: string; limit: number; filters?: DriveSearchFilters } = {
          query: parsed.text,
          limit: 10,
        };
        if (hasFilters) {
          // The semantic route scopes to the owner implicitly; drop the
          // owner key rather than sending a filter the backend would ignore.
          const { owner: _owner, ...semanticFilters } = filters;
          body.filters = semanticFilters;
        }
        const response = await this.apiFetch('/api/drive/ai/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error(`AI search failed with status ${response.status}`);
        }

        const data = await response.json();
        const rawItems = Array.isArray(data) ? data : data.results || [];
        const results: AISearchResultItem[] = rawItems.map((item: any) => ({
          fileId: item.fileId || item.id || '',
          fileName: item.fileName || item.name || 'Untitled File',
          mimeType: item.mimeType || 'application/octet-stream',
          score:
            typeof item.score === 'number'
              ? item.score
              : typeof item.relevanceScore === 'number'
                ? item.relevanceScore
                : null,
          snippet: item.snippet || item.matchSnippet || '',
          matchedLine: item.matchedLine ?? item.line,
        }));

        this.state.results = results;
        this.state.selectedIndex = results.length > 0 ? 0 : -1;
        this.state.error = null;
        return results;
      } else {
        // Name-based search (toggle off, pure operator query, or an
        // owner-scoped operator the semantic index cannot honor)
        let results: AISearchResultItem[] = [];
        const res = await this.apiFetch(this.buildNameSearchUrl(trimmed));
        if (res.ok) {
          const data = await res.json();
          results = this.mapNameSearchResults(data);
        } else if (parsed.text) {
          // Fallback to AI search endpoint if name search route unavailable
          const fallbackRes = await this.apiFetch('/api/drive/ai/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: parsed.text, limit: 10 }),
          });
          if (fallbackRes.ok) {
            const data = await fallbackRes.json();
            const rawItems = Array.isArray(data) ? data : data.results || [];
            results = rawItems.map((item: any) => ({
              fileId: item.fileId || item.id || '',
              fileName: item.fileName || item.name || 'Untitled File',
              mimeType: item.mimeType || 'application/octet-stream',
              score:
                typeof item.score === 'number'
                  ? item.score
                  : typeof item.relevanceScore === 'number'
                    ? item.relevanceScore
                    : null,
              snippet: item.snippet || item.matchSnippet || '',
              matchedLine: item.matchedLine ?? item.line,
            }));
          }
        }

        this.state.results = results;
        this.state.selectedIndex = results.length > 0 ? 0 : -1;
        this.state.error = null;
        return results;
      }
    } catch (err: any) {
      this.state.error = err?.message || 'Search failed';
      this.state.results = [];
      this.state.selectedIndex = -1;
      return [];
    } finally {
      this.state.isSearching = false;
      this.notify();
    }
  }

  public destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.listeners.clear();
  }
}

export interface DriveAISearchBarProps {
  onSelectFile: (fileId: string) => void;
  placeholder?: string;
  manager?: DriveAISearchManager;
  initialQuery?: string;
  initialSemantic?: boolean;
}

/**
 * Highlights matching search query terms inside snippet text
 */
function renderSnippetWithHighlight(snippet: string, query: string) {
  if (!snippet) return null;
  const trimmed = query.trim();
  if (!trimmed) return snippet;

  const terms = trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (terms.length === 0) return snippet;

  try {
    const regex = new RegExp(`(${terms.join('|')})`, 'gi');
    const parts = snippet.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-[var(--quant-primary)]/20 text-[var(--quant-primary)] font-semibold px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      ),
    );
  } catch {
    return snippet;
  }
}

/**
 * DriveAISearchBar Component
 *
 * Provides in-file semantic AI content search with toggleable file-name mode,
 * debounced input queries, keyboard navigation, and popover match snippets.
 */
export const DriveAISearchBar: React.FC<DriveAISearchBarProps> = ({
  onSelectFile,
  placeholder = 'Search files… try type:pdf owner:me before:2025-01-01',
  manager: customManager,
  initialQuery = '',
  initialSemantic = true,
}) => {
  const [manager] = useState(
    () =>
      customManager ||
      new DriveAISearchManager({
        initialQuery,
        initialSemantic,
      }),
  );

  const [state, setState] = useState<DriveAISearchState>(() => manager.getState());
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = manager.subscribe(setState);
    return () => {
      unsubscribe();
    };
  }, [manager]);

  // Click outside listener to close popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    manager.setQuery(value);
    if (!isOpen && value.trim()) {
      setIsOpen(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen && state.results.length > 0) {
        setIsOpen(true);
      } else {
        manager.selectIndex(state.selectedIndex + 1);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      manager.selectIndex(state.selectedIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = manager.getSelectedResult();
      if (selected) {
        onSelectFile(selected.fileId);
        setIsOpen(false);
      } else if (state.results.length > 0) {
        onSelectFile(state.results[0].fileId);
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const handleSelectResult = (result: AISearchResultItem) => {
    onSelectFile(result.fileId);
    setIsOpen(false);
  };

  const handleToggleSemantic = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    manager.toggleSemantic();
  };

  const matchPercentage = (score: number) => {
    const pct = score <= 1.0 ? Math.round(score * 100) : Math.round(score);
    return `${Math.min(100, Math.max(1, pct))}% Match`;
  };

  const showDropdown =
    isOpen && (state.results.length > 0 || state.isSearching || state.error !== null);

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-2xl text-slate-200"
      data-testid="drive-ai-search-container"
    >
      {/* Search Input Bar */}
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--quant-surface-elevated)] border transition-all duration-200 shadow-lg ${
          isOpen
            ? 'border-[var(--app-accent)] ring-2 ring-[color-mix(in_srgb,var(--app-accent)_20%,transparent)]'
            : 'border-[var(--quant-surface-elevated)] hover:border-slate-600'
        }`}
      >
        {/* Search Icon / Spinner */}
        <div className="flex items-center justify-center w-6 h-6 text-slate-400 shrink-0">
          {state.isSearching ? (
            <svg
              data-testid="search-spinner"
              className="w-4 h-4 animate-spin text-[var(--app-accent)]"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <svg
              className="w-4 h-4 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          )}
        </div>

        {/* Text Input */}
        <input
          ref={inputRef}
          type="text"
          value={state.query}
          onChange={handleInputChange}
          onFocus={() => {
            if (state.query.trim()) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={state.isSemantic ? placeholder : 'Search files by name...'}
          data-testid="drive-ai-search-input"
          // `min-w-0` is the fix for the clipped mode pill on narrow screens:
          // a flex item's default `min-width: auto` lets a long query (or the
          // input's intrinsic width) refuse to shrink, which shoves the
          // `shrink-0` pill out of the bar. With `min-w-0` the field yields
          // and the pill stays fully visible.
          className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm text-slate-100 placeholder-slate-500 font-sans"
        />

        {/* Mode Toggle Pill */}
        <button
          type="button"
          onClick={handleToggleSemantic}
          data-testid="semantic-toggle-pill"
          aria-label="Toggle Search Mode"
          // `whitespace-nowrap` + `shrink-0`: the label ("AI Content Search")
          // must never wrap or compress — it was getting clipped on phones
          // when the input refused to shrink (fixed via `min-w-0` above).
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 shrink-0 whitespace-nowrap select-none ${
            state.isSemantic
              ? 'bg-[color-mix(in_srgb,var(--app-accent)_15%,transparent)] text-[var(--app-accent)] border border-[color-mix(in_srgb,var(--app-accent)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--app-accent)_25%,transparent)]'
              : 'bg-[var(--quant-surface-elevated)] text-slate-300 border border-slate-700 hover:bg-slate-800'
          }`}
        >
          {state.isSemantic ? (
            <>
              <svg
                className="w-3.5 h-3.5 text-[var(--quant-primary)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <span>AI Content Search</span>
            </>
          ) : (
            <>
              <svg
                className="w-3.5 h-3.5 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span>File Name</span>
            </>
          )}
        </button>

        {/* Clear Button */}
        {state.query && (
          <button
            type="button"
            onClick={() => {
              manager.setQuery('');
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            data-testid="clear-search-button"
            aria-label="Clear Search"
            className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-[var(--quant-surface-elevated)] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Active operator chips — parsed out of the query above, removable */}
      {(() => {
        const parsed = parseDriveSearchQuery(state.query);
        if (!parsed.hasOperators) return null;
        const chips: { key: keyof DriveSearchFilters; label: string }[] = [];
        if (parsed.filters.type) chips.push({ key: 'type', label: `type:${parsed.filters.type}` });
        if (parsed.filters.name)
          chips.push({ key: 'name', label: `name:${parsed.filters.name}` });
        if (parsed.filters.owner)
          chips.push({ key: 'owner', label: `owner:${parsed.filters.owner}` });
        if (parsed.filters.before)
          chips.push({ key: 'before', label: `before:${parsed.filters.before}` });
        if (parsed.filters.after)
          chips.push({ key: 'after', label: `after:${parsed.filters.after}` });
        return (
          <div
            data-testid="drive-search-operator-chips"
            className="flex flex-wrap items-center gap-1.5 px-1 pt-2"
          >
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => manager.removeSearchOperator(chip.key)}
                data-testid={`operator-chip-${chip.key}`}
                aria-label={`Remove ${chip.label} filter`}
                className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--app-accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--app-accent)_12%,transparent)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--app-accent)_22%,transparent)]"
              >
                {chip.label}
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            ))}
          </div>
        );
      })()}

      {/* Popover Dropdown Results */}
      {showDropdown && (
        <div
          data-testid="drive-ai-search-results-popover"
          className="absolute left-0 right-0 top-full mt-2 z-50 overflow-hidden rounded-xl bg-[var(--quant-surface-elevated)] border border-[var(--quant-surface-elevated)] shadow-2xl backdrop-blur-xl"
        >
          {/* Header Status Bar */}
          <div className="flex items-center justify-between px-3.5 py-2 text-xs text-slate-400 bg-[var(--quant-surface-elevated)]/80">
            <span data-testid="results-count-label">
              {state.isSearching
                ? 'Scanning in-file contents...'
                : `${state.results.length} ${state.results.length === 1 ? 'match' : 'matches'} found`}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">
                <kbd className="px-1 py-0.5 rounded bg-[var(--quant-surface-elevated)] text-slate-400 border border-slate-700">
                  ↑↓
                </kbd>{' '}
                navigate
              </span>
              <span className="text-[11px] text-slate-500">
                <kbd className="px-1 py-0.5 rounded bg-[var(--quant-surface-elevated)] text-slate-400 border border-slate-700">
                  ↵
                </kbd>{' '}
                select
              </span>
              <span className="text-[11px] text-slate-500">
                <kbd className="px-1 py-0.5 rounded bg-[var(--quant-surface-elevated)] text-slate-400 border border-slate-700">
                  esc
                </kbd>{' '}
                close
              </span>
            </div>
          </div>

          {/* Results List */}
          <div className="max-h-80 overflow-y-auto flex flex-col gap-0.5 py-1">
            {state.error && (
              <div
                data-testid="search-error-message"
                className="px-4 py-3 text-xs text-red-400 flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4 shrink-0 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>{state.error}</span>
              </div>
            )}

            {!state.error && state.results.length === 0 && !state.isSearching && (
              <div
                data-testid="no-results-message"
                className="px-4 py-6 text-center text-xs text-slate-500"
              >
                No matching in-file contents found for &quot;{state.query}&quot;
              </div>
            )}

            {state.results.map((result, idx) => {
              const isSelected = idx === state.selectedIndex;
              return (
                <div
                  key={`${result.fileId}-${idx}`}
                  data-testid={`search-result-item-${result.fileId}`}
                  onClick={() => handleSelectResult(result)}
                  onMouseEnter={() => manager.selectIndex(idx)}
                  className={`px-3.5 py-2.5 cursor-pointer transition-colors duration-150 flex flex-col gap-1 ${
                    isSelected
                      ? 'bg-[var(--quant-surface-elevated)] border-l-2 border-[var(--app-accent)]'
                      : 'hover:bg-[var(--quant-surface-elevated)]/60'
                  }`}
                >
                  {/* Top Line: File Name & Match Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <svg
                        className="w-4 h-4 text-[var(--app-accent)] shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span
                        data-testid="result-file-name"
                        className="font-medium text-xs text-slate-100 truncate"
                      >
                        {result.fileName}
                      </span>
                      {result.matchedLine !== undefined && (
                        <span className="text-[10px] text-slate-500 bg-[var(--quant-surface-elevated)] px-1.5 py-0.5 rounded border border-[var(--quant-surface-elevated)]">
                          Line {result.matchedLine}
                        </span>
                      )}
                    </div>

                    {/* Match badge only when the backend reported a real score.
                        No score → no badge, never an invented "95% Match". */}
                    {result.score != null && (
                      <span
                        data-testid="result-match-badge"
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide shrink-0 bg-[var(--quant-primary)]/15 text-[var(--quant-primary)] border border-[var(--quant-primary)]/30"
                      >
                        {matchPercentage(result.score)}
                      </span>
                    )}
                  </div>

                  {/* Bottom Line: Highlighted Snippet */}
                  {result.snippet && (
                    <p
                      data-testid="result-snippet"
                      className="text-xs text-slate-400 line-clamp-2 pl-6 font-mono leading-relaxed"
                    >
                      {renderSnippetWithHighlight(result.snippet, state.query)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
