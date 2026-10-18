// ============================================================================
// QC-F-501 — QuantChat password login must find legacy mixed-case rows and
// must answer a malformed stored hash with an honest 401, never a 500.
//
// Background (customer-audit run 36, 2026-10-18): every pre-outage account
// was rejected with 401 INVALID_CREDENTIALS on BOTH QuantMail and QuantChat
// while fresh registrations logged in fine. The specialist root-cause audit
// (specialist-qc-f-501-buildprep.md, premise CONFIRMED @216505b09) split the
// defect: the recovered-DB row-state branches (D1/D2/D3) are ops/data work,
// but QuantChat's login ALSO has a real code defect —
//
//   1C  The lookup lowercases the identifier and then EXACT-matches it
//       against email/username. A legacy row stored with mixed case (created
//       before QuantMail's normalisation existed — see the migration note in
//       apps/quantmail/backend/routes/auth.ts) can therefore NEVER be found
//       by QuantChat login: dummy-verify, 401, forever. QuantMail login uses
//       a case-insensitive lookup with an explicit 409 EMAIL_CASE_CONFLICT
//       when two rows differ only by case; this fix ports that exact shape.
//   1D  passwordService.verify is a bare argon2.verify: a malformed stored
//       hash THROWS, and the throw escapes the handler as a 500
//       INTERNAL_ERROR. QuantMail's own two-factor route already documents
//       the honest contract ("a malformed stored hash is a failed check, not
//       a 500"); a corrupt row must answer 401 INVALID_CREDENTIALS and log
//       only the hash CLASS + length server-side — never the value.
//
// Scope honesty: this suite is the QC half of Slice-1C/1D only. The QM-side
// 1D wrap is gated on QuantMail-lane sign-off (HG-501-2) and the finding as
// a whole stays OPEN until Slice-0 names the data branch and customer-audit
// run 37 passes (HG-501-1/5). NOTHING here weakens verification: a wrong
// password is 401 before and after, tombstoned rows stay invisible, and
// '!'-marked (SSO/OTP) rows stay unusable by password.
//
// Negative-control signature (recorded in build-QC-F-501.md): on pre-fix
// code NC-501-1 / NC-501-1b / NC-501-5 / NC-501-9 FAIL with the exact defect
// shapes (401 / 401 / 500 / silent-200) and every PIN passes; on fixed code
// the whole file passes.
//
// These tests mount the REAL route plugin on a bare Fastify instance
// (QC-F-041 pattern). Prisma is an in-memory fake with stable identities
// whose findFirst/findMany faithfully implement BOTH query shapes (legacy
// plain-string equality for the pre-fix code, { equals, mode } for the fix)
// plus the deletedAt: null filter and take. passwordService is a stable
// module-level stub with faithful argon2 semantics for the synthetic hashes
// used here: a well-formed synthetic PHC verifies only its own password and
// a non-PHC string throws, exactly like argon2.verify.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Writable } from 'node:stream';

