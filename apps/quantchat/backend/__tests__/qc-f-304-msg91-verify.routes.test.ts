// ============================================================================
// QC-F-304 — MSG91 widget OTP verify must bind identity to the VERIFIED
// number only.
//
// Before this fix the branch in POST /auth/otp/verify did:
//     const verifiedMobile = verifyData.data.mobile || phoneNumber;
// so when the provider omitted `mobile`, the session was issued for
// whatever number the (unauthenticated) caller put in the body — a full
// account takeover of any phone account, needing only a widget token
// verified for the attacker's own number. The branch was additionally
// unreachable: verifySchema only accepted ^\d{4,8}$ OTPs, so a
// "msg91:<jwt>" token died as a 400 before ever reaching it — a latent
// fail-open landmine armed the day the schema is widened for a widget
// revival.
//
// This suite mounts the REAL auth routes on a bare Fastify instance
// (F-041/F-118 pattern) with an in-memory Prisma fake (stable,
// module-level identities), a counting sessionTokens stub, and a stubbed
// global fetch for the MSG91 verifyAccessToken call. Slice 1 pins:
//   - provider mobile missing/empty/blank  -> 401 OTP_INVALID, no session
//   - provider mobile != body phoneNumber  -> 401 OTP_INVALID, no session
//     (digit-canonical comparison: "+91…" and "91…" are the same number)
//   - provider mobile == body number       -> the pre-existing 200 path
//   - schema admits "msg91:<token>" (>=10 non-space chars) while plain
//     digit OTPs keep flowing to the local path unchanged
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Stable module-level mocks (F-041/F-062 documented pattern: the real
// @quant/auth graph does not resolve in a worktree test env, and the
// server-core import is only exercised by the SSO path).
vi.mock('@quant/auth', () => ({
  passwordService: {
    verify: async () => false,
    hash: async () => 'stub-hash',
  },
}));
vi.mock('@quant/server-core', () => ({
  fetchWithTimeout: async () => {
    throw new Error('fetchWithTimeout is not exercised by the QC-F-304 route tests');
  },
  getTimeoutMs: () => 1000,
}));

import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import authRoutes from '../routes/auth';
import type { OtpService } from '../lib/otp-service';
import type { SessionTokenIssuer } from '../lib/session-tokens';

// --- Stable identities -------------------------------------------------------
const ATTACKER_PHONE = '+919000000101';
const VICTIM_PHONE = '+919000000202';
const DELETED_PHONE = '+919000000303';
const MSG91_TOKEN = 'msg91:test-token-abcdef0123456789';

interface FakeUser {
  id: string;
  username: string;
  phoneNumber: string | null;
  phoneVerified: boolean;
  deletedAt: Date | null;
}

const usersByPhone = new Map<string, FakeUser>();
const createdUsers: FakeUser[] = [];
const issueCalls: { userId: string; username: string }[] = [];
const refreshRows: Record<string, unknown>[] = [];
let fetchCalls = 0;
let providerBehavior: { kind: 'json'; body: unknown } | { kind: 'throw' } = {
  kind: 'json',
  body: { type: 'success', data: { mobile: ATTACKER_PHONE, verified: true } },
};

function seedUsers() {
  usersByPhone.clear();
  createdUsers.length = 0;
  issueCalls.length = 0;
  refreshRows.length = 0;
  fetchCalls = 0;
  usersByPhone.set(ATTACKER_PHONE, {
    id: 'user-attacker',
    username: 'attacker',
    phoneNumber: ATTACKER_PHONE,
    phoneVerified: true,
    deletedAt: null,
  });
  usersByPhone.set(VICTIM_PHONE, {
    id: 'user-victim',
    username: 'victim',
    phoneNumber: VICTIM_PHONE,
    phoneVerified: true,
    deletedAt: null,
  });
  usersByPhone.set(DELETED_PHONE, {
    id: 'user-deleted',
    username: 'deleted',
    phoneNumber: DELETED_PHONE,
    phoneVerified: true,
    deletedAt: new Date('2026-10-10T00:00:00Z'),
  });
}

const fakePrisma = {
  user: {
    async findUnique({ where }: { where: { phoneNumber: string } }) {
      return usersByPhone.get(where.phoneNumber) ?? null;
    },
    async create({ data }: { data: Record<string, unknown> }) {
      const row: FakeUser = {
        id: `user-created-${createdUsers.length + 1}`,
        username: String(data['username']),
        phoneNumber: (data['phoneNumber'] as string | null) ?? null,
        phoneVerified: Boolean(data['phoneVerified']),
        deletedAt: null,
      };
      createdUsers.push(row);
      if (row.phoneNumber) usersByPhone.set(row.phoneNumber, row);
      return row;
    },
    async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
      for (const row of usersByPhone.values()) {
        if (row.id === where.id) {
          Object.assign(row, data);
          return row;
        }
      }
      throw new Error('user not found');
    },
  },
  refreshToken: {
    async create({ data }: { data: Record<string, unknown> }) {
      refreshRows.push(data);
      return data;
    },
  },
};

