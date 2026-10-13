// ============================================================================
// QC-F-118 — POST /auth/refresh is a STATEFUL redemption and
// POST /auth/logout actually revokes, at the route level.
//
// Before this fix the refresh route verified the JWT and minted a new
// pair, full stop: the presented token stayed redeemable for its whole
// 30-day life (replay = free new pairs forever), and there was NO backend
// logout route — sign-out only cleared local copies while the refresh
// token itself lived on. These tests mount the REAL auth routes on a bare
// Fastify instance (F-041 pattern) with an in-memory Prisma fake (stable
// identities) and the REAL SessionTokenIssuer, so the whole chain —
// issuance registration, CAS spend, grace chain-follow, reuse family
// revocation, logout revocation — is exercised end to end. Post-grace
// replay is pinned with a controllable clock in
// refresh-token-store.test.ts; here the no-live-head reuse path is driven
// via logout, which needs no clock.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Stable module-level mocks (same documented pattern as the F-041 / OTP
// suites: the real @quant/auth graph does not resolve in a worktree test
// env, and routes/auth.ts's server-core import is only exercised by the
// SSO path, which these tests do not drive).
vi.mock('@quant/auth', () => ({
  passwordService: {
    verify: async () => false,
    hash: async () => 'stub-hash',
  },
}));
vi.mock('@quant/server-core', () => ({
  fetchWithTimeout: async () => {
    throw new Error('fetchWithTimeout is not exercised by the QC-F-118 route tests');
  },
  getTimeoutMs: () => 1000,
}));

import Fastify, { type FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import authRoutes from '../routes/auth';
import { SessionTokenIssuer } from '../lib/session-tokens';
import { RefreshTokenStore, digestRefreshToken } from '../lib/refresh-token-store';
import type { OtpService } from '../lib/otp-service';

const SECRET = 'test-secret-at-least-32-chars-long-000';
const issuer = new SessionTokenIssuer({
  jwtSecret: SECRET,
  jwtIssuer: 'quantchat',
  jwtAudience: 'quant-ecosystem',
});

// --- In-memory fakes (stable identities) ------------------------------------
interface FakeUser {
  id: string;
  username: string;
  phoneNumber: string | null;
  phoneVerified: boolean;
  deletedAt: Date | null;
}
interface TokenRow {
  id: string;
  userId: string;
  token: string;
  family: string;
  isRevoked: boolean;
  expiresAt: Date;
  createdAt: Date;
}

const users = new Map<string, FakeUser>();
const tokenRows = new Map<string, TokenRow>();

function seedUsers() {
  users.clear();
  users.set('user-alice', {
    id: 'user-alice',
    username: 'alice',
    phoneNumber: '+919000000002',
    phoneVerified: true,
    deletedAt: null,
  });
  users.set('user-deleted', {
    id: 'user-deleted',
    username: 'deleted',
    phoneNumber: '+919000000001',
    phoneVerified: true,
    deletedAt: new Date('2026-10-10T00:00:00Z'),
  });
}

function matches(row: TokenRow, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'expiresAt' && cond && typeof cond === 'object') {
      const gt = (cond as { gt?: Date }).gt;
      if (gt && !(row.expiresAt.getTime() > gt.getTime())) return false;
      continue;
    }
    if ((row as unknown as Record<string, unknown>)[key] !== cond) return false;
  }
  return true;
}

const fakePrisma = {
  user: {
    async findUnique({ where }: { where: { id?: string; phoneNumber?: string } }) {
      if (where.id) return users.get(where.id) ?? null;
      if (where.phoneNumber) {
        return [...users.values()].find((u) => u.phoneNumber === where.phoneNumber) ?? null;
      }
      return null;
    },
    async create({ data }: { data: Record<string, unknown> }) {
      const row: FakeUser = {
        id: `user-created-${users.size + 1}`,
        username: String(data['username']),
        phoneNumber: (data['phoneNumber'] as string | null) ?? null,
        phoneVerified: Boolean(data['phoneVerified']),
        deletedAt: null,
      };
      users.set(row.id, row);
      return row;
    },
    async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
      const row = users.get(where.id);
      if (!row) throw new Error('user not found');
      Object.assign(row, data);
      return row;
    },
  },
  refreshToken: {
    async create({
      data,
    }: {
      data: Omit<TokenRow, 'createdAt' | 'isRevoked'> & { isRevoked?: boolean };
    }) {
      // Prisma's @default(false) on isRevoked is part of the real contract.
      const row: TokenRow = { ...data, isRevoked: data.isRevoked ?? false, createdAt: new Date() };
      tokenRows.set(row.id, row);
      return row;
    },
    async findUnique({ where }: { where: { id: string } }) {
      return tokenRows.get(where.id) ?? null;
    },
    async findFirst({ where }: { where: Record<string, unknown> }) {
      const found = [...tokenRows.values()].filter((r) => matches(r, where));
      found.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return found[0] ?? null;
    },
    async updateMany({ where, data }: { where: Record<string, unknown>; data: { isRevoked: boolean } }) {
      let count = 0;
      for (const row of tokenRows.values()) {
        if (matches(row, where)) {
          row.isRevoked = data.isRevoked;
          count++;
        }
      }
      return { count };
    },
  },
};

const otpServiceStub = {
  verifyCode: () => ({ ok: true }),
  requestCode: async () => ({ ok: true, expiresInSec: 300 }),
} as unknown as OtpService;

let app: FastifyInstance;

