// ============================================================================
// Recent-search history — account-scoped localStorage for the search page.
// P1 qm-search-history-scope (same leak class as #1123 P0
// qm-draft-privacy-isolation and qm-drive-doc-cache-scope): the original
// namespace cached recent search queries in a single UNSCOPED key
// (`quantmail_recent_searches`), and logout never purged it — so account B
// on the same browser saw account A's recent search queries. The namespace
// is now account-scoped: `quantmail_searches.v2.<account>`, where the
// account segment is the backend-verified IMMUTABLE user id (`AuthUser.id` —
// the access-token `sub`, the users-table primary key), never the mutable
// email. An email is reassignable; a reassigned address would hand the
// previous holder's queries to the new holder (the exact leak class
// CODEX-REVIEW 6157628718 killed for the draft v2 namespace).
//
// Threat/retention policy, stated honestly:
// - This is same-device plaintext persistence (localStorage). The app can
//   never read across accounts: every read/write/delete is namespaced by
//   the immutable user id, and an unknown/empty account means NO
//   persistence at all (fail closed), never a shared fallback key. A party
//   with full browser access (DevTools on the same profile) can still read
//   raw localStorage — that is outside the app's isolation boundary,
//   exactly like every other same-device cache. The stronger end state is
//   a server-side search history; this module invents no backend endpoint.
// - The legacy unscoped key (`quantmail_recent_searches`) is NOT
//   attributable to any account, so it is never migrated into a v2
//   namespace (that would move A's queries into B's session — the leak
//   itself). It is purged: on logout (browser-auth-session) and once per
//   page load when the search page mounts under an authenticated session.
//   Upgrading users lose their pre-fix recent searches; that is the honest
//   price of fixing the leak.
// - Account-scoped v2 keys survive logout for the account's own next
//   sign-in, exactly like the thread-draft v3 and doc-cache v2 namespaces.
// - History is capped at 5 entries, matching the pre-fix behavior.
//
// Everything in this module is framework-free and unit-testable without a
// DOM; the search page owns the React wiring.
// ============================================================================

/** How many recent queries are kept. */
export const MAX_RECENT_SEARCHES = 5;

/**
 * Legacy namespace — written by pre-fix builds, a single shared key.
 * Never written anymore; purge-only (see purgeLegacyRecentSearchKeys).
 */
export const LEGACY_RECENT_SEARCHES_KEY = 'quantmail_recent_searches';

/**
 * Account-scoped namespace. One key per account:
 * `quantmail_searches.v2.<accountKey>`, where the account segment is the
 * immutable user id. A single opaque segment is injective by construction
 * (no multi-segment concatenation, so no delimiter collisions possible).
 */
export const SEARCH_HISTORY_STORAGE_PREFIX = 'quantmail_searches.v2.';

/**
 * The minimal storage surface the logic needs. In the app this is a
 * window.localStorage adapter (see windowSearchHistoryStorage); in tests a
 * Map-backed stub.
 */
export interface SearchHistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /**
   * Optional key enumeration, used by the legacy-namespace purge. Stubs
   * that omit it simply cannot purge — nothing else depends on it.
   */
  keys?(prefix?: string): string[];
}

export function windowSearchHistoryStorage(): SearchHistoryStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    const ls = window.localStorage as unknown as Storage & {
      keys?: (prefix?: string) => string[];
    };
    const enumKeys = (): string[] => {
      // Test stubs pass themselves in as window.localStorage — prefer their
      // own enumeration so the purge path is exercised the same way.
      if (typeof ls.keys === 'function') return ls.keys();
      const out: string[] = [];
      for (let i = 0; i < ls.length; i += 1) {
        const k = ls.key(i);
        if (k) out.push(k);
      }
      return out;
    };
    return {
      getItem: (k) => ls.getItem(k),
      setItem: (k, v) => ls.setItem(k, v),
      removeItem: (k) => ls.removeItem(k),
      keys: (prefix) => enumKeys().filter((k) => !prefix || k.startsWith(prefix)),
    };
  } catch {
    return null;
  }
}

