'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Skeleton, ErrorState, EmptyState } from '@quant/shared-ui';
import { spring } from '@quant/brand';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { useSearchEmails } from '../../hooks/useSearchEmails';
import { listContainerVariants, listItemVariants } from '../../lib/motion-variants';
import type { Email, SearchEmailRequest } from '../../types';

const RECENT_SEARCHES_KEY = 'quantmail_recent_searches';
const MAX_RECENT_SEARCHES = 5;
const EXAMPLE_SEARCHES = ['invoice', 'design feedback', 'meeting follow-up'];

interface SearchFilter {
  type: 'from' | 'to' | 'has' | 'in' | 'date';
  label: string;
  value: string;
}

const FILTER_CHIPS: { type: SearchFilter['type']; label: string; placeholder: string }[] = [
  { type: 'from', label: 'From', placeholder: 'sender@example.com' },
  { type: 'to', label: 'To', placeholder: 'recipient@example.com' },
  { type: 'has', label: 'Has attachment', placeholder: '' },
  { type: 'in', label: 'Label', placeholder: 'Label name' },
  { type: 'date', label: 'Since', placeholder: 'YYYY-MM-DD' },
];

// --- tiny inline icon set (no emoji, no HTML entities) ----------------------
type IconName = 'search' | 'clock' | 'close' | 'clip' | 'arrow';
const ICON_PATHS: Record<IconName, React.ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2.5" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  clip: (
    <path d="m21 12-8.5 8.5a5 5 0 0 1-7-7L14 5a3.4 3.4 0 0 1 4.8 4.8L10.4 18a1.8 1.8 0 0 1-2.5-2.5L16 7.5" />
  ),
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
};

function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

// Deterministic avatar tone from the sender identity.
const toneFor = (seed: string): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
};

