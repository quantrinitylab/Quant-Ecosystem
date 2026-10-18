// P1 qm-contact-names-scope: user-renamed contact names were cached in one
// unscoped localStorage key (`quantmail_contact_names`, an email-normalized
// map) — account B on the same browser saw account A's private contact
// renames, and logout never purged them. These tests prove the v2 namespace
// partitions per immutable user id, fails closed on an unknown account,
// never reads the legacy unscoped key (purge-only), and keeps the
// email-normalized map semantics identical.
import { describe, expect, it } from 'vitest';
import {
  CONTACT_NAMES_STORAGE_PREFIX,
  LEGACY_CONTACT_NAMES_KEY,
  contactNameAccountKey,
  contactNameKey,
  ensureContactNamesNamespaceV2,
  getContactName,
  normalizeContactEmail,
  purgeLegacyContactNameKeys,
  saveContactName,
  type ContactNameStorage,
} from '../contactNameCache';

const ACCOUNT_A = 'user-id-aaa';
const ACCOUNT_B = 'user-id-bbb';

function mapStore(backing = new Map<string, string>()): ContactNameStorage & {
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

describe('contactNameAccountKey', () => {
  it('uses the immutable user id as-is (opaque — no case folding)', () => {
    expect(contactNameAccountKey('User-ID-123')).toBe('User-ID-123');
  });

  it('is empty when no account is known — the fail-closed path', () => {
    expect(contactNameAccountKey(null)).toBe('');
    expect(contactNameAccountKey(undefined)).toBe('');
    expect(contactNameAccountKey('   ')).toBe('');
  });
});

describe('contactNameKey', () => {
  it('namespaces per account so renames never collide across accounts', () => {
    const ka = contactNameKey(ACCOUNT_A);
    const kb = contactNameKey(ACCOUNT_B);
    expect(ka).toBe(`${CONTACT_NAMES_STORAGE_PREFIX}${ACCOUNT_A}`);
    expect(kb).not.toBe(ka);
  });

  it('is null for an unknown account — callers must not persist', () => {
    expect(contactNameKey('')).toBeNull();
  });
});

describe('normalizeContactEmail', () => {
  it('keeps the pre-fix map-key semantics: trim + lowercase', () => {
    expect(normalizeContactEmail('  Alice@Example.COM ')).toBe('alice@example.com');
    expect(normalizeContactEmail(null)).toBe('');
  });
});

describe('saveContactName / getContactName', () => {
  it('round-trips a rename for the owning account', () => {
    const store = mapStore();
    expect(saveContactName(store, ACCOUNT_A, 'alice@example.com', 'Ally')).toBe(true);
    expect(getContactName(store, ACCOUNT_A, 'alice@example.com')).toBe('Ally');
  });

  it('matches emails case-insensitively like the pre-fix map', () => {
    const store = mapStore();
    saveContactName(store, ACCOUNT_A, 'ALICE@EXAMPLE.COM', 'Ally');
    expect(getContactName(store, ACCOUNT_A, '  alice@example.com ')).toBe('Ally');
  });

  it('isolates accounts: B never sees A renames (the leak itself)', () => {
    const store = mapStore();
    saveContactName(store, ACCOUNT_A, 'alice@example.com', 'Ally');
    expect(getContactName(store, ACCOUNT_B, 'alice@example.com')).toBe('');
  });

  it('overwrites a rename for the same email', () => {
    const store = mapStore();
    saveContactName(store, ACCOUNT_A, 'alice@example.com', 'Ally');
    saveContactName(store, ACCOUNT_A, 'alice@example.com', 'Alice Cooper');
    expect(getContactName(store, ACCOUNT_A, 'alice@example.com')).toBe('Alice Cooper');
  });

  it('fail-closed: unknown account neither reads nor writes', () => {
    const store = mapStore();
    expect(saveContactName(store, '', 'alice@example.com', 'Ally')).toBe(false);
    expect(getContactName(store, '', 'alice@example.com')).toBe('');
    expect(store.backing.size).toBe(0);
  });

  it('fail-closed: null store neither reads nor writes', () => {
    expect(saveContactName(null, ACCOUNT_A, 'alice@example.com', 'Ally')).toBe(false);
    expect(getContactName(null, ACCOUNT_A, 'alice@example.com')).toBe('');
  });

  it('refuses empty email or empty name', () => {
    const store = mapStore();
    expect(saveContactName(store, ACCOUNT_A, '', 'Ally')).toBe(false);
    expect(saveContactName(store, ACCOUNT_A, 'alice@example.com', '  ')).toBe(false);
    expect(store.backing.size).toBe(0);
  });

  it('never reads the legacy unscoped key even when it exists', () => {
    const store = mapStore();
    store.setItem(LEGACY_CONTACT_NAMES_KEY, JSON.stringify({ 'alice@example.com': 'Legacy Ally' }));
    // The v2 namespace has nothing stored for account A — the legacy
    // content must NOT leak through a v2 read.
    expect(getContactName(store, ACCOUNT_A, 'alice@example.com')).toBe('');
    // And writing to v2 must not touch the legacy key.
    saveContactName(store, ACCOUNT_A, 'alice@example.com', 'Ally');
    expect(store.getItem(LEGACY_CONTACT_NAMES_KEY)).toBe(
      JSON.stringify({ 'alice@example.com': 'Legacy Ally' }),
    );
    expect(getContactName(store, ACCOUNT_A, 'alice@example.com')).toBe('Ally');
  });

  it('degrades a corrupt payload to no rename', () => {
    const store = mapStore();
    store.setItem(contactNameKey(ACCOUNT_A)!, 'not-json{{{');
    expect(getContactName(store, ACCOUNT_A, 'alice@example.com')).toBe('');
    // A save over the corrupt payload recovers cleanly.
    expect(saveContactName(store, ACCOUNT_A, 'alice@example.com', 'Ally')).toBe(true);
    expect(getContactName(store, ACCOUNT_A, 'alice@example.com')).toBe('Ally');
  });
});

describe('purgeLegacyContactNameKeys', () => {
  it('removes the legacy unscoped key and leaves v2 keys alone', () => {
    const store = mapStore();
    store.setItem(LEGACY_CONTACT_NAMES_KEY, JSON.stringify({ 'alice@example.com': 'Legacy' }));
    saveContactName(store, ACCOUNT_A, 'alice@example.com', 'Ally');
    expect(purgeLegacyContactNameKeys(store)).toBe(1);
    expect(store.getItem(LEGACY_CONTACT_NAMES_KEY)).toBeNull();
    expect(getContactName(store, ACCOUNT_A, 'alice@example.com')).toBe('Ally');
  });

  it('is a no-op when no legacy key exists', () => {
    const store = mapStore();
    expect(purgeLegacyContactNameKeys(store)).toBe(0);
  });
});
