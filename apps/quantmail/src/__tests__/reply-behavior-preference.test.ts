// Default reply behavior preference (fix/qm-default-reply-behavior):
// the old "Default Reply Action" control had no persistence at all, so the
// replacement's contract is proved here — normalize, persist, read back,
// and fail safe — rather than asserted in a comment.
import { describe, expect, it } from 'vitest';

import {
  REPLY_BEHAVIOR_OPTIONS,
  REPLY_BEHAVIOR_STORAGE_KEY,
  isReplyAllDefault,
  normalizeReplyBehavior,
  readReplyBehavior,
  writeReplyBehavior,
  type ReplyBehaviorStorage,
} from '../lib/reply-behavior-preference';

function memoryStorage(initial?: Record<string, string>): ReplyBehaviorStorage {
  const store = new Map(Object.entries(initial ?? {}));
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

describe('normalizeReplyBehavior', () => {
  it('keeps reply-all', () => {
    expect(normalizeReplyBehavior('reply-all')).toBe('reply-all');
  });

  it('falls back to sender-only reply for everything else', () => {
    expect(normalizeReplyBehavior('reply')).toBe('reply');
    expect(normalizeReplyBehavior('')).toBe('reply');
    expect(normalizeReplyBehavior('Reply All')).toBe('reply');
    expect(normalizeReplyBehavior('reply_all')).toBe('reply');
    expect(normalizeReplyBehavior(null)).toBe('reply');
    expect(normalizeReplyBehavior(undefined)).toBe('reply');
    expect(normalizeReplyBehavior(42)).toBe('reply');
  });
});

describe('read/write round-trip', () => {
  it('persists under the single shared key and reads back', () => {
    const storage = memoryStorage();
    writeReplyBehavior('reply-all', storage);
    expect(storage.getItem(REPLY_BEHAVIOR_STORAGE_KEY)).toBe('reply-all');
    expect(readReplyBehavior(storage)).toBe('reply-all');
    writeReplyBehavior('reply', storage);
    expect(readReplyBehavior(storage)).toBe('reply');
  });

  it('reads the sender-only default when nothing is stored', () => {
    expect(readReplyBehavior(memoryStorage())).toBe('reply');
  });

  it('reads the sender-only default for a stored value no build recognises', () => {
    const storage = memoryStorage({ [REPLY_BEHAVIOR_STORAGE_KEY]: 'reply-everyone' });
    expect(readReplyBehavior(storage)).toBe('reply');
  });

  it('never throws on an unreadable or unwritable store', () => {
    const throwing: ReplyBehaviorStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(readReplyBehavior(throwing)).toBe('reply');
    expect(() => writeReplyBehavior('reply-all', throwing)).not.toThrow();
    expect(readReplyBehavior(null)).toBe('reply');
  });
});

describe('isReplyAllDefault', () => {
  it('is true only for reply-all', () => {
    expect(isReplyAllDefault('reply-all')).toBe(true);
    expect(isReplyAllDefault('reply')).toBe(false);
  });
});

describe('REPLY_BEHAVIOR_OPTIONS', () => {
  it('offers exactly Reply and Reply all, with distinct values', () => {
    expect(REPLY_BEHAVIOR_OPTIONS.map((option) => option.value)).toEqual(['reply', 'reply-all']);
    expect(REPLY_BEHAVIOR_OPTIONS.map((option) => option.label)).toEqual(['Reply', 'Reply all']);
  });
});
