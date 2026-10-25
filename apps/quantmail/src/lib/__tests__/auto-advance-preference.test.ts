// Auto-advance (Settings → General → "After delete or archive"): the setting
// Gmail offers for where a triage action lands, which QuantMail had nowhere.
// These tests prove the preference logic the Settings picker writes and the
// thread page reads: normalisation (unknown values fall back to today's
// back-to-list behaviour, never to a direction the user did not pick),
// round-trip persistence through an injected store (vitest runs in node, so
// `window` does not exist — the module's storage is injectable for exactly
// this reason), and the neighbour resolution, including the honest fallback:
// no neighbour in the chosen direction means back to the list, never a
// silent jump in the opposite direction.
import { describe, expect, it } from 'vitest';
import {
  AUTO_ADVANCE_MODES,
  AUTO_ADVANCE_OPTIONS,
  AUTO_ADVANCE_STORAGE_KEY,
  normalizeAutoAdvance,
  readAutoAdvance,
  resolveAutoAdvanceTarget,
  writeAutoAdvance,
  type AutoAdvanceStorage,
} from '../auto-advance-preference';

function mapStore(backing = new Map<string, string>()): AutoAdvanceStorage & {
  backing: Map<string, string>;
} {
  return {
    backing,
    getItem: (key) => (backing.has(key) ? backing.get(key)! : null),
    setItem: (key, value) => {
      backing.set(key, value);
    },
  };
}

describe('normalizeAutoAdvance', () => {
  it('keeps the two directions', () => {
    expect(normalizeAutoAdvance('older')).toBe('older');
    expect(normalizeAutoAdvance('newer')).toBe('newer');
  });

  it('keeps the explicit back-to-list choice', () => {
    expect(normalizeAutoAdvance('list')).toBe('list');
  });

  it('falls back to back-to-list for anything unrecognised', () => {
    for (const value of [null, undefined, '', 'next', 'previous', 'OLDER', 'back', 0, {}]) {
      expect(normalizeAutoAdvance(value)).toBe('list');
    }
  });
});

describe('readAutoAdvance / writeAutoAdvance', () => {
  it('defaults to back-to-list when nothing is stored', () => {
    expect(readAutoAdvance(mapStore())).toBe('list');
  });

  it('round-trips a chosen direction under the one shared key', () => {
    const store = mapStore();
    writeAutoAdvance('older', store);
    expect(store.backing.get(AUTO_ADVANCE_STORAGE_KEY)).toBe('older');
    expect(readAutoAdvance(store)).toBe('older');
    writeAutoAdvance('newer', store);
    expect(readAutoAdvance(store)).toBe('newer');
  });

  it('treats a stored invalid value as back-to-list, not as a direction', () => {
    const store = mapStore(new Map([[AUTO_ADVANCE_STORAGE_KEY, 'sideways']]));
    expect(readAutoAdvance(store)).toBe('list');
  });

  it('defaults to back-to-list with no storage (server render) and never throws', () => {
    expect(readAutoAdvance(null)).toBe('list');
    expect(() => writeAutoAdvance('older', null)).not.toThrow();
    const throwing: AutoAdvanceStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(readAutoAdvance(throwing)).toBe('list');
    expect(() => writeAutoAdvance('older', throwing)).not.toThrow();
  });
});

describe('resolveAutoAdvanceTarget', () => {
  const neighbours = { previous: 'thread-newer', next: 'thread-older' };

  it('maps newer to the previous (up-list) neighbour and older to the next (down-list) neighbour', () => {
    expect(resolveAutoAdvanceTarget('newer', neighbours)).toBe('thread-newer');
    expect(resolveAutoAdvanceTarget('older', neighbours)).toBe('thread-older');
  });

  it('returns null for back-to-list even when neighbours exist', () => {
    expect(resolveAutoAdvanceTarget('list', neighbours)).toBeNull();
  });

  it('falls back to the list when the chosen direction has no neighbour', () => {
    expect(resolveAutoAdvanceTarget('newer', { previous: null, next: 'thread-older' })).toBeNull();
    expect(resolveAutoAdvanceTarget('older', { previous: 'thread-newer', next: null })).toBeNull();
    // Never a silent jump in the opposite direction.
    expect(resolveAutoAdvanceTarget('newer', { previous: null, next: 'thread-older' })).not.toBe(
      'thread-older',
    );
  });

  it('falls back to the list when the thread is outside the inbox corpus', () => {
    expect(resolveAutoAdvanceTarget('older', { previous: null, next: null })).toBeNull();
    expect(resolveAutoAdvanceTarget('newer', { previous: null, next: null })).toBeNull();
  });
});

describe('AUTO_ADVANCE_OPTIONS', () => {
  it('offers exactly the modes the normaliser accepts, once each', () => {
    const values = AUTO_ADVANCE_OPTIONS.map((option) => option.value);
    expect([...values].sort()).toEqual([...AUTO_ADVANCE_MODES].sort());
    expect(new Set(values).size).toBe(values.length);
    for (const option of AUTO_ADVANCE_OPTIONS) {
      expect(option.label.trim().length).toBeGreaterThan(0);
      expect(option.description.trim().length).toBeGreaterThan(0);
    }
  });
});
