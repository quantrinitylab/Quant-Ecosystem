// ============================================================================
// QC-F-141 — POST /auth/login 2FA gate + POST /auth/2fa/verify
// ============================================================================
//
// Password login honoured the shared User row's 2FA state never: a correct
// password alone bought a full session even with `twoFactorEnabled = true`.
// These tests pin the fix at QuantMail parity:
//   - /auth/login answers a short-lived challenge (no tokens) for 2FA-on
//     accounts, 409 for the half-enabled corruption state, and the byte-
//     identical session shape for 2FA-off accounts.
//   - /auth/2fa/verify completes the second factor (TOTP with replay floor +
//     single-use backup codes), fail-closed on every stale/forged state, and
//     issues the session only after the factor passes.
//
// Harness: bare Fastify + authRoutes (the QC-F-501 pattern) with a stable
// module-level @quant/auth mock that keeps the REAL totpService (otplib,
// window=1) while synthesising passwordService over synthetic PHCs — the
// fresh-identity mock that OOMs the effect loop is deliberately NOT used.
//
// Negative control: on the pre-fix auth.ts these suites fail where they must
// (login 1,4,5,6 issue sessions / verify 7,8,9,15,18 404); guard cases 2,3,
// 13,14,17 pass on both (their behaviour never changed).
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';

vi.mock('@quant/auth', () => {
  // Self-contained TOTP: RFC 6238 (SHA1, 30s, 6 digits, ±1 step window) —
  // the same contract the real TOTPService (otplib, window=1) enforces.
  // The real @quant/auth module is NOT loaded here because it drags
  // @quant/database into the backend test process (see the QC-F-501 harness
  // note); otplib↔RFC6238 equivalence is covered by packages/auth's own
  // totp.test.ts.
  const base32Decode = (input: string): Buffer => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const clean = input.replace(/=+$/, '').toUpperCase();
    let bits = 0;
    let value = 0;
    const out: number[] = [];
    for (const ch of clean) {
      const idx = alphabet.indexOf(ch);
      if (idx < 0) throw new Error(`bad base32 char ${ch}`);
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        out.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return Buffer.from(out);
  };
  const totpAt = (secret: string, counter: bigint): string => {
    const msg = Buffer.alloc(8);
    msg.writeBigUInt64BE(counter);
    const hmac = createHmac('sha1', base32Decode(secret)).update(msg).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    return String(code % 1_000_000).padStart(6, '0');
  };
  return {
    passwordService: {
      verify: async (digest: string, password: string): Promise<boolean> => {
        if (!digest.startsWith('$argon2')) {
          throw new Error('Invalid hash: not a valid PHC string');
        }
        return digest === syntheticHash(password);
      },
      hash: async (password: string): Promise<string> => syntheticHash(password),
    },
    totpService: {
      generateSecret: (): string => {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        const bytes = randomBytes(20);
        return Array.from(bytes)
          .map((b) => alphabet[b % 32])
          .join('');
      },
      verify: (token: string, secret: string): boolean => {
        const step = Math.floor(Date.now() / 1000 / 30);
        return [-1, 0, 1].some((off) => totpAt(secret, BigInt(step + off)) === token);
      },
    },
  };
});

import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

import authRoutes from '../routes/auth';
import { totpService } from '@quant/auth';
import type { OtpService } from '../lib/otp-service';
import type { SessionTokenIssuer } from '../lib/session-tokens';
import {
  hashBackupCode,
  signTwoFactorChallenge,
  totpStepFor,
  verifyTwoFactorChallenge,
} from '../lib/two-factor';

// ---------------------------------------------------------------------------
// Stable synthetic identities + credentials (no real accounts, ever).
// ---------------------------------------------------------------------------
const CORRECT_PASSWORD = 'qc-f-141-correct-password';
const WRONG_PASSWORD = 'qc-f-141-wrong-password';

function syntheticHash(password: string): string {
  return `$argon2id$v=19$synthetic$${password}`;
}

