// @vitest-environment node
// ============================================================================
// POST /auth/resend-verification — REAL-POSTGRES proofs for PR #1495.
//
// These tests are MEANINGLESS against the fake prisma in
// auth-resend-race.test.ts: the partial unique index, the speculative-
// insertion wait, and the dedupe DELETE only exist on real Postgres. The
// fake suite stays as unit coverage (and is labeled as such in its header);
// it does NOT substitute for the proofs below.
//
// This file therefore runs ONLY when DATABASE_URL points at a migrated
// Postgres (migration 0107_email_verification_live_unique applied);
// otherwise the whole suite is skipped — honestly, not faked. There is no
// live Postgres in the dev VM, so local runs always skip; CI runs them when
// it provides DATABASE_URL for a migrated database.
//
// What each test proves, against the REAL route (routes/auth.ts) and the
// REAL prisma singleton (no prisma mock in this file):
//   1. SEEDED-DUPLICATE proof: a database holding pre-existing duplicate
//      live rows for one user, migrated with 0107, ends with exactly ONE
//      live row (the newest) for that user — and the partial unique index
//      then holds for subsequent inserts (second live insert -> P2002,
//      while a usedAt-set insert still succeeds: the predicate is partial).
//      The test reads migration 0107's EXACT statements from the branch's
//      migration file and executes them (after dropping the index and
//      seeding duplicates), so it tests the shipped SQL, not a copy of it.
//      A negative-control sub-step first proves the dedupe step is
//      load-bearing: creating the index on the duplicate rows FAILS.
//   2. SIMULTANEOUS-RESEND proof, in two forms:
//      a. DETERMINISTIC: a live code inserted by a second, still-open
//         transaction (two real PrismaClient instances = two real
//         connections) plus one real resend. The resend's snapshot is empty
//         (the parked row is uncommitted and invisible), its create blocks
//         on the parked row (Postgres speculative-insertion wait), and once
//         the parked transaction commits the resend loses with
//         409 RESEND_SUPERSEDED, no email, no new code — the P2002 mapping
//         in the route, on real Postgres, not a fake.
//      b. BURST: two simultaneous real resends for one user produce exactly
//         ONE 200 + ONE 409 (RESEND_SUPERSEDED) + ONE live code row + ONE
//         email — never two live codes, never two emails, never a raw 500
//         from an unmapped P2002. A burst that serializes instead of
//         overlapping (both 200: the second legitimately invalidates the
//         first) is retried with a fresh user, bounded; a 500 or a
//         200+409 burst that violates the email/live-row counts FAILS
//         immediately — the retry loop never swallows a real failure.
//   3. NEGATIVE CONTROL: the same burst WITHOUT the partial unique index
//      sends TWO emails (both 200) — proving the positive tests actually
//      exercise the index, and would fail against a store without it.
//
// Mocking boundary (deliberate, documented): ONLY the email-delivery edge
// is mocked — sendVerificationEmail records instead of mailing (same
// pattern as the fake suite), and ses-sender is stubbed so the real
// email-verification module can load without SES. The route, the prisma
// clients, the transaction, the index, and the P2002 mapping are all real.
// The suite seeds only its own rows (unique email suffix per run) and
// deletes them afterwards; it never migrates anything except re-applying
// migration 0107's own statements to restore the index it deliberately
// drops in tests 1 and 3 (always in a finally block, with the index's
// existence re-asserted afterwards). Tests in this file run sequentially
// and no other real-DB suite touches email_verification_codes, so the
// brief index-drop windows cannot disturb another suite.
//
// HARD RULE: email only. No phone/SMS anywhere in this file or the code it
// tests — phone OTP was removed by user order.
// ============================================================================

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Email-delivery edge only: record instead of mailing. Everything else in
// this file is real (route, prisma, Postgres).
const sentEmails = vi.hoisted(() => [] as Array<{ to: string; code: string }>);

vi.mock('../lib/ses-sender', () => ({
  sendViaSes: vi.fn(),
  isSesConfigured: vi.fn(() => true),
}));

