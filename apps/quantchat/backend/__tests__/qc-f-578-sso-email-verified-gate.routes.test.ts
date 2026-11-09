// ============================================================================
// QC-F-578 (P0) — SSO exchange must fail closed when QuantMail does NOT
// prove the email is verified.
//
// The takeover: QuantMail's GET /oauth/userinfo returns NO email_verified
// field (only the OIDC id_token carries it, which the exchange never sees).
// The old code treated that silence as "verified": upsertSsoUser matched the
// victim's live QuantChat row by email and recordLogin stamped
// emailVerified:true/isVerified:true on it, then native session tokens were
// issued — logged in AS THE VICTIM with an UNVERIFIED QuantMail account.
//
// The fix: the ONLY acceptable proof is an explicit email_verified === true
// on the verified userinfo response. Anything else — absent (QuantMail's
// current behaviour), false, or a non-boolean — is refused with
// 403 SSO_EMAIL_UNVERIFIED, with NO upsert and NO tokens. And
// upsertSsoUser/recordLogin never fabricate verification flags: they set
// them only from the caller's verification proof.
//
// These tests mount the REAL authRoutes plugin on a bare Fastify instance
// (QC-F-041/QC-F-537 pattern). Prisma is an in-memory fake with stable
// identities whose findMany/findFirst faithfully implement the two query
// shapes the fixed upsertSsoUser uses (insensitive { equals, mode } email +
// the deletedAt: null live filter). QuantMail's userinfo is stubbed fetch,
// like the other SSO test files.
//
// Negative-control signature: on PRE-FIX code (no gate, unconditional
// emailVerified:true) N1/N2/N3/N4 FAIL — the exchange returns 200 and
// stamps emailVerified:true on the victim row. On fixed code the whole
// file passes.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

import authRoutes from '../routes/auth';
import type { OtpService } from '../lib/otp-service';
import type { SessionTokenIssuer } from '../lib/session-tokens';

// ---------------------------------------------------------------------------
// Stable synthetic identities.
// ---------------------------------------------------------------------------
interface FakeUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  phoneNumber: string | null;
  passwordHash: string;
  emailVerified: boolean;
  isVerified: boolean;
  deletedAt: Date | null;
}

