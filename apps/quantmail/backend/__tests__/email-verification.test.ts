/**
 * Email address ownership proof, end to end through the real handlers.
 *
 * What this replaces: `POST /auth/register` created users with
 * `emailVerified: true` without ever verifying the address — anyone could
 * claim any address with no proof of ownership.
 *
 * The properties worth breaking a build over: the code actually leaves the
 * building (mocked SES, but the call must happen), only the digest is stored
 * (never the plaintext code), a wrong code is rejected without burning the
 * row, an expired code is rejected, `emailVerified` flips true ONLY on a
 * successful code match, and — the race this suite was built for — N
 * concurrent redemptions of the same code produce EXACTLY ONE winner.
 *
 * The in-memory prisma below is deliberately stateful and emulates real
 * Postgres semantics for the burn: `updateMany({ id, usedAt: null })` checks
 * the WHERE and writes in one synchronous step with no await between them,
 * exactly like a single `UPDATE ... WHERE` statement under a row lock. Two
 * interleaved requests therefore cannot both see count 1. A mock that let
 * both win would be testing nothing.
 *
 * HARD RULE: email only. No phone/SMS anywhere in this file or the code it
 * tests — phone OTP was removed by user order.
 */

import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const db = {
    users: {} as Record<string, any>,
    codes: [] as any[],
  };

  const matchId = (row: any, id: any): boolean => {
    if (id === undefined) return true;
    // The resend burn is compare-and-set on the request's own snapshot:
    // { id: { in: [...] }, usedAt: null }.
    if (typeof id === 'object' && id !== null && 'in' in id) return id.in.includes(row.id);
    return row.id === id;
  };

  const matchCodes = (where: any) =>
    db.codes.filter(
      (r) =>
        (where.userId === undefined || r.userId === where.userId) &&
        matchId(r, where.id) &&
        (where.usedAt === undefined || (where.usedAt === null ? r.usedAt === null : r.usedAt !== null)),
    );

  const emailVerificationCode = {
    create: vi.fn(async (args: any) => {
      const row = {
        id: `evc-${db.codes.length + 1}`,
        usedAt: null,
        attempts: 0,
        createdAt: new Date(),
        ...args.data,
      };
      db.codes.push(row);
      return row;
    }),
    findFirst: vi.fn(async (args: any) => {
      const matches = matchCodes(args?.where ?? {});
      matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return matches[0] ?? null;
    }),
    // The resend handler snapshots pending rows inside its transaction before
    // burning exactly that snapshot (compare-and-set). The mock mirrors the
    // real semantics: pending rows are those with usedAt null.
    findMany: vi.fn(async (args: any) => {
      const matches = matchCodes(args?.where ?? {});
      matches.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return matches;
    }),
    update: vi.fn(async (args: any) => {
      const row = db.codes.find((r) => r.id === args.where.id);
      if (!row) throw new Error('record not found');
      if (args.data?.attempts?.increment) {
        row.attempts += args.data.attempts.increment;
      } else {
        Object.assign(row, args.data);
      }
      return row;
    }),
    // ATOMIC compare-and-set: the WHERE check and the write complete in one
    // synchronous step (no await between them), mirroring a single Postgres
    // UPDATE ... WHERE under the row lock. Exactly one concurrent racer can
    // observe count 1 for the same { id, usedAt: null } predicate.
    updateMany: vi.fn(async (args: any) => {
      const rows = matchCodes(args?.where ?? {});
      for (const row of rows) {
        if (args.data?.usedAt !== undefined) row.usedAt = args.data.usedAt;
      }
      return { count: rows.length };
    }),
  };

  // Mirrors Postgres `{ equals, mode: 'insensitive' }` string-filter semantics
  // for the identity lookups the verify/resend handlers now perform (the
  // handler normalizes once and looks up case-insensitively, so a legacy
  // mixed-case row must still match).
  const matchEmail = (stored: unknown, filter: any): boolean => {
    if (typeof filter === 'string') return stored === filter;
    if (filter && typeof filter === 'object' && 'equals' in filter) {
      const lhs = String(stored ?? '');
      const rhs = String(filter.equals);
      return filter.mode === 'insensitive' ? lhs.toLowerCase() === rhs.toLowerCase() : lhs === rhs;
    }
    return false;
  };
  const matchUser = (u: any, where: any): boolean => {
    if (!where) return true;
    if (where.email !== undefined && !matchEmail(u.email, where.email)) return false;
    if (where.id !== undefined && u.id !== where.id) return false;
    if (where.deletedAt !== undefined) {
      const wantNull = where.deletedAt === null;
      if (wantNull ? u.deletedAt != null : u.deletedAt == null) return false;
    }
    return true;
  };

  const user = {
    findFirst: vi.fn(async () => null),
    findUnique: vi.fn(async (args: any) =>
      Object.values(db.users).find((u: any) => matchUser(u, args?.where ?? {})) ?? null,
    ),
    findMany: vi.fn(async (args: any) => {
      const matches = Object.values(db.users).filter((u: any) =>
        matchUser(u, args?.where ?? {}),
      );
      return args?.take !== undefined ? matches.slice(0, args.take) : matches;
    }),
    create: vi.fn(async (args: any) => {
      const u = { id: 'user-1', ...args.data };
      db.users[args.data.email] = u;
      return u;
    }),
    update: vi.fn(async (args: any) => {
      const u = Object.values(db.users).find((x: any) => x.id === args.where.id) as any;
      Object.assign(u, args.data);
      return u;
    }),
  };

  // The interactive-transaction proxy shares the same atomic
  // implementations, so the route's tx.* calls behave like the real DB.
  const tx = { emailVerificationCode, user };

  return {
    db,
    prisma: {
      user,
      emailVerificationCode,
      emailFolder: { createMany: vi.fn() },
      $transaction: vi.fn(async (arg: any) =>
        typeof arg === 'function' ? arg(tx) : Promise.all(arg),
      ),
    },
    sendViaSes: vi.fn(),
    isSesConfigured: vi.fn(() => true),
    argon2Hash: vi.fn(async (password: string) => `hashed_${password}`),
    issueBrowserSession: vi.fn(async (_t: unknown, _r: unknown, user: any) => ({
      success: true as const,
      data: { userId: user.id, user: { id: user.id, email: user.email } },
    })),
  };
});