/**
 * The stable authenticated account identity used as the namespace segment:
 * the backend-verified IMMUTABLE user id (`AuthUser.id`), never the mutable
 * email. The id is opaque: no case folding is applied (folding an opaque
 * identifier could merge two distinct accounts). Returns '' when no id is
 * known; an empty account key means "no persistence available" (fail
 * closed — the module never falls back to an unscoped shared key).
 */
export function searchHistoryAccountKey(userId: string | null | undefined): string {
  const id = (userId ?? '').trim();
  return id;
}

/**
 * The storage key for one account's recent searches, or null when the
 * account is unknown — callers must treat null as "do not persist".
 */
export function searchHistoryKey(accountKey: string): string | null {
  if (!accountKey) return null;
  return `${SEARCH_HISTORY_STORAGE_PREFIX}${accountKey}`;
}

/** Parse a stored payload defensively: corrupt entries degrade to []. */
function parseRecentSearches(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === 'string' && s.length > 0);
  } catch {
    return [];
  }
}

/**
 * Load one account's recent searches. Null store or empty accountKey means
 * "no persistence available" — never throws, never reads across accounts.
 * The legacy unscoped key is NEVER read here.
 */
export function getRecentSearches(
  store: SearchHistoryStorage | null,
  accountKey: string,
): string[] {
  const key = store ? searchHistoryKey(accountKey) : null;
  if (!store || !key) return [];
  try {
    return parseRecentSearches(store.getItem(key));
  } catch {
    return [];
  }
}

/**
 * Record one query at the front of the account's history, deduplicated and
 * capped at MAX_RECENT_SEARCHES. Returns true when the write landed; false
 * when storage is unavailable, the account is unknown, or the query is
 * empty — fail closed, never touching any shared key.
 */
export function saveRecentSearch(
  store: SearchHistoryStorage | null,
  accountKey: string,
  query: string,
): boolean {
  const key = store ? searchHistoryKey(accountKey) : null;
  const trimmed = (query ?? '').trim();
  if (!store || !key || !trimmed) return false;
  try {
    const existing = getRecentSearches(store, accountKey);
    const updated = [trimmed, ...existing.filter((s) => s !== trimmed)].slice(
      0,
      MAX_RECENT_SEARCHES,
    );
    store.setItem(key, JSON.stringify(updated));
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete one account's recent-search history (the "clear" UX). Never
 * touches another account's namespace.
 */
export function clearRecentSearches(
  store: SearchHistoryStorage | null,
  accountKey: string,
): void {
  const key = store ? searchHistoryKey(accountKey) : null;
  if (!store || !key) return;
  try {
    store.removeItem(key);
  } catch {
    // Best effort: a wedged key must not break the page.
  }
}

/**
 * Remove the legacy unscoped recent-search key. It cannot be attributed to
 * an account, so it is purged rather than migrated — migrating would move
 * the previous account's queries into whoever signs in next. Returns the
 * number of keys removed.
 */
export function purgeLegacyRecentSearchKeys(store: SearchHistoryStorage | null): number {
  if (!store || typeof store.keys !== 'function') return 0;
  let removed = 0;
  try {
    for (const key of store.keys()) {
      if (key !== LEGACY_RECENT_SEARCHES_KEY) continue;
      try {
        store.removeItem(key);
        removed += 1;
      } catch {
        // One wedged key must not protect the rest.
      }
    }
  } catch {
    // Best effort: enumeration failed, nothing removed.
  }
  return removed;
}

/**
 * One-time per page load: drop the retired unscoped key now that the v2
 * account-scoped namespace is authoritative. Called from the search page
 * under an authenticated session.
 */
let legacyPurgeDone = false;
export function ensureSearchHistoryNamespaceV2(store: SearchHistoryStorage | null): void {
  if (legacyPurgeDone) return;
  legacyPurgeDone = true;
  purgeLegacyRecentSearchKeys(store);
}