vi.mock('@quant/auth', () => ({
  passwordService: {
    verify: async (digest: string, password: string): Promise<boolean> => {
      if (!digest.startsWith('$argon2')) {
        // argon2.verify throws on a malformed PHC string — the stub keeps
        // that contract so the 500-vs-401 distinction is really exercised.
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
const CORRECT_PASSWORD = 'CorrectHorse1!';
const WRONG_PASSWORD = 'WrongHorse9!';
const MALFORMED_HASH = 'not-a-phc-string';

function syntheticHash(password: string): string {
  return `$argon2id$v=19$synthetic$${password}`;
}

const MIXED_EMAIL = 'MixedCase@Example.com';
const MIXED_USERNAME = 'MixedUser';
const MALFORMED_EMAIL = 'malformed@example.com';
const UNUSABLE_EMAIL = 'otp-only@example.com';
const DELETED_EMAIL = 'deleted-login@example.com';
const FRESH_EMAIL = 'fresh@example.com';
const FRESH_PHONE = '+919000000099';
const DUP_EMAIL_A = 'DupCase@Example.com';
const DUP_EMAIL_B = 'dupcase@example.com';

interface FakeUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  phoneNumber: string | null;
  passwordHash: string;
  role: string;
  deletedAt: Date | null;
}

function seedUsers(): FakeUser[] {
  return [
    {
      id: 'user_mixed_case',
      email: MIXED_EMAIL,
      username: MIXED_USERNAME,
      displayName: 'Mixed Case Legacy',
      phoneNumber: null,
      passwordHash: syntheticHash(CORRECT_PASSWORD),
      role: 'USER',
      deletedAt: null,
    },
    {
      id: 'user_malformed',
      email: MALFORMED_EMAIL,
      username: 'malformed_user',
      displayName: 'Malformed Hash Row',
      phoneNumber: null,
      passwordHash: MALFORMED_HASH,
      role: 'USER',
      deletedAt: null,
    },
    {
      id: 'user_unusable',
      email: UNUSABLE_EMAIL,
      username: 'otp_only',
      displayName: 'OTP Only User',
      phoneNumber: null,
      passwordHash: '!unusable-marker',
      role: 'USER',
      deletedAt: null,
    },
    {
      id: 'user_deleted_login',
      email: DELETED_EMAIL,
      username: 'deleted_login',
      displayName: 'Deleted Login User',
      phoneNumber: null,
      passwordHash: syntheticHash(CORRECT_PASSWORD),
      role: 'USER',
      deletedAt: new Date('2026-10-10T00:00:00Z'),
    },
    {
      id: 'user_fresh',
      email: FRESH_EMAIL,
      username: 'fresh_user',
      displayName: 'Fresh User',
      phoneNumber: FRESH_PHONE,
      passwordHash: syntheticHash(CORRECT_PASSWORD),
      role: 'USER',
      deletedAt: null,
    },
    {
      id: 'user_dup_a',
      email: DUP_EMAIL_A,
      username: 'dup_user_a',
      displayName: 'Duplicate Case A',
      phoneNumber: null,
      passwordHash: syntheticHash(CORRECT_PASSWORD),
      role: 'USER',
      deletedAt: null,
    },
    {
      id: 'user_dup_b',
      email: DUP_EMAIL_B,
      username: 'dup_user_b',
      displayName: 'Duplicate Case B',
      phoneNumber: null,
      passwordHash: syntheticHash(CORRECT_PASSWORD),
      role: 'USER',
      deletedAt: null,
    },
  ];
}

// ---------------------------------------------------------------------------
// Faithful in-memory Prisma fake: understands both the legacy plain-string
// equality conditions and the fixed { equals, mode: 'insensitive' } ones.
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
  if (typeof where['email'] === 'string' || (where['email'] && typeof where['email'] === 'object')) {
    return fieldMatches(user.email, where['email']);
  }
  return true;
}

function makeFakePrisma(users: FakeUser[]) {
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
      async findMany({
        where,
        take,
      }: {
        where: Record<string, unknown>;
        take?: number;
      }) {
        const rows = users.filter((u) => rowMatches(u, where));
        return typeof take === 'number' ? rows.slice(0, take) : rows;
      },
      async findUnique({ where }: { where: { id?: string; phoneNumber?: string } }) {
        if (where.id) return users.find((u) => u.id === where.id) ?? null;
        if (where.phoneNumber) return users.find((u) => u.phoneNumber === where.phoneNumber) ?? null;
        return null;
      },
    },
  };
  // Helper params take the REAL decorated PrismaClient type (the `unknown`
  // param pattern broke CI typecheck against app.decorate('prisma', ...) in
  // PR #903/#905); the fake is cast at construction.
  return { prisma: prisma as unknown as PrismaClient, users };
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

describe('QC-F-501 POST /auth/login — legacy rows + malformed-hash honesty', () => {
  let app: FastifyInstance | null = null;
  let fake: ReturnType<typeof makeFakePrisma>;
  let tokens: ReturnType<typeof makeSessionTokensStub>;
  let logLines: string[];

  beforeEach(() => {
    fake = makeFakePrisma(seedUsers());
    tokens = makeSessionTokensStub();
    logLines = [];
    app = null;
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  async function login(identifier: string, password: string) {
    app = await buildAuthApp(fake.prisma, tokens.stub, logLines);
    return app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier, password },
    });
  }

  it('NC-501-1: stored MIXED-CASE email row + correct password -> 200 with tokens for that row', async () => {
    const res = await login('mixedcase@example.com', CORRECT_PASSWORD);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.id).toBe('user_mixed_case');
    expect(body.data.accessToken).toBe('stub-access-token');
    expect(tokens.issueCalls).toEqual([{ userId: 'user_mixed_case', username: MIXED_USERNAME }]);
  });

  it('NC-501-1b: stored MIXED-CASE username + correct password -> 200', async () => {
    const res = await login('mixeduser', CORRECT_PASSWORD);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.user.id).toBe('user_mixed_case');
  });

  it('PIN-501-2: stored MIXED-CASE row + WRONG password -> 401 INVALID_CREDENTIALS, no tokens', async () => {
    const res = await login('mixedcase@example.com', WRONG_PASSWORD);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'INVALID_CREDENTIALS' },
    });
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('NC-501-5: malformed stored hash -> honest 401 INVALID_CREDENTIALS (never 500), hash value never exposed', async () => {
    const res = await login(MALFORMED_EMAIL, CORRECT_PASSWORD);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'INVALID_CREDENTIALS' },
    });
    expect(tokens.issueCalls).toHaveLength(0);
    // Privacy (HG-501-4): neither the response nor the server warn log may
    // carry the stored hash value — class + length only.
    expect(res.body).not.toContain(MALFORMED_HASH);
    const logs = logLines.join('');
    expect(logs).not.toContain(MALFORMED_HASH);
    expect(logs).toContain('storedHashClass');
  });

  it("PIN-501-6: '!'-marked unusable row (SSO/OTP shape) + any password -> 401, no tokens", async () => {
    const res = await login(UNUSABLE_EMAIL, CORRECT_PASSWORD);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'INVALID_CREDENTIALS' },
    });
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('PIN-501-7: soft-deleted row + correct password -> 401 (tombstone stays invisible; recovery is Slice-1A, not code)', async () => {
    const res = await login(DELETED_EMAIL, CORRECT_PASSWORD);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'INVALID_CREDENTIALS' },
    });
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('PIN-501-8a: fresh lowercase row + correct password -> 200 (fresh flow unchanged)', async () => {
    const res = await login(FRESH_EMAIL, CORRECT_PASSWORD);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.user.id).toBe('user_fresh');
  });

  it('PIN-501-8b: fresh lowercase row + WRONG password -> 401 (verification not weakened)', async () => {
    const res = await login(FRESH_EMAIL, WRONG_PASSWORD);
    expect(res.statusCode).toBe(401);
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('PIN-501-11: phone-number login branch unchanged -> 200 for the fresh row', async () => {
    const res = await login(FRESH_PHONE, CORRECT_PASSWORD);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.user.id).toBe('user_fresh');
  });

  it('NC-501-9: two rows differing only by email case -> 409 EMAIL_CASE_CONFLICT, never a silent pick, no tokens', async () => {
    const res = await login('dupcase@example.com', CORRECT_PASSWORD);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'EMAIL_CASE_CONFLICT' },
    });
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('PIN-501-10: empty payload -> 400 BAD_REQUEST (schema gate unchanged)', async () => {
    app = await buildAuthApp(fake.prisma, tokens.stub, logLines);
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'BAD_REQUEST' },
    });
  });
});
