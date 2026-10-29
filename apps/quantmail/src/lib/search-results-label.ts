// ============================================================================
// Search result labelling — pure helpers for the Mail Search slice
// (rebuild plan Phase 1.3, PR-ready prep only).
//
// The one honesty rule these helpers exist to pin: a number shown on a
// search screen is a SEARCH answer, never an inbox or folder total. The
// inbox pool counts (lensCounts, folder counts) are computed from the
// narrowed thread pool on the inbox page; a search runs a different query
// against the search backends, so its counts must never be read as pool
// counts, and must never be fed back into lens/folder counts. Every
// label below says "search results" explicitly, and the banner constant
// says the pool distinction out loud so a future edit cannot silently
// drop it.
//
// Everything here is framework-free and unit-testable without a DOM;
// the search page and UniversalSearchResults own the React wiring.
// No competitor code, asset, or screenshot is used: the grouping pattern
// (Top Results + per-source sections) is rebuilt in QuantWorkplace's own
// Obsidian theme and code.
// ============================================================================

/** Per-source hit counts for one search answer. Drive counts files + documents. */
export interface SearchSourceCounts {
  mail: number;
  people: number;
  calendar: number;
  drive: number;
}

/**
 * The banner every search-results view carries. It is a constant, not a
 * computed string, so the pool distinction cannot drift between the mail
 * view and the universal view: both render this exact text.
 */
export const SEARCH_COUNT_BANNER =
  'Counts on this page are search results only — they are not your inbox or folder totals.';

/** Search scopes the search page actually offers (mirrors its scope tabs). */
export type SearchPageScope = 'all' | 'mail' | 'people' | 'calendar' | 'drive';

const SCOPE_LABELS: Record<SearchPageScope, string> = {
  all: 'mail, people, calendar, and drive',
  mail: 'mail',
  people: 'people',
  calendar: 'calendar',
  drive: 'drive',
};

/**
 * The count line above a search answer. The query is echoed back so the
 * count is always read against the search that produced it, and the scope
 * is named so a scoped search never reads as an everything search.
 * `partial` is set when at least one source failed: the count is then
 * explicitly partial, never a full total.
 */
export function describeSearchCountLabel(input: {
  query: string;
  scope: SearchPageScope;
  total: number;
  partial?: boolean;
}): string {
  const total = Math.max(0, Math.floor(input.total));
  const noun = total === 1 ? 'search result' : 'search results';
  const partial = input.partial ? ' — some sources could not be searched, so this count is partial' : '';
  return `${total} ${noun} for “${input.query}” across ${SCOPE_LABELS[input.scope]}${partial}.`;
}

/**
 * The honest no-result state. It names the query, the scope, and any
 * applied mail filters, so "nothing matched" is never read as "the inbox
 * is empty" or "this folder is empty". With no filters it falls back to
 * the plain broader-phrase advice the page already used.
 */
export function describeSearchEmpty(input: {
  query: string;
  scope: SearchPageScope;
  filterLabels?: string[];
}): string {
  const filters = (input.filterLabels ?? []).filter((label) => label.trim().length > 0);
  const where =
    input.scope === 'all'
      ? 'across mail, people, calendar, and drive'
      : `in ${SCOPE_LABELS[input.scope]}`;
  const withFilters =
    filters.length > 0 ? ` with ${filters.join(', ')}` : '';
  return (
    `Nothing ${where} matched “${input.query}”${withFilters}. ` +
    'Try a broader phrase' +
    (filters.length > 0 ? ', remove filters,' : ',') +
    ' or search by sender or subject.'
  );
}

/**
 * How many items of each source the "Top results" section takes, for a
 * scope='all' universal answer. This is NOT a relevance ranking: there
 * is no ranking signal in the universal answer, so the section takes the
 * first matches from each source, in source order (mail, people, calendar,
 * drive documents, drive files), capped per source and in total. The
 * section's caption must say exactly that, so "Top results" is never
 * read as "best matches".
 */
export interface TopResultSlots {
  mail: number;
  people: number;
  calendar: number;
  driveDocuments: number;
  driveFiles: number;
}

const TOP_PER_SOURCE: TopResultSlots = {
  mail: 3,
  people: 1,
  calendar: 1,
  driveDocuments: 1,
  driveFiles: 1,
};

const TOP_TOTAL = 6;

export function selectTopResultSlots(input: {
  mail: number;
  people: number;
  calendar: number;
  driveDocuments: number;
  driveFiles: number;
}): TopResultSlots {
  const available: TopResultSlots = {
    mail: Math.max(0, Math.floor(input.mail)),
    people: Math.max(0, Math.floor(input.people)),
    calendar: Math.max(0, Math.floor(input.calendar)),
    driveDocuments: Math.max(0, Math.floor(input.driveDocuments)),
    driveFiles: Math.max(0, Math.floor(input.driveFiles)),
  };
  const slots: TopResultSlots = {
    mail: 0,
    people: 0,
    calendar: 0,
    driveDocuments: 0,
    driveFiles: 0,
  };
  let remaining = TOP_TOTAL;
  (Object.keys(TOP_PER_SOURCE) as Array<keyof TopResultSlots>).forEach((source) => {
    if (remaining <= 0) return;
    const take = Math.min(TOP_PER_SOURCE[source], available[source], remaining);
    slots[source] = take;
    remaining -= take;
  });
  return slots;
}

/** One suggestion row: a query the user has actually run before. */
export interface SearchSuggestion {
  query: string;
  kind: 'frequent' | 'recent';
}

/**
 * Merge recency and frequency into one suggestion list. Frequency only
 * ever promotes a query the user has run at least twice: a query run
 * once is recent, not frequent — calling it frequent would invent a
 * habit from a single run. Frequent rows come first (count descending,
 * then most-recent first on ties), then recent rows not already listed,
 * capped at `limit` (default 5, matching the recent-history cap).
 * Queries are matched exactly after trimming; no case folding, so two
 * differently-cased queries stay distinct suggestions.
 */
export function deriveSearchSuggestions(input: {
  recent: string[];
  frequency: Record<string, number>;
  limit?: number;
}): SearchSuggestion[] {
  const limit = Math.max(0, Math.floor(input.limit ?? 5));
  if (limit === 0) return [];
  const recent = input.recent
    .map((query) => (query ?? '').trim())
    .filter((query) => query.length > 0);
  const recentOrder = new Map<string, number>();
  recent.forEach((query, index) => {
    if (!recentOrder.has(query)) recentOrder.set(query, index);
  });
  const frequent = Object.entries(input.frequency)
    .map(([rawQuery, rawCount]) => ({
      query: (rawQuery ?? '').trim(),
      count: Math.floor(rawCount ?? 0),
    }))
    .filter(({ query, count }) => query.length > 0 && count >= 2)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const aOrder = recentOrder.get(a.query) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = recentOrder.get(b.query) ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder;
    });
  const out: SearchSuggestion[] = [];
  const seen = new Set<string>();
  for (const { query } of frequent) {
    if (out.length >= limit || seen.has(query)) continue;
    out.push({ query, kind: 'frequent' });
    seen.add(query);
  }
  for (const query of recent) {
    if (out.length >= limit || seen.has(query)) continue;
    out.push({ query, kind: 'recent' });
    seen.add(query);
  }
  return out;
}