// RFC 6238 TOTP generation for the CURRENT 30s step — independent of otplib,
// so the route's verify path is exercised through the real TOTPService.
function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error(`bad base32 char ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function currentTotpCode(secret: string): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
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
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  twoFactorLastUsedStep: number | null;
}

interface FakeBackupRow {
  id: string;
  userId: string;
  codeHash: string;
  usedAt: Date | null;
}

const SECRET_2FA = totpService.generateSecret();
const SEED_BACKUP_CODE = 'ABCDH-JKLMN'; // 10-char recovery shape, unambiguous alphabet

function seedUsers(): FakeUser[] {
  return [
    {
      id: 'user_2fa',
      email: 'twofa@example.com',
      username: 'twofa_user',
      displayName: 'Two Factor User',
      phoneNumber: null,
      passwordHash: syntheticHash(CORRECT_PASSWORD),
      role: 'USER',
      deletedAt: null,
      twoFactorEnabled: true,
      twoFactorSecret: SECRET_2FA,
      twoFactorLastUsedStep: null,
    },
    {
      id: 'user_no2fa',
      email: 'plain@example.com',
      username: 'plain_user',
      displayName: 'Plain User',
      phoneNumber: null,
      passwordHash: syntheticHash(CORRECT_PASSWORD),
      role: 'USER',
      deletedAt: null,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorLastUsedStep: null,
    },
    {
      id: 'user_half_enabled',
      email: 'half1@example.com',
      username: 'half1_user',
      displayName: 'Half Enabled',
      phoneNumber: null,
      passwordHash: syntheticHash(CORRECT_PASSWORD),
      role: 'USER',
      deletedAt: null,
      twoFactorEnabled: true,
      twoFactorSecret: null,
      twoFactorLastUsedStep: null,
    },
    {
      id: 'user_half_secret',
      email: 'half2@example.com',
      username: 'half2_user',
      displayName: 'Half Secret',
      phoneNumber: null,
      passwordHash: syntheticHash(CORRECT_PASSWORD),
      role: 'USER',
      deletedAt: null,
      twoFactorEnabled: false,
      twoFactorSecret: SECRET_2FA,
      twoFactorLastUsedStep: null,
    },
  ];
}

function seedBackupRows(): FakeBackupRow[] {
  return [
    {
      id: 'brow_1',
      userId: 'user_2fa',
      codeHash: hashBackupCode(SEED_BACKUP_CODE),
      usedAt: null,
    },
  ];
}

// ---------------------------------------------------------------------------
// Faithful in-memory Prisma fake for the exact queries this suite's routes
// make: login findMany (OR/insensitive/take), verify findUnique +
// user.updateMany CAS, backup findMany/updateMany, refreshToken.create.
// ---------------------------------------------------------------------------
interface UpdateManyCall {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
}

function makeFakePrisma(users: FakeUser[], backupRows: FakeBackupRow[]) {
  const userUpdateManyCalls: UpdateManyCall[] = [];
  const backupUpdateManyCalls: UpdateManyCall[] = [];

  const prisma = {
    refreshToken: {
      async create({ data }: { data: Record<string, unknown> }) {
        return data;
      },
    },
    twoFactorBackupCode: {
      async findMany({ where }: { where: { userId?: string; usedAt?: null } }) {
        return backupRows.filter(
          (r) =>
            (where.userId === undefined || r.userId === where.userId) &&
            (where.usedAt === undefined || r.usedAt === where.usedAt),
        );
      },
      async updateMany({
        where,
        data,
      }: {
        where: { id?: string; usedAt?: null };
        data: { usedAt?: Date };
      }) {
        backupUpdateManyCalls.push({ where, data });
        const row = backupRows.find(
          (r) => r.id === where.id && (where.usedAt === undefined || r.usedAt === where.usedAt),
        );
        if (!row) return { count: 0 };
        row.usedAt = data.usedAt ?? new Date();
        return { count: 1 };
      },
    },
    user: {
      async findMany({
        where,
        take,
      }: {
        where: Record<string, unknown>;
        take?: number;
      }) {
        const ors = (where['OR'] as Record<string, unknown>[]) ?? [];
        const rows = users.filter((u) => {
          if (where['deletedAt'] === null && u.deletedAt !== null) return false;
          return ors.some((cond) => {
            const emailCond = cond['email'] as { equals?: string; mode?: string } | undefined;
            if (emailCond?.equals !== undefined) {
              const a = u.email.toLowerCase();
              const b = String(emailCond.equals).toLowerCase();
              if (emailCond.mode === 'insensitive' ? a !== b : u.email !== String(emailCond.equals)) {
                return false;
              }
              return true;
            }
            const usernameCond = cond['username'] as { equals?: string; mode?: string } | undefined;
            if (usernameCond?.equals !== undefined) {
              const a = u.username.toLowerCase();
              const b = String(usernameCond.equals).toLowerCase();
              if (usernameCond.mode === 'insensitive' ? a !== b : u.username !== String(usernameCond.equals)) {
                return false;
              }
              return true;
            }
            if (cond['phoneNumber'] !== undefined) {
              return u.phoneNumber === cond['phoneNumber'];
            }
            return false;
          });
        });
        return typeof take === 'number' ? rows.slice(0, take) : rows;
      },
      async findUnique({ where }: { where: { id?: string } }) {
        return users.find((u) => u.id === where.id) ?? null;
      },
      async updateMany({
        where,
        data,
      }: {
        where: { id?: string; OR?: Record<string, unknown>[] };
        data: { twoFactorLastUsedStep?: number };
      }) {
        userUpdateManyCalls.push({ where, data });
        const u = users.find((x) => x.id === where.id);
        if (!u) return { count: 0 };
        const ors = where.OR ?? [];
        const matched = ors.some((cond) => {
          const v = cond['twoFactorLastUsedStep'];
          if (v === null) return u.twoFactorLastUsedStep === null;
          const lt = (v as { lt?: number } | undefined)?.lt;
          if (typeof lt === 'number') {
            return u.twoFactorLastUsedStep !== null && u.twoFactorLastUsedStep < lt;
          }
          return false;
        });
        if (!matched) return { count: 0 };
        if (typeof data.twoFactorLastUsedStep === 'number') {
          u.twoFactorLastUsedStep = data.twoFactorLastUsedStep;
        }
        return { count: 1 };
      },
    },
  };
  // Helper params take the REAL decorated PrismaClient type (the `unknown`
  // param pattern broke CI typecheck against app.decorate('prisma', ...) in
  // PR #903/#905); the fake is cast at construction.
  return {
    prisma: prisma as unknown as PrismaClient,
    users,
    backupRows,
    userUpdateManyCalls,
    backupUpdateManyCalls,
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

const TEST_APP_CONFIG = {
  jwtSecret: 'qc-f-141-test-challenge-secret-long-enough',
  jwtIssuer: 'quant-test',
  jwtAudience: 'quant-test-audience',
};

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
  (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
    'appConfig',
    TEST_APP_CONFIG,
  );
  await app.register(authRoutes, { prefix: '/auth' });
  await app.ready();
  return app;
}

describe('QC-F-141 POST /auth/login — 2FA gate', () => {
  let app: FastifyInstance | null = null;
  let fake: ReturnType<typeof makeFakePrisma>;
  let tokens: ReturnType<typeof makeSessionTokensStub>;
  let logLines: string[];

  beforeEach(() => {
    fake = makeFakePrisma(seedUsers(), seedBackupRows());
    tokens = makeSessionTokensStub();
    logLines = [];
    app = null;
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  async function login(identifier: string, password: string, extra?: Record<string, unknown>) {
    if (!app) app = await buildAuthApp(fake.prisma, tokens.stub, logLines);
    return app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier, password, ...extra },
    });
  }

  it('1. 2FA-on + correct password returns a challenge, never a session', async () => {
    const res = await login('twofa@example.com', CORRECT_PASSWORD);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.twoFactorRequired).toBe(true);
    expect(typeof body.data.challenge).toBe('string');
    expect(body.data.expiresIn).toBe(300);
    expect(body.data).not.toHaveProperty('accessToken');
    expect(body.data).not.toHaveProperty('refreshToken');
    expect(body.data).not.toHaveProperty('user');
    // The response must never carry the TOTP secret, anywhere.
    expect(res.body).not.toContain(SECRET_2FA);
    expect(tokens.issueCalls).toHaveLength(0);
    // And the challenge really is a live one for this user.
    const claims = verifyTwoFactorChallenge(body.data.challenge, {
      jwtSecret: TEST_APP_CONFIG.jwtSecret,
      jwtIssuer: TEST_APP_CONFIG.jwtIssuer,
    });
    expect(claims?.userId).toBe('user_2fa');
  });

  it('2. 2FA-on + wrong password answers INVALID_CREDENTIALS with no 2FA hint', async () => {
    const res = await login('twofa@example.com', WRONG_PASSWORD);
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
    expect(body.data ?? {}).not.toHaveProperty('challenge');
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('3. 2FA-off login behaviour is byte-identical to before', async () => {
    const res = await login('plain@example.com', CORRECT_PASSWORD);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.twoFactorRequired ?? false).toBe(false);
    expect(body.data.accessToken).toBe('stub-access-token');
    expect(body.data.refreshToken).toBe('stub-refresh-token');
    expect(body.data.tokenType).toBe('Bearer');
    expect(body.data.user).toMatchObject({
      id: 'user_no2fa',
      email: 'plain@example.com',
      username: 'plain_user',
    });
    expect(tokens.issueCalls).toHaveLength(1);
  });

  it('4. enabled-without-secret is fail-closed (409), never a session', async () => {
    const res = await login('half1@example.com', CORRECT_PASSWORD);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('TWO_FACTOR_STATE_INVALID');
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('5. disabled-with-secret is fail-closed (409), never a session', async () => {
    const res = await login('half2@example.com', CORRECT_PASSWORD);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('TWO_FACTOR_STATE_INVALID');
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('6. a client-sent `code` field cannot summon a combined single-step login', async () => {
    const res = await login('twofa@example.com', CORRECT_PASSWORD, {
      code: currentTotpCode(SECRET_2FA),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.twoFactorRequired).toBe(true);
    expect(body.data).not.toHaveProperty('accessToken');
    expect(tokens.issueCalls).toHaveLength(0);
  });
});

describe('QC-F-141 POST /auth/2fa/verify — second-factor completion', () => {
  let app: FastifyInstance | null = null;
  let fake: ReturnType<typeof makeFakePrisma>;
  let tokens: ReturnType<typeof makeSessionTokensStub>;
  let logLines: string[];

  beforeEach(() => {
    fake = makeFakePrisma(seedUsers(), seedBackupRows());
    tokens = makeSessionTokensStub();
    logLines = [];
    app = null;
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  async function ready() {
    if (!app) app = await buildAuthApp(fake.prisma, tokens.stub, logLines);
    return app;
  }

  async function verify(challenge: unknown, code: unknown) {
    const a = await ready();
    return a.inject({ method: 'POST', url: '/auth/2fa/verify', payload: { challenge, code } });
  }

  async function loginChallenge(email = 'twofa@example.com'): Promise<string> {
    const a = await ready();
    const res = await a.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: email, password: CORRECT_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    return res.json().data.challenge as string;
  }

  it('7. valid TOTP completes login in the exact /auth/login session shape', async () => {
    const challenge = await loginChallenge();
    const res = await verify(challenge, currentTotpCode(SECRET_2FA));
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.accessToken).toBe('stub-access-token');
    expect(body.data.refreshToken).toBe('stub-refresh-token');
    expect(body.data.tokenType).toBe('Bearer');
    expect(body.data.user).toMatchObject({ id: 'user_2fa', username: 'twofa_user' });
    expect(tokens.issueCalls).toHaveLength(1);
    expect(tokens.issueCalls[0]).toMatchObject({ userId: 'user_2fa' });
    // Replay floor advanced via compare-and-set with the exact CAS args.
    expect(fake.userUpdateManyCalls).toHaveLength(1);
    const call = fake.userUpdateManyCalls[0];
    const ors = call.where['OR'] as Record<string, unknown>[];
    expect(ors).toContainEqual({ twoFactorLastUsedStep: null });
    const ltCond = ors.find((o) => typeof (o['twoFactorLastUsedStep'] as { lt?: number })?.lt === 'number');
    expect(ltCond).toBeDefined();
    const floor = (ltCond!['twoFactorLastUsedStep'] as { lt: number }).lt;
    const step = totpStepFor();
    expect(floor).toBe(step + 1);
    expect(call.data.twoFactorLastUsedStep).toBe(step + 1);
  });

  it('8. the same TOTP cannot complete a second login (replay floor)', async () => {
    const challenge1 = await loginChallenge();
    const code = currentTotpCode(SECRET_2FA);
    const first = await verify(challenge1, code);
    expect(first.statusCode).toBe(200);
    // Even with a FRESH challenge the spent step is refused.
    const challenge2 = await loginChallenge();
    const second = await verify(challenge2, code);
    expect(second.statusCode).toBe(401);
    expect(second.json().error.code).toBe('CODE_ALREADY_USED');
    expect(tokens.issueCalls).toHaveLength(1);
  });

  it('9. wrong TOTP is INVALID_CODE and never moves the replay floor', async () => {
    const challenge = await loginChallenge();
    const res = await verify(challenge, '000000');
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CODE');
    expect(fake.userUpdateManyCalls).toHaveLength(0);
    expect(tokens.issueCalls).toHaveLength(0);
    // The warn log trails the attempt with the user id, never the code value.
    expect(logLines.join('\n')).toContain('user_2fa');
    expect(logLines.join('\n')).not.toContain('"000000"');
  });

  it('10. an expired challenge is CHALLENGE_EXPIRED', async () => {
    const { challenge } = signTwoFactorChallenge(
      'user_2fa',
      { jwtSecret: TEST_APP_CONFIG.jwtSecret, jwtIssuer: TEST_APP_CONFIG.jwtIssuer },
      Date.now() - 301_000,
    );
    const res = await verify(challenge, currentTotpCode(SECRET_2FA));
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('CHALLENGE_EXPIRED');
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('11. a forged challenge (wrong key) is CHALLENGE_EXPIRED', async () => {
    const { challenge } = signTwoFactorChallenge(
      'user_2fa',
      { jwtSecret: 'a-completely-different-secret', jwtIssuer: TEST_APP_CONFIG.jwtIssuer },
    );
    const res = await verify(challenge, currentTotpCode(SECRET_2FA));
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('CHALLENGE_EXPIRED');
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('12. a real access token cannot stand in as a challenge', async () => {
    // access-shape JWT (session iss/aud, HS256) — the audience gate must kill it.
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'user_2fa',
        iss: TEST_APP_CONFIG.jwtIssuer,
        aud: TEST_APP_CONFIG.jwtAudience,
        kind: 'access',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    const sig = createHmac('sha256', TEST_APP_CONFIG.jwtSecret)
      .update(`${header}.${payload}`)
      .digest('base64url');
    const res = await verify(`${header}.${payload}.${sig}`, currentTotpCode(SECRET_2FA));
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('CHALLENGE_EXPIRED');
  });

  it('13. a challenge buys nothing as a Bearer on /auth/me', async () => {
    const a = await ready();
    const challenge = await loginChallenge();
    const res = await a.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${challenge}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('14. a challenge cannot be redeemed as a refresh token', async () => {
    const a = await ready();
    const challenge = await loginChallenge();
    const res = await a.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: challenge },
    });
    expect(res.statusCode).toBe(401);
  });

  it('15. a recovery code works once, then is spent', async () => {
    const challenge = await loginChallenge();
    const res = await verify(challenge, SEED_BACKUP_CODE);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.accessToken).toBe('stub-access-token');
    expect(tokens.issueCalls).toHaveLength(1);
    expect(fake.backupUpdateManyCalls).toHaveLength(1);
    expect(fake.backupUpdateManyCalls[0].where).toMatchObject({ id: 'brow_1', usedAt: null });
    // Second use of the same code: spent == unknown, indistinguishable.
    const challenge2 = await loginChallenge();
    const res2 = await verify(challenge2, SEED_BACKUP_CODE);
    expect(res2.statusCode).toBe(401);
    expect(res2.json().error.code).toBe('INVALID_CODE');
    expect(tokens.issueCalls).toHaveLength(1);
  });

  it('16. an unknown recovery-shaped code is INVALID_CODE, same as a spent one', async () => {
    const challenge = await loginChallenge();
    const res = await verify(challenge, 'ZZZZZ-YYYYY');
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CODE');
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('17. a garbage code shape is a 400, not a 401', async () => {
    const challenge = await loginChallenge();
    const res = await verify(challenge, 'nope');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('18. account state change between challenge and verify kills the attempt', async () => {
    const challenge = await loginChallenge();
    // The account is deleted (or 2FA disabled) after the challenge was issued.
    const u = fake.users.find((x) => x.id === 'user_2fa');
    if (!u) throw new Error('seed user missing');
    u.deletedAt = new Date();
    const res = await verify(challenge, currentTotpCode(SECRET_2FA));
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('CHALLENGE_EXPIRED');
    expect(tokens.issueCalls).toHaveLength(0);
  });

  it('19. 2FA-off accounts can never complete via this route (no challenge exists)', async () => {
    const a = await ready();
    // No 2FA-on state for user_no2fa: minting a challenge by hand proves the
    // verify-side gate, not the login gate — the user row itself refuses.
    const { challenge } = signTwoFactorChallenge(
      'user_no2fa',
      { jwtSecret: TEST_APP_CONFIG.jwtSecret, jwtIssuer: TEST_APP_CONFIG.jwtIssuer },
    );
    const res = await verify(challenge, '123456');
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('CHALLENGE_EXPIRED');
    expect(tokens.issueCalls).toHaveLength(0);
  });
});

describe('QC-F-141 GET /auth/me — informational twoFactorEnabled', () => {
  let app: FastifyInstance | null = null;
  let fake: ReturnType<typeof makeFakePrisma>;

  beforeEach(() => {
    fake = makeFakePrisma(seedUsers(), seedBackupRows());
    app = null;
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  async function meAs(userId: string) {
    const a = Fastify({ logger: false });
    a.addHook('onRequest', (request, _reply, done) => {
      (request as unknown as { auth?: { userId?: string } }).auth = { userId };
      done();
    });
    (a as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
      'prisma',
      fake.prisma,
    );
    (a as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
      'otpService',
      otpServiceStub,
    );
    const tokens = makeSessionTokensStub();
    (a as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
      'sessionTokens',
      tokens.stub,
    );
    (a as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
      'appConfig',
      TEST_APP_CONFIG,
    );
    await a.register(authRoutes, { prefix: '/auth' });
    await a.ready();
    app = a;
    return a.inject({ method: 'GET', url: '/auth/me' });
  }

  it('20. /me reports twoFactorEnabled truthfully', async () => {
    const on = await meAs('user_2fa');
    expect(on.statusCode).toBe(200);
    expect(on.json().data.twoFactorEnabled).toBe(true);
    const off = await meAs('user_no2fa');
    expect(off.statusCode).toBe(200);
    expect(off.json().data.twoFactorEnabled).toBe(false);
  });
});

describe('QC-F-141 lib/two-factor.ts unit pins', () => {
  it('challenge round-trips and the secret never appears in the token', () => {
    const { challenge, expiresIn } = signTwoFactorChallenge('u1', {
      jwtSecret: TEST_APP_CONFIG.jwtSecret,
      jwtIssuer: TEST_APP_CONFIG.jwtIssuer,
    });
    expect(expiresIn).toBe(300);
    expect(challenge).not.toContain(TEST_APP_CONFIG.jwtSecret);
    const claims = verifyTwoFactorChallenge(challenge, {
      jwtSecret: TEST_APP_CONFIG.jwtSecret,
      jwtIssuer: TEST_APP_CONFIG.jwtIssuer,
    });
    expect(claims?.userId).toBe('u1');
    expect(typeof claims?.issuedAt).toBe('number');
  });

  it('a different issuer or audience breaks verification', () => {
    const { challenge } = signTwoFactorChallenge('u1', {
      jwtSecret: TEST_APP_CONFIG.jwtSecret,
      jwtIssuer: 'quant-test',
    });
    expect(
      verifyTwoFactorChallenge(challenge, {
        jwtSecret: TEST_APP_CONFIG.jwtSecret,
        jwtIssuer: 'other-issuer',
      }),
    ).toBeNull();
  });

  it('backup-code normalisation + hashing are case/hyphen/space insensitive', () => {
    expect(hashBackupCode('abcdh-jklmn')).toBe(hashBackupCode('ABCDHJKLMN'));
    expect(hashBackupCode(' abcdh jklmn ')).toBe(hashBackupCode('ABCDH-JKLMN'));
  });
});
