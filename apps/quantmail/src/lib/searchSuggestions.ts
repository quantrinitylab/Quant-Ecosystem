// ============================================================================
// As-you-type suggestion builders for the /search page.
//
// Gmail drops a suggestion list while typing (queries, senders, labels); this
// module computes the same three sections from local-first sources so the
// dropdown is instant and honest:
//
//   queries — recent searches (account-scoped, from lib/searchHistory) plus
//             the page's quick-start examples, substring-matched;
//   senders — unique sender addresses from the local SQLite FTS5 hits for the
//             typed text. Local-index only: when the device index is empty the
//             section is empty too, never invented;
//   labels  — the user's real labels (useLabels), substring-matched.
//
// Everything here is pure and framework-free: unit-testable without a DOM,
// no network, no storage. The page owns the React wiring and the FTS5/labels
// reads.
// ============================================================================

export type SuggestionKind = 'query' | 'sender' | 'label';

export interface SearchSuggestion {
  kind: SuggestionKind;
  /** Display text: the query, the sender address, or the label name. */
  label: string;
}

export interface SuggestionSections {
  queries: SearchSuggestion[];
  senders: SearchSuggestion[];
  labels: SearchSuggestion[];
}

/** Per-section cap: the dropdown stays scannable, never a wall of rows. */
export const MAX_SUGGESTIONS_PER_SECTION = 4;

function matches(needle: string, haystack: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

function collect<T>(
  candidates: readonly T[],
  textOf: (c: T) => string,
  needle: string,
  kind: SuggestionKind,
  limit: number,
): SearchSuggestion[] {
  const seen = new Set<string>();
  const out: SearchSuggestion[] = [];
  for (const candidate of candidates) {
    const text = (textOf(candidate) ?? '').trim();
    if (!text) continue;
    const folded = text.toLowerCase();
    if (seen.has(folded)) continue;
    if (!matches(needle, folded)) continue;
    seen.add(folded);
    out.push({ kind, label: text });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Query suggestions: recent searches first, then quick-start examples,
 * substring-matched against the typed text (so "voic" still finds
 * "invoice"), deduplicated case-insensitively, capped.
 */
export function querySuggestions(
  recentSearches: readonly string[],
  exampleSearches: readonly string[],
  text: string,
  limit: number = MAX_SUGGESTIONS_PER_SECTION,
): SearchSuggestion[] {
  const needle = text.trim().toLowerCase();
  if (!needle) return [];
  return collect(
    [...recentSearches, ...exampleSearches],
    (s) => s,
    needle,
    'query',
    limit,
  );
}

/**
 * Sender suggestions: unique sender addresses from the local FTS5 hits for
 * the typed text. The hits already rank by relevance; this only dedupes and
 * re-checks the substring match (the index match may be on subject/body, in
 * which case the sender is not a useful suggestion for this text).
 */
export function senderSuggestionsFromHits(
  ftsHits: readonly { fromAddress?: string }[],
  text: string,
  limit: number = MAX_SUGGESTIONS_PER_SECTION,
): SearchSuggestion[] {
  const needle = text.trim().toLowerCase();
  if (!needle) return [];
  return collect(
    ftsHits,
    (h) => h.fromAddress ?? '',
    needle,
    'sender',
    limit,
  );
}

/** Label suggestions: the user's real label names, substring-matched. */
export function labelSuggestions(
  labels: readonly { name?: string | null }[],
  text: string,
  limit: number = MAX_SUGGESTIONS_PER_SECTION,
): SearchSuggestion[] {
  const needle = text.trim().toLowerCase();
  if (!needle) return [];
  return collect(
    labels,
    (l) => l.name ?? '',
    needle,
    'label',
    limit,
  );
}

/**
 * Ordered sections for the dropdown: queries first (what you typed before),
 * then senders (who it might be from), then labels (where it might live) —
 * the same ordering Gmail uses.
 */
export function buildSuggestionSections(args: {
  text: string;
  recentSearches: readonly string[];
  exampleSearches: readonly string[];
  ftsHits: readonly { fromAddress?: string }[];
  labels: readonly { name?: string | null }[];
}): SuggestionSections {
  const { text, recentSearches, exampleSearches, ftsHits, labels } = args;
  return {
    queries: querySuggestions(recentSearches, exampleSearches, text),
    senders: senderSuggestionsFromHits(ftsHits, text),
    labels: labelSuggestions(labels, text),
  };
}

export function countSuggestions(sections: SuggestionSections): number {
  return sections.queries.length + sections.senders.length + sections.labels.length;
}

/** Sections flattened in display order — the arrow-key navigation order. */
export function flattenSuggestions(sections: SuggestionSections): SearchSuggestion[] {
  return [...sections.queries, ...sections.senders, ...sections.labels];
}
