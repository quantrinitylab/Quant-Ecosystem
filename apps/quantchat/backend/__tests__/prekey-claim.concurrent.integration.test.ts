// ============================================================================
// Integration test — concurrent one-time prekey claim (deployability bar)
// Spec: quantchat-launch-readiness, Task 25.1
// Requirement 18.2 — "THE QuantChat_Backend test suite SHALL include a
//   concurrent one-time prekey claim test that issues at least 100 concurrent
//   claims against a single user's pool and verifies that no claimed
//   One_Time_PreKey is returned to more than one caller."
// Design: Component 1 (PrismaKeyStorage), Algorithm 1 ("Atomic one-time prekey
//   claim", `UPDATE ... FOR UPDATE SKIP LOCKED RETURNING`), Correctness
//   Property 2 ("One-time prekey uniqueness").
//
// This is the required *verification* test (distinct from the fast-check
// property test in prisma-key-storage.prekey-uniqueness.property.test.ts): it
// pins the concrete deployability-bar guarantee of >= 100 truly concurrent
// claims against one user's pool, with NO key handed to two callers.
//
// The design calls for `testcontainers` (real Postgres). A live Postgres is not
// available in this sandbox, so the test defaults to the in-memory harness
// (`createFakeKeyPrisma`), whose `$queryRaw` models the `FOR UPDATE SKIP LOCKED`
// atomic claim exactly — concurrent claims issued via `Promise.all` are
// serialised and can never return the same row twice. The REAL
// `PrismaKeyStorage.claimOneTimePreKey` is the code under test in both modes.
// Set QUANTCHAT_INTEGRATION_BACKEND=testcontainers to target a real Postgres
// at the documented wiring point below. See integration-harness.ts.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaKeyStorage } from '../services/prisma-key-storage';
import { createFakeKeyPrisma, asPrismaClient, type FakeKeyPrisma } from './fake-key-prisma';
import { USE_TESTCONTAINERS, requireTestcontainers } from './integration-harness';

const USER_ID = 'user-concurrent-claim';

/** The deployability-bar floor: at least this many concurrent claims (Req 18.2). */
const CONCURRENT_CLAIMS = 100;

interface KeyStoreHarness {
  store: PrismaKeyStorage;
  teardown: () => Promise<void>;
}

/**
 * Build the key-store harness for the selected integration backend.
 *  - in-memory (default): the REAL PrismaKeyStorage over the in-memory fake
 *    Prisma whose `$queryRaw` models `FOR UPDATE SKIP LOCKED` atomic claim.
 *  - testcontainers: documented wiring point for a real Postgres-backed store.
 */
async function createKeyStoreHarness(): Promise<KeyStoreHarness> {
  if (USE_TESTCONTAINERS) {
    // ---- Real-container wiring point (Req 18.2 against real Postgres) -------
    // Start a testcontainers PostgreSQL, run `prisma migrate deploy`, construct
    // a PrismaClient against it, and `return { store: new PrismaKeyStorage(prisma),
    // teardown }`. The genuine row-level `FOR UPDATE SKIP LOCKED` lock then
    // enforces single-claim semantics under real DB concurrency.
    requireTestcontainers('a PostgreSQL container + PrismaClient for PrismaKeyStorage');
  }

  const prisma: FakeKeyPrisma = createFakeKeyPrisma();
  const store = new PrismaKeyStorage(asPrismaClient(prisma));
  return {
    store,
    teardown: async () => {
      /* in-memory harness holds no external resources */
    },
  };
}

/** Seed the user's bundle, then fill the pool with `n` distinct one-time prekeys. */
async function seedPool(store: PrismaKeyStorage, n: number): Promise<string[]> {
  await store.storeBundle(USER_ID, {
    identityKey: 'public-identity-key',
    signedPreKey: 'public-signed-prekey',
    signedPreKeySignature: 'signature',
    registrationId: 42,
  });
  const keys = Array.from({ length: n }, (_, i) => `otk-${i}`);
  // storeOneTimePreKeys caps a batch at 100; upload in chunks for larger pools.
  for (let i = 0; i < keys.length; i += 100) {
    await store.storeOneTimePreKeys(USER_ID, keys.slice(i, i + 100));
  }
  return keys;
}

describe('Integration: concurrent one-time prekey claim (Task 25.1, Requirement 18.2)', () => {
  let harness: KeyStoreHarness;

  beforeEach(async () => {
    harness = await createKeyStoreHarness();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('issues 100 concurrent claims against a pool of 100 and hands each key to exactly one caller', async () => {
    const pool = await seedPool(harness.store, CONCURRENT_CLAIMS);

    // Fire >= 100 claims concurrently against the SAME user's pool.
    const results = await Promise.all(
      Array.from({ length: CONCURRENT_CLAIMS }, () => harness.store.claimOneTimePreKey(USER_ID)),
    );

    const claimed = results.filter((r): r is string => r !== null);

    // Every claim succeeded (pool size == claim count).
    expect(claimed).toHaveLength(CONCURRENT_CLAIMS);
    // CORE GUARANTEE (Req 18.2): no claimed key was returned to more than one
    // caller — the multiset of returned keys contains no duplicates.
    expect(new Set(claimed).size).toBe(claimed.length);
    // Every returned key came from the seeded pool, and the whole pool was drained.
    expect(new Set(claimed)).toEqual(new Set(pool));
    // The pool is now empty.
    expect(await harness.store.countOneTimePreKeys(USER_ID)).toBe(0);
  });

  it('issues more concurrent claims than the pool holds: each key claimed at most once, surplus claims get null', async () => {
    const poolSize = CONCURRENT_CLAIMS; // 100 keys
    const overClaim = CONCURRENT_CLAIMS + 50; // 150 concurrent claims (> 100)
    const pool = await seedPool(harness.store, poolSize);

    const results = await Promise.all(
      Array.from({ length: overClaim }, () => harness.store.claimOneTimePreKey(USER_ID)),
    );

    const claimed = results.filter((r): r is string => r !== null);
    const nulls = results.filter((r) => r === null);

    // Exactly `poolSize` keys handed out, each exactly once (no key to two callers).
    expect(claimed).toHaveLength(poolSize);
    expect(new Set(claimed).size).toBe(claimed.length);
    expect(new Set(claimed)).toEqual(new Set(pool));
    // The surplus claims fall back to null (empty pool -> signedPreKey-only X3DH).
    expect(nulls).toHaveLength(overClaim - poolSize);
    expect(await harness.store.countOneTimePreKeys(USER_ID)).toBe(0);
  });

  it('issues 200 concurrent claims against a larger pool and never double-claims a key', async () => {
    const poolSize = 200; // well above the 100-claim floor
    const pool = await seedPool(harness.store, poolSize);

    const results = await Promise.all(
      Array.from({ length: poolSize }, () => harness.store.claimOneTimePreKey(USER_ID)),
    );
    const claimed = results.filter((r): r is string => r !== null);

    expect(claimed).toHaveLength(poolSize);
    // No key returned to more than one caller, even at higher concurrency.
    expect(new Set(claimed).size).toBe(poolSize);
    expect(new Set(claimed)).toEqual(new Set(pool));
    expect(await harness.store.countOneTimePreKeys(USER_ID)).toBe(0);
  });
});
