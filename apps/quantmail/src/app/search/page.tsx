'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { AppShell, SearchInput, Card, Badge, Button, Skeleton } from '@quant/shared-ui';
import { ErrorState, EmptyState } from '@quant/shared-ui';
import { spring } from '@quant/brand';
import { AppSidebar } from '../../components/AppSidebar';
import { useSearchEmails } from '../../hooks/useSearchEmails';
import { listContainerVariants, listItemVariants, chipVariants } from '../../lib/motion-variants';
import type { Email, SearchEmailRequest } from '../../types';

const RECENT_SEARCHES_KEY = 'quantmail_recent_searches';
const MAX_RECENT_SEARCHES = 5;

interface SearchFilter {
  type: 'from' | 'to' | 'has' | 'in' | 'date';
  label: string;
  value: string;
}

const FILTER_CHIPS: { type: SearchFilter['type']; label: string; placeholder: string }[] = [
  { type: 'from', label: 'From:', placeholder: 'sender@example.com' },
  { type: 'to', label: 'To:', placeholder: 'recipient@example.com' },
  { type: 'has', label: 'Has: attachment', placeholder: '' },
  { type: 'in', label: 'In: label', placeholder: 'Label name' },
  { type: 'date', label: 'Date:', placeholder: 'YYYY-MM-DD' },
];

function getRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string): void {
  if (typeof window === 'undefined' || !query.trim()) return;
  try {
    const existing = getRecentSearches();
    const filtered = existing.filter((s) => s !== query);
    const updated = [query, ...filtered].slice(0, MAX_RECENT_SEARCHES);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {
    // localStorage may be unavailable
  }
}

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<SearchFilter[]>([]);
  const [editingFilter, setEditingFilter] = useState<SearchFilter['type'] | null>(null);
  const [filterInput, setFilterInput] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  // Build search params from query + filters
  const searchParams: Partial<SearchEmailRequest> | null =
    hasSearched && query.trim()
      ? {
          query: query.trim(),
          from: activeFilters.find((f) => f.type === 'from')?.value,
          to: activeFilters.find((f) => f.type === 'to')?.value,
          hasAttachment: activeFilters.some((f) => f.type === 'has') ? true : undefined,
          label: activeFilters.find((f) => f.type === 'in')?.value,
          dateFrom: activeFilters.find((f) => f.type === 'date')?.value,
        }
      : null;

  const { data: results, isLoading, error } = useSearchEmails(searchParams);

  const handleSearch = useCallback(() => {
    if (!query.trim()) return;
    setHasSearched(true);
    saveRecentSearch(query.trim());
    setRecentSearches(getRecentSearches());
  }, [query]);

  const handleSearchInput = useCallback((value: string) => {
    setQuery(value);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSearch();
      }
    },
    [handleSearch],
  );

  const handleAddFilter = useCallback((type: SearchFilter['type']) => {
    if (type === 'has') {
      setActiveFilters((prev) => {
        if (prev.some((f) => f.type === 'has')) return prev;
        return [...prev, { type: 'has', label: 'Has: attachment', value: 'attachment' }];
      });
      setEditingFilter(null);
    } else {
      setEditingFilter(type);
      setFilterInput('');
    }
  }, []);

  const handleConfirmFilter = useCallback(() => {
    if (!editingFilter || !filterInput.trim()) {
      setEditingFilter(null);
      return;
    }
    const chip = FILTER_CHIPS.find((c) => c.type === editingFilter);
    setActiveFilters((prev) => [
      ...prev.filter((f) => f.type !== editingFilter),
      { type: editingFilter, label: `${chip?.label || ''} ${filterInput}`, value: filterInput },
    ]);
    setEditingFilter(null);
    setFilterInput('');
  }, [editingFilter, filterInput]);

  const handleRemoveFilter = useCallback((type: SearchFilter['type']) => {
    setActiveFilters((prev) => prev.filter((f) => f.type !== type));
  }, []);

  const handleRecentSearch = useCallback((search: string) => {
    setQuery(search);
    setHasSearched(true);
    saveRecentSearch(search);
    setRecentSearches(getRecentSearches());
  }, []);

  const handleEmailClick = useCallback(
    (email: Email) => {
      router.push(`/thread/${email.threadId}`);
    },
    [router],
  );

  return (
    <AppShell sidebar={<AppSidebar />}>
      <div className="flex flex-col h-full">
        {/* Search header */}
        <div className="p-4 border-b border-[var(--quant-border)]">
          <div className="flex items-center gap-2" onKeyDown={handleKeyDown}>
            <div className="flex-1">
              <SearchInput
                placeholder="Search all emails..."
                value={query}
                onChange={handleSearchInput}
              />
            </div>
            <Button variant="primary" onClick={handleSearch} disabled={!query.trim()}>
              Search
            </Button>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--quant-border)] overflow-x-auto">
          {FILTER_CHIPS.map((chip) => {
            const isActive = activeFilters.some((f) => f.type === chip.type);
            return (
              <button
                key={chip.type}
                className={`px-3 py-1.5 min-h-[44px] text-xs rounded-full border whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-[var(--quant-primary)] text-white border-[var(--quant-primary)]'
                    : 'border-[var(--quant-border)] text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-muted)]'
                }`}
                onClick={() =>
                  isActive ? handleRemoveFilter(chip.type) : handleAddFilter(chip.type)
                }
              >
                {chip.label}
                {isActive && ' \u2715'}
              </button>
            );
          })}
        </div>

        {/* Filter input form */}
        <AnimatePresence>
          {editingFilter && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', ...spring.snappy }}
              className="border-b border-[var(--quant-border)] bg-[var(--quant-muted)]/50"
            >
              <div className="flex items-center gap-2 px-4 py-3">
                <span className="text-sm font-medium capitalize">{editingFilter}:</span>
                <input
                  type="text"
                  className="flex-1 px-3 py-2 min-h-[44px] text-sm border border-[var(--quant-border)] rounded-md bg-[var(--quant-background)] focus:outline-none focus:ring-2 focus:ring-[var(--quant-primary)]"
                  placeholder={FILTER_CHIPS.find((c) => c.type === editingFilter)?.placeholder}
                  value={filterInput}
                  onChange={(e) => setFilterInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmFilter();
                  }}
                  autoFocus
                />
                <Button variant="primary" onClick={handleConfirmFilter}>
                  Apply
                </Button>
                <Button variant="secondary" onClick={() => setEditingFilter(null)}>
                  Cancel
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active filter tags */}
        {activeFilters.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-[var(--quant-muted)]/30">
            <span className="text-xs text-[var(--quant-muted-foreground)]">Active filters:</span>
            {activeFilters.map((filter) => (
              <motion.span
                key={filter.type}
                variants={chipVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-[var(--quant-primary)]/10 text-[var(--quant-primary)] rounded-full"
              >
                {filter.label}
                <button
                  className="ml-1 min-h-[44px] min-w-[44px] flex items-center justify-center text-[10px] hover:text-[var(--quant-destructive)]"
                  onClick={() => handleRemoveFilter(filter.type)}
                >
                  \u2715
                </button>
              </motion.span>
            ))}
          </div>
        )}

        {/* Results / Recent searches */}
        <div className="flex-1 overflow-y-auto">
          {!hasSearched && (
            <div className="p-6">
              {recentSearches.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-[var(--quant-muted-foreground)] mb-3">
                    Recent Searches
                  </h3>
                  <div className="space-y-2">
                    {recentSearches.map((search) => (
                      <button
                        key={search}
                        className="flex items-center gap-2 w-full text-left px-3 py-2 min-h-[44px] text-sm rounded-md hover:bg-[var(--quant-muted)] transition-colors"
                        onClick={() => handleRecentSearch(search)}
                      >
                        <span className="text-[var(--quant-muted-foreground)]">&#128269;</span>
                        {search}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {recentSearches.length === 0 && (
                <EmptyState
                  title="Search your email"
                  description="Use the search bar above to find emails by content, sender, or subject"
                />
              )}
            </div>
          )}

          {hasSearched && isLoading && (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="rect" width="100%" height="80px" />
              ))}
            </div>
          )}

          {hasSearched && error && <ErrorState message={error.message} onRetry={handleSearch} />}

          {hasSearched && !isLoading && !error && (!results || results.length === 0) && (
            <EmptyState
              title="No results found"
              description={`No emails match "${query}". Try different keywords or adjust your filters.`}
            />
          )}

          {hasSearched && !isLoading && !error && results && results.length > 0 && (
            <motion.div
              variants={listContainerVariants}
              initial="hidden"
              animate="visible"
              className="p-4"
            >
              <p className="text-sm text-[var(--quant-muted-foreground)] mb-3">
                {results.length} result{results.length !== 1 ? 's' : ''} found
              </p>
              {results.map((email) => (
                <motion.div key={email.id} variants={listItemVariants}>
                  <Card
                    padding="none"
                    className={`my-2 p-4 cursor-pointer hover:bg-[var(--quant-muted)] transition-colors ${
                      !email.isRead ? 'border-l-4 border-l-[var(--quant-primary)]' : ''
                    }`}
                    onClick={() => handleEmailClick(email)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm ${!email.isRead ? 'font-semibold' : 'font-normal'}`}
                          >
                            {email.from?.name || email.from?.email}
                          </span>
                          {!email.isRead && <Badge variant="info">New</Badge>}
                          {email.attachments?.length > 0 && (
                            <span className="text-xs text-[var(--quant-muted-foreground)]">
                              &#128206;
                            </span>
                          )}
                        </div>
                        <h3 className={`text-sm mt-1 ${!email.isRead ? 'font-semibold' : ''}`}>
                          {email.subject}
                        </h3>
                        <p className="text-xs text-[var(--quant-muted-foreground)] mt-1 line-clamp-2">
                          {email.snippet}
                        </p>
                      </div>
                      <span className="text-xs text-[var(--quant-muted-foreground)] whitespace-nowrap ml-4">
                        {email.receivedAt ? new Date(email.receivedAt).toLocaleDateString() : ''}
                      </span>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
