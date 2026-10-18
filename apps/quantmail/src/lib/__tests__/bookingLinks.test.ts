// P1 qm-booking-links-scope: the host's booking links (shareable meeting
// slugs/titles) were cached in one unscoped localStorage key
// (`quant_calendar_booking_links`) — account B on the same browser saw
// account A's booking-link slugs/titles, and logout never purged them. These
// tests prove the v2 namespace partitions per immutable user id, fails
// closed on an unknown account, never reads or migrates the legacy unscoped
// key (purge-only), and still strips the seeded fake-data sample links.
import { describe, expect, it } from 'vitest';
import {
  BOOKING_LINKS_STORAGE_PREFIX,
  LEGACY_BOOKING_LINKS_KEY,
  bookingLinksAccountKey,
  bookingLinksKey,
  ensureBookingLinksNamespaceV2,
  getBookingLinks,
  parseStoredBookingLinks,
  purgeLegacyBookingLinksKeys,
  saveBookingLinks,
  type BookingLinkItem,
  type BookingLinksStorage,
} from '../bookingLinks';

const ACCOUNT_A = 'user-id-aaa';
const ACCOUNT_B = 'user-id-bbb';

const link = (id: string, slug: string, title: string): BookingLinkItem => ({
  id,
  slug,
  title,
  duration: 30,
  startHour: 9,
  endHour: 17,
  availableDays: [1, 2, 3, 4, 5],
  timezone: 'Asia/Kolkata',
  isActive: true,
  createdAt: '2026-10-18T00:00:00.000Z',
});

function mapStore(backing = new Map<string, string>()): BookingLinksStorage & {
  backing: Map<string, string>;
} {
  return {
    backing,
    getItem: (k) => (backing.has(k) ? backing.get(k)! : null),
    setItem: (k, v) => {
      backing.set(k, v);
    },
    removeItem: (k) => {
      backing.delete(k);
    },
    keys: (prefix) => {
      const out: string[] = [];
      for (const k of backing.keys()) {
        if (!prefix || k.startsWith(prefix)) out.push(k);
      }
      return out;
    },
  };
}

describe('bookingLinksAccountKey', () => {
  it('uses the immutable user id as-is (opaque — no case folding)', () => {
    expect(bookingLinksAccountKey('User-ID-123')).toBe('User-ID-123');
  });

  it('is empty when no account is known — the fail-closed path', () => {
    expect(bookingLinksAccountKey(null)).toBe('');
    expect(bookingLinksAccountKey(undefined)).toBe('');
    expect(bookingLinksAccountKey('   ')).toBe('');
  });
});

describe('bookingLinksKey', () => {
  it('namespaces per account so booking links never collide across accounts', () => {
    const ka = bookingLinksKey(ACCOUNT_A);
    const kb = bookingLinksKey(ACCOUNT_B);
    expect(ka).toBe(`${BOOKING_LINKS_STORAGE_PREFIX}${ACCOUNT_A}`);
    expect(kb).toBe(`${BOOKING_LINKS_STORAGE_PREFIX}${ACCOUNT_B}`);
    expect(ka).not.toBe(kb);
  });

  it('is null for an unknown account — callers must treat it as do-not-persist', () => {
    expect(bookingLinksKey('')).toBeNull();
  });
});