async function buildAuthApp(): Promise<FastifyInstance> {
  const instance = Fastify({ logger: false });
  const decorate = (instance as unknown as { decorate: (k: string, v: unknown) => void }).decorate.bind(instance);
  decorate('prisma', fakePrisma as unknown as PrismaClient);
  decorate('otpService', otpServiceStub);
  decorate('sessionTokens', issuer);
  // Install request.auth from a test header, mirroring the real auth
  // plugin's binding (logout is the only route here that reads it).
  instance.addHook('preHandler', async (req) => {
    const userId = req.headers['x-test-user'];
    if (typeof userId === 'string' && userId) {
      (req as unknown as { auth: unknown }).auth = { userId, username: 'tester' };
    }
  });
  await instance.register(authRoutes, { prefix: '/auth' });
  await instance.ready();
  return instance;
}

function decodePayload(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64').toString('utf8')) as Record<string, unknown>;
}

/** Sign a refresh-shaped JWT by hand (for the pre-QC-F-118 legacy shape). */
function signLegacyRefresh(userId: string): string {
  const b64url = (input: Buffer | string) =>
    Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const nowSec = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      sub: userId,
      username: 'alice',
      app: 'quantchat',
      scopes: [],
      role: 'user',
      kind: 'refresh',
      jti: 'legacy-session-id',
      iat: nowSec,
      iss: 'quantchat',
      aud: 'quant-ecosystem',
      exp: nowSec + 3600,
    }),
  );
  const sig = b64url(createHmac('sha256', SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

async function seedSession(user: { userId: string; username: string }) {
  const store = new RefreshTokenStore(fakePrisma as unknown as PrismaClient, issuer);
  return store.issueNewSession(user);
}

beforeEach(async () => {
  seedUsers();
  tokenRows.clear();
  app = await buildAuthApp();
});

afterEach(async () => {
  await app.close();
});

describe('QC-F-118 POST /auth/refresh (stateful)', () => {
  it('redeems a registered token once: 200, successor in the same family, old row spent', async () => {
    const first = await seedSession({ userId: 'user-alice', username: 'alice' });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data as { refreshToken: string };
    const newPayload = decodePayload(data.refreshToken);
    expect(newPayload['fam']).toBe(first.familyId);
    expect(newPayload['jti']).not.toBe(first.refreshTokenId);
    expect(tokenRows.get(first.refreshTokenId)!.isRevoked).toBe(true);
    expect(tokenRows.get(newPayload['jti'] as string)!.isRevoked).toBe(false);
  });

  it('grace: re-presenting the just-rotated token immediately still succeeds (parallel-401 race)', async () => {
    const first = await seedSession({ userId: 'user-alice', username: 'alice' });
    const first1 = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });
    expect(first1.statusCode).toBe(200);
    const again = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: first.refreshToken },
    });
    expect(again.statusCode).toBe(200);
  });

  it('a legacy (pre-QC-F-118, no fam/row) refresh token is refused 401 INVALID_REFRESH_TOKEN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: signLegacyRefresh('user-alice') },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'INVALID_REFRESH_TOKEN' } });
  });

  it('an unregistered (never-issued-by-the-store) token is refused 401 REFRESH_TOKEN_REUSE_DETECTED', async () => {
    const orphan = await issuer.issue({ userId: 'user-alice', username: 'alice' });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: orphan.refreshToken },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'REFRESH_TOKEN_REUSE_DETECTED' },
    });
  });

  it('a deleted user is refused BEFORE any spend: 401 and the token row stays unspent', async () => {
    const session = await seedSession({ userId: 'user-deleted', username: 'deleted' });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'INVALID_REFRESH_TOKEN' } });
    expect(tokenRows.get(session.refreshTokenId)!.isRevoked).toBe(false);
  });
});

describe('QC-F-118 POST /auth/logout (revocation)', () => {
  it('logout kills the refresh token: a later refresh is 401 REFRESH_TOKEN_REUSE_DETECTED', async () => {
    const session = await seedSession({ userId: 'user-alice', username: 'alice' });

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { 'x-test-user': 'user-alice' },
      payload: { refreshToken: session.refreshToken },
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toMatchObject({ success: true, data: { signedOut: true } });

    const refresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });
    expect(refresh.statusCode).toBe(401);
    expect(refresh.json()).toMatchObject({
      success: false,
      error: { code: 'REFRESH_TOKEN_REUSE_DETECTED' },
    });
  });

  it('logout without an authenticated caller is 401 (route is NOT public)', async () => {
    const session = await seedSession({ userId: 'user-alice', username: 'alice' });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken: session.refreshToken },
    });
    expect(res.statusCode).toBe(401);
    // And the session is untouched.
    expect(tokenRows.get(session.refreshTokenId)!.isRevoked).toBe(false);
  });

  it("logout with SOMEONE ELSE's identity revokes nothing (user binding)", async () => {
    const session = await seedSession({ userId: 'user-alice', username: 'alice' });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { 'x-test-user': 'user-bob' },
      payload: { refreshToken: session.refreshToken },
    });
    expect(res.statusCode).toBe(200);
    const refresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });
    expect(refresh.statusCode).toBe(200);
  });

  it('logout validates its body: missing refreshToken → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { 'x-test-user': 'user-alice' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('QC-F-118 issuance registration (OTP verify)', () => {
  it('OTP verify registers the issued refresh token row (digest only)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { phoneNumber: '+919000000002', otp: '123456' },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data as { refreshToken: string };
    const jti = decodePayload(data.refreshToken)['jti'] as string;
    const row = tokenRows.get(jti);
    expect(row).toBeTruthy();
    expect(row!.token).toBe(digestRefreshToken(data.refreshToken));
    expect(row!.token).not.toBe(data.refreshToken);
  });
});
