// ============================================================================
// QC-F-305 — Password login had NO per-account brute-force defence: the
// User row's `failedLoginAttempts` / `lockoutUntil` fields have existed
// since migration 0001_init (and QuantMail's password reset already clears
// them on a successful reset), but no login path ever read or wrote them,
// so guessing was bounded only by the global per-IP rate limit
// (100/min/IP ≈ 144,000 guesses/day against one account, and nothing at
// all once the attacker rotates IPs).
//
// Band design (specialist-qc-f-305-buildprep.md §3, READY-with-corrections;
// QC-F-118 merged first, so issuance below is the stateful refreshStore):
//   - threshold 5 wrong passwords, lock 15 minutes (ecosystem convention:
//     OTP verify cap 5, @quant/auth maxLoginAttempts 5 / lockout 900s)
//   - the count lives on the USER ROW — the login lookup already collapses
//     email / username / phone onto one row, so rotating identifier or IP
//     cannot shed it; an unknown identifier creates no count and answers
//     identically
//   - argon2 verify ALWAYS runs first (real hash for an existing user,
//     dummy otherwise); the lock is judged only after it, so lock state is
//     not a timing oracle
//   - every failure answers the SAME generic 401 INVALID_CREDENTIALS body
//     (wrong password / locked / unknown identifier are deep-equal), so
//     the lock is not an account-existence oracle either
//   - counting is one atomic `{ increment: 1 }` update; crossing the
//     threshold sets lockoutUntil = now + 15min and resets the counter, so
//     an expired lock opens a fresh window
//   - locked attempts change NOTHING (no increment, no lock extension —
//     otherwise an attacker could keep a victim locked out forever)
//   - a successful login clears residue via a conditional updateMany; a
//     counter/reset write failure is logged and NEVER changes the answer
//     (wrong stays the same 401, success still issues tokens)
//   - knobs: LOGIN_LOCKOUT_MAX_ATTEMPTS / LOGIN_LOCKOUT_MINUTES read in
//     auth.ts, defaults 5 / 15, malformed values fall back to defaults
//
// Negative-control signature (observed 2026-10-22, recorded in
// build-QC-F-305.md): on the ORIGINAL auth.ts the suite goes 14 FAIL /
// 2 PASS — only pins 1 and 15 pass. Every lockout case fails with the
// defect's own shapes (lockoutUntil is never set, counters are never
// written — cases 3 and 11 fail on exactly those counter/mutation pins),
// and a probe run of case 5 with the lock-precondition assert neutralized
// shows the core defect directly: after 5 wrong passwords the ORIGINAL
// handler answers the CORRECT password with 200 + tokens.
//
// Harness: QC-F-041/QC-F-501 pattern — bare Fastify + REAL authRoutes +
// in-memory fake Prisma with stable identities. The fake's findMany
// returns row COPIES (production snapshot semantics), its user.update
// applies `{ increment: 1 }` synchronously (so the concurrency case races
// the handler, not the fake), and every mutation is logged so "no write
// happened" is pinnable. passwordService is a stable module-level stub
// with faithful argon2 semantics for the synthetic hashes used here.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Writable } from 'node:stream';

const verifyCalls = vi.hoisted(() => ({ calls: [] as { digest: string; password: string }[] }));

vi.mock('@quant/auth', () => ({
  passwordService: {
    verify: async (digest: string, password: string): Promise<boolean> => {
      verifyCalls.calls.push({ digest, password });
      if (!digest.startsWith('$argon2')) {
        // argon2.verify throws on a malformed PHC string — the stub keeps
        // that contract (QC-F-501 1D exercises it elsewhere; here it just
        // keeps the fake honest).
        throw new Error('Invalid hash: not a valid PHC string');
      }
      return digest === syntheticHash(password);
    },
    hash: async (password: string): Promise<string> => syntheticHash(password),
  },
}));

import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

import authRoutes from '../routes/auth';
import type { OtpService } from '../lib/otp-service';
import type { SessionTokenIssuer } from '../lib/session-tokens';

// ---------------------------------------------------------------------------
// Stable synthetic identities + credentials (no real accounts, ever).
// ---------------------------------------------------------------------------
const USER_ID = 'user_lockout';
const USER_EMAIL = 'lockout.user@example.com';
const USER_USERNAME = 'lockout_user';
const USER_PHONE = '+919000000305';
const CORRECT_PASSWORD = 'CorrectHorse1!';
const WRONG_PASSWORD = 'WrongPass9!';
const DELETED_EMAIL = 'deleted.lockout@example.com';

