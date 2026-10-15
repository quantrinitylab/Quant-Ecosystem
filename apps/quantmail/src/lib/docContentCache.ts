// ============================================================================
// Doc content cache — account-scoped localStorage for drive doc pages.
// P1 qm-drive-doc-cache-scope (same leak class as #1123 P0): the original
// namespace keyed cached document content by `docId` alone
// (`quant_doc_<docId>`), and logout never purged it — so account B on the
// same browser opening the same docId could read account A's cached
// document content. The namespace is now account-scoped:
// `quant_doc.v2.<account>.<docId>`, where the account segment is the stable
// authenticated account identity (normalized current-user email), not
// mutable display data.
//
// Threat/retention policy, stated honestly:
// - This is same-device plaintext persistence (localStorage). The app can
//   never read across accounts: every read/write/delete is namespaced by
//   account, and an unknown/empty account means NO persistence at all
//   (fail closed), never a shared fallback key. A party with full browser
//   access (DevTools on the same profile) can still read raw localStorage —
//   that is outside the app's isolation boundary, exactly like every other
//   same-device cache. The stronger end state is an authorized server
//   document store; this module invents no backend endpoint.
// - Legacy v1 keys (`quant_doc_<docId>`) are NOT attributable to any
//   account, so they are never migrated into a v2 namespace (that would
//   move A's plaintext into B's session — the leak itself). They are
//   purged: on logout (browser-auth-session) and once per page load when a
//   doc page first mounts under an authenticated session. Upgrading users
//   lose their pre-upgrade cached docs; that is the honest price of fixing
//   the leak, and the server copy is still fetched on every mount.
// - Account-scoped v2 keys survive logout for the account's own next
//   sign-in, exactly like the thread-draft v2 namespace (#1123).
//
// Everything in this module is framework-free and unit-testable without a
// DOM; the hook owns the React lifecycle wiring.
// ============================================================================

export interface DocCacheStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(prefix: string): string[];
}

/**
 * Legacy namespace — written by pre-fix builds, keyed by docId only.
 * Never written anymore; purge-only (see purgeLegacyDocCacheKeys).
 */
export const LEGACY_DOC_CACHE_PREFIX = 'quant_doc_';

/**
 * Account-scoped namespace. One key per (account, docId) pair:
 * `quant_doc.v2.<accountKey>.<docId>`.
 */
export const DOC_CACHE_STORAGE_PREFIX = 'quant_doc.v2.';

/**
 * The stable authenticated account identity used as the namespace segment.
 * Normalized so one account always maps to exactly one namespace; empty
 * when the account is unknown — the fail-closed path (no persistence).
 */
export function docCacheAccountKey(email: string | null | undefined): string {
  if (email == null) return '';
  const normalized = email.trim().toLowerCase();
  return normalized;
}

/**
 * Full storage key for an account's cached doc, or null when the account
 * is unknown — callers must treat null as "do not persist".
 */
export function docCacheKey(docId: string, accountKey: string): string | null {
  if (!accountKey || !docId) return null;
  return `${DOC_CACHE_STORAGE_PREFIX}${accountKey}.${docId}`;
}

export function windowDocCacheStorage(): DocCacheStorage | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const ls = window.localStorage;
  return {
    getItem: (key) => ls.getItem(key),
    setItem: (key, value) => ls.setItem(key, value),
    removeItem: (key) => ls.removeItem(key),
    keys: (prefix) => {
      const out: string[] = [];
      for (let i = 0; i < ls.length; i += 1) {
        const k = ls.key(i);
        if (k !== null && k.startsWith(prefix)) out.push(k);
      }
      return out;
    },
  };
}

export function readDocCache(
  storage: DocCacheStorage | null,
  docId: string,
  accountKey: string,
): string | null {
  if (!storage) return null;
  const key = docCacheKey(docId, accountKey);
  if (!key) return null; // fail closed: unknown account never reads
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writeDocCache(
  storage: DocCacheStorage | null,
  docId: string,
  accountKey: string,
  value: string,
): void {
  if (!storage) return;
  const key = docCacheKey(docId, accountKey);
  if (!key) return; // fail closed: unknown account never writes
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore localStorage quota errors
  }
}

export function removeDocCache(
  storage: DocCacheStorage | null,
  docId: string,
  accountKey: string,
): void {
  if (!storage) return;
  const key = docCacheKey(docId, accountKey);
  if (!key) return;
  try {
    storage.removeItem(key);
  } catch {
    // Best effort
  }
}

/**
 * Purge every legacy unscoped `quant_doc_<docId>` key. Never called with a
 * v2 key — v2 keys already carry their account segment, so they cannot be
 * confused with the legacy shape (`quant_doc_` !== `quant_doc.v2.`).
 * Returns the number of keys removed.
 */
export function purgeLegacyDocCacheKeys(storage: DocCacheStorage | null): number {
  if (!storage) return 0;
  let removed = 0;
  try {
    for (const key of storage.keys(LEGACY_DOC_CACHE_PREFIX)) {
      if (key.startsWith(DOC_CACHE_STORAGE_PREFIX)) continue; // v2, account-scoped — keep
      storage.removeItem(key);
      removed += 1;
    }
  } catch {
    // Best effort: storage failure must never break the caller
  }
  return removed;
}