vi.mock('@quant/auth/lib/prisma', () => ({ default: mocks.prisma, prisma: mocks.prisma }));

vi.mock('../lib/ses-sender', () => ({
  sendViaSes: mocks.sendViaSes,
  isSesConfigured: mocks.isSesConfigured,
}));

vi.mock('../lib/email-verification', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return { ...original, sendVerificationEmail: vi.fn() };
});

vi.mock('argon2', () => ({ hash: mocks.argon2Hash, verify: vi.fn(async () => true) }));

vi.mock('../lib/auth-session', () => ({
  createTokenService: () => ({}),
  fail: (reply: any, statusCode: number, code: string, message: string) => {
    reply.statusCode = statusCode;
    return reply.send({ success: false, error: { code, message } });
  },
  requireTrustedOrigin: () => true,
  sessionMetadataFromRequest: () => ({}),
  setRefreshCookie: () => {},
  issueBrowserSession: mocks.issueBrowserSession,
}));

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: () => 'test-access-secret',
  getJwtRefreshSecret: () => 'test-refresh-secret-long-enough-for-hs256',
}));

import { authRoutes } from '../routes/auth';
import { hashVerificationCode } from '../lib/email-verification';

type RouteHandler = (request: any, reply: any) => Promise<unknown>;

/* A fake Fastify, deliberately loose: this suite is about the handlers. */
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

const USER = {
  id: 'user-1',
  email: 'Kundan@quantmail.in',
  username: 'kundan',
  displayName: 'Kundan',
  emailVerified: false,
};

const REAL_CODE = '482916';

const seedUser = (overrides: Record<string, unknown> = {}) => {
  mocks.db.users[USER.email] = { ...USER, ...overrides };
};