function syntheticHash(password: string): string {
  return `$argon2id$v=19$synthetic$${password}`;
}

interface FakeUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  phoneNumber: string | null;
  passwordHash: string;
  role: string;
  deletedAt: Date | null;
  failedLoginAttempts: number;
  lockoutUntil: Date | null;
}

function seedUsers(): FakeUser[] {
  return [
    {
      id: USER_ID,
      email: USER_EMAIL,
      username: USER_USERNAME,
      displayName: 'Lockout User',
      phoneNumber: USER_PHONE,
      passwordHash: syntheticHash(CORRECT_PASSWORD),
      role: 'USER',
      deletedAt: null,
      failedLoginAttempts: 0,
      lockoutUntil: null,
    },
    {
      id: 'user_deleted_lockout',
      email: DELETED_EMAIL,
      username: 'deleted_lockout',
      displayName: 'Deleted Lockout User',
      phoneNumber: null,
      passwordHash: syntheticHash(CORRECT_PASSWORD),
      role: 'USER',
      deletedAt: new Date('2026-10-10T00:00:00Z'),
      failedLoginAttempts: 0,
      lockoutUntil: null,
    },
  ];
}

// ---------------------------------------------------------------------------
// Faithful in-memory Prisma fake (QC-F-501 chassis + QC-F-305 write side).
// ---------------------------------------------------------------------------
function fieldMatches(stored: string | null, condition: unknown): boolean {
  if (typeof condition === 'string') return stored === condition;
  if (condition && typeof condition === 'object' && 'equals' in condition) {
    const { equals, mode } = condition as { equals: unknown; mode?: string };
    if (stored === null || typeof equals !== 'string') return false;
    return mode === 'insensitive'
      ? stored.toLowerCase() === equals.toLowerCase()
      : stored === equals;
  }
  return false;
}

function rowMatches(user: FakeUser, where: Record<string, unknown>): boolean {
  if (where['deletedAt'] === null && user.deletedAt) return false;
  const or = where['OR'];
  if (Array.isArray(or)) {
    return or.some((branch) => {
      const cond = branch as Record<string, unknown>;
      if ('email' in cond) return fieldMatches(user.email, cond['email']);
      if ('username' in cond) return fieldMatches(user.username, cond['username']);
      if ('phoneNumber' in cond) return fieldMatches(user.phoneNumber, cond['phoneNumber']);
      return false;
    });
  }
  return true;
}

type Mutation =
  | { kind: 'update'; id: string; data: Record<string, unknown> }
  | { kind: 'updateMany'; count: number; data: Record<string, unknown> };

