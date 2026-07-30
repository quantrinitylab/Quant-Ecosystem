import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import {
  MIN_TOKEN_LENGTH,
  SEARCH_KEY_BYTES,
  computeTokenHash,
  computeTokenHashes,
  createLocalSearchKeyStore,
  generateSearchKey,
  getOrCreateSearchKey,
  indexMessageTokens,
  normalizeText,
  searchEncryptedMessages,
  tokenize,
  type BlindIndexTransport,
  type BlindIndexUpload,
  type EncryptedSearchCandidate,
  type SearchKeyStore,
} from '../features/encryption/searchClient';

// ============================================================================
// Unit + property tests for client tokenize + HMAC blind-index search (Task 18,
// Requirements 14.1, 14.2, 15.1). The Web_Client tokenizes/normalizes plaintext,
// computes HMAC(Search_Key, token) per DISTINCT token, and uploads/queries ONLY
// the opaque token hashes. The Search_Key never leaves the client.
// ============================================================================

describe('normalizeText (Req 14.1, 15.1)', () => {
  it('lowercases, strips diacritics, and collapses punctuation to spaces', () => {
    expect(normalizeText('Héllo, WORLD!!')).toBe('hello world');
    expect(normalizeText('café—CAFE')).toBe('cafe cafe');
    expect(normalizeText('  multiple   spaces  ')).toBe('multiple spaces');
  });

  it('returns an empty string for punctuation/whitespace-only input', () => {
    expect(normalizeText('   ')).toBe('');
    expect(normalizeText('!!!???')).toBe('');
  });
});

describe('tokenize (distinct tokens, Req 14.1)', () => {
  it('returns DISTINCT tokens in first-seen order', () => {
    expect(tokenize('the cat sat on the cat')).toEqual(['the', 'cat', 'sat', 'on']);
  });

  it('normalizes before tokenizing so case/punctuation do not split a word', () => {
    expect(tokenize('Hello, hello! HELLO')).toEqual(['hello']);
  });

  it('returns no tokens for empty or symbol-only plaintext', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('😀😀😀')).toEqual([]);
  });

  it('keeps tokens at least MIN_TOKEN_LENGTH long', () => {
    for (const token of tokenize('a quick brown fox')) {
      expect(token.length).toBeGreaterThanOrEqual(MIN_TOKEN_LENGTH);
    }
  });
});

describe('computeTokenHash / computeTokenHashes (HMAC, Req 14.1, 14.2, 15.6)', () => {
  const key = generateSearchKey();

  it('is deterministic for the same key + token', () => {
    expect(computeTokenHash(key, 'hello')).toBe(computeTokenHash(key, 'hello'));
  });

  it('produces a fixed-width opaque hex digest that is NOT the plaintext token', () => {
    const hash = computeTokenHash(key, 'hello');
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // HMAC-SHA256 hex
    expect(hash).not.toBe('hello');
  });

  it('yields different hashes under different Search_Keys (key dependence)', () => {
    const other = generateSearchKey();
    expect(computeTokenHash(key, 'hello')).not.toBe(computeTokenHash(other, 'hello'));
  });

  it('computes one DISTINCT hash per distinct token and never leaks the key/plaintext', () => {
    const hashes = computeTokenHashes(key, 'the cat sat on the cat');
    // 4 distinct tokens -> 4 distinct hashes.
    expect(hashes).toHaveLength(4);
    expect(new Set(hashes).size).toBe(4);
    // The Search_Key and the raw tokens are never present in the uploaded hashes.
    expect(hashes).not.toContain(key);
    for (const token of ['the', 'cat', 'sat', 'on']) {
      expect(hashes).not.toContain(token);
    }
  });

  it('returns no hashes for empty/symbol-only plaintext', () => {
    expect(computeTokenHashes(key, '   ')).toEqual([]);
  });
});

describe('Search_Key management (derive/store locally, Req 14.2)', () => {
  it('generates a 256-bit hex key', () => {
    const key = generateSearchKey();
    expect(key).toMatch(/^[0-9a-f]+$/);
    expect(key).toHaveLength(SEARCH_KEY_BYTES * 2);
  });

  it('persists a fresh key on first use and returns the same key thereafter', () => {
    const store = createLocalSearchKeyStore();
    const first = getOrCreateSearchKey(store);
    const second = getOrCreateSearchKey(store);
    expect(first).toBe(second);
    expect(store.get()).toBe(first);
  });

  it('reuses an existing stored key rather than regenerating', () => {
    const existing = generateSearchKey();
    let stored: string | null = existing;
    const store: SearchKeyStore = {
      get: () => stored,
      set: (k) => {
        stored = k;
      },
    };
    expect(getOrCreateSearchKey(store)).toBe(existing);
  });
});

