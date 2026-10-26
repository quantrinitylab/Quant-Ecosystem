/**
 * Risk-based new-device sign-in challenge (fix/qm-new-device-challenge).
 *
 * The contract pinned here:
 * - Familiar device (a LIVE browser session row with the same ipAddress AND
 *   userAgent) → session issued, no challenge, no email.
 * - Unfamiliar device (live rows exist, none match) → NO session; a
 *   single-use code row is minted and mailed to the verified recovery email
 *   when one exists, else to the account email; the response names only a
 *   masked destination.
 * - Zero live sessions → session issued (no trusted device on record yet).
 * - SES failure on the challenge mail → honest 503, minted row burned, no
 *   session — a mail outage never silently disables the gate.
 * - Verify: correct code from the SAME device fingerprint → session; wrong
 *   code → INVALID_CODE + attempt increment; different device → 401
 *   NEW_DEVICE_MISMATCH with NO attempt consumed; attempt-capped → 429;
 *   expired/missing → generic INVALID_OR_EXPIRED_CODE; a burned code cannot
 *   mint a second session.
 * - Resend: pending challenge only; burns the old row, mails a new code
 *   bound to the resending device; no pending challenge → honest 400.
 *
 * Runs the REAL /auth/login + /auth/new-device/* handlers against an
 * in-memory Prisma fake. TOTP logins are out of scope here: a second factor
 * already proves possession, so 2FA logins are never double-gated.
 *
 * HARD RULE: email only. No phone/SMS anywhere in this file or the code it
 * tests — phone OTP was removed by user order.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => {
  const state = {
    users: new Map<string, any>(),
    sessions: [] as any[],
    challenges: [] as any[],
  };
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${++seq}`;

  const stringMatches = (rowVal: unknown, filter: any): boolean => {
    if (filter === undefined) return true;
    if (typeof filter === 'string') return rowVal === filter;
    if (filter && typeof filter === 'object') {
      if ('equals' in filter) {
        const lhs = String(rowVal ?? '');
        const rhs = String(filter.equals);
        return filter.mode === 'insensitive'
          ? lhs.toLowerCase() === rhs.toLowerCase()
          : lhs === rhs;
      }
      if ('in' in filter) return Array.isArray(filter.in) && filter.in.includes(rowVal);
    }
    return false;
  };

  const dateMatches = (rowVal: any, filter: any): boolean => {
    if (filter === undefined) return true;
    if (filter instanceof Date) return rowVal?.getTime?.() === filter.getTime();
    if (filter && typeof filter === 'object' && 'gt' in filter) {
      return rowVal instanceof Date && filter.gt instanceof Date && rowVal > filter.gt;
    }
    return false;
  };

  const userMatches = (u: any, where: any): boolean => {
    if (!where) return true;
    for (const key of Object.keys(where)) {
      if (key === 'deletedAt') {
        const wantNull = where.deletedAt === null;
        if (wantNull ? u.deletedAt != null : u.deletedAt == null) return false;
        continue;
      }
      if (key === 'email' || key === 'username' || key === 'id') {
        if (!stringMatches(u[key], where[key])) return false;
        continue;
      }
      throw new Error(`fake userMatches: unhandled filter key "${key}"`);
    }
    return true;
  };

  const sessionMatches = (s: any, where: any): boolean => {
    if (!where) return true;
    for (const key of Object.keys(where)) {
      if (key === 'OR') {
        const clauses: any[] = where.OR ?? [];
        if (!clauses.some((c: any) => sessionMatches(s, c))) return false;
        continue;
      }
      if (key === 'userId' && s.userId !== where.userId) return false;
      if (key === 'isRevoked' && s.isRevoked !== where.isRevoked) return false;
      if (key === 'expiresAt' && !dateMatches(s.expiresAt, where.expiresAt)) return false;
      if (key === 'source') {
        if (typeof where.source === 'string' ? s.source !== where.source : s.source !== null) {
          if (!(where.source === null && s.source == null)) return false;
        }
      }
    }
    return true;
  };

  const challengeMatches = (r: any, where: any): boolean => {
    if (!where) return true;
    for (const key of Object.keys(where)) {
      if (key === 'userId' && r.userId !== where.userId) return false;
      if (key === 'id' && !stringMatches(r.id, where.id)) return false;
      if (key === 'usedAt') {
        const wantNull = where.usedAt === null;
        if (wantNull ? r.usedAt !== null : r.usedAt === null) return false;
      }
    }
    return true;
  };

  const applyData = (row: any, data: any) => {
    for (const [key, value] of Object.entries(data ?? {})) {
      if (value && typeof value === 'object' && 'increment' in (value as any)) {
        row[key] = (row[key] ?? 0) + (value as any).increment;
      } else {
        row[key] = value;
      }
    }
  };

  const challengeApi = (arr: any[]) => ({
    findFirst: async ({ where, orderBy }: any) => {
      const rows = arr.filter((r) => challengeMatches(r, where));
      if (orderBy?.createdAt === 'desc') rows.sort((a, b) => b.createdAt - a.createdAt);
      return rows[0] ? { ...rows[0] } : null;
    },
    create: async ({ data }: any) => {
      const row = {
        id: nextId('ndc'),
        createdAt: new Date(),
        usedAt: null,
        attempts: 0,
        ...data,
      };
      arr.push(row);
      return { ...row };
    },
    update: async ({ where, data }: any) => {
      const row = arr.find((r) => r.id === where.id);
      if (!row) throw new Error('fake newDeviceChallenge.update: row not found');
      applyData(row, data);
      return { ...row };
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const r of arr) {
        if (challengeMatches(r, where)) {
          applyData(r, data);
          count++;
        }
      }
      return { count };
    },
  });

  const prisma = {
    user: {
      findMany: async ({ where, take }: any) => {
        const out = [...state.users.values()].filter((u) => userMatches(u, where));
        return (take === undefined ? out : out.slice(0, take)).map((u) => ({ ...u }));
      },
    },
    refreshToken: {
      findMany: async ({ where }: any) =>
        state.sessions.filter((s) => sessionMatches(s, where)).map((s) => ({ ...s })),
    },
    newDeviceChallenge: {
      findFirst: (args: any) => challengeApi(state.challenges).findFirst(args),
      create: (args: any) => challengeApi(state.challenges).create(args),
      update: (args: any) => challengeApi(state.challenges).update(args),
      updateMany: (args: any) => challengeApi(state.challenges).updateMany(args),
    },
    $transaction: async (cb: (tx: any) => Promise<any>) => cb(prisma),
  };

  const sendNewDeviceChallengeEmail = vi.fn(async () => true);

  return { state, nextId, prisma, sendNewDeviceChallengeEmail };
});

vi.mock('@quant/auth/lib/prisma', () => ({ default: fakes.prisma, prisma: fakes.prisma }));

// The real email-verification module pulls ses-sender → @quant/server-core,
// whose worktree layout cannot resolve fastify-type-provider-zod under
// vitest (same reason auth-login-liveness mocks it wholesale). The mock
// keeps the digest contract hash-consistent: verificationCodeMatches
// recomputes the digest, so a row seeded with hashVerificationCode('123456')
// is consumable by the code '123456' through the real handler path.
vi.mock('../lib/email-verification', () => ({
  MAX_VERIFICATION_ATTEMPTS: 5,
  generateVerificationCode: () => '123456',
  hashVerificationCode: (code: string) => `hash_${code}`,
  isVerificationCodeExpired: () => false,
  looksLikeVerificationCode: (code: unknown) => typeof code === 'string' && /^\d{6}$/.test(code),
  sendVerificationEmail: vi.fn(async () => true),
  verificationCodeExpiry: () => new Date(Date.now() + 15 * 60 * 1000),
  verificationCodeMatches: (a: unknown, b: unknown) =>
    typeof a === 'string' && `hash_${a}` === b,
}));

// Same @quant/server-core resolution problem, one hop down: the real
// new-device-challenge module (loaded via importOriginal below) imports
// ses-sender. The mailer itself is overridden in that mock, so this stub
// only needs to exist for module load.
vi.mock('../lib/ses-sender', () => ({
  isSesConfigured: () => true,
  sendViaSes: vi.fn(async () => true),
}));

vi.mock('../lib/new-device-challenge', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return { ...original, sendNewDeviceChallengeEmail: fakes.sendNewDeviceChallengeEmail };
});

vi.mock('argon2', () => ({
  hash: vi.fn(async (password: string) => `hashed_${password}`),
  verify: vi.fn(async () => true),
}));

vi.mock('../lib/auth-session', () => ({
  createTokenService: () => ({}),
  fail: (reply: any, statusCode: number, code: string, message: string) => {
    reply.statusCode = statusCode;
    return reply.send({ success: false, error: { code, message } });
  },
  requireTrustedOrigin: () => true,
  sessionMetadataFromRequest: (request: any) => ({
    source: 'browser',
    userAgent:
      typeof request.headers?.['user-agent'] === 'string'
        ? request.headers['user-agent']
        : undefined,
    ipAddress: typeof request.ip === 'string' ? request.ip : undefined,
  }),
  setRefreshCookie: () => {},
  issueBrowserSession: vi.fn(async (_t: unknown, _r: unknown, user: any) => ({
    success: true as const,
    data: { userId: user.id, accessToken: 'access-token', user: { id: user.id, email: user.email } },
  })),
}));

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: () => 'test-access-secret',
  getJwtRefreshSecret: () => 'test-refresh-secret-long-enough-for-hs256',
}));

import { authRoutes } from '../routes/auth';
import { hashVerificationCode } from '../lib/email-verification';
import {
  challengeDestination,
  deviceFingerprint,
  isFamiliarDevice,
  maskEmail,
} from '../lib/new-device-challenge';

type RouteHandler = (request: any, reply: any) => Promise<unknown>;

const loadHandlers = async () => {
  const handlers = new Map<string, RouteHandler>();
  const register = (path: string, optionsOrHandler: unknown, maybeHandler?: RouteHandler) => {
    handlers.set(path, (maybeHandler ?? optionsOrHandler) as RouteHandler);
  };
  await authRoutes({
    post: register,
    get: register,
    patch: register,
    requireStepUp: () => async () => {},
  } as never);
  return handlers;
};

const makeReply = () => {
  const reply: any = {
    statusCode: 200,
    body: undefined,
    code(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    send(body: unknown) {
      this.body = body;
      return body;
    },
    setCookie() {
      return this;
    },
  };
  return reply;
};

const call = async (path: string, request: Record<string, unknown>) => {
  const handlers = await loadHandlers();
  const reply = makeReply();
  await handlers.get(path)!(request, reply);
  return reply;
};

const seedUser = (overrides: Record<string, unknown> = {}) => {
  const row = {
    id: fakes.nextId('user'),
    email: 'alice@quantmail.in',
    username: 'alice',
    displayName: 'Alice',
    passwordHash: 'hashed_x',
    emailVerified: true,
    status: 'ACTIVE',
    deletedAt: null,
    recoveryEmail: null,
    recoveryEmailVerifiedAt: null,
    ...overrides,
  };
  fakes.state.users.set(row.id, row);
  return row;
};

const seedSession = (
  userId: string,
  ipAddress: string,
  userAgent: string,
  overrides: Record<string, unknown> = {},
) => {
  const row = {
    id: fakes.nextId('sess'),
    userId,
    ipAddress,
    userAgent,
    source: 'browser',
    isRevoked: false,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
  fakes.state.sessions.push(row);
  return row;
};

const HOME = { ip: '203.0.113.10', ua: 'Mozilla/5.0 (Home Laptop)' };
const ATTACKER = { ip: '198.51.100.77', ua: 'Mozilla/5.0 (Unknown Device)' };

beforeEach(() => {
  vi.clearAllMocks();
  fakes.state.users = new Map();
  fakes.state.sessions = [];
  fakes.state.challenges = [];
});

describe('pure helpers', () => {
  it('fingerprint is stable and device familiarity needs the exact pair', () => {
    expect(deviceFingerprint({ ipAddress: HOME.ip, userAgent: HOME.ua })).toBe(
      deviceFingerprint({ ipAddress: HOME.ip, userAgent: HOME.ua }),
    );
    const rows = [{ ipAddress: HOME.ip, userAgent: HOME.ua }];
    expect(isFamiliarDevice(rows, { ipAddress: HOME.ip, userAgent: HOME.ua })).toBe(true);
    // VPN/location change: same browser, new IP → unfamiliar.
    expect(isFamiliarDevice(rows, { ipAddress: ATTACKER.ip, userAgent: HOME.ua })).toBe(false);
    // New device: same IP, different UA → unfamiliar.
    expect(isFamiliarDevice(rows, { ipAddress: HOME.ip, userAgent: ATTACKER.ua })).toBe(false);
    expect(isFamiliarDevice([], { ipAddress: HOME.ip, userAgent: HOME.ua })).toBe(false);
  });

  it('challenge goes to the VERIFIED recovery email, never an unverified one', () => {
    expect(
      challengeDestination({
        email: 'alice@quantmail.in',
        recoveryEmail: 'recovery@example.com',
        recoveryEmailVerifiedAt: new Date(),
      }),
    ).toEqual({ to: 'recovery@example.com', channel: 'recovery' });
    expect(
      challengeDestination({
        email: 'alice@quantmail.in',
        recoveryEmail: 'pending@example.com',
        recoveryEmailVerifiedAt: null,
      }),
    ).toEqual({ to: 'alice@quantmail.in', channel: 'primary' });
    expect(maskEmail('alice@quantmail.in')).toBe('a***@quantmail.in');
  });
});

describe('POST /auth/login — new-device gate', () => {
  it('familiar device: session issued, no challenge, no email', async () => {
    const user = seedUser();
    seedSession(user.id, HOME.ip, HOME.ua);
    const reply = await call('/auth/login', {
      headers: { 'user-agent': HOME.ua },
      body: { email: 'alice@quantmail.in', password: 'correct' },
      ip: HOME.ip,
    });
    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.accessToken).toBe('access-token');
    expect(fakes.state.challenges).toHaveLength(0);
    expect(fakes.sendNewDeviceChallengeEmail).not.toHaveBeenCalled();
  });

  it('zero live sessions: session issued (no trusted device on record yet)', async () => {
    seedUser();
    const reply = await call('/auth/login', {
      headers: { 'user-agent': HOME.ua },
      body: { email: 'alice@quantmail.in', password: 'correct' },
      ip: HOME.ip,
    });
    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.accessToken).toBe('access-token');
  });

  it('revoked/expired rows do not count as history: session issued', async () => {
    const user = seedUser();
    seedSession(user.id, HOME.ip, HOME.ua, { isRevoked: true });
    seedSession(user.id, HOME.ip, HOME.ua, { expiresAt: new Date(Date.now() - 1000) });
    const reply = await call('/auth/login', {
      headers: { 'user-agent': HOME.ua },
      body: { email: 'alice@quantmail.in', password: 'correct' },
      ip: HOME.ip,
    });
    expect(reply.body.data.accessToken).toBe('access-token');
  });

  it('unfamiliar device: NO session, challenge minted, code mailed to the account email', async () => {
    const user = seedUser();
    seedSession(user.id, HOME.ip, HOME.ua);
    const reply = await call('/auth/login', {
      headers: { 'user-agent': ATTACKER.ua },
      body: { email: 'alice@quantmail.in', password: 'correct' },
      ip: ATTACKER.ip,
    });
    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.newDeviceChallengeRequired).toBe(true);
    expect(reply.body.data.accessToken).toBeUndefined();
    expect(reply.body.data.maskedDestination).toBe('a***@quantmail.in');
    expect(reply.body.data.channel).toBe('primary');
    expect(fakes.state.challenges).toHaveLength(1);
    expect(fakes.sendNewDeviceChallengeEmail).toHaveBeenCalledTimes(1);
    const sentCalls = fakes.sendNewDeviceChallengeEmail.mock
      .calls as unknown as Array<[{ to: string }]>;
    expect(sentCalls[0]![0].to).toBe('alice@quantmail.in');
    // The response never leaks the code or the full destination.
    expect(JSON.stringify(reply.body)).not.toContain('alice@quantmail.in');
  });

  it('unfamiliar device with a verified recovery email: code goes there', async () => {
    const user = seedUser({
      recoveryEmail: 'recovery@example.com',
      recoveryEmailVerifiedAt: new Date(),
    });
    seedSession(user.id, HOME.ip, HOME.ua);
    const reply = await call('/auth/login', {
      headers: { 'user-agent': ATTACKER.ua },
      body: { email: 'alice@quantmail.in', password: 'correct' },
      ip: ATTACKER.ip,
    });
    expect(reply.body.data.channel).toBe('recovery');
    const sentCalls = fakes.sendNewDeviceChallengeEmail.mock
      .calls as unknown as Array<[{ to: string }]>;
    expect(sentCalls[0]![0].to).toBe('recovery@example.com');
    expect(JSON.stringify(reply.body)).not.toContain('recovery@example.com');
  });

  it('mail failure: honest 503, minted row burned, no session', async () => {
    fakes.sendNewDeviceChallengeEmail.mockResolvedValueOnce(false);
    const user = seedUser();
    seedSession(user.id, HOME.ip, HOME.ua);
    const reply = await call('/auth/login', {
      headers: { 'user-agent': ATTACKER.ua },
      body: { email: 'alice@quantmail.in', password: 'correct' },
      ip: ATTACKER.ip,
    });
    expect(reply.statusCode).toBe(503);
    expect(reply.body.error.code).toBe('NEW_DEVICE_EMAIL_FAILED');
    expect(reply.body.data).toBeUndefined();
    expect(fakes.state.challenges).toHaveLength(1);
    expect(fakes.state.challenges[0].usedAt).not.toBeNull();
  });

  it('a second unfamiliar login burns the first pending challenge', async () => {
    const user = seedUser();
    seedSession(user.id, HOME.ip, HOME.ua);
    await call('/auth/login', {
      headers: { 'user-agent': ATTACKER.ua },
      body: { email: 'alice@quantmail.in', password: 'correct' },
      ip: ATTACKER.ip,
    });
    await call('/auth/login', {
      headers: { 'user-agent': ATTACKER.ua },
      body: { email: 'alice@quantmail.in', password: 'correct' },
      ip: ATTACKER.ip,
    });
    expect(fakes.state.challenges).toHaveLength(2);
    expect(fakes.state.challenges.filter((c) => c.usedAt === null)).toHaveLength(1);
  });
});

describe('POST /auth/new-device/verify', () => {
  const gatedLogin = async () => {
    const user = seedUser();
    seedSession(user.id, HOME.ip, HOME.ua);
    await call('/auth/login', {
      headers: { 'user-agent': ATTACKER.ua },
      body: { email: 'alice@quantmail.in', password: 'correct' },
      ip: ATTACKER.ip,
    });
    return user;
  };

  it('correct code from the same device mints the session; replay mints nothing', async () => {
    // Seed a challenge with a KNOWN code (the login path mints a random
    // one, which no test can guess — the digest is the only stored form).
    const user = seedUser();
    const { deviceFingerprint } = await import('../lib/new-device-challenge');
    fakes.state.challenges.push({
      id: fakes.nextId('ndc'),
      userId: user.id,
      deviceFingerprint: deviceFingerprint({ ipAddress: ATTACKER.ip, userAgent: ATTACKER.ua }),
      codeHash: hashVerificationCode('123456'),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      usedAt: null,
      attempts: 0,
      createdAt: new Date(),
    });
    const first = await call('/auth/new-device/verify', {
      headers: { 'user-agent': ATTACKER.ua },
      body: { email: 'alice@quantmail.in', code: '123456' },
      ip: ATTACKER.ip,
    });
    expect(first.statusCode).toBe(200);
    expect(first.body.data.accessToken).toBe('access-token');
    expect(fakes.state.challenges[0].usedAt).not.toBeNull();

    // Replay: no pending challenge remains, so the same code is generic-dead.
    const replay = await call('/auth/new-device/verify', {
      headers: { 'user-agent': ATTACKER.ua },
      body: { email: 'alice@quantmail.in', code: '123456' },
      ip: ATTACKER.ip,
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.body.error.code).toBe('INVALID_OR_EXPIRED_CODE');
    expect(replay.body.data?.accessToken).toBeUndefined();
  });

  it('wrong code increments attempts; capped challenge answers 429', async () => {
    await gatedLogin();
    const wrong = await call('/auth/new-device/verify', {
      headers: { 'user-agent': ATTACKER.ua },
      body: { email: 'alice@quantmail.in', code: '000000' },
      ip: ATTACKER.ip,
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.body.error.code).toBe('INVALID_CODE');
    expect(fakes.state.challenges[0].attempts).toBe(1);

    fakes.state.challenges[0].attempts = 5;
    const capped = await call('/auth/new-device/verify', {
      headers: { 'user-agent': ATTACKER.ua },
      body: { email: 'alice@quantmail.in', code: '000000' },
      ip: ATTACKER.ip,
    });
    expect(capped.statusCode).toBe(429);
    expect(capped.body.error.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('device mismatch fails WITHOUT consuming an attempt', async () => {
    await gatedLogin();
    const reply = await call('/auth/new-device/verify', {
      headers: { 'user-agent': HOME.ua },
      body: { email: 'alice@quantmail.in', code: '000000' },
      ip: HOME.ip,
    });
    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('NEW_DEVICE_MISMATCH');
    expect(fakes.state.challenges[0].attempts).toBe(0);
    expect(fakes.state.challenges[0].usedAt).toBeNull();
  });

  it('unknown account and expired challenge share one generic answer', async () => {
    const unknown = await call('/auth/new-device/verify', {
      headers: { 'user-agent': ATTACKER.ua },
      body: { email: 'ghost@quantmail.in', code: '123456' },
      ip: ATTACKER.ip,
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.body.error.code).toBe('INVALID_OR_EXPIRED_CODE');

    await gatedLogin();
    fakes.state.challenges[0].expiresAt = new Date(Date.now() - 1000);
    const expired = await call('/auth/new-device/verify', {
      headers: { 'user-agent': ATTACKER.ua },
      body: { email: 'alice@quantmail.in', code: '123456' },
      ip: ATTACKER.ip,
    });
    expect(expired.body.error.code).toBe('INVALID_OR_EXPIRED_CODE');
  });
});

describe('POST /auth/new-device/resend', () => {
  it('pending challenge: old row burned, new code mailed; none pending: honest 400', async () => {
    const user = seedUser();
    seedSession(user.id, HOME.ip, HOME.ua);
    await call('/auth/login', {
      headers: { 'user-agent': ATTACKER.ua },
      body: { email: 'alice@quantmail.in', password: 'correct' },
      ip: ATTACKER.ip,
    });
    const resent = await call('/auth/new-device/resend', {
      headers: { 'user-agent': ATTACKER.ua },
      body: { email: 'alice@quantmail.in' },
      ip: ATTACKER.ip,
    });
    expect(resent.statusCode).toBe(200);
    expect(resent.body.data.emailSent).toBe(true);
    expect(fakes.state.challenges).toHaveLength(2);
    expect(fakes.state.challenges.filter((c) => c.usedAt === null)).toHaveLength(1);
    expect(fakes.sendNewDeviceChallengeEmail).toHaveBeenCalledTimes(2);

    // Burn the pending row, then resend must say so honestly.
    fakes.state.challenges.forEach((c) => {
      c.usedAt = new Date();
    });
    const none = await call('/auth/new-device/resend', {
      headers: { 'user-agent': ATTACKER.ua },
      body: { email: 'alice@quantmail.in' },
      ip: ATTACKER.ip,
    });
    expect(none.statusCode).toBe(400);
    expect(none.body.error.code).toBe('NO_PENDING_CHALLENGE');
  });
});