function makeUser(partial: Partial<FakeUser> & { id: string; email: string }): FakeUser {
  return {
    username: `user_${partial.id}`,
    displayName: 'Test User',
    role: 'USER',
    phoneNumber: null,
    passwordHash: '!unusable-marker',
    emailVerified: false,
    isVerified: false,
    deletedAt: null,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Faithful in-memory Prisma fake (QC-F-537 pattern).
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
  if ('email' in where) return fieldMatches(user.email, where['email']);
  return true;
}

function makeFakePrisma(users: FakeUser[]) {
  const created: Record<string, unknown>[] = [];
  const prisma = {
    refreshToken: {
      async create({ data }: { data: Record<string, unknown> }) {
        return data;
      },
    },
    user: {
      async findFirst({ where }: { where: Record<string, unknown> }) {
        return users.find((u) => rowMatches(u, where)) ?? null;
      },
      async findMany({ where, take }: { where: Record<string, unknown>; take?: number }) {
        const rows = users.filter((u) => rowMatches(u, where));
        return typeof take === 'number' ? rows.slice(0, take) : rows;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        if (users.some((u) => u.email === String(data['email']))) {
          const err = new Error('Unique constraint failed') as Error & { code: string };
          err.code = 'P2002';
          throw err;
        }
        const row: FakeUser = {
          id: `user_created_${users.length + 1}`,
          email: String(data['email']),
          username: String(data['username']),
          displayName: String(data['displayName'] ?? 'QuantChat User'),
          role: 'USER',
          phoneNumber: null,
          passwordHash: String(data['passwordHash'] ?? '!unusable-marker'),
          emailVerified: Boolean(data['emailVerified']),
          isVerified: Boolean(data['isVerified']),
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

/**
 * Stub QuantMail's /oauth/userinfo. `emailVerified` maps onto the response's
 * email_verified field; `undefined` means the field is ABSENT — which is
 * QuantMail's real current behaviour (the takeover precondition).
 */
function stubQuantMailUserinfo(email: string, emailVerified?: unknown) {
  const data: Record<string, unknown> = {
    id: 'qm-1',
    email,
    username: email.split('@')[0],
    displayName: 'SSO User',
  };
  if (emailVerified !== undefined) data['email_verified'] = emailVerified;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data }) }),
  );
}

async function ssoExchange(app: FastifyInstance) {
  return app.inject({
    method: 'POST',
    url: '/auth/sso/exchange',
    payload: { ssoToken: 'eyJhbGciOiJIUzI1NiJ9.valid.looking' },
  });
}

describe('QC-F-578 SSO exchange — email verification gate', () => {
  let app: FastifyInstance | null = null;
  let fake: ReturnType<typeof makeFakePrisma>;
  let tokens: ReturnType<typeof makeSessionTokensStub>;

  beforeEach(() => {
    fake = makeFakePrisma([]);
    tokens = makeSessionTokensStub();
    app = null;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (app) await app.close();
  });

  it('N1: userinfo with NO email_verified field (current QuantMail) -> 403 SSO_EMAIL_UNVERIFIED, no upsert, no tokens', async () => {
    stubQuantMailUserinfo('victim@example.com'); // email_verified ABSENT
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const res = await ssoExchange(app);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'SSO_EMAIL_UNVERIFIED', statusCode: 403 },
    });
    expect(fake.created).toHaveLength(0);
    expect(fake.users).toHaveLength(0);
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('N2: email_verified:false -> 403 SSO_EMAIL_UNVERIFIED, no upsert, no tokens', async () => {
    stubQuantMailUserinfo('victim@example.com', false);
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const res = await ssoExchange(app);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'SSO_EMAIL_UNVERIFIED' } });
    expect(fake.created).toHaveLength(0);
    expect(fake.users).toHaveLength(0);
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('N3: email_verified as a non-boolean ("true" string) -> 403 SSO_EMAIL_UNVERIFIED, no upsert, no tokens', async () => {
    stubQuantMailUserinfo('victim@example.com', 'true');
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const res = await ssoExchange(app);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'SSO_EMAIL_UNVERIFIED' } });
    expect(fake.created).toHaveLength(0);
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('N4 (takeover negative control): existing victim row, unverified userinfo -> 403, victim row emailVerified stays false, no tokens', async () => {
    fake = makeFakePrisma([
      makeUser({
        id: 'u_victim',
        email: 'victim@example.com',
        username: 'victim_user',
        emailVerified: false,
        isVerified: false,
      }),
    ]);
    stubQuantMailUserinfo('victim@example.com'); // unverified — the takeover shape
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const res = await ssoExchange(app);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'SSO_EMAIL_UNVERIFIED' } });
    // The old code stamped emailVerified:true on the victim's row here.
    expect(fake.users).toHaveLength(1);
    expect(fake.users[0]?.emailVerified).toBe(false);
    expect(fake.users[0]?.isVerified).toBe(false);
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('P1: email_verified:true -> 200 isNewUser, row created WITH verification flags from the proof, tokens issued', async () => {
    stubQuantMailUserinfo('newbie@example.com', true);
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const res = await ssoExchange(app);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.isNewUser).toBe(true);
    expect(fake.users).toHaveLength(1);
    expect(fake.users[0]?.emailVerified).toBe(true);
    expect(fake.users[0]?.isVerified).toBe(true);
    expect(tokens.issueCalls).toHaveLength(1);
    expect(tokens.issueCalls[0]?.userId).toBe(fake.users[0]?.id);
  });

  it('P2: email_verified:true for an existing row -> 200 same account, flags set from the verified proof, tokens issued', async () => {
    fake = makeFakePrisma([
      makeUser({ id: 'u_existing', email: 'owner@example.com', username: 'owner_user' }),
    ]);
    stubQuantMailUserinfo('owner@example.com', true);
    app = await buildAuthApp(fake.prisma, tokens.stub);
    const res = await ssoExchange(app);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.isNewUser).toBe(false);
    expect(body.data.user.id).toBe('u_existing');
    expect(fake.users).toHaveLength(1);
    expect(fake.users[0]?.emailVerified).toBe(true);
    expect(fake.users[0]?.isVerified).toBe(true);
    expect(tokens.issueCalls).toHaveLength(1);
    expect(tokens.issueCalls[0]?.userId).toBe('u_existing');
  });
});
