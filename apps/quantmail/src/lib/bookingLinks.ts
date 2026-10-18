// ============================================================================
// Booking-links offline cache — account-scoped localStorage for the calendar
// host booking-links modal.
// P1 qm-booking-links-scope (same leak class as #1123 P0
// qm-draft-privacy-isolation, qm-drive-doc-cache-scope, and
// qm-search-history-scope): the original namespace cached the host's booking
// links (shareable meeting URLs — slugs/titles) in a single UNSCOPED key
// (`quant_calendar_booking_links`), and logout never purged it — so account B
// on the same browser saw account A's booking-link slugs/titles. The
// namespace is now account-scoped: `quant_calendar_booking_links.v2.<account>`,
// where the account segment is the backend-verified IMMUTABLE user id
// (`AuthUser.id` — the access-token `sub`, the users-table primary key),
// never the mutable email. An email is reassignable; a reassigned address
// would hand the previous holder's booking links to the new holder (the
// exact leak class CODEX-REVIEW 6157628718 killed for the draft v2
// namespace).
//
// Threat/retention policy, stated honestly:
// - This is same-device plaintext persistence (localStorage). The app can
//   never read across accounts: every read/write is namespaced by the
//   immutable user id, and an unknown/empty account means NO persistence at
//   all (fail closed), never a shared fallback key. A party with full browser
//   access (DevTools on the same profile) can still read raw localStorage —
//   that is outside the app's isolation boundary, exactly like every other
//   same-device cache. This cache is an OFFLINE copy only — the backend is
//   the source of truth (BookingLinksModal merges server links on open).
// - The legacy unscoped key (`quant_calendar_booking_links`) is NOT
//   attributable to any account, so it is never migrated into a v2
//   namespace (that would move A's booking links into B's session — the leak
//   itself). It is purged: on logout (browser-auth-session) and once per
//   page load when the calendar surface mounts under an authenticated
//   session. Upgrading users lose their pre-fix offline copies; that is the
//   honest price of fixing the leak.
// - Account-scoped v2 keys survive logout for the account's own next
//   sign-in, exactly like the thread-draft v3, doc-cache v2, and
//   search-history v2 namespaces.
//
// Everything in this module is framework-free and unit-testable without a
// DOM; the modal owns the React wiring.
// ============================================================================

export interface BookingLinkItem {
  id: string;
  slug: string;
  title: string;
  description?: string;
  duration: number; // in minutes (15, 30, 45, 60)
  startHour: number; // 0..23 (default 9)
  endHour: number; // 1..24 (default 17)
  availableDays: number[]; // 0 = Sun, 1 = Mon ... 6 = Sat
  /**
   * IANA timezone anchoring the availability window
   * (fix/qm-booking-tz-availability-2). startHour/endHour/availableDays are
   * wall-clock values in this zone — never server-local. 'UTC' when unset.
   */
  timezone: string;
  isActive: boolean;
  createdAt: string;
  /**
   * Honest sync marker: true when this link lives only on this device because
   * the server never accepted it. Rendered as a "This device only" badge —
   * never silently presented as shareable.
   */
  pendingSync?: boolean;
}

/**
 * Legacy namespace — written by pre-fix builds, a single shared key.
 * Never written anymore; purge-only (see purgeLegacyBookingLinksKeys).
 */
export const LEGACY_BOOKING_LINKS_KEY = 'quant_calendar_booking_links';

/**
 * Account-scoped namespace. One key per account:
 * `quant_calendar_booking_links.v2.<accountKey>`, where the account segment
 * is the immutable user id. A single opaque segment is injective by
 * construction (no multi-segment concatenation, so no delimiter collisions
 * possible).
 */
export const BOOKING_LINKS_STORAGE_PREFIX = 'quant_calendar_booking_links.v2.';

/**
 * The minimal storage surface the logic needs. In the app this is a
 * window.localStorage adapter (see windowBookingLinksStorage); in tests a
 * Map-backed stub.
 */
export interface BookingLinksStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /**
   * Optional key enumeration, used by the legacy-namespace purge. Stubs
   * that omit it simply cannot purge — nothing else depends on it.
   */
  keys?(prefix?: string): string[];
}

