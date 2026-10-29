// ============================================================================
// Search-frequency counts — account-scoped localStorage, beside the recent
// searches in lib/searchHistory (same isolation rules, same threat model).
//
// Why a second store instead of counting inside the recent list: the
// recent list is deduplicated and capped at 5, so it cannot remember how
// many times a query ran — a frequency derived from it would be invented.
// This store keeps one count per query, in its own account-scoped key
// (`quantmail_search_freq.v2.<account>`), where the account segment is
// the same backend-verified immutable user id searchHistory uses. Unknown
// or empty account means NO persistence at all (fail closed — never a
// shared fallback key), and the legacy unscoped recent-search key is
// never read here either.
//
// Same-device plaintext, same as recent searches: a party with full
// browser access to this profile can read raw localStorage. That is
// outside the app's isolation boundary; the stronger end state is a
// server-side search history, and this module invents no backend endpoint.
// ============================================================================

import type { SearchHistoryStorage } from './searchHistory';

/** How many distinct queries keep a count (bounds one localStorage key). */
export const MAX_FREQUENCY_ENTRIES = 50;

/**
 * Account-scoped namespace. One key per account:
 * `quantmail_search_freq.v2.<accountKey>`.
 */
export const SEARCH_FREQUENCY_STORAGE_PREFIX = 'quantmail_search_freq.v2.';

/**
 * The storage key for one account's frequency counts, or null when the
 * account is unknown — callers must treat null as "do not persist".
 */
export function searchFrequencyKey(accountKey: string): string | null {
  if (!accountKey) return null;
  return `${SEARCH_FREQUENCY_STORAGE_PREFIX}${accountKey}`;
}

/** Parse a stored payload defensively: corrupt entries degrade to {}. */
function parseFrequency(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [query, count] of Object.entries(parsed)) {
      const trimmed = query.trim();
      const n = typeof count === 'number' ? Math.floor(count) : NaN;
      if (trimmed.length > 0 && Number.isFinite(n) && n > 0) out[trimmed] = n;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Load one account's frequency counts. Null store or empty accountKey
 * means "no persistence available" — never throws, never reads across
 * accounts.
 */
export function getSearchFrequency(
  store: SearchHistoryStorage | null,
  accountKey: string,
): Record<string, number> {
  const key = store ? searchFrequencyKey(accountKey) : null;
  if (!store || !key) return {};
  try {
    return parseFrequency(store.getItem(key));
  } catch {
    return {};
  }
}

/**
 * Record one run of a query: increment its count, keeping the most-run
 * queries when the entry cap is hit. On a tie at the cut the query just
 * run wins the slot (it is the freshest evidence), so the cap never
 * silently drops the run being recorded. Returns true when the write
 * landed; false when storage is unavailable, the account is unknown, or
 * the query is empty — fail closed, never touching any shared key.
 */
export function saveSearchFrequency(
  store: SearchHistoryStorage | null,
  accountKey: string,
  query: string,
): boolean {
  const key = store ? searchFrequencyKey(accountKey) : null;
  const trimmed = (query ?? '').trim();
  if (!store || !key || !trimmed) return false;
  try {
    const counts = getSearchFrequency(store, accountKey);
    counts[trimmed] = (counts[trimmed] ?? 0) + 1;
    const entries = Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      if (a[0] === trimmed) return -1;
      if (b[0] === trimmed) return 1;
      return 0;
    });
    const capped: Record<string, number> = {};
    for (const [q, c] of entries.slice(0, MAX_FREQUENCY_ENTRIES)) capped[q] = c;
    store.setItem(key, JSON.stringify(capped));
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete one account's frequency counts (the search page's "Clear" action
 * clears recent and frequent together: both lists are that page's history
 * view, and leaving counts behind would resurrect "frequent" rows the
 * user just cleared). Never touches another account's namespace.
 */
export function clearSearchFrequency(
  store: SearchHistoryStorage | null,
  accountKey: string,
): void {
  const key = store ? searchFrequencyKey(accountKey) : null;
  if (!store || !key) return;
  try {
    store.removeItem(key);
  } catch {
    // Best effort: a wedged key must not break the page.
  }
}
