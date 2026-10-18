// P1 qm-search-history-scope: recent searches were cached in one unscoped
// localStorage key (`quantmail_recent_searches`) — account B on the same
// browser saw account A's queries, and logout never purged them. These
// tests prove the v2 namespace partitions per immutable user id, fails
// closed on an unknown account, and never reads or migrates the legacy
// unscoped key (purge-only).
import { describe, expect, it } from 'vitest';
import {
  LEGACY_RECENT_SEARCHES_KEY,
  MAX_RECENT_SEARCHES,
  SEARCH_HISTORY_STORAGE_PREFIX,
  clearRecentSearches,
  getRecentSearches,
  purgeLegacyRecentSearchKeys,
  saveRecentSearch,
  searchHistoryAccountKey,
  searchHistoryKey,
  type SearchHistoryStorage,
} from '../searchHistory';

const ACCOUNT_A = 'user-id-aaa';
const ACCOUNT_B = 'user-id-bbb';

function mapStore(backing = new Map<string, string>()): SearchHistoryStorage & {
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

describe('searchHistoryAccountKey', () => {
  it('uses the immutable user id as-is (opaque — no case folding)', () => {
    expect(searchHistoryAccountKey('User-ID-123')).toBe('User-ID-123');
  });

  it('is empty when no account is known — the fail-closed path', () => {
    expect(searchHistoryAccountKey(null)).toBe('');
    expect(searchHistoryAccountKey(undefined)).toBe('');
    expect(searchHistoryAccountKey('   ')).toBe('');
  });
});

describe('searchHistoryKey', () => {
  it('namespaces per account so queries never collide across accounts', () => {
    const ka = searchHistoryKey(ACCOUNT_A);
    const kb = searchHistoryKey(ACCOUNT_B);
    expect(ka).toBe(`${SEARCH_HISTORY_STORAGE_PREFIX}${ACCOUNT_A}`);
    expect(kb).not.toBe(ka);
  });

  it('is null for an unknown account — callers must not persist', () => {
    expect(searchHistoryKey('')).toBeNull();
  });
});

describe('getRecentSearches / saveRecentSearch', () => {
  it('B can never read A\'s queries (per-account isolation)', () => {
    const store = mapStore();
    expect(saveRecentSearch(store, ACCOUNT_A, 'invoice')).toBe(true);
    expect(saveRecentSearch(store, ACCOUNT_A, 'meeting follow-up')).toBe(true);
    expect(getRecentSearches(store, ACCOUNT_A)).toEqual(['meeting follow-up', 'invoice']);
    expect(getRecentSearches(store, ACCOUNT_B)).toEqual([]);
  });

  it('fails closed: unknown account never reads or writes any key', () => {
    const store = mapStore();
    expect(saveRecentSearch(store, '', 'invoice')).toBe(false);
    expect(getRecentSearches(store, '')).toEqual([]);
    expect(store.backing.size).toBe(0);
    // A null store degrades to no persistence instead of throwing.
    expect(saveRecentSearch(null, ACCOUNT_A, 'invoice')).toBe(false);
    expect(getRecentSearches(null, ACCOUNT_A)).toEqual([]);
  });

  it('dedupes to the front and caps at MAX_RECENT_SEARCHES', () => {
    const store = mapStore();
    for (let i = 1; i <= MAX_RECENT_SEARCHES + 3; i += 1) {
      saveRecentSearch(store, ACCOUNT_A, `q${i}`);
    }
    saveRecentSearch(store, ACCOUNT_A, 'q2');
    const got = getRecentSearches(store, ACCOUNT_A);
    expect(got).toHaveLength(MAX_RECENT_SEARCHES);
    expect(got[0]).toBe('q2');
    expect(new Set(got).size).toBe(got.length);
  });

  it('ignores blank queries and degrades on corrupt payloads', () => {
    const store = mapStore();
    expect(saveRecentSearch(store, ACCOUNT_A, '   ')).toBe(false);
    store.backing.set(`${SEARCH_HISTORY_STORAGE_PREFIX}${ACCOUNT_A}`, 'not-json{{{');
    expect(getRecentSearches(store, ACCOUNT_A)).toEqual([]);
    store.backing.set(`${SEARCH_HISTORY_STORAGE_PREFIX}${ACCOUNT_A}`, '["a", 42, null]');
    expect(getRecentSearches(store, ACCOUNT_A)).toEqual(['a']);
  });

  it('never reads the legacy unscoped key, even when it holds data', () => {
    const store = mapStore();
    store.backing.set(LEGACY_RECENT_SEARCHES_KEY, JSON.stringify(['a-query']));
    expect(getRecentSearches(store, ACCOUNT_A)).toEqual([]);
    expect(saveRecentSearch(store, ACCOUNT_A, 'b-query')).toBe(true);
    // The legacy payload is untouched by reads/writes — purge-only.
    expect(store.backing.get(LEGACY_RECENT_SEARCHES_KEY)).toBe(JSON.stringify(['a-query']));
    expect(getRecentSearches(store, ACCOUNT_A)).toEqual(['b-query']);
  });
});

describe('clearRecentSearches', () => {
  it('clears only the caller\'s namespace', () => {
    const store = mapStore();
    saveRecentSearch(store, ACCOUNT_A, 'invoice');
    saveRecentSearch(store, ACCOUNT_B, 'design feedback');
    clearRecentSearches(store, ACCOUNT_A);
    expect(getRecentSearches(store, ACCOUNT_A)).toEqual([]);
    expect(getRecentSearches(store, ACCOUNT_B)).toEqual(['design feedback']);
  });

  it('is a no-op for an unknown account', () => {
    const store = mapStore();
    saveRecentSearch(store, ACCOUNT_A, 'invoice');
    clearRecentSearches(store, '');
    expect(getRecentSearches(store, ACCOUNT_A)).toEqual(['invoice']);
  });
});

describe('purgeLegacyRecentSearchKeys', () => {
  it('removes the legacy unscoped key and leaves v2 keys alone', () => {
    const store = mapStore();
    store.backing.set(LEGACY_RECENT_SEARCHES_KEY, JSON.stringify(['a-query']));
    saveRecentSearch(store, ACCOUNT_A, 'b-query');
    expect(purgeLegacyRecentSearchKeys(store)).toBe(1);
    expect(store.backing.has(LEGACY_RECENT_SEARCHES_KEY)).toBe(false);
    expect(getRecentSearches(store, ACCOUNT_A)).toEqual(['b-query']);
  });

  it('is a no-op when there is nothing legacy to purge', () => {
    const store = mapStore();
    expect(purgeLegacyRecentSearchKeys(store)).toBe(0);
    expect(purgeLegacyRecentSearchKeys(null)).toBe(0);
  });
});