export function windowBookingLinksStorage(): BookingLinksStorage | null {
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
export function bookingLinksAccountKey(userId: string | null | undefined): string {
  const id = (userId ?? '').trim();
  return id;
}

/**
 * The storage key for one account's booking-links offline cache, or null
 * when the account is unknown — callers must treat null as "do not
 * persist".
 */
export function bookingLinksKey(accountKey: string): string | null {
  if (!accountKey) return null;
  return `${BOOKING_LINKS_STORAGE_PREFIX}${accountKey}`;
}

// NOTE (2026-10-11, fix/qm-bookinglinks-fake-data): the 3 hardcoded sample
// booking links ("30 Min Strategy Session", "15 Min Quick Sync", "60 Min
// Technical Deep Dive") that used to be seeded on first load were REMOVED.
// They were presented as the user's own links — fake data. The honest
// first-run state is an empty list; the modal renders a "No booking links
// created yet" empty state for that case. Seeded samples that a user's
// browser persisted earlier are filtered out by parseStoredBookingLinks so
// they never masquerade as real user data again.

/**
 * Exact id|slug pairs of the sample links the old version seeded.
 * Only these exact pairs are treated as seeded fake data — a user's own
 * link can never collide because created ids are `link-${Date.now()}-...`.
 */
const SEEDED_SAMPLE_LINK_KEYS = new Set([
  'link-30-min|30-min-strategy-session',
  'link-15-min|15-min-quick-sync',
  'link-60-min|60-min-deep-dive',
]);

/**
 * Parse the persisted booking-links value into a validated list.
 * Returns [] for missing/corrupt/non-array values, and strips out any
 * seeded sample links from the old fake-data version.
 */
export function parseStoredBookingLinks(raw: string | null | undefined): BookingLinkItem[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (l): l is BookingLinkItem =>
        !!l &&
        typeof l === 'object' &&
        typeof (l as BookingLinkItem).slug === 'string' &&
        !SEEDED_SAMPLE_LINK_KEYS.has(
          `${(l as BookingLinkItem).id}|${(l as BookingLinkItem).slug}`,
        ),
    )
    // Links cached before the timezone field existed carry no timezone —
    // default them honestly to 'UTC' (fix/qm-booking-tz-availability-2).
    .map((l) => ({
      ...l,
      timezone:
        typeof l.timezone === 'string' && l.timezone.trim() ? l.timezone : 'UTC',
    }));
}

/**
 * Load one account's booking-links offline cache. Null store or empty
 * accountKey means "no persistence available" — never throws, never reads
 * across accounts. The legacy unscoped key is NEVER read here.
 */
export function getBookingLinks(
  store: BookingLinksStorage | null,
  accountKey: string,
): BookingLinkItem[] {
  const key = store ? bookingLinksKey(accountKey) : null;
  if (!store || !key) return [];
  try {
    return parseStoredBookingLinks(store.getItem(key));
  } catch {
    return [];
  }
}

/**
 * Replace one account's offline cache with the current list. Returns true
 * when the write landed; false when storage is unavailable or the account
 * is unknown — fail closed, never touching any shared key.
 */
export function saveBookingLinks(
  store: BookingLinksStorage | null,
  accountKey: string,
  links: BookingLinkItem[],
): boolean {
  const key = store ? bookingLinksKey(accountKey) : null;
  if (!store || !key) return false;
  try {
    store.setItem(key, JSON.stringify(links ?? []));
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove the legacy unscoped booking-links key. It cannot be attributed to
 * an account, so it is purged rather than migrated — migrating would move
 * the previous account's shareable booking links into whoever signs in
 * next. Returns the number of keys removed.
 */
export function purgeLegacyBookingLinksKeys(store: BookingLinksStorage | null): number {
  if (!store || typeof store.keys !== 'function') return 0;
  let removed = 0;
  try {
    for (const key of store.keys()) {
      if (key !== LEGACY_BOOKING_LINKS_KEY) continue;
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
 * account-scoped namespace is authoritative. Called from the calendar
 * surface under an authenticated session.
 */
let legacyPurgeDone = false;
export function ensureBookingLinksNamespaceV2(store: BookingLinksStorage | null): void {
  if (legacyPurgeDone) return;
  legacyPurgeDone = true;
  purgeLegacyBookingLinksKeys(store);
}