describe('indexMessageTokens (upload-on-send, Req 14.1, 14.2)', () => {
  it('uploads ONLY message ids + token hashes (never plaintext or the Search_Key)', async () => {
    const key = generateSearchKey();
    let uploaded: BlindIndexUpload | null = null;
    const transport: BlindIndexTransport = {
      uploadIndex: vi.fn(async (u: BlindIndexUpload) => {
        uploaded = u;
      }),
      search: vi.fn(),
    };

    const plaintext = 'meet me at the cafe tonight';
    const hashes = await indexMessageTokens(
      key,
      { messageId: 'm1', conversationId: 'c1', plaintext },
      transport,
    );

    expect(uploaded).not.toBeNull();
    const upload = uploaded as unknown as BlindIndexUpload;
    expect(upload.messageId).toBe('m1');
    expect(upload.conversationId).toBe('c1');
    expect(upload.tokenHashes).toEqual(hashes);
    // Nothing sensitive crosses the seam: the uploaded token hashes contain
    // neither the plaintext words nor the Search_Key. Check exact uploaded hash
    // elements rather than substring matches so random hex digests cannot trip
    // false positives when they coincidentally contain a token fragment.
    expect(upload.tokenHashes).not.toContain(key);
    for (const hash of upload.tokenHashes) {
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    }
    for (const token of tokenize(plaintext)) {
      expect(upload.tokenHashes).not.toContain(token);
    }
  });

  it('skips the upload entirely when the message has no searchable tokens', async () => {
    const key = generateSearchKey();
    const upload = vi.fn();
    const transport: BlindIndexTransport = { uploadIndex: upload, search: vi.fn() };

    const hashes = await indexMessageTokens(
      key,
      { messageId: 'm1', conversationId: 'c1', plaintext: '😀 !!!' },
      transport,
    );

    expect(hashes).toEqual([]);
    expect(upload).not.toHaveBeenCalled();
  });
});

describe('searchEncryptedMessages (query-on-search, Req 15.1)', () => {
  it('sends ONLY query token hashes and returns candidates', async () => {
    const key = generateSearchKey();
    const candidates: EncryptedSearchCandidate[] = [{ messageId: 'm1', conversationId: 'c1' }];
    let sentHashes: string[] | null = null;
    const transport: BlindIndexTransport = {
      uploadIndex: vi.fn(),
      search: vi.fn(async (hashes: string[]) => {
        sentHashes = hashes;
        return candidates;
      }),
    };

    const result = await searchEncryptedMessages(key, 'cafe', transport);

    expect(result).toEqual(candidates);
    expect(sentHashes).toEqual(computeTokenHashes(key, 'cafe'));
    // The query plaintext and the Search_Key never reach the transport. Check
    // exact uploaded hash elements rather than substring matches so random hex
    // digests cannot coincidentally contain token fragments.
    const queryHashes = sentHashes as unknown as string[];
    expect(queryHashes).not.toContain('cafe');
    expect(queryHashes).not.toContain(key);
    for (const hash of queryHashes) {
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('does not hit the network for an empty/symbol-only query', async () => {
    const key = generateSearchKey();
    const search = vi.fn();
    const transport: BlindIndexTransport = { uploadIndex: vi.fn(), search };

    const result = await searchEncryptedMessages(key, '   ', transport);

    expect(result).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });
});

describe('blind-index round trip via a fake hash-only server (Req 15.3, 15.4)', () => {
  // A minimal in-memory blind index that, like the real server, matches OPAQUE
  // token hashes only — it never sees plaintext or the Search_Key.
  function makeFakeServer(key: string): {
    transport: BlindIndexTransport;
    store: Map<string, Set<string>>; // tokenHash -> messageIds
  } {
    const store = new Map<string, Set<string>>();
    const meta = new Map<string, string>(); // messageId -> conversationId
    const transport: BlindIndexTransport = {
      async uploadIndex(u) {
        meta.set(u.messageId, u.conversationId);
        for (const hash of u.tokenHashes) {
          const set = store.get(hash) ?? new Set<string>();
          set.add(u.messageId);
          store.set(hash, set);
        }
      },
      async search(hashes) {
        const ids = new Set<string>();
        for (const hash of hashes) {
          for (const id of store.get(hash) ?? []) ids.add(id);
        }
        return Array.from(ids).map((id) => ({
          messageId: id,
          conversationId: meta.get(id) ?? '',
        }));
      },
    };
    // The fake server is built without ever being handed `key`.
    void key;
    return { transport, store };
  }

  it('returns a message when the query shares a token, excludes it otherwise', async () => {
    const key = generateSearchKey();
    const { transport } = makeFakeServer(key);

    await indexMessageTokens(
      key,
      { messageId: 'm1', conversationId: 'c1', plaintext: 'lunch at the cafe' },
      transport,
    );

    const hit = await searchEncryptedMessages(key, 'cafe', transport);
    expect(hit.map((c) => c.messageId)).toEqual(['m1']);

    const miss = await searchEncryptedMessages(key, 'zebra', transport);
    expect(miss).toEqual([]);
  });

  it('property: querying any sent token finds the message; a disjoint query does not', async () => {
    const key = generateSearchKey();

    await fc.assert(
      fc.asyncProperty(
        fc
          .array(fc.stringMatching(/^[a-z]{3,8}$/), { minLength: 1, maxLength: 6 })
          .filter((words) => tokenize(words.join(' ')).length > 0),
        fc.stringMatching(/^[a-z]{3,8}$/),
        async (words, queryWord) => {
          const { transport } = makeFakeServer(key);
          const plaintext = words.join(' ');
          const tokens = tokenize(plaintext);

          await indexMessageTokens(
            key,
            { messageId: 'm1', conversationId: 'c1', plaintext },
            transport,
          );

          // Any indexed token must locate the message (Req 15.3).
          for (const token of tokens) {
            const found = await searchEncryptedMessages(key, token, transport);
            expect(found.map((c) => c.messageId)).toContain('m1');
          }

          // A query word that is NOT one of the message tokens must not match
          // (Req 15.4) — matching is purely token-hash equality.
          if (!tokens.includes(queryWord)) {
            const found = await searchEncryptedMessages(key, queryWord, transport);
            expect(found).toEqual([]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
