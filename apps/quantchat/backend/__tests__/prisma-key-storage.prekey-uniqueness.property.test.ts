// ============================================================================
// Property test — PrismaKeyStorage one-time prekey uniqueness
// Spec: quantchat-launch-readiness, Task 2.3
// Design: Correctness Property 2 ("One-time prekey uniqueness"), Component 1,
//         Algorithm 1 ("Atomic one-time prekey claim").
//
//   Property 2 — for any pool size N and any K <= N concurrent claims, the
//   multiset of returned keys contains NO duplicates and no claimed key is
//   returned twice.
//
// Library: fast-check (per the design's Testing Strategy), minimum 100 runs.
// Drives the REAL PrismaKeyStorage.claimOneTimePreKey against an in-memory fake
// Prisma whose `$queryRaw` models `FOR UPDATE SKIP LOCKED` atomic claim.
// ============================================================================

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { PrismaKeyStorage } from '../services/prisma-key-storage';
import { createFakeKeyPrisma, asPrismaClient } from './fake-key-prisma';

const USER_ID = 'user-otk-uniqueness';

/** Seed a user's bundle then fill the pool with N distinct one-time prekeys. */
async function seedPool(store: PrismaKeyStorage, n: number): Promise<string[]> {
  await store.storeBundle(USER_ID, {
    identityKey: 'idk',
    signedPreKey: 'spk',
    signedPreKeySignature: 'sig',
    registrationId: 1,
  });
  const keys = Array.from({ length: n }, (_, i) => `otk-${i}`);
  if (keys.length > 0) {
    await store.storeOneTimePreKeys(USER_ID, keys);
  }
  return keys;
}

// Feature: quantchat-launch-readiness, Property 2: One-time prekey uniqueness
// **Validates: Requirements 2.3, 2.4, 2.5**
describe('Feature: quantchat-launch-readiness, Property 2: One-time prekey uniqueness', () => {
  it('K <= N concurrent claims each return a distinct key — no duplicates, none returned twice', async () => {
    await fc.assert(
      fc.asyncProperty(
        // N pool size in [1, 100] (storeOneTimePreKeys batch cap is 100).
        fc.integer({ min: 1, max: 100 }),
        // A fraction used to derive K in [0, N].
        fc.double({ min: 0, max: 1, noNaN: true }),
        async (n, frac) => {
          const k = Math.min(n, Math.round(frac * n));

          const prisma = createFakeKeyPrisma();
          const store = new PrismaKeyStorage(asPrismaClient(prisma));
          const pool = await seedPool(store, n);

          // Fire K claims concurrently against the same pool.
          const results = await Promise.all(
            Array.from({ length: k }, () => store.claimOneTimePreKey(USER_ID)),
          );

          const claimed = results.filter((r): r is string => r !== null);

          // Since K <= N, every claim succeeds.
          expect(claimed).toHaveLength(k);
          // No duplicates in the returned multiset (no key handed out twice).
          expect(new Set(claimed).size).toBe(claimed.length);
          // Every returned key came from the seeded pool.
          for (const key of claimed) {
            expect(pool).toContain(key);
          }
          // The pool shrank by exactly K unclaimed keys.
          expect(await store.countOneTimePreKeys(USER_ID)).toBe(n - k);
        },
      ),
      { numRuns: 120 },
    );
  });

  it('draining the entire pool returns every key exactly once, then null when exhausted', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 100 }), async (n) => {
        const prisma = createFakeKeyPrisma();
        const store = new PrismaKeyStorage(asPrismaClient(prisma));
        const pool = await seedPool(store, n);

        // Over-claim: N + a few extra concurrent claims.
        const extra = 3;
        const results = await Promise.all(
          Array.from({ length: n + extra }, () => store.claimOneTimePreKey(USER_ID)),
        );

        const claimed = results.filter((r): r is string => r !== null);
        const nulls = results.filter((r) => r === null);

        // Exactly N keys claimed, each exactly once (multiset == the pool set).
        expect(claimed).toHaveLength(n);
        expect(new Set(claimed)).toEqual(new Set(pool));
        // The surplus claims fall back to null (empty pool -> signedPreKey-only X3DH).
        expect(nulls).toHaveLength(extra);
        expect(await store.countOneTimePreKeys(USER_ID)).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});