function makeFakePrisma(users: FakeUser[]) {
  const mutations: Mutation[] = [];
  const faults = { failUpdate: false, failUpdateMany: false };

  function applyData(row: FakeUser, data: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(data)) {
      if (
        value &&
        typeof value === 'object' &&
        'increment' in (value as Record<string, unknown>)
      ) {
        const inc = (value as { increment: number }).increment;
        (row as unknown as Record<string, unknown>)[key] =
          ((row as unknown as Record<string, unknown>)[key] as number) + inc;
      } else {
        (row as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }

  const prisma = {
    refreshToken: {
      async create({ data }: { data: Record<string, unknown> }) {
        return data;
      },
    },
    user: {
      async findFirst({ where }: { where: Record<string, unknown> }) {
        const row = users.find((u) => rowMatches(u, where));
        return row ? { ...row } : null;
      },
      async findMany({
        where,
        take,
      }: {
        where: Record<string, unknown>;
        take?: number;
      }) {
        const rows = users.filter((u) => rowMatches(u, where));
        const sliced = typeof take === 'number' ? rows.slice(0, take) : rows;
        return sliced.map((u) => ({ ...u }));
      },
      async findUnique({ where }: { where: { id?: string; phoneNumber?: string } }) {
        if (where.id) return users.find((u) => u.id === where.id) ?? null;
        if (where.phoneNumber)
          return users.find((u) => u.phoneNumber === where.phoneNumber) ?? null;
        return null;
      },
      // Mutation is applied synchronously inside the call so concurrent
      // handlers race exactly like concurrent requests against one row.
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        if (faults.failUpdate) throw new Error('fake prisma: user.update fault');
        const row = users.find((u) => u.id === where.id);
        if (!row) throw new Error('fake prisma: user.update target missing');
        applyData(row, data);
        mutations.push({ kind: 'update', id: where.id, data });
        return { ...row };
      },
      async updateMany({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) {
        if (faults.failUpdateMany) throw new Error('fake prisma: user.updateMany fault');
        let count = 0;
        for (const row of users) {
          if (row.id !== where['id']) continue;
          const or = where['OR'] as Record<string, unknown>[] | undefined;
          const matches =
            !or ||
            or.some((cond) => {
              if ('failedLoginAttempts' in cond) {
                const c = cond['failedLoginAttempts'] as { gt?: number };
                return typeof c.gt === 'number' && row.failedLoginAttempts > c.gt;
              }
              if ('lockoutUntil' in cond) {
                const c = cond['lockoutUntil'] as { not?: unknown };
                return 'not' in c && row.lockoutUntil !== null;
              }
              return false;
            });
          if (matches) {
            applyData(row, data);
            count += 1;
          }
        }
        mutations.push({ kind: 'updateMany', count, data });
        return { count };
      },
    },
  };
  // Helper params take the REAL decorated PrismaClient type (the `unknown`
  // param pattern broke CI typecheck in PR #903/#905); cast at construction.
  return { prisma: prisma as unknown as PrismaClient, users, mutations, faults };
}

function makeSessionTokensStub() {
  const issueCalls: { userId: string; username: string }[] = [];
  const stub = {
    issue: async (args: { userId: string; username: string }) => {
      issueCalls.push(args);
      return {
        accessToken: 'stub-access-token',
        refreshToken: 'stub-refresh-token',
        expiresIn: 3600,
        tokenType: 'Bearer',
        refreshTokenId: 'stub-refresh-id',
        familyId: 'stub-family-id',
      };
    },
    verifyRefreshToken: () => null,
  };
  return { stub: stub as unknown as SessionTokenIssuer, issueCalls };
}

const otpServiceStub = {
  verifyCode: () => ({ ok: true }),
} as unknown as OtpService;

async function buildAuthApp(
  prisma: PrismaClient,
  sessionTokens: SessionTokenIssuer,
  logLines: string[],
): Promise<FastifyInstance> {
  const logStream = new Writable({
    write(chunk, _encoding, callback) {
      logLines.push(chunk.toString());
      callback();
    },
  });
  const app = Fastify({ logger: { level: 'warn', stream: logStream } });
  (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate('prisma', prisma);
  (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
    'otpService',
    otpServiceStub,
  );
  (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
    'sessionTokens',
    sessionTokens,
  );
  await app.register(authRoutes, { prefix: '/auth' });
  await app.ready();
  return app;
}

const INVALID_BODY = {
  success: false,
  error: {
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid identifier or password',
    statusCode: 401,
  },
};

describe('QC-F-305 POST /auth/login — per-account lockout on the dead schema fields', () => {
  let app: FastifyInstance | null = null;
  let fake: ReturnType<typeof makeFakePrisma>;
  let tokens: ReturnType<typeof makeSessionTokensStub>;
  let logLines: string[];

  beforeEach(async () => {
    delete process.env['LOGIN_LOCKOUT_MAX_ATTEMPTS'];
    delete process.env['LOGIN_LOCKOUT_MINUTES'];
    fake = makeFakePrisma(seedUsers());
    tokens = makeSessionTokensStub();
    logLines = [];
    verifyCalls.calls.length = 0;
    app = await buildAuthApp(fake.prisma, tokens.stub, logLines);
  });

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  function row(): FakeUser {
    return fake.users.find((u) => u.id === USER_ID)!;
  }

  async function login(identifier: string, password: string, remoteAddress?: string) {
    return app!.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier, password },
      ...(remoteAddress ? { remoteAddress } : {}),
    });
  }

  async function lockAccount(): Promise<void> {
    for (let i = 0; i < 5; i += 1) {
      const res = await login(USER_EMAIL, WRONG_PASSWORD);
      expect(res.statusCode).toBe(401);
    }
    expect(row().lockoutUntil).not.toBeNull();
  }

  it('case 1 (pin): correct password on a clean counter -> 200, tokens issued, no lockout write', async () => {
    const res = await login(USER_EMAIL, CORRECT_PASSWORD);
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(tokens.issueCalls).toEqual([{ userId: USER_ID, username: USER_USERNAME }]);
    // No counter write of any effect: no update() at all, and the success
    // reset is a no-op against a clean row.
    expect(fake.mutations.filter((m) => m.kind === 'update')).toHaveLength(0);
    for (const m of fake.mutations) {
      if (m.kind === 'updateMany') expect(m.count).toBe(0);
    }
    expect(row().failedLoginAttempts).toBe(0);
    expect(row().lockoutUntil).toBeNull();
  });

  it('case 2: one wrong password -> 401 INVALID_CREDENTIALS, counter 0->1, no lock yet', async () => {
    const res = await login(USER_EMAIL, WRONG_PASSWORD);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(INVALID_BODY);
    expect(tokens.issueCalls).toHaveLength(0);
    expect(row().failedLoginAttempts).toBe(1);
    expect(row().lockoutUntil).toBeNull();
  });

  it('case 3 (pin): four wrong then correct -> 200 and the counter resets to 0/null', async () => {
    for (let i = 0; i < 4; i += 1) {
      expect((await login(USER_EMAIL, WRONG_PASSWORD)).statusCode).toBe(401);
    }
    expect(row().failedLoginAttempts).toBe(4);
    const res = await login(USER_EMAIL, CORRECT_PASSWORD);
    expect(res.statusCode).toBe(200);
    expect(tokens.issueCalls).toHaveLength(1);
    expect(row().failedLoginAttempts).toBe(0);
    expect(row().lockoutUntil).toBeNull();
  });

  it('case 4: the fifth wrong password sets lockoutUntil ≈ now + 15min and resets the counter to 0', async () => {
    const before = Date.now();
    for (let i = 0; i < 5; i += 1) {
      expect((await login(USER_EMAIL, WRONG_PASSWORD)).statusCode).toBe(401);
    }
    const after = Date.now();
    const lock = row().lockoutUntil;
    expect(lock).not.toBeNull();
    expect(lock!.getTime()).toBeGreaterThanOrEqual(before + 14 * 60_000);
    expect(lock!.getTime()).toBeLessThanOrEqual(after + 15 * 60_000 + 1_000);
    expect(row().failedLoginAttempts).toBe(0);
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('case 5 (core regression): locked account + CORRECT password -> 401 INVALID_CREDENTIALS, no tokens', async () => {
    await lockAccount();
    const res = await login(USER_EMAIL, CORRECT_PASSWORD);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(INVALID_BODY);
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('case 6: locked account + wrong password -> 401, lock NOT extended, counter NOT incremented', async () => {
    await lockAccount();
    const lockBefore = row().lockoutUntil!.getTime();
    const res = await login(USER_EMAIL, WRONG_PASSWORD);
    expect(res.statusCode).toBe(401);
    expect(row().lockoutUntil!.getTime()).toBe(lockBefore);
    expect(row().failedLoginAttempts).toBe(0);
  });

  it('case 7: expired lock + correct password -> 200, fields cleared to 0/null', async () => {
    row().lockoutUntil = new Date(Date.now() - 60_000);
    const res = await login(USER_EMAIL, CORRECT_PASSWORD);
    expect(res.statusCode).toBe(200);
    expect(tokens.issueCalls).toHaveLength(1);
    expect(row().failedLoginAttempts).toBe(0);
    expect(row().lockoutUntil).toBeNull();
  });

  it('case 8: expired lock + wrong password -> counting restarts at 1 (old window does not leak in)', async () => {
    row().lockoutUntil = new Date(Date.now() - 60_000);
    const res = await login(USER_EMAIL, WRONG_PASSWORD);
    expect(res.statusCode).toBe(401);
    expect(row().failedLoginAttempts).toBe(1);
  });

  it('case 9: IP rotation — five wrong attempts from five different IPs still lock the ACCOUNT', async () => {
    const ips = ['203.0.113.1', '203.0.113.2', '198.51.100.7', '192.0.2.44', '203.0.113.99'];
    for (const ip of ips) {
      expect((await login(USER_EMAIL, WRONG_PASSWORD, ip)).statusCode).toBe(401);
    }
    expect(row().lockoutUntil).not.toBeNull();
    const res = await login(USER_EMAIL, CORRECT_PASSWORD, '198.51.100.200');
    expect(res.statusCode).toBe(401);
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('case 10: identifier rotation — email x2 + username x2 + phone x1 wrong attempts share ONE count and lock', async () => {
    expect((await login(USER_EMAIL, WRONG_PASSWORD)).statusCode).toBe(401);
    expect((await login(USER_EMAIL.toUpperCase(), WRONG_PASSWORD)).statusCode).toBe(401);
    expect((await login(USER_USERNAME, WRONG_PASSWORD)).statusCode).toBe(401);
    expect((await login(USER_USERNAME.toUpperCase(), WRONG_PASSWORD)).statusCode).toBe(401);
    expect(row().failedLoginAttempts).toBe(4);
    expect((await login(USER_PHONE, WRONG_PASSWORD)).statusCode).toBe(401);
    expect(row().lockoutUntil).not.toBeNull();
    const res = await login(USER_USERNAME, CORRECT_PASSWORD);
    expect(res.statusCode).toBe(401);
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('case 11 (pin): no existence leak — unknown identifier vs wrong password vs locked+correct are deep-equal 401s', async () => {
    const unknown = await login('nobody@example.com', WRONG_PASSWORD);
    const wrong = await login(USER_EMAIL, WRONG_PASSWORD);
    await lockAccount();
    const locked = await login(USER_EMAIL, CORRECT_PASSWORD);
    for (const res of [unknown, wrong, locked]) {
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual(INVALID_BODY);
    }
    expect(unknown.json()).toEqual(wrong.json());
    expect(wrong.json()).toEqual(locked.json());
    // ...and the unknown identifier created no counter state anywhere:
    // the only update() calls are the known account's own counting
    // (1 from `wrong` + 4 increments and 1 lock-set inside lockAccount).
    expect(fake.mutations.filter((m) => m.kind === 'update')).toHaveLength(6);
  });

  it('case 12: timing defence — a locked login still runs password verify exactly once, against the REAL hash', async () => {
    await lockAccount();
    verifyCalls.calls.length = 0;
    const res = await login(USER_EMAIL, CORRECT_PASSWORD);
    expect(res.statusCode).toBe(401);
    expect(verifyCalls.calls).toHaveLength(1);
    expect(verifyCalls.calls[0]!.digest).toBe(row().passwordHash);
    expect(verifyCalls.calls[0]!.password).toBe(CORRECT_PASSWORD);
  });

  it('case 13: concurrent burst — 10 simultaneous wrong passwords all 401 and the account ends locked', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => login(USER_EMAIL, WRONG_PASSWORD)),
    );
    for (const res of results) expect(res.statusCode).toBe(401);
    expect(row().lockoutUntil).not.toBeNull();
    expect(row().lockoutUntil!.getTime()).toBeGreaterThan(Date.now());
    const res = await login(USER_EMAIL, CORRECT_PASSWORD);
    expect(res.statusCode).toBe(401);
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('case 14a: reset-write failure on a successful login -> still 200 + tokens (fault logged, login proceeds)', async () => {
    row().failedLoginAttempts = 3;
    fake.faults.failUpdateMany = true;
    const res = await login(USER_EMAIL, CORRECT_PASSWORD);
    expect(res.statusCode).toBe(200);
    expect(tokens.issueCalls).toHaveLength(1);
    expect(logLines.join('')).toContain('QC-F-305');
  });

  it('case 14b: counter-write failure on a wrong password -> still the same 401, never a 500', async () => {
    fake.faults.failUpdate = true;
    const res = await login(USER_EMAIL, WRONG_PASSWORD);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(INVALID_BODY);
    expect(logLines.join('')).toContain('QC-F-305');
  });

  it('case 15 (pin): soft-deleted row + correct password -> the pre-existing 401, and no lockout write', async () => {
    const res = await login(DELETED_EMAIL, CORRECT_PASSWORD);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(INVALID_BODY);
    expect(tokens.issueCalls).toHaveLength(0);
    expect(fake.mutations).toHaveLength(0);
  });
});
