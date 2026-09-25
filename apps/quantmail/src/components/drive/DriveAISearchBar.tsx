'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { browserApiRequest } from '../../services/browser-api-request';

export interface AISearchResultItem {
  fileId: string;
  fileName: string;
  mimeType: string;
  score: number;
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
      } catch (err) {
        console.error('[DriveAISearchManager] listener error:', err);
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

    try {
      if (this.state.isSemantic) {
        const response = await this.apiFetch('/api/drive/ai/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: trimmed, limit: 10 }),
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
                : 0.95,
          snippet: item.snippet || item.matchSnippet || '',
          matchedLine: item.matchedLine ?? item.line,
        }));

        this.state.results = results;
        this.state.selectedIndex = results.length > 0 ? 0 : -1;
        this.state.error = null;
        return results;
      } else {
        // Name-based search fallback
        let results: AISearchResultItem[] = [];
        const res = await this.apiFetch(`/api/drive/search?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          const files = data.files || [];
          results = files.map((file: any) => ({
            fileId: file.id || file.fileId || '',
            fileName: file.name || file.fileName || 'Untitled File',
            mimeType: file.mimeType || 'application/octet-stream',
            score: 1.0,
            snippet: `Matching file name: ${file.name || ''}`,
          }));
        } else {
          // Fallback to AI search endpoint if name search route unavailable
          const fallbackRes = await this.apiFetch('/api/drive/ai/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: trimmed, limit: 10 }),
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
                    : 1.0,
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
        <mark key={i} className="bg-[#FF8C42]/20 text-[#FF8C42] font-semibold px-0.5 rounded">
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
  placeholder = 'Search file contents with Quanty AI...',
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
        className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-[#16181D] border transition-all duration-200 shadow-lg ${
          isOpen
            ? 'border-[#60A5FA] ring-2 ring-[#60A5FA]/20'
            : 'border-[#282C35] hover:border-slate-600'
        }`}
      >
        {/* Search Icon / Spinner */}
        <div className="flex items-center justify-center w-6 h-6 text-slate-400 shrink-0">
          {state.isSearching ? (
            <svg
              data-testid="search-spinner"
              className="w-4 h-4 animate-spin text-[#60A5FA]"
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
          className="flex-1 bg-transparent border-0 outline-none text-sm text-slate-100 placeholder-slate-500 font-sans"
        />

        {/* Mode Toggle Pill */}
        <button
          type="button"
          onClick={handleToggleSemantic}
          data-testid="semantic-toggle-pill"
          aria-label="Toggle Search Mode"
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 shrink-0 select-none ${
            state.isSemantic
              ? 'bg-[#60A5FA]/15 text-[#60A5FA] border border-[#60A5FA]/30 hover:bg-[#60A5FA]/25'
              : 'bg-[#282C35] text-slate-300 border border-slate-700 hover:bg-slate-800'
          }`}
        >
          {state.isSemantic ? (
            <>
              <svg
                className="w-3.5 h-3.5 text-[#FF8C42]"
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
            className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-[#282C35] transition-colors"
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

      {/* Popover Dropdown Results */}
      {showDropdown && (
        <div
          data-testid="drive-ai-search-results-popover"
          className="absolute left-0 right-0 top-full mt-2 z-50 overflow-hidden rounded-xl bg-[#16181D] border border-[#282C35] shadow-2xl backdrop-blur-xl"
        >
          {/* Header Status Bar */}
          <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#282C35] text-xs text-slate-400 bg-[#16181D]/80">
            <span data-testid="results-count-label">
              {state.isSearching
                ? 'Scanning in-file contents...'
                : `${state.results.length} ${state.results.length === 1 ? 'match' : 'matches'} found`}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">
                <kbd className="px-1 py-0.5 rounded bg-[#282C35] text-slate-400 border border-slate-700">
                  ↑↓
                </kbd>{' '}
                navigate
              </span>
              <span className="text-[11px] text-slate-500">
                <kbd className="px-1 py-0.5 rounded bg-[#282C35] text-slate-400 border border-slate-700">
                  ↵
                </kbd>{' '}
                select
              </span>
              <span className="text-[11px] text-slate-500">
                <kbd className="px-1 py-0.5 rounded bg-[#282C35] text-slate-400 border border-slate-700">
                  esc
                </kbd>{' '}
                close
              </span>
            </div>
          </div>

          {/* Results List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-[#282C35]/50 py-1">
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
                      ? 'bg-[#282C35] border-l-2 border-[#60A5FA]'
                      : 'hover:bg-[#282C35]/60'
                  }`}
                >
                  {/* Top Line: File Name & Match Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <svg
                        className="w-4 h-4 text-[#60A5FA] shrink-0"
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
                        <span className="text-[10px] text-slate-500 bg-[#16181D] px-1.5 py-0.5 rounded border border-[#282C35]">
                          Line {result.matchedLine}
                        </span>
                      )}
                    </div>

                    <span
                      data-testid="result-match-badge"
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide shrink-0 bg-[#FF8C42]/15 text-[#FF8C42] border border-[#FF8C42]/30"
                    >
                      {matchPercentage(result.score)}
                    </span>
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
