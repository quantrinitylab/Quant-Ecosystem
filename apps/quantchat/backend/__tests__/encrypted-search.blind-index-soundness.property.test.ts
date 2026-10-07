// ============================================================================
// Property test — EncryptedSearchIndex blind-index soundness / E2EE confidentiality
// Spec: quantchat-launch-readiness, Task 17.3
// Design: Correctness Property 6 ("Blind-index soundness / E2EE confidentiality"),
//         Component 5 ("EncryptedSearchIndex"), Algorithm 5 ("Blind-index search").
//         Requirements 15.3, 15.4, 16.1.
//
//   Property 6 — for any plaintext:
//     * indexing its HMAC token hashes then searching those tokens RETURNS the
//       message (Req 15.3);
//     * a message whose plaintext shares NO token with the query is NOT returned
//       (Req 15.4);
//     * results are OWNER-SCOPED — a different userId never matches another
//       user's entries (Req 15.5);
//     * results are DEDUPED — each messageId appears at most once even when many
//       of its tokens match (Req 15.2);
//     * the server matches TOKEN HASHES ONLY — no plaintext, ciphertext, or key
//       material is ever persisted (Req 16.1).
//
// The client is MODELLED in-test: tokenize + normalize plaintext, then compute a
// deterministic HMAC(Search_Key, token) per distinct token. Only the resulting
// opaque token hashes are handed to the server; the Search_Key never crosses the
// boundary. The REAL `PrismaEncryptedSearchIndex` runs against an in-memory fake
// Prisma (fake-search-prisma.ts) modelling the GROUP BY / COUNT(DISTINCT) match.
//
// Library: fast-check (per the design's Testing Strategy), minimum 100 runs.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import fc from 'fast-check';
import { PrismaEncryptedSearchIndex } from '../services/encrypted-search.service';
import { createFakeSearchPrisma, asPrismaClient } from './fake-search-prisma';

// ----------------------------------------------------------------------------
// Client model — tokenization + blind-index HMAC (mirrors Task 18 Web_Client).
// The server NEVER sees these functions' inputs: it only ever receives the
// opaque hex digests produced by `hashToken`.
// ----------------------------------------------------------------------------

/** Normalize + tokenize plaintext into distinct lowercase alphanumeric tokens. */
function tokenize(plaintext: string): string[] {
  const tokens = plaintext
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
  return Array.from(new Set(tokens));
}

/** Deterministic client-side blind-index hash: HMAC(Search_Key, token). */
function hashToken(searchKey: string, token: string): string {
  return createHmac('sha256', searchKey).update(token).digest('hex');
}

/** Compute the distinct token hashes the client would upload for a plaintext. */
function tokenHashesFor(searchKey: string, plaintext: string): string[] {
  return tokenize(plaintext).map((t) => hashToken(searchKey, t));
}

// ----------------------------------------------------------------------------
// Generators — a vocabulary keeps overlaps/disjointness controllable so each
// run exercises both matching and non-matching (disjoint) messages.
// ----------------------------------------------------------------------------

const WORD_POOL = [
  'alpha',
  'bravo',
  'charlie',
  'delta',
  'echo',
  'foxtrot',
  'golf',
  'hotel',
  'india',
  'juliet',
  'kilo',
  'lima',
];

const USERS = ['userA', 'userB', 'userC'] as const;

const wordsArb = fc.uniqueArray(fc.constantFrom(...WORD_POOL), { minLength: 0, maxLength: 6 });

interface PlannedMessage {
  ownerIdx: number;
  convIdx: number;
  words: string[];
}

const scenarioArb = fc.record({
  // A non-empty Search_Key (kept entirely client-side).
  searchKey: fc.string({ minLength: 1, maxLength: 24 }).filter((s) => s.length > 0),
  messages: fc.array(
    fc.record({
      ownerIdx: fc.integer({ min: 0, max: USERS.length - 1 }),
      convIdx: fc.integer({ min: 0, max: 4 }),
      words: wordsArb,
    }),
    { minLength: 1, maxLength: 12 },
  ),
  searcherIdx: fc.integer({ min: 0, max: USERS.length - 1 }),
  queryWords: wordsArb,
});

