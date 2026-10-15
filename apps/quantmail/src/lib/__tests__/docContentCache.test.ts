// P1 qm-drive-doc-cache-scope: doc content cached in localStorage was keyed
// by docId alone (`quant_doc_<docId>`) — account B opening the same docId
// could read account A's cached content, and logout never purged it. The
// namespace is now account-scoped; these tests prove B can never read A's
// cache, legacy unscoped keys are purged rather than migrated, and an
// unknown account fails closed (no persistence at all).
import { describe, expect, it } from 'vitest';
import {
  DOC_CACHE_STORAGE_PREFIX,
  LEGACY_DOC_CACHE_PREFIX,
  docCacheAccountKey,
  docCacheKey,
  purgeLegacyDocCacheKeys,
  readDocCache,
  removeDocCache,
  writeDocCache,
  type DocCacheStorage,
} from '../docContentCache';

const ACCOUNT_A = docCacheAccountKey('a@quantmail.in');
const ACCOUNT_B = docCacheAccountKey('b@quantmail.in');

function mapStore(backing = new Map<string, string>()): DocCacheStorage & {
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
        if (k.startsWith(prefix)) out.push(k);
      }
      return out;
    },
  };
}

describe('docCacheAccountKey', () => {
  it('normalizes the account identity (trim + lowercase) — one identity, one namespace', () => {
    expect(docCacheAccountKey('  A@QuantMail.IN ')).toBe('a@quantmail.in');
  });

  it('is empty when no account is known — the fail-closed path', () => {
    expect(docCacheAccountKey(null)).toBe('');
    expect(docCacheAccountKey(undefined)).toBe('');
    expect(docCacheAccountKey('   ')).toBe('');
  });
});

describe('docCacheKey', () => {
  it('namespaces per (account, docId) so cached docs never collide across accounts', () => {
    const ka = docCacheKey('doc-1', ACCOUNT_A);
    const kb = docCacheKey('doc-1', ACCOUNT_B);
    expect(ka).toBe(`${DOC_CACHE_STORAGE_PREFIX}a@quantmail.in.doc-1`);
    expect(kb).not.toBe(ka);
  });

  it('returns null when the account is unknown — callers must not persist', () => {
    expect(docCacheKey('doc-1', '')).toBeNull();
    expect(docCacheKey('doc-1', docCacheAccountKey(null))).toBeNull();
  });
});

describe('two-account same-docId isolation (the P1 regression)', () => {
  it('account B never reads account A\'s cached doc content', () => {
    const store = mapStore();
    writeDocCache(store, 'doc-1', ACCOUNT_A, JSON.stringify({ title: 'A secret' }));
    // B reads its own namespace: miss, not A's plaintext.
    expect(readDocCache(store, 'doc-1', ACCOUNT_B)).toBeNull();
    // A still reads its own.
    expect(readDocCache(store, 'doc-1', ACCOUNT_A)).toContain('A secret');
  });

  it('removing B\'s cache never touches A\'s cache', () => {
    const store = mapStore();
    writeDocCache(store, 'doc-1', ACCOUNT_A, 'A');
    writeDocCache(store, 'doc-1', ACCOUNT_B, 'B');
    removeDocCache(store, 'doc-1', ACCOUNT_B);
    expect(readDocCache(store, 'doc-1', ACCOUNT_A)).toBe('A');
    expect(readDocCache(store, 'doc-1', ACCOUNT_B)).toBeNull();
  });

  it('fail closed: unknown account neither writes nor reads', () => {
    const store = mapStore();
    writeDocCache(store, 'doc-1', '', 'should-not-persist');
    expect(store.backing.size).toBe(0);
    // Even a legacy unscoped key left on disk is not readable via the API.
    store.backing.set(`${LEGACY_DOC_CACHE_PREFIX}doc-1`, 'legacy plaintext');
    expect(readDocCache(store, 'doc-1', '')).toBeNull();
  });
});

describe('legacy unscoped keys — purge, never migrate', () => {
  it('purges legacy `quant_doc_<docId>` keys and reports the count', () => {
    const store = mapStore();
    store.backing.set(`${LEGACY_DOC_CACHE_PREFIX}doc-1`, '{"title":"old"}');
    store.backing.set(`${LEGACY_DOC_CACHE_PREFIX}doc-2`, '{"title":"older"}');
    const removed = purgeLegacyDocCacheKeys(store);
    expect(removed).toBe(2);
    expect(store.backing.size).toBe(0);
  });

  it('never touches account-scoped v2 keys', () => {
    const store = mapStore();
    writeDocCache(store, 'doc-1', ACCOUNT_A, 'A');
    store.backing.set(`${LEGACY_DOC_CACHE_PREFIX}doc-9`, 'legacy');
    const removed = purgeLegacyDocCacheKeys(store);
    expect(removed).toBe(1);
    expect(readDocCache(store, 'doc-1', ACCOUNT_A)).toBe('A');
  });

  it('purge is idempotent and null-storage safe', () => {
    const store = mapStore();
    expect(purgeLegacyDocCacheKeys(store)).toBe(0);
    expect(purgeLegacyDocCacheKeys(store)).toBe(0);
    expect(purgeLegacyDocCacheKeys(null)).toBe(0);
    expect(readDocCache(null, 'doc-1', ACCOUNT_A)).toBeNull();
  });
});
