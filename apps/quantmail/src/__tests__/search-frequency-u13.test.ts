// @vitest-environment node
/**
 * Search-frequency storage (Mail Search slice, Phase 1.3) — same
 * isolation rules as lib/searchHistory, pinned with a Map-backed stub:
 * account-scoped keys only, unknown account fails closed, corrupt
 * payloads degrade to empty, and "Clear" removes only that account's
 * counts.
 */
import { describe, it, expect } from 'vitest';
import type { SearchHistoryStorage } from '../lib/searchHistory';
import {
  MAX_FREQUENCY_ENTRIES,
  searchFrequencyKey,
  getSearchFrequency,
  saveSearchFrequency,
  clearSearchFrequency,
} from '../lib/searchFrequency';

function mapStore(): SearchHistoryStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
    keys: (prefix) => [...data.keys()].filter((k) => !prefix || k.startsWith(prefix)),
  };
}

describe('search frequency storage', () => {
  it('increments per query, scoped to the account key', () => {
    const store = mapStore();
    expect(saveSearchFrequency(store, 'user-1', 'invoice')).toBe(true);
    expect(saveSearchFrequency(store, 'user-1', 'invoice')).toBe(true);
    expect(saveSearchFrequency(store, 'user-1', 'design')).toBe(true);
    expect(getSearchFrequency(store, 'user-1')).toEqual({ invoice: 2, design: 1 });
    // Another account's namespace is untouched.
    expect(getSearchFrequency(store, 'user-2')).toEqual({});
    expect(searchFrequencyKey('user-1')).toBe('quantmail_search_freq.v2.user-1');
  });

  it('fails closed on unknown account or empty query — no shared key is written', () => {
    const store = mapStore();
    expect(saveSearchFrequency(store, '', 'invoice')).toBe(false);
    expect(saveSearchFrequency(null, 'user-1', 'invoice')).toBe(false);
    expect(saveSearchFrequency(store, 'user-1', '   ')).toBe(false);
    expect(store.data.size).toBe(0);
    expect(getSearchFrequency(store, '')).toEqual({});
  });

  it('degrades corrupt payloads to empty and never throws', () => {
    const store = mapStore();
    store.setItem('quantmail_search_freq.v2.user-1', '{not json');
    expect(getSearchFrequency(store, 'user-1')).toEqual({});
    store.setItem('quantmail_search_freq.v2.user-1', JSON.stringify({ invoice: 'two', ok: 3 }));
    expect(getSearchFrequency(store, 'user-1')).toEqual({ ok: 3 });
  });

  it('caps distinct entries, keeping the query just run on a tie', () => {
    const store = mapStore();
    for (let i = 0; i < MAX_FREQUENCY_ENTRIES; i += 1) {
      saveSearchFrequency(store, 'user-1', `q${i}`);
    }
    saveSearchFrequency(store, 'user-1', 'new-query');
    const counts = getSearchFrequency(store, 'user-1');
    expect(Object.keys(counts)).toHaveLength(MAX_FREQUENCY_ENTRIES);
    expect(counts['new-query']).toBe(1);
  });

  it('clear removes only that account’s counts', () => {
    const store = mapStore();
    saveSearchFrequency(store, 'user-1', 'invoice');
    saveSearchFrequency(store, 'user-2', 'invoice');
    clearSearchFrequency(store, 'user-1');
    expect(getSearchFrequency(store, 'user-1')).toEqual({});
    expect(getSearchFrequency(store, 'user-2')).toEqual({ invoice: 1 });
  });
});