vi.mock('../lib/email-verification', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    sendVerificationEmail: vi.fn(async ({ to, code }: any) => {
      sentEmails.push({ to, code });
      return true;
    }),
  };
});

const pgUrl = process.env.DATABASE_URL;
const describePg = pgUrl ? describe : describe.skip;
if (!pgUrl) {
  // eslint-disable-next-line no-console
  console.log(
    '[auth-resend-race.postgres] SKIPPED: DATABASE_URL is not set — ' +
      'real-Postgres proofs are owed to a CI run against a migrated database.',
  );
}

const INDEX_NAME = 'email_verification_codes_user_live_unique';
const INDEX_DDL = `CREATE UNIQUE INDEX "${INDEX_NAME}" ON "email_verification_codes"("userId") WHERE "usedAt" IS NULL`;

/**
 * Migration 0107's EXACT statements, read from the branch's migration file
 * (never a hand copy): full-line comments stripped, split on ';'. Asserts
 * the file still holds exactly the dedupe DELETE + the index CREATE, so a
 * future edit to 0107 fails loudly here instead of silently testing
 * something else.
 */
function migration0107Statements(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(
    join(here, '..', '..', '..', '..', 'packages', 'database', 'prisma', 'migrations', '0107_email_verification_live_unique', 'migration.sql'),
    'utf8',
  );
  const body = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  const statements = body
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  expect(statements).toHaveLength(2);
  expect(statements[0]!.toUpperCase().startsWith('DELETE FROM')).toBe(true);
  expect(statements[1]!.toUpperCase().startsWith('CREATE UNIQUE INDEX')).toBe(true);
  return statements;
}

async function applyMigration0107(client: any): Promise<void> {
  for (const stmt of migration0107Statements()) {
    await client.$executeRawUnsafe(stmt);
  }
}

async function indexExists(client: any): Promise<boolean> {
  const rows = await client.$queryRawUnsafe(
    `SELECT indexname FROM pg_indexes WHERE indexname = '${INDEX_NAME}'`,
  );
  return (rows as unknown[]).length === 1;
}