// Feature: quantchat-launch-readiness, Property 6: Blind-index soundness
// **Validates: Requirements 15.3, 15.4, 16.1**
describe('Feature: quantchat-launch-readiness, Property 6: Blind-index soundness', () => {
  it('returns matching messages, excludes disjoint ones, owner-scoped + deduped, hashes only', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const { searchKey, messages, searcherIdx, queryWords } = scenario;
        const prisma = createFakeSearchPrisma();
        const index = new PrismaEncryptedSearchIndex(asPrismaClient(prisma));

        // ---- Client indexes each message: build plaintext, tokenize, HMAC. ----
        const planned: Array<PlannedMessage & { messageId: string; plaintext: string }> = [];
        for (let i = 0; i < messages.length; i += 1) {
          const m = messages[i]!;
          const messageId = `msg-${i}`;
          const plaintext = m.words.join(' ');
          planned.push({ ...m, messageId, plaintext });
          await index.index({
            messageId,
            conversationId: `conv-${m.convIdx}`,
            userId: USERS[m.ownerIdx]!,
            tokenHashes: tokenHashesFor(searchKey, plaintext),
          });
        }

        // ---- Client issues a search: only query token hashes cross the wire. ----
        const searcher = USERS[searcherIdx]!;
        const queryTokens = new Set(queryWords);
        const queryHashes = queryWords.map((w) => hashToken(searchKey, w));

        const result = await index.search(searcher, queryHashes, { page: 1, pageSize: 1000 });
        const returnedIds = result.data.map((d) => d.messageId);

        // ---- Expected set: owner == searcher AND token sets intersect. --------
        const expected = planned
          .filter(
            (p) =>
              USERS[p.ownerIdx] === searcher &&
              tokenize(p.plaintext).some((tok) => queryTokens.has(tok)),
          )
          .map((p) => p.messageId);

        // Soundness (Req 15.3) + disjoint-exclusion (Req 15.4) + owner scope (Req 15.5):
        // the returned set equals exactly the expected set.
        expect([...returnedIds].sort()).toEqual([...expected].sort());

        // Dedup (Req 15.2): every returned messageId appears at most once.
        expect(new Set(returnedIds).size).toBe(returnedIds.length);

        // total matches the deduped count.
        expect(result.total).toBe(expected.length);

        // ---- Owner-scoping cross-check: no returned message belongs to another. ----
        for (const id of returnedIds) {
          const owner = planned.find((p) => p.messageId === id)!;
          expect(USERS[owner.ownerIdx]).toBe(searcher);
        }

        // ---- Zero-knowledge: only hash-bearing columns are persisted. ---------
        const ALLOWED_COLUMNS = new Set([
          'messageId',
          'conversationId',
          'userId',
          'tokenHash',
          'createdAt',
          'seq',
        ]);
        const allPlaintextTokens = new Set(planned.flatMap((p) => tokenize(p.plaintext)));
        for (const row of prisma.__state.entries) {
          // No column outside the allow-list ever reaches the store.
          for (const key of Object.keys(row)) {
            expect(ALLOWED_COLUMNS.has(key)).toBe(true);
          }
          // The stored token value is an opaque HMAC digest, never a plaintext
          // token and never the Search_Key.
          expect(allPlaintextTokens.has(row.tokenHash)).toBe(false);
          expect(row.tokenHash).not.toBe(searchKey);
          // A token hash is a 64-char sha256 hex digest — no plaintext leaks.
          expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
        }
      }),
      { numRuns: 150 },
    );
  });

  it('a message and a disjoint message: query tokens return only the matching one', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 16 }).filter((s) => s.length > 0),
        async (searchKey) => {
          const prisma = createFakeSearchPrisma();
          const index = new PrismaEncryptedSearchIndex(asPrismaClient(prisma));
          const owner = 'userA';

          // Matching message shares the query token "alpha"; disjoint one does not.
          await index.index({
            messageId: 'hit',
            conversationId: 'conv-1',
            userId: owner,
            tokenHashes: tokenHashesFor(searchKey, 'alpha bravo charlie'),
          });
          await index.index({
            messageId: 'miss',
            conversationId: 'conv-1',
            userId: owner,
            tokenHashes: tokenHashesFor(searchKey, 'delta echo foxtrot'),
          });

          const res = await index.search(owner, [hashToken(searchKey, 'alpha')], {
            page: 1,
            pageSize: 50,
          });
          expect(res.data.map((d) => d.messageId)).toEqual(['hit']);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a message matching the query on many tokens is returned exactly once (dedup)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 16 }).filter((s) => s.length > 0),
        async (searchKey) => {
          const prisma = createFakeSearchPrisma();
          const index = new PrismaEncryptedSearchIndex(asPrismaClient(prisma));
          const owner = 'userA';
          const words = ['alpha', 'bravo', 'charlie', 'delta'];

          await index.index({
            messageId: 'multi',
            conversationId: 'conv-1',
            userId: owner,
            tokenHashes: tokenHashesFor(searchKey, words.join(' ')),
          });

          // Query carries ALL of the message's tokens — many rows match.
          const res = await index.search(
            owner,
            words.map((w) => hashToken(searchKey, w)),
            { page: 1, pageSize: 50 },
          );
          expect(res.data.map((d) => d.messageId)).toEqual(['multi']);
          expect(res.total).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("owner scoping: searching as one user never matches another user's entries", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 16 }).filter((s) => s.length > 0),
        async (searchKey) => {
          const prisma = createFakeSearchPrisma();
          const index = new PrismaEncryptedSearchIndex(asPrismaClient(prisma));

          // Identical plaintext indexed under userB only.
          await index.index({
            messageId: 'b-owned',
            conversationId: 'conv-1',
            userId: 'userB',
            tokenHashes: tokenHashesFor(searchKey, 'alpha bravo'),
          });

          // userA searches the very same token hash — must see nothing.
          const res = await index.search('userA', [hashToken(searchKey, 'alpha')], {
            page: 1,
            pageSize: 50,
          });
          expect(res.data).toHaveLength(0);
          expect(res.total).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
