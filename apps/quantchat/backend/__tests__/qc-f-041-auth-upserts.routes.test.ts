// ============================================================================
// QC-F-041 — sign-in paths must never mint tokens for a deleted account,
// /auth/me must not serve a deleted identity, and DELETE /settings/account
// must enforce revocation on this process (cache invalidate + live-socket
// close).
//
// Before this fix:
//   - POST /auth/otp/verify on a deleted phone number minted a BRAND-NEW
//     token pair for the deleted row (upsertPhoneUser had no deletedAt
//     handling at all) — account deletion was fully reversible by whoever
//     held the phone, forever.
//   - POST /auth/sso/exchange on a deleted email died as a 500: the lookup
//     filtered deletedAt: null, so the deleted row was invisible and the
//     create path collided with the email unique constraint.
//   - GET /auth/me returned the full profile for a deleted user (200).
//   - DELETE /settings/account only stamped deletedAt; the comment on it
//     claimed an auth-layer deletedAt check that did not exist.
//
// These tests mount the REAL route plugins on a bare Fastify instance
// (F-017 pattern). A preHandler hook installs request.auth the way the
// real auth plugin does; only Prisma is an in-memory fake with stable
// identities, and the OTP/session-token decorations are stubs that record
// whether a token pair was issued. Every QC-F-041 assertion FAILS against
// the pre-fix code (negative control in the build report).
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// routes/auth.ts imports passwordService from @quant/auth, whose real
// module graph reaches @quant/database — in a worktree/symlink test env
// that chain does not resolve (the same documented artifact that makes
// the buildApp suites load-fail locally but pass in CI). The only
// passwordService use in these tests is the login dummy-hash verify on
// the no-user path, which must simply not match — a stable module-level
// stub keeps the suite loadable in both environments.
vi.mock('@quant/auth', () => ({
  passwordService: {
    verify: async () => false,
    hash: async () => 'stub-hash',
  },
}));

import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { WebSocket } from '@fastify/websocket';

import authRoutes from '../routes/auth';
import settingsRoutes from '../routes/settings';
import {
  registerLiveSocket,
  unregisterLiveSocket,
  closeLiveSocketsForUser,
} from '../routes/websocket';
import { createAccountStatusGate, type AccountStatusGate } from '../lib/account-status';
import type { OtpService } from '../lib/otp-service';
import type { SessionTokenIssuer } from '../lib/session-tokens';

// ---------------------------------------------------------------------------
// Stable identities (module-level — no fresh-identity mocks).
// ---------------------------------------------------------------------------
const DELETED_PHONE = '+919000000001';
const ACTIVE_PHONE = '+919000000002';
const DELETED_EMAIL = 'deleted@example.com';
const ACTIVE_EMAIL = 'active@example.com';

interface FakeUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  phoneNumber: string | null;
  phoneVerified: boolean;
  passwordHash: string;
  bio: string | null;
  avatarUrl: string | null;
  xpPoints: number;
  level: number;
  status: string;
  deletedAt: Date | null;
}

function seedUsers(): FakeUser[] {
  return [
    {
      id: 'user_deleted_phone',
      email: 'phone_deleted@phone.quantchat.local',
      username: 'qc_deleted',
      displayName: 'Deleted Phone User',
      role: 'USER',
      phoneNumber: DELETED_PHONE,
      phoneVerified: true,
      passwordHash: '!unusable',
      bio: null,
      avatarUrl: null,
      xpPoints: 0,
      level: 1,
      status: 'PENDING_VERIFICATION',
      deletedAt: new Date('2026-10-10T00:00:00Z'),
    },
    {
      id: 'user_active_phone',
      email: 'phone_active@phone.quantchat.local',
      username: 'qc_active',
      displayName: 'Active Phone User',
      role: 'USER',
      phoneNumber: ACTIVE_PHONE,
      phoneVerified: true,
      passwordHash: '!unusable',
      bio: null,
      avatarUrl: null,
      xpPoints: 0,
      level: 1,
      status: 'PENDING_VERIFICATION',
      deletedAt: null,
    },
    {
      id: 'user_deleted_email',
      email: DELETED_EMAIL,
      username: 'deleted_email',
      displayName: 'Deleted Email User',
      role: 'USER',
      phoneNumber: null,
      phoneVerified: false,
      passwordHash: '!unusable',
      bio: 'gone',
      avatarUrl: null,
      xpPoints: 5,
      level: 2,
      status: 'ACTIVE',
      deletedAt: new Date('2026-10-10T00:00:00Z'),
    },
    {
      id: 'user_active_email',
      email: ACTIVE_EMAIL,
      username: 'active_email',
      displayName: 'Active Email User',
      role: 'USER',
      phoneNumber: null,
      phoneVerified: false,
      passwordHash: '!unusable',
      bio: null,
      avatarUrl: null,
      xpPoints: 0,
      level: 1,
      status: 'ACTIVE',
      deletedAt: null,
    },
  ];
}