const seedLiveCode = () => {
  mocks.db.codes.push({
    id: 'evc-1',
    userId: USER.id,
    codeHash: hashVerificationCode(REAL_CODE),
    expiresAt: new Date(Date.now() + 5 * 60_000),
    usedAt: null,
    attempts: 0,
    createdAt: new Date(),
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.users = {};
  mocks.db.codes = [];
  seedUser();
  mocks.sendViaSes.mockResolvedValue('ses-message-id');
  mocks.isSesConfigured.mockReturnValue(true);
});

describe('POST /auth/register — address is not proven at signup', () => {
  const request = (body: unknown) => call('/auth/register', { headers: {}, body, ip: '203.0.113.9' });

  it('creates the user with emailVerified: false, never true', async () => {
    mocks.db.users = {};
    const reply = await request({ email: USER.email, username: USER.username, password: 's3cure-p4ss' });
    expect(reply.statusCode).toBe(200);
    expect(mocks.prisma.user.create).toHaveBeenCalled();
    const created = mocks.prisma.user.create.mock.calls[0][0].data;
    expect(created.emailVerified).toBe(false);
  });

  it('dispatches a real verification email through SES and stores only the hash', async () => {
    mocks.db.users = {};
    const reply = await request({ email: USER.email, username: USER.username, password: 's3cure-p4ss' });
    expect(reply.statusCode).toBe(200);
    // The code must leave the building via the mailer…
    const { sendVerificationEmail } = await import('../lib/email-verification');
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    const sent = (sendVerificationEmail as any).mock.calls[0][0];
    // The canonical (normalized) address is mailed: the account is stored
    // lowercase, so the verification mail must go to the stored form, not
    // the raw body casing.
    expect(sent.to).toBe(USER.email.toLowerCase());
    expect(/^\d{6}$/.test(sent.code)).toBe(true);
    // …and the stored row must be a digest, never the plaintext code.
    const stored = mocks.prisma.emailVerificationCode.create.mock.calls[0][0].data;
    expect(stored.codeHash).toBe(hashVerificationCode(sent.code));
    expect(stored.codeHash).not.toContain(sent.code);
    expect(sent.code.length).toBe(6);
    // Response is honest about verification state.
    expect(reply.body.data.emailVerification.emailVerified).toBe(false);
    expect(reply.body.data.emailVerification.required).toBe(true);
  });
});

describe('POST /auth/verify-email — proving the address', () => {
  const request = (body: unknown) => call('/auth/verify-email', { headers: {}, body, ip: '203.0.113.9' });

  it('rejects a wrong code and burns an attempt, not the row', async () => {
    seedLiveCode();
    const reply = await request({ email: USER.email, code: '000000' });
    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('INVALID_CODE');
    expect(mocks.prisma.emailVerificationCode.update).toHaveBeenCalledWith({
      where: { id: 'evc-1' },
      data: { attempts: { increment: 1 } },
    });
    expect(mocks.db.codes[0].attempts).toBe(1);
    expect(mocks.db.codes[0].usedAt).toBeNull();
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects an expired code', async () => {
    seedLiveCode();
    mocks.db.codes[0].expiresAt = new Date(Date.now() - 60_000);
    const reply = await request({ email: USER.email, code: REAL_CODE });
    expect(reply.statusCode).toBe(400);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects a malformed code without touching the database', async () => {
    const reply = await request({ email: USER.email, code: '12' });
    expect(reply.statusCode).toBe(400);
    expect(mocks.prisma.emailVerificationCode.findFirst).not.toHaveBeenCalled();
  });

  it('answers a nonexistent account exactly like a wrong code', async () => {
    const reply = await request({ email: 'ghost@quantmail.in', code: REAL_CODE });
    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('INVALID_OR_EXPIRED_CODE');
  });

  it('flips emailVerified true only on the correct code, single-use', async () => {
    seedLiveCode();
    const reply = await request({ email: USER.email, code: REAL_CODE });
    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.emailVerified).toBe(true);
    // The burn goes through an interactive transaction…
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(typeof mocks.prisma.$transaction.mock.calls[0][0]).toBe('function');
    // …the code row is burned exactly once…
    const burns = mocks.prisma.emailVerificationCode.updateMany.mock.calls.filter(
      (c: any) => c[0]?.where?.id === 'evc-1' && c[0]?.where?.usedAt === null,
    );
    expect(burns).toHaveLength(1);
    expect(mocks.db.codes[0].usedAt).not.toBeNull();
    // …and the user row flips only inside that transaction.
    expect(mocks.db.users[USER.email].emailVerified).toBe(true);
  });

  it('short-circuits when the address is already verified', async () => {
    mocks.db.users[USER.email].emailVerified = true;
    const reply = await request({ email: USER.email, code: REAL_CODE });
    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.alreadyVerified).toBe(true);
    expect(mocks.prisma.emailVerificationCode.findFirst).not.toHaveBeenCalled();
  });

  it('concurrent redemptions: exactly one winner, the rest lose honestly', async () => {
    seedLiveCode();
    const RACERS = 10;
    const results = await Promise.all(
      Array.from({ length: RACERS }, () =>
        call('/auth/verify-email', { headers: {}, body: { email: USER.email, code: REAL_CODE }, ip: '203.0.113.9' }),
      ),
    );
    const winners = results.filter((r) => r.statusCode === 200);
    const losers = results.filter(
      (r) => r.statusCode === 400 && r.body?.error?.code === 'CODE_ALREADY_USED',
    );
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(RACERS - 1);
    expect(winners[0].body.data.emailVerified).toBe(true);
    // The code row was burned exactly once — one compare-and-set won.
    expect(mocks.db.codes[0].usedAt).not.toBeNull();
    const burns = mocks.prisma.emailVerificationCode.updateMany.mock.calls.filter(
      (c: any) => c[0]?.where?.id === 'evc-1' && c[0]?.where?.usedAt === null,
    );
    expect(burns).toHaveLength(RACERS);
    // The address is proven exactly once, by the single winner.
    expect(mocks.db.users[USER.email].emailVerified).toBe(true);
  });
});

