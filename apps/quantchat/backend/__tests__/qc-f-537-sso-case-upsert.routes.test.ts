// ============================================================================
// QC-F-537 — SSO exchange identity resolution must be case-INSENSITIVE,
// exactly like password login (QC-F-501 Slice-1C).
//
// Before this fix, upsertSsoUser looked the verified email up with an EXACT
// findFirst({ where: { email } }) against Postgres' case-sensitive @unique:
//   T1  a legacy mixed-case row was missed -> SSO CREATE succeeded -> a
//       second account for the same email (split identity), after which
//       password login matched both rows insensitively and 409'd forever.
//   T2  a pre-existing case-duplicate pair was resolved by silently picking
//       whichever row findFirst happened to return, while login 409s.
//   T3  a mixed-case DELETED row was missed the same way -> SSO resurrected
//       it as a duplicate instead of the QC-F-041 401 ACCOUNT_DELETED.
//   T5  two concurrent first exchanges: the loser's create hits email-P2002,
//       but the retry loop only ever changed the USERNAME, so every attempt
//       re-collided on the same email and the exchange died as a 500.
//
// These tests mount the REAL authRoutes plugin on a bare Fastify instance
// (QC-F-041 pattern). Prisma is an in-memory fake with stable identities
// whose findFirst/findMany faithfully implement BOTH query shapes (legacy
// plain-string equality for the pre-fix code, { equals, mode } for the fix)
// plus the deletedAt: null filter and take, and whose create enforces the
// case-SENSITIVE unique exactly like Postgres. passwordService is a stable
// module-level stub with faithful argon2 semantics for the synthetic hashes
// used here (QC-F-501 pattern).
//
// Negative-control signature (recorded in build-QC-F-537.md): on pre-fix
// code T1/T2/T3/T5/T10 FAIL with the defect shapes above and T4/T6/T7/T8/T9
// PASS (controls); on fixed code the whole file passes.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@quant/auth', () => ({
  passwordService: {
    verify: async (digest: string, password: string): Promise<boolean> => {
      if (!digest.startsWith('$argon2')) {
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
const CORRECT_PASSWORD = 'Correct-Horse-537!';

function syntheticHash(password: string): string {
  return `$argon2id$v=19$synthetic$${password}`;
}

const EMAIL_CASE_CONFLICT_MESSAGE =
  'This email address is registered on more than one account with different capitalisation. ' +
  'Sign-in is paused for these accounts until the addresses are merged — contact support.';

interface FakeUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  phoneNumber: string | null;
  phoneVerified: boolean;
  passwordHash: string;
  deletedAt: Date | null;
}

function makeUser(partial: Partial<FakeUser> & { id: string; email: string }): FakeUser {
  return {
    username: `user_${partial.id}`,
    displayName: 'Test User',
    role: 'USER',
    phoneNumber: null,
    phoneVerified: false,
    passwordHash: '!unusable-marker',
    deletedAt: null,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Faithful in-memory Prisma fake (QC-F-501 rowMatches pattern + create/update
// with Postgres-faithful case-sensitive uniques + a deterministic race hook).
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
  if ('email' in where) return fieldMatches(user.email, where['email']);
  return true;
}

function uniqueViolation(): Error & { code: string } {
  const err = new Error('Unique constraint failed') as Error & { code: string };
  err.code = 'P2002';
  return err;
}

function makeFakePrisma(users: FakeUser[]) {
  const created: Record<string, unknown>[] = [];
  // Deterministic race injection: when set, the FIRST create call first
  // inserts the competitor row, then the normal unique check runs — so the
  // create fails with a genuine email-P2002, exactly like losing a real
  // concurrent first exchange. No timers, no real concurrency, never flaky.
  let raceHook: ((data: Record<string, unknown>) => void) | null = null;
  const prisma = {
    refreshToken: {
      async create({ data }: { data: Record<string, unknown> }) {
        return data;
      },
    },
    user: {
      async findUnique({ where }: { where: { id?: string; phoneNumber?: string } }) {
        if (where.id) return users.find((u) => u.id === where.id) ?? null;
        if (where.phoneNumber) return users.find((u) => u.phoneNumber === where.phoneNumber) ?? null;
        return null;
      },
      async findFirst({ where }: { where: Record<string, unknown> }) {
        return users.find((u) => rowMatches(u, where)) ?? null;
      },
      async findMany({ where, take }: { where: Record<string, unknown>; take?: number }) {
        const rows = users.filter((u) => rowMatches(u, where));
        return typeof take === 'number' ? rows.slice(0, take) : rows;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        if (raceHook) {
          const hook = raceHook;
          raceHook = null;
          hook(data);
        }
        // Postgres @unique on email/username/phone is case-SENSITIVE.
        if (users.some((u) => u.email === data['email'])) throw uniqueViolation();
        if (data['phoneNumber'] && users.some((u) => u.phoneNumber === data['phoneNumber'])) {
          throw uniqueViolation();
        }
        if (users.some((u) => u.username === data['username'])) throw uniqueViolation();
        const row: FakeUser = {
          id: `user_created_${users.length + 1}`,
          email: String(data['email']),
          username: String(data['username']),
          displayName: String(data['displayName'] ?? 'QuantChat User'),
          role: 'USER',
          phoneNumber: (data['phoneNumber'] as string | null) ?? null,
          phoneVerified: Boolean(data['phoneVerified']),
          passwordHash: String(data['passwordHash'] ?? '!unusable-marker'),
          deletedAt: null,
        };
        users.push(row);
        created.push(data);
        return row;
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const row = users.find((u) => u.id === where.id);
        if (!row) throw new Error('record not found');
        for (const [key, value] of Object.entries(data)) {
          if (value && typeof value === 'object' && 'increment' in (value as object)) continue;
          (row as unknown as Record<string, unknown>)[key] = value;
        }
        return row;
      },
    },
  };
  // Helper params take the REAL decorated PrismaClient type (the `unknown`
  // param pattern broke CI typecheck against app.decorate('prisma', ...)
  // in PR #903/#905); the fake is cast at construction.
  return {
    prisma: prisma as unknown as PrismaClient,
    created,
    users,
    setRaceHook(hook: ((data: Record<string, unknown>) => void) | null) {
      raceHook = hook;
    },
  };
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
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
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

function stubQuantMailUserinfo(identity: { email: string; username?: string; displayName?: string }) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          id: 'qm-1',
          email: identity.email,
          username: identity.username ?? identity.email.split('@')[0],
          displayName: identity.displayName ?? 'SSO User',
        },
      }),
    }),
  );
}