function uniqueViolation(): Error & { code: string } {
  const err = new Error('Unique constraint failed') as Error & { code: string };
  err.code = 'P2002';
  return err;
}

function makeFakePrisma(users: FakeUser[]) {
  const created: Record<string, unknown>[] = [];
  const prisma = {
    // QC-F-118: sign-in issuance registers the refresh token's row; this
    // suite pins WHO may be issued a pair, not redemption, so the
    // delegate only accepts the registration write.
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
        let row: FakeUser | undefined;
        if (typeof where['email'] === 'string') {
          row = users.find((u) => u.email === where['email']);
        } else if (
          where['email'] &&
          typeof where['email'] === 'object' &&
          'equals' in (where['email'] as Record<string, unknown>)
        ) {
          // QC-F-537: the SSO tombstone check queries findFirst with a
          // direct { equals, mode: 'insensitive' } email condition; match
          // it faithfully like the findMany plumbing below. (Harness
          // plumbing only: every QC-F-041 assertion is unchanged.)
          const { equals, mode } = where['email'] as { equals: unknown; mode?: string };
          if (typeof equals === 'string') {
            row = users.find((u) =>
              mode === 'insensitive'
                ? u.email.toLowerCase() === equals.toLowerCase()
                : u.email === equals,
            );
          }
        } else if (Array.isArray(where['OR'])) {
          const or = where['OR'] as Record<string, string>[];
          row = users.find(
            (u) =>
              u.email === or[0]?.['email'] ||
              u.username === or[1]?.['username'] ||
              u.phoneNumber === or[2]?.['phoneNumber'],
          );
        }
        if (!row) return null;
        // Honour the deletedAt: null filter exactly like Prisma would.
        if (where['deletedAt'] === null && row.deletedAt) return null;
        return row;
      },
      async findMany({ where, take }: { where: Record<string, unknown>; take?: number }) {
        // QC-F-501: password login now queries with { equals, mode:
        // 'insensitive' } conditions (findMany, take: 2). Match them
        // faithfully — case-insensitive equality, the deletedAt: null
        // filter and take exactly like Prisma would. (Harness plumbing
        // only: every QC-F-041 assertion in this file is unchanged.)
        const matchesField = (stored: string | null, cond: unknown): boolean => {
          if (typeof cond === 'string') return stored === cond;
          if (cond && typeof cond === 'object' && 'equals' in (cond as Record<string, unknown>)) {
            const { equals, mode } = cond as { equals: unknown; mode?: string };
            if (stored === null || typeof equals !== 'string') return false;
            return mode === 'insensitive'
              ? stored.toLowerCase() === equals.toLowerCase()
              : stored === equals;
          }
          return false;
        };
        let rows = users;
        if (Array.isArray(where['OR'])) {
          const or = where['OR'] as Record<string, unknown>[];
          rows = rows.filter((u) =>
            or.some((branch) => {
              if ('email' in branch) return matchesField(u.email, branch['email']);
              if ('username' in branch) return matchesField(u.username, branch['username']);
              if ('phoneNumber' in branch) return matchesField(u.phoneNumber, branch['phoneNumber']);
              return false;
            }),
          );
        }
        // QC-F-537: the SSO upsert now also queries findMany with a DIRECT
        // (non-OR) email condition — the same { equals, mode: 'insensitive' }
        // shape, matched with the same faithfulness. (Harness plumbing
        // only: every QC-F-041 assertion in this file is unchanged.)
        if ('email' in where) {
          rows = rows.filter((u) => matchesField(u.email, where['email']));
        }
        if (where['deletedAt'] === null) rows = rows.filter((u) => !u.deletedAt);
        return typeof take === 'number' ? rows.slice(0, take) : rows;
      },
      async create({ data }: { data: Record<string, unknown> }) {
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
          passwordHash: String(data['passwordHash'] ?? '!unusable'),
          bio: null,
          avatarUrl: null,
          xpPoints: 0,
          level: 1,
          status: String(data['status'] ?? 'PENDING_VERIFICATION'),
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
  return { prisma: prisma as unknown as PrismaClient, created, users };
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
        // QC-F-118: the issuer contract now carries the refresh row id +
        // family so callers can register the pair with the store.
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
  authUser?: { userId: string; username: string },
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
  if (authUser) {
    app.addHook('preHandler', async (req) => {
      (req as unknown as { auth: unknown }).auth = {
        userId: authUser.userId,
        username: authUser.username,
        email: '',
        role: 'user',
        scopes: [],
        sessionId: 'sess_test',
        app: 'quantchat',
        tokenId: 'tok_test',
      };
    });
  }
  await app.register(authRoutes, { prefix: '/auth' });
  await app.ready();
  return app;
}

function stubQuantMailUserinfo(email: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { id: 'qm-1', email, username: email.split('@')[0], displayName: 'SSO User' },
      }),
    }),
  );
}