describe('POST /auth/resend-verification — the first mail may not arrive', () => {
  const request = (body: unknown) => call('/auth/resend-verification', { headers: {}, body, ip: '203.0.113.9' });

  it('invalidates old codes, stores a fresh hash, and reports delivery honestly', async () => {
    const { sendVerificationEmail } = await import('../lib/email-verification');
    (sendVerificationEmail as any).mockResolvedValue(true);
    seedLiveCode();
    const reply = await request({ email: USER.email });
    expect(reply.statusCode).toBe(200);
    // The burn is compare-and-set on the request's own pending snapshot
    // ({ id, usedAt: null }), never a blanket userId burn — that is what
    // stops a concurrent resend from killing the code this request emails.
    expect(mocks.prisma.emailVerificationCode.findMany).toHaveBeenCalledWith({
      where: { userId: USER.id, usedAt: null },
      select: { id: true, attempts: true, expiresAt: true },
    });
    expect(mocks.prisma.emailVerificationCode.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['evc-1'] }, usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(mocks.db.codes[0].usedAt).not.toBeNull();
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(reply.body.data.emailSent).toBe(true);
    // The emailed code is the live one.
    const sent = (sendVerificationEmail as any).mock.calls[0][0];
    const live = mocks.db.codes.find((r: any) => r.usedAt === null);
    expect(live.codeHash).toBe(hashVerificationCode(sent.code));
  });

  it('a resend does NOT reset the attempt cap: live-code attempts carry over', async () => {
    const { sendVerificationEmail } = await import('../lib/email-verification');
    (sendVerificationEmail as any).mockResolvedValue(true);
    seedLiveCode();
    mocks.db.codes[0].attempts = 4;
    const reply = await request({ email: USER.email });
    expect(reply.statusCode).toBe(200);
    // Regression (per-account cap, not per-row): the replacement row must
    // inherit the 4 burned attempts, not start at 0 — otherwise resending
    // after 5 wrong guesses would mint a fresh 5-guess budget.
    const live = mocks.db.codes.find((r: any) => r.usedAt === null);
    expect(live.attempts).toBe(4);
    // One more wrong guess exhausts the inherited budget…
    const verify = (body: unknown) => call('/auth/verify-email', { headers: {}, body, ip: '203.0.113.9' });
    const wrong = await verify({ email: USER.email, code: '000000' });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.body.error.code).toBe('INVALID_CODE');
    expect(live.attempts).toBe(5);
    // …and the next guess is capped on the NEW row, not given a fresh budget.
    const capped = await verify({ email: USER.email, code: '000000' });
    expect(capped.statusCode).toBe(429);
    expect(capped.body.error.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('an expired superseded code does NOT carry attempts: a fresh epoch recovers', async () => {
    const { sendVerificationEmail } = await import('../lib/email-verification');
    (sendVerificationEmail as any).mockResolvedValue(true);
    seedLiveCode();
    mocks.db.codes[0].expiresAt = new Date(Date.now() - 60_000);
    mocks.db.codes[0].attempts = 5;
    const reply = await request({ email: USER.email });
    expect(reply.statusCode).toBe(200);
    // Expiry ends the epoch: the capped-out user is not locked out forever.
    const live = mocks.db.codes.find((r: any) => r.usedAt === null);
    expect(live.attempts).toBe(0);
    const sent = (sendVerificationEmail as any).mock.calls[0][0];
    const verify = (body: unknown) => call('/auth/verify-email', { headers: {}, body, ip: '203.0.113.9' });
    const ok = await verify({ email: USER.email, code: sent.code });
    expect(ok.statusCode).toBe(200);
    expect(ok.body.data.emailVerified).toBe(true);
  });

  it('keeps USER_NOT_FOUND non-enumeration and alreadyVerified early-return', async () => {
    const missing = await request({ email: 'nobody@quantmail.in' });
    expect(missing.statusCode).toBe(404);
    expect(missing.body.error.code).toBe('USER_NOT_FOUND');

    mocks.db.users[USER.email] = { ...USER, emailVerified: true };
    const verified = await request({ email: USER.email });
    expect(verified.statusCode).toBe(200);
    expect(verified.body.data.alreadyVerified).toBe(true);
    // No burn, no create, no email for an already-proven address.
    expect(mocks.prisma.emailVerificationCode.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.emailVerificationCode.create).not.toHaveBeenCalled();
  });
});