async function ssoExchange(app: FastifyInstance) {
  return app.inject({
    method: 'POST',
    url: '/auth/sso/exchange',
    payload: { ssoToken: 'eyJhbGciOiJIUzI1NiJ9.valid.looking' },
  });
}

describe('QC-F-537 SSO exchange — case-insensitive identity resolution', () => {
  let app: FastifyInstance | null = null;
  let tokens: ReturnType<typeof makeSessionTokensStub>;

  beforeEach(() => {
    tokens = makeSessionTokensStub();
    app = null;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (app) await app.close();
  });

  it('T1: mixed-case live row -> SSO resolves to THAT account (no duplicate, casing untouched)', async () => {
    const fake = makeFakePrisma([
      makeUser({ id: 'u_mixed', email: 'User@Example.com', username: 'mixed_user' }),
    ]);
    stubQuantMailUserinfo({ email: 'user@example.com' });
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const res = await ssoExchange(app);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.user.id).toBe('u_mixed');
    expect(body.data.isNewUser).toBe(false);
    expect(fake.created).toHaveLength(0);
    expect(fake.users).toHaveLength(1);
    expect(fake.users[0]?.email).toBe('User@Example.com');
    expect(tokens.issueCalls).toHaveLength(1);
    expect(tokens.issueCalls[0]?.userId).toBe('u_mixed');
  });

  it('T2: pre-existing case-duplicate pair -> honest 409 EMAIL_CASE_CONFLICT (login parity), no tokens', async () => {
    const fake = makeFakePrisma([
      makeUser({ id: 'u_dup_a', email: 'User@X.io', username: 'dup_a' }),
      makeUser({ id: 'u_dup_b', email: 'user@x.io', username: 'dup_b' }),
    ]);
    stubQuantMailUserinfo({ email: 'user@x.io' });
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const res = await ssoExchange(app);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'EMAIL_CASE_CONFLICT', message: EMAIL_CASE_CONFLICT_MESSAGE, statusCode: 409 },
    });
    expect(fake.created).toHaveLength(0);
    expect(fake.users).toHaveLength(2);
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('T3: mixed-case DELETED tombstone alone -> 401 ACCOUNT_DELETED (no resurrection duplicate)', async () => {
    const fake = makeFakePrisma([
      makeUser({
        id: 'u_gone_mixed',
        email: 'Gone@Example.com',
        username: 'gone_mixed',
        deletedAt: new Date('2026-10-10T00:00:00Z'),
      }),
    ]);
    stubQuantMailUserinfo({ email: 'gone@example.com' });
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const res = await ssoExchange(app);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'ACCOUNT_DELETED' } });
    expect(fake.created).toHaveLength(0);
    expect(fake.users).toHaveLength(1);
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('T4: exact-case DELETED tombstone -> 401 ACCOUNT_DELETED (QC-F-041 control)', async () => {
    const fake = makeFakePrisma([
      makeUser({
        id: 'u_gone_exact',
        email: 'gone@example.com',
        username: 'gone_exact',
        deletedAt: new Date('2026-10-10T00:00:00Z'),
      }),
    ]);
    stubQuantMailUserinfo({ email: 'gone@example.com' });
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const res = await ssoExchange(app);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'ACCOUNT_DELETED' } });
    expect(fake.created).toHaveLength(0);
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('T5: concurrent first exchange (create loses the email race) -> 200 with the WINNER row, exactly one account', async () => {
    const fake = makeFakePrisma([]);
    fake.setRaceHook(() => {
      fake.users.push(
        makeUser({ id: 'u_winner', email: 'new@example.com', username: 'winner_user' }),
      );
    });
    stubQuantMailUserinfo({ email: 'new@example.com', username: 'new' });
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const res = await ssoExchange(app);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.user.id).toBe('u_winner');
    expect(body.data.isNewUser).toBe(false);
    expect(fake.users).toHaveLength(1);
    expect(tokens.issueCalls).toHaveLength(1);
    expect(tokens.issueCalls[0]?.userId).toBe('u_winner');
  });

  it('T6: username-only collision still retries with a suffix and creates (control)', async () => {
    const fake = makeFakePrisma([
      makeUser({ id: 'u_other', email: 'other@example.com', username: 'newperson' }),
    ]);
    stubQuantMailUserinfo({ email: 'newperson@example.com', username: 'newperson' });
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const res = await ssoExchange(app);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.isNewUser).toBe(true);
    expect(body.data.user.username).not.toBe('newperson');
    expect(fake.users).toHaveLength(2);
  });

  it('T7: brand-new SSO user -> 200 isNewUser, row created with lowercase email (control)', async () => {
    const fake = makeFakePrisma([]);
    stubQuantMailUserinfo({ email: 'newbie@example.com', username: 'newbie' });
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const res = await ssoExchange(app);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.isNewUser).toBe(true);
    expect(fake.users).toHaveLength(1);
    expect(fake.users[0]?.email).toBe('newbie@example.com');
    expect(fake.users[0]?.username).toBe('newbie');
  });

  it('T8: exact-case live row -> 200 same account, no create (control)', async () => {
    const fake = makeFakePrisma([
      makeUser({ id: 'u_exact', email: 'user@example.com', username: 'exact_user' }),
    ]);
    stubQuantMailUserinfo({ email: 'user@example.com' });
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const res = await ssoExchange(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.user.id).toBe('u_exact');
    expect(res.json().data.isNewUser).toBe(false);
    expect(fake.created).toHaveLength(0);
  });

  it('T9: live + tombstone case pair -> the LIVE row wins (login parity) (control)', async () => {
    const fake = makeFakePrisma([
      makeUser({
        id: 'u_tombstone',
        email: 'User@Example.com',
        username: 'tombstone_user',
        deletedAt: new Date('2026-10-10T00:00:00Z'),
      }),
      makeUser({ id: 'u_live', email: 'user@example.com', username: 'live_user' }),
    ]);
    stubQuantMailUserinfo({ email: 'user@example.com' });
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const res = await ssoExchange(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.user.id).toBe('u_live');
    expect(fake.created).toHaveLength(0);
    expect(tokens.issueCalls[0]?.userId).toBe('u_live');
  });

  it('T10: chain pin — SSO on a mixed-case row leaves password login working (200, not the duplicate 409)', async () => {
    const fake = makeFakePrisma([
      makeUser({
        id: 'u_mixed_pw',
        email: 'User@Example.com',
        username: 'mixed_pw',
        passwordHash: syntheticHash(CORRECT_PASSWORD),
      }),
    ]);
    stubQuantMailUserinfo({ email: 'user@example.com' });
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const sso = await ssoExchange(app);
    expect(sso.statusCode).toBe(200);
    expect(fake.users).toHaveLength(1);
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: 'user@example.com', password: CORRECT_PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().success).toBe(true);
  });
});