describe('QC-F-041 sign-in paths never mint tokens for a deleted account', () => {
  let app: FastifyInstance | null = null;
  let fake: ReturnType<typeof makeFakePrisma>;
  let tokens: ReturnType<typeof makeSessionTokensStub>;

  beforeEach(() => {
    fake = makeFakePrisma(seedUsers());
    tokens = makeSessionTokensStub();
    app = null;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (app) await app.close();
  });

  it('OTP verify for a DELETED phone user -> 401 ACCOUNT_DELETED, no token pair issued, no create', async () => {
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { phoneNumber: DELETED_PHONE, otp: '123456' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'ACCOUNT_DELETED' } });
    expect(tokens.issueCalls).toHaveLength(0);
    expect(fake.created).toHaveLength(0);
  });

  it('OTP verify for an ACTIVE phone user -> 200 with a token pair (control)', async () => {
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { phoneNumber: ACTIVE_PHONE, otp: '123456' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(tokens.issueCalls).toHaveLength(1);
    expect(tokens.issueCalls[0]?.userId).toBe('user_active_phone');
  });

  it('OTP verify for a NEW phone user -> 200 isNewUser (control)', async () => {
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { phoneNumber: '+919000000099', otp: '123456' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.isNewUser).toBe(true);
    expect(tokens.issueCalls).toHaveLength(1);
  });

  it('SSO exchange for a DELETED email -> 401 ACCOUNT_DELETED (not the old accidental 500), no create, no tokens', async () => {
    stubQuantMailUserinfo(DELETED_EMAIL);
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/exchange',
      payload: { ssoToken: 'eyJhbGciOiJIUzI1NiJ9.valid.looking' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'ACCOUNT_DELETED' } });
    expect(fake.created).toHaveLength(0);
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('SSO exchange for an ACTIVE email -> 200 with tokens (control)', async () => {
    stubQuantMailUserinfo(ACTIVE_EMAIL);
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/exchange',
      payload: { ssoToken: 'eyJhbGciOiJIUzI1NiJ9.valid.looking' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(tokens.issueCalls).toHaveLength(1);
  });

  it('password login for a deleted identifier stays 401 INVALID_CREDENTIALS (existing behaviour pin)', async () => {
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: DELETED_EMAIL, password: 'Password123!' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'INVALID_CREDENTIALS' } });
    expect(tokens.issueCalls).toHaveLength(0);
  });
});

describe('QC-F-041 GET /auth/me refuses a deleted identity', () => {
  let app: FastifyInstance | null = null;
  let fake: ReturnType<typeof makeFakePrisma>;
  let tokens: ReturnType<typeof makeSessionTokensStub>;

  beforeEach(() => {
    fake = makeFakePrisma(seedUsers());
    tokens = makeSessionTokensStub();
    app = null;
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('deleted user -> 401 ACCOUNT_DELETED and no profile fields leak', async () => {
    app = await buildAuthApp(fake.prisma, tokens.stub, {
      userId: 'user_deleted_email',
      username: 'deleted_email',
    });
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body).toMatchObject({ success: false, error: { code: 'ACCOUNT_DELETED' } });
    expect(body.data).toBeUndefined();
  });

  it('active user -> 200 with the profile exactly as before (control)', async () => {
    app = await buildAuthApp(fake.prisma, tokens.stub, {
      userId: 'user_active_email',
      username: 'active_email',
    });
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ id: 'user_active_email', email: ACTIVE_EMAIL });
  });
});