const relativeDate = (value?: string | Date): string => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (dayDiff === 0) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' });
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
};

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

  const runSearchString = useCallback((search: string) => {
    const trimmed = search.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setHasSearched(true);
    saveRecentSearch(trimmed);
    setRecentSearches(getRecentSearches());
  }, []);

  const handleSearch = useCallback(() => {
    runSearchString(query);
  }, [query, runSearchString]);

  /**
   * Seed from `?q=` so other screens can deep-link a search.
   *
   * Read off `window.location.search` rather than `useSearchParams()` on purpose:
   * the hook forces this route into a Suspense boundary at build time, and all
   * this needs is the value present on first paint.
   */
  useEffect(() => {
    const seed = new URLSearchParams(window.location.search).get('q');
    if (seed) runSearchString(seed);
  }, [runSearchString]);

  const handleAddFilter = useCallback((type: SearchFilter['type']) => {
    if (type === 'has') {
      setActiveFilters((prev) => {
        if (prev.some((f) => f.type === 'has')) return prev;
        return [...prev, { type: 'has', label: 'Has attachment', value: 'attachment' }];
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
      { type: editingFilter, label: `${chip?.label || ''}: ${filterInput}`, value: filterInput },
    ]);
    setEditingFilter(null);
    setFilterInput('');
  }, [editingFilter, filterInput]);

  const handleRemoveFilter = useCallback((type: SearchFilter['type']) => {
    setActiveFilters((prev) => prev.filter((f) => f.type !== type));
  }, []);

  const handleResetSearch = useCallback(() => {
    setQuery('');
    setHasSearched(false);
    setActiveFilters([]);
    setEditingFilter(null);
    setFilterInput('');
  }, []);

  const clearRecent = useCallback(() => {
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {
      // ignore
    }
    setRecentSearches([]);
  }, []);

  const handleEmailClick = useCallback(
    (email: Email) => {
      const targetId = email.threadId || email.id;
      if (targetId) router.push(`/thread/${targetId}`);
    },
    [router],
  );

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <div className="workspace-page search-workspace flex flex-col h-full">
        {/* Search bar — one rounded field, icon inside, Enter searches */}
        <div className="p-4 pb-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--quant-muted-foreground)]">
                <Icon name="search" className="h-[18px] w-[18px]" />
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch();
                }}
                placeholder="Search mail — sender, subject, words…"
                aria-label="Search mail"
                autoFocus
                className="h-11 w-full rounded-full border border-[var(--quant-border)] bg-[var(--quant-surface)] pl-11 pr-10 text-sm outline-none transition-colors placeholder:text-[var(--quant-muted-foreground)]/60 focus:border-[var(--brand-primary)]/60 focus:ring-2 focus:ring-[var(--brand-primary)]/25"
              />
              {query && (
                <button
                  type="button"
                  onClick={handleResetSearch}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[var(--quant-muted-foreground)] transition-colors hover:bg-[var(--quant-muted)] hover:text-[var(--quant-foreground)]"
                >
                  <Icon name="close" className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button variant="primary" onClick={handleSearch} disabled={!query.trim()}>
              Search
            </Button>
          </div>

          {/* Filter chips — compact pills */}
          <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
            {FILTER_CHIPS.map((chip) => {
              const isActive = activeFilters.some((f) => f.type === chip.type);
              return (
                <button
                  key={chip.type}
                  type="button"
                  onClick={() =>
                    isActive ? handleRemoveFilter(chip.type) : handleAddFilter(chip.type)
                  }
                  // `min-w-11` because the height floor alone is not the whole
                  // target: "To" is two characters, so `px-3` left it 40px wide
                  // on a phone while every longer label cleared 44 by accident.
                  className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors sm:min-h-0 sm:h-8 ${
                    isActive
                      ? 'border-[var(--brand-primary)]/60 bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]'
                      : 'border-[var(--quant-border)] text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-muted)] hover:text-[var(--quant-foreground)]'
                  }`}
                >
                  {chip.label}
                  {isActive && <Icon name="close" className="h-3 w-3" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filter value editor */}
        <AnimatePresence>
          {editingFilter && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', ...spring.snappy }}
              className="overflow-hidden border-y border-[var(--quant-border)] bg-[var(--quant-muted)]/40"
            >
              <div className="flex items-center gap-2 px-4 py-3">
                <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[var(--quant-muted-foreground)]">
                  {FILTER_CHIPS.find((c) => c.type === editingFilter)?.label}
                </span>
                <input
                  type={editingFilter === 'date' ? 'date' : 'text'}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 text-sm outline-none focus:border-[var(--brand-primary)]/60 focus:ring-2 focus:ring-[var(--brand-primary)]/25"
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

        {/* Active filters */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-4 py-2">
            {activeFilters.map((filter) => (
              <span
                key={filter.type}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-primary)]/12 py-1 pl-2.5 pr-1 text-xs font-medium text-[var(--brand-primary)]"
              >
                {filter.label}
                <button
                  type="button"
                  onClick={() => handleRemoveFilter(filter.type)}
                  aria-label={`Remove filter ${filter.label}`}
                  className="grid h-5 w-5 place-items-center rounded-full transition-colors hover:bg-[var(--brand-primary)]/20"
                >
                  <Icon name="close" className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {/* Zero state: recent + quick starts */}
          {!hasSearched && (
            <div className="space-y-6 p-4 sm:p-6">
              {recentSearches.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--quant-muted-foreground)]">
                      Recent
                    </h3>
                    <button
                      type="button"
                      onClick={clearRecent}
                      className="text-xs text-[var(--quant-muted-foreground)] transition-colors hover:text-[var(--quant-foreground)]"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-[var(--quant-border)]">
                    {recentSearches.map((search) => (
                      <button
                        key={search}
                        type="button"
                        onClick={() => runSearchString(search)}
                        className="group flex w-full items-center gap-3 border-b border-[var(--quant-border)] px-3.5 py-2.5 text-left text-sm last:border-b-0 transition-colors hover:bg-[var(--quant-muted)]"
                      >
                        <Icon
                          name="clock"
                          className="h-4 w-4 shrink-0 text-[var(--quant-muted-foreground)]"
                        />
                        <span className="min-w-0 flex-1 truncate">{search}</span>
                        <Icon
                          name="arrow"
                          className="h-3.5 w-3.5 shrink-0 text-[var(--quant-muted-foreground)] opacity-0 transition-opacity group-hover:opacity-100"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {recentSearches.length === 0 && (
                <EmptyState
                  title="Search every conversation"
                  description="Look across senders, subjects, attachments, and labels to jump straight back into the exact thread you need."
                  actionLabel="Try “invoice”"
                  onAction={() => runSearchString('invoice')}
                />
              )}

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--quant-muted-foreground)]">
                  Quick starts
                </h3>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLE_SEARCHES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => runSearchString(example)}
                      className="inline-flex min-h-11 sm:min-h-0 sm:h-8 items-center gap-1.5 rounded-full border border-[var(--quant-border)] px-3 text-xs font-medium text-[var(--quant-muted-foreground)] transition-colors hover:bg-[var(--quant-muted)] hover:text-[var(--quant-foreground)]"
                    >
                      <Icon name="search" className="h-3 w-3" />
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Loading */}
          {hasSearched && isLoading && (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="rect" width="100%" height="72px" />
              ))}
            </div>
          )}

          {hasSearched && error && <ErrorState message={error.message} onRetry={handleSearch} />}

          {hasSearched && !isLoading && !error && (!results || results.length === 0) && (
            <EmptyState
              title="No results"
              description={`Nothing matched “${query}”. Try a broader phrase, remove filters, or search by sender or subject.`}
              actionLabel="Reset search"
              onAction={handleResetSearch}
            />
          )}

          {/* Results */}
          {hasSearched && !isLoading && !error && results && results.length > 0 && (
            <motion.div
              variants={listContainerVariants}
              initial="hidden"
              animate="visible"
              className="p-4"
            >
              <p className="mb-2 px-1 text-xs text-[var(--quant-muted-foreground)]">
                {results.length} result{results.length !== 1 ? 's' : ''} for “{query}”
              </p>
              <div className="overflow-hidden rounded-xl border border-[var(--quant-border)]">
                {results.map((email) => {
                  const senderLabel = email.from?.name || email.from?.email || '?';
                  const hue = toneFor(email.from?.email || senderLabel);
                  return (
                    <motion.button
                      key={email.id}
                      variants={listItemVariants}
                      type="button"
                      onClick={() => handleEmailClick(email)}
                      className="flex w-full items-start gap-3 border-b border-[var(--quant-border)] bg-[var(--quant-surface)]/40 px-3.5 py-3 text-left last:border-b-0 transition-colors hover:bg-[var(--quant-muted)]"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
                        style={{
                          background: `linear-gradient(135deg, hsl(${hue} 65% 46%), hsl(${(hue + 42) % 360} 65% 36%))`,
                        }}
                      >
                        {senderLabel.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          {!email.isRead && (
                            <span className="mail-unread-dot" aria-label="Unread" />
                          )}
                          <span
                            className={`min-w-0 truncate text-sm ${
                              email.isRead
                                ? 'font-normal text-[var(--quant-muted-foreground)]'
                                : 'font-semibold'
                            }`}
                          >
                            {senderLabel}
                          </span>
                          {(email.attachments?.length ?? 0) > 0 && (
                            <Icon
                              name="clip"
                              className="h-3.5 w-3.5 shrink-0 text-[var(--quant-muted-foreground)]"
                            />
                          )}
                          <span className="ml-auto shrink-0 text-xs text-[var(--quant-muted-foreground)]">
                            {relativeDate(email.receivedAt)}
                          </span>
                        </span>
                        <span
                          className={`mt-0.5 block truncate text-sm ${
                            email.isRead ? '' : 'font-medium'
                          }`}
                        >
                          {email.subject}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-[var(--quant-muted-foreground)]">
                          {email.snippet}
                        </span>
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
