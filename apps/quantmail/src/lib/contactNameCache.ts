// ============================================================================
// User-renamed contact names — account-scoped localStorage for contacts.
// P1 qm-contact-names-scope (same leak class as #1123 P0
// qm-draft-privacy-isolation, qm-drive-doc-cache-scope and
// qm-search-history-scope): the original namespace cached user-renamed
// contact display names in a single UNSCOPED key
// (`quantmail_contact_names`, an email-normalized map), and logout never
// purged it — so account B on the same browser saw account A's private
// contact renames. The namespace is now account-scoped:
// `quantmail_contact_names.v2.<account>`, where the account segment is the
// backend-verified IMMUTABLE user id (`AuthUser.id` — the access-token `sub`,
// the users-table primary key), never the mutable email. An email is
// reassignable; a reassigned address would hand the previous holder's
// renames to the new holder (the exact leak class CODEX-REVIEW 6157628718
// killed for the draft v2 namespace).
//
// Threat/retention policy, stated honestly:
// - This is same-device plaintext persistence (localStorage). The app can
//   never read across accounts: every read/write/delete is namespaced by
//   the immutable user id, and an unknown/empty account means NO
//   persistence at all (fail closed), never a shared fallback key. A party
//   with full browser access (DevTools on the same profile) can still read
//   raw localStorage — that is outside the app's isolation boundary,
//   exactly like every other same-device cache. The stronger end state is a
//   server-side contact-rename store; this module invents no backend
//   endpoint.
// - The legacy unscoped key (`quantmail_contact_names`) is NOT
//   attributable to any account, so it is never migrated into a v2
//   namespace (that would move A's renames into B's session — the leak
//   itself). It is purged: on logout (browser-auth-session) and once per
//   mount of the contact inspector under an authenticated session.
//   Upgrading users lose their pre-fix contact renames; that is the honest
//   price of fixing the leak.
// - Account-scoped v2 keys survive logout for the account's own next
//   sign-in, exactly like the thread-draft v3, doc-cache v2 and
//   search-history v2 namespaces.
// - The email-normalized map semantics are unchanged: keys are
//   trim().toLowerCase() email addresses (matching the pre-fix behavior in
//   ContactProfileInspector).
//
// Everything in this module is framework-free and unit-testable without a
// DOM; ContactProfileInspector owns the React wiring.
// ============================================================================

/**
 * Legacy namespace — written by pre-fix builds, a single shared key.
 * Never written anymore; purge-only (see purgeLegacyContactNameKeys).
 */
export const LEGACY_CONTACT_NAMES_KEY = 'quantmail_contact_names';

/**
 * Account-scoped namespace. One key per account:
 * `quantmail_contact_names.v2.<accountKey>`, where the account segment is
 * the immutable user id. A single opaque segment is injective by
 * construction (no multi-segment concatenation, so no delimiter collisions
 * possible).
 */
export const CONTACT_NAMES_STORAGE_PREFIX = 'quantmail_contact_names.v2.';

/**
 * The minimal storage surface the logic needs. In the app this is a
 * window.localStorage adapter (see windowContactNameStorage); in tests a
 * Map-backed stub.
 */
export interface ContactNameStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /**
   * Optional key enumeration, used by the legacy-namespace purge. Stubs
   * that omit it simply cannot purge — nothing else depends on it.
   */
  keys?(prefix?: string): string[];
}

export function windowContactNameStorage(): ContactNameStorage | null {
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
export function contactNameAccountKey(userId: string | null | undefined): string {
  const id = (userId ?? '').trim();
  return id;
}

/**
 * The storage key for one account's contact renames, or null when the
 * account is unknown — callers must treat null as "do not persist".
 */
export function contactNameKey(accountKey: string): string | null {
  if (!accountKey) return null;
  return `${CONTACT_NAMES_STORAGE_PREFIX}${accountKey}`;
}

/**
 * Map-key normalization for the stored email -> display-name map.
 * Matches the pre-fix behavior in ContactProfileInspector: trim + lowercase.
 */
export function normalizeContactEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** Parse a stored payload defensively: corrupt entries degrade to {}. */
function parseContactNameMap(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === 'string' && typeof v === 'string' && v.length > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Load one account's renamed display name for an email. Null store or empty
 * accountKey means "no persistence available" — never throws, never reads
 * across accounts. Returns '' when no rename is stored. The legacy
 * unscoped key is NEVER read here.
 */
export function getContactName(
  store: ContactNameStorage | null,
  accountKey: string,
  email: string,
): string {
  const key = store ? contactNameKey(accountKey) : null;
  if (!store || !key) return '';
  try {
    const map = parseContactNameMap(store.getItem(key));
    const name = map[normalizeContactEmail(email)];
    return typeof name === 'string' ? name : '';
  } catch {
    return '';
  }
}

/**
 * Record a user-renamed display name for an email in the account's map.
 * Returns true when the write landed; false when storage is unavailable,
 * the account is unknown, or the email/name is empty — fail closed, never
 * touching any shared key.
 */
export function saveContactName(
  store: ContactNameStorage | null,
  accountKey: string,
  email: string,
  name: string,
): boolean {
  const key = store ? contactNameKey(accountKey) : null;
  const normalized = normalizeContactEmail(email);
  const trimmed = (name ?? '').trim();
  if (!store || !key || !normalized || !trimmed) return false;
  try {
    const map = parseContactNameMap(store.getItem(key));
    map[normalized] = trimmed;
    store.setItem(key, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove the legacy unscoped contact-rename key. It cannot be attributed
 * to any account, so it is purged rather than migrated — migrating would
 * move the previous account's renames into whoever signs in next. Returns
 * the number of keys removed.
 */
export function purgeLegacyContactNameKeys(store: ContactNameStorage | null): number {
  if (!store || typeof store.keys !== 'function') return 0;
  let removed = 0;
  try {
    for (const key of store.keys()) {
      if (key !== LEGACY_CONTACT_NAMES_KEY) continue;
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
 * One-time per mount: drop the retired unscoped key now that the v2
 * account-scoped namespace is authoritative. Called from the contact
 * inspector under an authenticated session.
 */
let legacyPurgeDone = false;
export function ensureContactNamesNamespaceV2(store: ContactNameStorage | null): void {
  if (legacyPurgeDone) return;
  legacyPurgeDone = true;
  purgeLegacyContactNameKeys(store);
}