describe('QC-F-041 DELETE /settings/account revocation side-effects', () => {
  let app: FastifyInstance | null = null;
  let fake: ReturnType<typeof makeFakePrisma>;

  beforeEach(() => {
    fake = makeFakePrisma(seedUsers());
    app = null;
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  async function buildSettingsApp(gate?: AccountStatusGate) {
    const instance = Fastify({ logger: false });
    (instance as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
      'prisma',
      fake.prisma,
    );
    if (gate) {
      (instance as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
        'accountStatusGate',
        gate,
      );
    }
    instance.addHook('preHandler', async (req) => {
      (req as unknown as { auth: unknown }).auth = {
        userId: 'user_active_email',
        username: 'active_email',
        email: '',
        role: 'user',
        scopes: [],
        sessionId: 'sess_test',
        app: 'quantchat',
        tokenId: 'tok_test',
      };
    });
    await instance.register(settingsRoutes, { prefix: '/settings' });
    await instance.ready();
    return instance;
  }

  function fakeSocket() {
    const socket = {
      readyState: 1,
      OPEN: 1,
      send: vi.fn(),
      close: vi.fn(),
    };
    return socket as unknown as WebSocket & {
      send: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    };
  }

  it('stamps deletedAt, invalidates the cached verdict, and closes the user\u2019s live sockets', async () => {
    const gate = createAccountStatusGate(() => fake.prisma, { ttlMs: 30_000 });
    // Prime the cache with an 'ok' verdict for the still-active user.
    await expect(gate.resolver('user_active_email')).resolves.toBe('ok');

    const socket = fakeSocket();
    registerLiveSocket('user_active_email', socket);

    app = await buildSettingsApp(gate);
    const res = await app.inject({ method: 'DELETE', url: '/settings/account' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, data: { deleted: true } });

    const row = fake.users.find((u) => u.id === 'user_active_email');
    expect(row?.deletedAt).toBeInstanceOf(Date);

    // The primed 'ok' verdict must be gone: this very process now reports
    // the account deleted, without waiting out the 30s TTL.
    await expect(gate.resolver('user_active_email')).resolves.toBe('deleted');

    // The socket opened BEFORE the delete got the ACCOUNT_DELETED frame
    // and a 4001 close.
    expect(socket.send).toHaveBeenCalledTimes(1);
    const frame = JSON.parse(String(socket.send.mock.calls[0]?.[0]));
    expect(frame).toMatchObject({ type: 'error', code: 'ACCOUNT_DELETED' });
    expect(socket.close).toHaveBeenCalledWith(4001, 'ACCOUNT_DELETED');
  });

  it('still stamps deletedAt and returns 200 when no gate/socket plumbing is present', async () => {
    app = await buildSettingsApp(undefined);
    const res = await app.inject({ method: 'DELETE', url: '/settings/account' });
    expect(res.statusCode).toBe(200);
    const row = fake.users.find((u) => u.id === 'user_active_email');
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });
});

describe('QC-F-041 live-socket registry', () => {
  function fakeSocket() {
    const socket = {
      readyState: 1,
      OPEN: 1,
      send: vi.fn(),
      close: vi.fn(),
    };
    return socket as unknown as WebSocket & {
      send: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    };
  }

  it('closeLiveSocketsForUser closes only that user\u2019s sockets and reports the count', () => {
    const a1 = fakeSocket();
    const a2 = fakeSocket();
    const b1 = fakeSocket();
    registerLiveSocket('user-a', a1);
    registerLiveSocket('user-a', a2);
    registerLiveSocket('user-b', b1);

    expect(closeLiveSocketsForUser('user-a', 'ACCOUNT_SUSPENDED')).toBe(2);
    expect(a1.close).toHaveBeenCalledWith(4001, 'ACCOUNT_SUSPENDED');
    expect(a2.close).toHaveBeenCalledWith(4001, 'ACCOUNT_SUSPENDED');
    expect(b1.close).not.toHaveBeenCalled();

    // Registry entry is drained — a second close is a no-op.
    expect(closeLiveSocketsForUser('user-a', 'ACCOUNT_SUSPENDED')).toBe(0);
    unregisterLiveSocket('user-b', b1);
    expect(closeLiveSocketsForUser('user-b', 'ACCOUNT_DELETED')).toBe(0);
  });
});
