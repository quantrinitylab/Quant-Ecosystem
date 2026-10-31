import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  UNDO_SEND_DELAY_OPTIONS,
  UNDO_SEND_DELAY_STORAGE_KEY,
  normalizeUndoSendDelay,
  readUndoSendDelay,
  subscribeUndoSendDelay,
  writeUndoSendDelay,
} from '../lib/undo-send-preference';

/** In-memory localStorage stand-in, installed as `window` for each test. */
function installStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
  vi.stubGlobal('window', { localStorage });
  return store;
}

describe('undo-send delay preference', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts only Gmail\'s 5/10/20/30 seconds, folding everything else to 10', () => {
    expect(UNDO_SEND_DELAY_OPTIONS).toEqual([5, 10, 20, 30]);
    for (const seconds of [5, 10, 20, 30]) {
      expect(normalizeUndoSendDelay(seconds)).toBe(seconds);
      expect(normalizeUndoSendDelay(String(seconds))).toBe(seconds);
    }
    for (const bad of [0, 7, 15, 60, -5, 10.5, '', '  ', 'soon', null, undefined, {}, NaN]) {
      expect(normalizeUndoSendDelay(bad)).toBe(10);
    }
  });

  it('defaults to 10 with no window, no stored value, or an unreadable store', () => {
    // No window at all (node env, nothing stubbed).
    expect(readUndoSendDelay()).toBe(10);

    installStorage();
    expect(readUndoSendDelay()).toBe(10);

    const throwing = {
      getItem: () => {
        throw new Error('private mode');
      },
      setItem: () => {
        throw new Error('private mode');
      },
    };
    vi.stubGlobal('window', { localStorage: throwing });
    expect(readUndoSendDelay()).toBe(10);
  });

  it('round-trips a written value through the same key the provider reads', () => {
    const store = installStorage();
    writeUndoSendDelay(30);
    expect(store.get(UNDO_SEND_DELAY_STORAGE_KEY)).toBe('30');
    expect(readUndoSendDelay()).toBe(30);

    writeUndoSendDelay(5);
    expect(readUndoSendDelay()).toBe(5);
  });

  it('migrates the removed control\'s legacy key instead of dropping the choice', () => {
    const store = installStorage({ 'quant-undo-delay': '20' });
    expect(readUndoSendDelay()).toBe(20);
    // The legacy id retires: the next read comes from the new key.
    expect(store.get(UNDO_SEND_DELAY_STORAGE_KEY)).toBe('20');
    store.delete('quant-undo-delay');
    expect(readUndoSendDelay()).toBe(20);
  });

  it('ignores a legacy value this build does not recognise', () => {
    installStorage({ 'quant-undo-delay': '45' });
    expect(readUndoSendDelay()).toBe(10);
  });

  it('notifies subscribers on write, even when storage throws', () => {
    installStorage();
    const listener = vi.fn();
    const unsubscribe = subscribeUndoSendDelay(listener);
    writeUndoSendDelay(20);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    writeUndoSendDelay(30);
    expect(listener).toHaveBeenCalledTimes(1);

    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('private mode');
      },
    };
    vi.stubGlobal('window', { localStorage: throwing });
    const second = vi.fn();
    subscribeUndoSendDelay(second);
    writeUndoSendDelay(5);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