describePg('POST /auth/resend-verification — real-Postgres proofs (PR #1495)', () => {
  let clientA: any;
  let clientB: any;
  let app: any;
  let hashVerificationCode: (code: string) => string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const makeUser = async (tag: string) => {
    const email = `pg-resend-${suffix}-${tag}@quantmail.in`.toLowerCase();
    const user = await clientA.user.create({
      data: {
        email,
        username: `pg-resend-${suffix}-${tag}`.toLowerCase(),
        displayName: `PG Resend ${tag}`,
        passwordHash: 'pg-test-only-not-a-real-hash',
      },
      select: { id: true, email: true },
    });
    return user;
  };

  const cleanupUser = async (userId: string) => {
    await clientA.emailVerificationCode.deleteMany({ where: { userId } }).catch(() => {});
    await clientA.user.delete({ where: { id: userId } }).catch(() => {});
  };

  const resend = (email: string) =>
    app.inject({
      method: 'POST',
      url: '/auth/resend-verification',
      payload: { email },
      headers: { origin: 'http://localhost:3000' },
    });

  const liveRows = (userId: string) =>
    clientA.emailVerificationCode.findMany({ where: { userId, usedAt: null } });

  beforeAll(async () => {
    // Pin the trusted origin regardless of the CI environment's CORS_ORIGINS
    // (configuredOrigins() reads this per request).
    process.env.CORS_ORIGINS = 'http://localhost:3000';
    // The generated client's export shape does not survive bundler module
    // resolution as a destructurable type here (TS2339); the runtime named
    // export exists (the chain probe constructed through it), and both
    // clients below are `any`, so read it loosely instead of fighting the
    // generated .d.ts. A missing export would fail loudly at $connect.
    const PrismaClient = (await import('@prisma/client') as any).PrismaClient;
    clientA = new PrismaClient() as any;
    clientB = new PrismaClient() as any;
    await clientA.$connect();
    await clientB.$connect();
    // The CI database must already carry migration 0107; fail loudly (not
    // skip) if it does not, so a mis-provisioned CI run cannot pass hollow.
    expect(await indexExists(clientA)).toBe(true);
    const emailVerification = await import('../lib/email-verification');
    hashVerificationCode = emailVerification.hashVerificationCode;
    const { authRoutes } = await import('../routes/auth');
    const Fastify = (await import('fastify')).default;
    app = Fastify();
    // Registration-time scaffolding only: two unrelated auth routes use
    // fastify.requireStepUp() as a preHandler; the resend route does not.
    app.decorate('requireStepUp', () => async () => {});
    await app.register(authRoutes);
    await app.ready();
  }, 60000);

  afterAll(async () => {
    if (app) await app.close().catch(() => {});
    if (clientA) await clientA.$disconnect().catch(() => {});
    if (clientB) await clientB.$disconnect().catch(() => {});
  });

  it('migration 0107 dedupe: pre-existing duplicate live rows collapse to the newest, then the index holds', async () => {
    const user = await makeUser('dedupe');
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    try {
      await clientA.$executeRawUnsafe(`DROP INDEX IF EXISTS "${INDEX_NAME}"`);
      const tOld = new Date(Date.now() - 3 * 60_000);
      const tMid = new Date(Date.now() - 2 * 60_000);
      const tNew = new Date(Date.now() - 1 * 60_000);
      const seed = (code: string, createdAt: Date, usedAt: Date | null) =>
        clientA.emailVerificationCode.create({
          data: { userId: user.id, codeHash: hashVerificationCode(code), expiresAt, createdAt, usedAt },
        });
      await seed('111111', tOld, null);
      await seed('222222', tMid, null);
      const newest = await seed('333333', tNew, null);
      // A spent row must survive the dedupe untouched (the predicate only
      // covers live rows), even when it is newer than every live row.
      const used = await seed('444444', new Date(Date.now()), new Date());

      // Negative control, part 1: the dedupe step is load-bearing — with
      // duplicates present, creating the index must FAIL.
      await expect(clientA.$executeRawUnsafe(INDEX_DDL)).rejects.toThrow();

      // Run migration 0107's exact statements against the duplicate rows.
      await applyMigration0107(clientA);

      const live = await liveRows(user.id);
      expect(live).toHaveLength(1);
      expect(live[0].id).toBe(newest.id);
      expect(live[0].codeHash).toBe(hashVerificationCode('333333'));
      const usedAfter = await clientA.emailVerificationCode.findUnique({ where: { id: used.id } });
      expect(usedAfter).not.toBeNull();
      expect(usedAfter.usedAt).not.toBeNull();

      // The index now holds: a second live insert fails P2002, while a
      // usedAt-set insert still succeeds (the predicate is partial).
      await expect(
        clientA.emailVerificationCode.create({
          data: { userId: user.id, codeHash: hashVerificationCode('555555'), expiresAt },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      const usedOk = await clientA.emailVerificationCode.create({
        data: {
          userId: user.id,
          codeHash: hashVerificationCode('666666'),
          expiresAt,
          usedAt: new Date(),
        },
      });
      expect(usedOk.id).toBeTruthy();
    } finally {
      // Guarantee the index is restored even if an assertion above failed.
      await applyMigration0107(clientA).catch(() => {});
      expect(await indexExists(clientA)).toBe(true);
      await cleanupUser(user.id);
    }
  });

  it('parked live insert + real resend: the resend blocks on the index and loses 409 RESEND_SUPERSEDED, no email, no new code', async () => {
    const user = await makeUser('parked');
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    sentEmails.length = 0;
    let release!: () => void;
    let released = false;
    const releaseOnce = () => {
      if (!released) {
        released = true;
        release();
      }
    };
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let parkedResolve!: () => void;
    const parked = new Promise<void>((r) => {
      parkedResolve = r;
    });
    let txB: Promise<unknown> | null = null;
    let resendP: Promise<any> | null = null;
    try {
      // Second real connection, still-open transaction: inserts a live code
      // and holds it uncommitted, so the resend's snapshot is EMPTY (the
      // parked row is invisible under READ COMMITTED) while its create must
      // block on that row at the partial unique index.
      txB = clientB.$transaction(async (tx: any) => {
        await tx.emailVerificationCode.create({
          data: { userId: user.id, codeHash: hashVerificationCode('999999'), expiresAt },
        });
        parkedResolve();
        await gate;
      });
      await parked;
      resendP = resend(user.email);
      // Let the resend reach its index-blocked create before releasing the
      // parked transaction: once blocked it cannot proceed until the
      // release, so the P2002 loser path is exercised deterministically.
      await new Promise((r) => setTimeout(r, 1000));
      releaseOnce();
      await txB;
      const res = await resendP;
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('RESEND_SUPERSEDED');
      // The loser mailed nothing and created nothing: the only live row is
      // the parked winner's, and it is still live.
      expect(sentEmails).toHaveLength(0);
      const live = await liveRows(user.id);
      expect(live).toHaveLength(1);
      expect(live[0].codeHash).toBe(hashVerificationCode('999999'));
    } finally {
      releaseOnce();
      await txB?.catch(() => {});
      await resendP?.catch(() => {});
      await cleanupUser(user.id);
    }
  });

  it('two simultaneous real resends: exactly one 200 + one 409, one email, one live code', async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const user = await makeUser(`burst-${attempt}`);
      sentEmails.length = 0;
      try {
        const [r1, r2] = await Promise.all([resend(user.email), resend(user.email)]);
        const statuses = [r1.statusCode, r2.statusCode].sort((a, b) => a - b);
        // A raw 500 is the unmapped-P2002 escape this PR closes: surface it,
        // never retry it away.
        if (statuses.includes(500)) {
          throw new Error(
            `simultaneous resends produced a 500 (raw P2002 escape?): ${r1.statusCode} ${JSON.stringify(r1.json())} / ${r2.statusCode} ${JSON.stringify(r2.json())}`,
          );
        }
        if (statuses[0] === 200 && statuses[1] === 409) {
          const loser = r1.statusCode === 409 ? r1 : r2;
          expect(loser.json().error.code).toBe('RESEND_SUPERSEDED');
          expect(sentEmails).toHaveLength(1);
          const live = await liveRows(user.id);
          expect(live).toHaveLength(1);
          expect(live[0].codeHash).toBe(hashVerificationCode(sentEmails[0]!.code));
          return;
        }
        if (statuses[0] === 200 && statuses[1] === 200) {
          // Serialized, not overlapped: the second resend legitimately
          // invalidated the first (two emails, one live row at the end).
          // Retry the burst with a fresh user; the overlap window is timing.
          continue;
        }
        throw new Error(
          `unexpected simultaneous-resend outcome: ${r1.statusCode} ${JSON.stringify(r1.json())} / ${r2.statusCode} ${JSON.stringify(r2.json())}`,
        );
      } finally {
        await cleanupUser(user.id);
      }
    }
    throw new Error(
      'simultaneous-resend overlap never manifested in 3 bursts — the race window did not occur, so the contract is unproven (not passed).',
    );
  });

  it('NEGATIVE CONTROL: without the partial unique index the same burst sends two emails', async () => {
    const user = await makeUser('noindex');
    sentEmails.length = 0;
    try {
      await clientA.$executeRawUnsafe(`DROP INDEX IF EXISTS "${INDEX_NAME}"`);
      const [r1, r2] = await Promise.all([resend(user.email), resend(user.email)]);
      // Without the index both requests succeed: overlapped, two live rows;
      // serialized, two emails with the second invalidating the first.
      // Either way the burst produces TWO emails — exactly what the index
      // prevents, proving the positive tests exercise the index.
      expect([r1.statusCode, r2.statusCode].sort((a, b) => a - b)).toEqual([200, 200]);
      expect(sentEmails).toHaveLength(2);
    } finally {
      // Restore migration 0107 and prove the index is back before leaving.
      await applyMigration0107(clientA).catch(() => {});
      expect(await indexExists(clientA)).toBe(true);
      await cleanupUser(user.id);
    }
  });
});