describe('getBookingLinks / saveBookingLinks', () => {
  it('isolates accounts: A cannot read B\'s booking links', () => {
    const store = mapStore();
    saveBookingLinks(store, ACCOUNT_A, [link('link-a1', 'a-strategy-call', 'A Strategy Call')]);
    saveBookingLinks(store, ACCOUNT_B, [link('link-b1', 'b-quick-sync', 'B Quick Sync')]);

    const aLinks = getBookingLinks(store, ACCOUNT_A);
    const bLinks = getBookingLinks(store, ACCOUNT_B);
    expect(aLinks.map((l) => l.slug)).toEqual(['a-strategy-call']);
    expect(bLinks.map((l) => l.slug)).toEqual(['b-quick-sync']);
  });

  it('fails closed: no read and no write when the account is unknown', () => {
    const store = mapStore();
    expect(getBookingLinks(store, '')).toEqual([]);
    expect(saveBookingLinks(store, '', [link('link-x', 'x', 'X')])).toBe(false);
    expect(store.backing.size).toBe(0);
  });

  it('fails closed: nothing persists when storage is unavailable', () => {
    expect(getBookingLinks(null, ACCOUNT_A)).toEqual([]);
    expect(saveBookingLinks(null, ACCOUNT_A, [link('link-x', 'x', 'X')])).toBe(false);
  });

  it('never reads the legacy unscoped key', () => {
    const store = mapStore();
    store.setItem(LEGACY_BOOKING_LINKS_KEY, JSON.stringify([link('link-old', 'old-slug', 'Old')]));
    expect(getBookingLinks(store, ACCOUNT_A)).toEqual([]);
  });

  it('round-trips the full link shape', () => {
    const store = mapStore();
    const original = link('link-1', 'strategy-call', 'Strategy Call');
    expect(saveBookingLinks(store, ACCOUNT_A, [original])).toBe(true);
    expect(getBookingLinks(store, ACCOUNT_A)).toEqual([original]);
  });
});

describe('parseStoredBookingLinks', () => {
  it('returns [] for missing/corrupt/non-array payloads', () => {
    expect(parseStoredBookingLinks(null)).toEqual([]);
    expect(parseStoredBookingLinks(undefined)).toEqual([]);
    expect(parseStoredBookingLinks('not-json')).toEqual([]);
    expect(parseStoredBookingLinks('{"not":"an array"}')).toEqual([]);
  });

  it('strips the seeded fake-data sample links (fix/qm-bookinglinks-fake-data)', () => {
    const raw = JSON.stringify([
      { id: 'link-30-min', slug: '30-min-strategy-session', title: '30 Min Strategy Session' },
      link('link-real-1', 'real-call', 'Real Call'),
    ]);
    expect(parseStoredBookingLinks(raw).map((l) => l.id)).toEqual(['link-real-1']);
  });

  it('defaults pre-timezone links to UTC honestly', () => {
    const raw = JSON.stringify([{ id: 'link-1', slug: 'old', title: 'Old' }]);
    expect(parseStoredBookingLinks(raw)[0].timezone).toBe('UTC');
  });
});

describe('purgeLegacyBookingLinksKeys', () => {
  it('removes the legacy key but never a v2 account key', () => {
    const store = mapStore();
    store.setItem(LEGACY_BOOKING_LINKS_KEY, '[]');
    store.setItem(`${BOOKING_LINKS_STORAGE_PREFIX}${ACCOUNT_A}`, '[]');
    expect(purgeLegacyBookingLinksKeys(store)).toBe(1);
    expect(store.backing.has(LEGACY_BOOKING_LINKS_KEY)).toBe(false);
    expect(store.backing.has(`${BOOKING_LINKS_STORAGE_PREFIX}${ACCOUNT_A}`)).toBe(true);
  });

  it('is a no-op without key enumeration', () => {
    const store: BookingLinksStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    expect(purgeLegacyBookingLinksKeys(store)).toBe(0);
  });
});

describe('ensureBookingLinksNamespaceV2', () => {
  it('purges the legacy key once per module lifetime', () => {
    const store = mapStore();
    store.setItem(LEGACY_BOOKING_LINKS_KEY, '[]');
    ensureBookingLinksNamespaceV2(store);
    expect(store.backing.has(LEGACY_BOOKING_LINKS_KEY)).toBe(false);
    // Second call is a no-op even if the key reappears (one-time flag).
    store.setItem(LEGACY_BOOKING_LINKS_KEY, '[]');
    ensureBookingLinksNamespaceV2(store);
    expect(store.backing.has(LEGACY_BOOKING_LINKS_KEY)).toBe(true);
  });
});
