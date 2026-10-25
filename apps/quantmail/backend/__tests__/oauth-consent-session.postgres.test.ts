// @vitest-environment node
// ============================================================================
// REAL-PostgreSQL two-client barrier test for OAuth consent-token single-use
// (services/oauth-consent-session.ts, PrismaConsentTokenStore, PR #1492).
//
// WHAT THIS PROVES (and nothing else claims to): two INDEPENDENT PrismaClient
// instances — two real connections, as two backend replicas would hold —
// attempt tryConsume of the SAME jti released simultaneously from a barrier,
// and exactly one succeeds while the other gets the unique-violation replay
// signal (false). Never two successes. The UNIQUE(jti) constraint of the
// real `oauth_consent_tokens` table (migration 0115) is the mutex; no
// in-memory fake stands in for it here.
//
// GATING — READ BEFORE CITING RESULTS: this suite runs ONLY when
// DATABASE_URL points at a migrated PostgreSQL database (migration 0115
// applied). Otherwise the whole suite is SKIPPED, honestly, not faked.
// There is no live PostgreSQL in the dev VM, so local runs always skip;
// live two-connection execution is OWED TO CI, where DATABASE_URL is
// provided for a migrated database. A skipped local run is NOT proof of
// the cross-instance guarantee — it is proof only that the gate works.
// The mocked-store tests in oauth-consent-session.test.ts (explicitly
// labeled MOCKED there) cover the store's branching logic, never this.
//
// SCOPE DISCIPLINE: this suite never migrates, never touches other data.
// It seeds only its own rows (unique jti prefix per run) and deletes them
// afterwards. The ONLY mock is the JWT-secret getter for @quant/auth —
// tryConsume never calls it (it performs raw INSERTs only), so the DB
// path under test is fully real: real PrismaClient, real INSERT, real
// unique violation from real Postgres.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: vi.fn(() => 'test-jwt-secret'),
  getJwtRefreshSecret: vi.fn(() => 'test-refresh-secret'),
}));

import {
  PrismaConsentTokenStore,
  CONSENT_TOKEN_TTL_SECONDS,
} from '../services/oauth-consent-session';

const pgUrl = process.env.DATABASE_URL;
const describePg = pgUrl ? describe : describe.skip;
if (!pgUrl) {
  // eslint-disable-next-line no-console
  console.log(
    '[oauth-consent-session.postgres] SKIPPED: DATABASE_URL is not set — ' +
      'the two-client barrier proof is owed to a CI run against real ' +
      'Postgres with migration 0115 applied. No live Postgres exists in ' +
      'the dev VM; this skip is honest, not a pass.',
  );
}

const RUN_SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const jtiFor = (tag: string) => `pg-consent-barrier-${RUN_SUFFIX}-${tag}`;

describePg('OAuth consent tokens — two-client Postgres barrier (PR #1492)', () => {
  let clientA: PrismaClient;
  let clientB: PrismaClient;
  // Jtis created by the current test, for cleanup.
  let ownedJtis: string[] = [];

  const expiresAt = () => new Date(Date.now() + CONSENT_TOKEN_TTL_SECONDS * 1000);

  async function rowCount(client: PrismaClient, jti: string): Promise<number> {
    const rows = (await client.$queryRawUnsafe(
      'SELECT COUNT(*)::int AS "c" FROM "oauth_consent_tokens" WHERE "jti" = $1',
      jti,
    )) as Array<{ c: number }>;
    return rows[0]?.c ?? 0;
  }

  beforeAll(async () => {
    clientA = new PrismaClient();
    clientB = new PrismaClient();
    await clientA.$connect();
    await clientB.$connect();
  });

  afterAll(async () => {
    await clientA.$disconnect().catch(() => {});
    await clientB.$disconnect().catch(() => {});
  });

  afterEach(async () => {
    // Best-effort cleanup of this run's rows only.
    for (const jti of ownedJtis) {
      await clientA
        .$executeRawUnsafe('DELETE FROM "oauth_consent_tokens" WHERE "jti" = $1', jti)
        .catch(() => {});
    }
    ownedJtis = [];
  });

  it('barrier: two clients racing the same jti yield exactly one winner', async () => {
    const jti = jtiFor('race');
    ownedJtis.push(jti);
    const storeA = new PrismaConsentTokenStore(clientA);
    const storeB = new PrismaConsentTokenStore(clientB);

    // Barrier: neither INSERT is issued until release() fires, so both
    // attempts hit Postgres simultaneously and serialize on UNIQUE(jti).
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const attemptA = gate.then(() => storeA.tryConsume(jti, expiresAt()));
    const attemptB = gate.then(() => storeB.tryConsume(jti, expiresAt()));
    release();
    const results = await Promise.all([attemptA, attemptB]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results).toContain(true);
    expect(results).toContain(false);
    // And the table agrees: exactly one row for the jti, no duplicates.
    expect(await rowCount(clientA, jti)).toBe(1);
  });

  it('sequential: replica B replays a jti consumed on replica A', async () => {
    const jti = jtiFor('sequential');
    ownedJtis.push(jti);
    const storeA = new PrismaConsentTokenStore(clientA);
    const storeB = new PrismaConsentTokenStore(clientB);
    expect(await storeA.tryConsume(jti, expiresAt())).toBe(true);
    expect(await storeB.tryConsume(jti, expiresAt())).toBe(false);
    expect(await rowCount(clientB, jti)).toBe(1);
  });

  it('distinct jtis both succeed (the store blocks replays, not new tokens)', async () => {
    const jti1 = jtiFor('distinct-1');
    const jti2 = jtiFor('distinct-2');
    ownedJtis.push(jti1, jti2);
    const storeA = new PrismaConsentTokenStore(clientA);
    const storeB = new PrismaConsentTokenStore(clientB);
    expect(await storeA.tryConsume(jti1, expiresAt())).toBe(true);
    expect(await storeB.tryConsume(jti2, expiresAt())).toBe(true);
    expect(await rowCount(clientA, jti1)).toBe(1);
    expect(await rowCount(clientA, jti2)).toBe(1);
  });
});