function b64urlJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

const sessionTokensStub = {
  issue: async (subject: { userId: string; username: string }) => {
    issueCalls.push({ ...subject });
    const n = issueCalls.length;
    const payload = b64urlJson({
      sub: subject.userId,
      jti: `rt-${n}`,
      fam: 'fam-qc-f-304',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    return {
      accessToken: `access-${n}`,
      refreshToken: `${b64urlJson({ alg: 'HS256', typ: 'JWT' })}.${payload}.sig`,
      expiresIn: 3600,
      tokenType: 'Bearer' as const,
      refreshTokenId: `rt-${n}`,
      familyId: 'fam-qc-f-304',
    };
  },
};

const otpServiceStub = {
  verifyCode: () => ({ ok: true }),
  requestCode: async () => ({ ok: true, expiresInSec: 300 }),
} as unknown as OtpService;

let app: FastifyInstance;
const savedAuthKey = process.env['MSG91_AUTH_KEY'];

async function buildApp(): Promise<FastifyInstance> {
  const instance = Fastify({ logger: false });
  const decorate = (
    instance as unknown as { decorate: (k: string, v: unknown) => void }
  ).decorate.bind(instance);
  decorate('prisma', fakePrisma as unknown as PrismaClient);
  decorate('otpService', otpServiceStub);
  decorate('sessionTokens', sessionTokensStub as unknown as SessionTokenIssuer);
  await instance.register(authRoutes, { prefix: '/auth' });
  await instance.ready();
  return instance;
}

function verifyRequest(phoneNumber: string, otp: string = MSG91_TOKEN) {
  return app.inject({
    method: 'POST',
    url: '/auth/otp/verify',
    payload: { phoneNumber, otp },
  });
}

beforeEach(async () => {
  seedUsers();
  providerBehavior = {
    kind: 'json',
    body: { type: 'success', data: { mobile: ATTACKER_PHONE, verified: true } },
  };
  process.env['MSG91_AUTH_KEY'] = 'test-auth-key';
  vi.stubGlobal('fetch', async () => {
    fetchCalls++;
    const behavior = providerBehavior;
    if (behavior.kind === 'throw') throw new Error('network down');
    const body = behavior.body;
    return { json: async () => body };
  });
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
  if (savedAuthKey === undefined) delete process.env['MSG91_AUTH_KEY'];
  else process.env['MSG91_AUTH_KEY'] = savedAuthKey;
});

describe('QC-F-304 POST /auth/otp/verify (MSG91 widget branch)', () => {
  it('1. happy path: provider mobile == body number (existing user) → 200, session for that user, isNewUser:false', async () => {
    const res = await verifyRequest(ATTACKER_PHONE);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.user.id).toBe('user-attacker');
    expect(body.data.isNewUser).toBe(false);
    expect(issueCalls).toEqual([{ userId: 'user-attacker', username: 'attacker' }]);
    expect(createdUsers).toHaveLength(0);
  });

  it('2. provider returns verified with NO mobile, body = VICTIM → 401 OTP_INVALID, no session, no user created', async () => {
    providerBehavior = { kind: 'json', body: { type: 'success', data: { verified: true } } };
    const res = await verifyRequest(VICTIM_PHONE);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('OTP_INVALID');
    expect(issueCalls).toHaveLength(0);
    expect(createdUsers).toHaveLength(0);
    expect(usersByPhone.get(VICTIM_PHONE)!.id).toBe('user-victim');
  });

  it("3. provider mobile = '' (empty string), body = VICTIM → 401, no session, no create", async () => {
    providerBehavior = {
      kind: 'json',
      body: { type: 'success', data: { mobile: '', verified: true } },
    };
    const res = await verifyRequest(VICTIM_PHONE);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('OTP_INVALID');
    expect(issueCalls).toHaveLength(0);
    expect(createdUsers).toHaveLength(0);
  });

  it("4. provider mobile = '   ' (whitespace only), body = VICTIM → 401, no session", async () => {
    providerBehavior = {
      kind: 'json',
      body: { type: 'success', data: { mobile: '   ', verified: true } },
    };
    const res = await verifyRequest(VICTIM_PHONE);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('OTP_INVALID');
    expect(issueCalls).toHaveLength(0);
  });

  it('5. mismatch: provider mobile = ATTACKER, body = VICTIM → 401 OTP_INVALID, no session for anyone', async () => {
    providerBehavior = {
      kind: 'json',
      body: { type: 'success', data: { mobile: ATTACKER_PHONE, verified: true } },
    };
    const res = await verifyRequest(VICTIM_PHONE);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('OTP_INVALID');
    expect(issueCalls).toHaveLength(0);
    expect(createdUsers).toHaveLength(0);
  });

  it("6. digit-canonical match: provider mobile '919000000101' (no +), body '+919000000101' → 200, session for that user", async () => {
    // The stored key form follows whoever created the account: a user
    // created through this very branch is stored in the provider's form
    // (no '+'). Seed the attacker in that form for this case — the pin is
    // that a FORMAT-only difference must not reject a verified match.
    // (The '+'-form duplicate-account nuance for local-path users is the
    // brief §3.3 recorded follow-up, deliberately NOT fixed in Slice 1.)
    const attacker = usersByPhone.get(ATTACKER_PHONE)!;
    usersByPhone.delete(ATTACKER_PHONE);
    usersByPhone.set('919000000101', { ...attacker, phoneNumber: '919000000101' });
    providerBehavior = {
      kind: 'json',
      body: { type: 'success', data: { mobile: '919000000101', verified: true } },
    };
    const res = await verifyRequest(ATTACKER_PHONE);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.user.id).toBe('user-attacker');
    expect(issueCalls).toEqual([{ userId: 'user-attacker', username: 'attacker' }]);
  });

  it("7. provider type:'error' / verified:false → 401 OTP_INVALID, no session (pre-existing behaviour kept)", async () => {
    providerBehavior = { kind: 'json', body: { type: 'error', data: { verified: false } } };
    const res = await verifyRequest(ATTACKER_PHONE);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('OTP_INVALID');
    expect(issueCalls).toHaveLength(0);
  });

  it('8. provider fetch rejects (network down) → 500 OTP_VERIFY_ERROR, no session (pre-existing catch kept)', async () => {
    providerBehavior = { kind: 'throw' };
    const res = await verifyRequest(ATTACKER_PHONE);
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('OTP_VERIFY_ERROR');
    expect(issueCalls).toHaveLength(0);
  });

  it('9. MSG91_AUTH_KEY unset → 500 OTP_CONFIG, provider never called', async () => {
    delete process.env['MSG91_AUTH_KEY'];
    const res = await verifyRequest(ATTACKER_PHONE);
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('OTP_CONFIG');
    expect(fetchCalls).toBe(0);
    expect(issueCalls).toHaveLength(0);
  });

  it("10. schema: otp='msg91:short' → 400 BAD_REQUEST (provider never called); plain digits still reach the local path → 200", async () => {
    const short = await verifyRequest(ATTACKER_PHONE, 'msg91:short');
    expect(short.statusCode).toBe(400);
    expect(short.json().error.code).toBe('BAD_REQUEST');
    expect(fetchCalls).toBe(0);

    const local = await verifyRequest(ATTACKER_PHONE, '123456');
    expect(local.statusCode).toBe(200);
    expect(local.json().data.user.id).toBe('user-attacker');
    expect(issueCalls).toHaveLength(1);
  });

  it('11. provider mobile == soft-deleted user → 401 ACCOUNT_DELETED, no session (QC-F-041 behaviour kept on this branch)', async () => {
    providerBehavior = {
      kind: 'json',
      body: { type: 'success', data: { mobile: DELETED_PHONE, verified: true } },
    };
    const res = await verifyRequest(DELETED_PHONE);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('ACCOUNT_DELETED');
    expect(issueCalls).toHaveLength(0);
  });
});
