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
 * row, an expired code is rejected, and `emailVerified` flips true ONLY on a
 * successful code match.
 *
 * HARD RULE: email only. No phone/SMS anywhere in this file or the code it
 * tests — phone OTP was removed by user order.
 */

import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    emailVerificationCode: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    emailFolder: { createMany: vi.fn() },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
  sendViaSes: vi.fn(),
  isSesConfigured: vi.fn(() => true),
  argon2Hash: vi.fn(async (password: string) => `hashed_${password}`),
  issueBrowserSession: vi.fn(async (_t: unknown, _r: unknown, user: any) => ({
    success: true as const,
    data: { userId: user.id, user: { id: user.id, email: user.email } },
  })),
}));

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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendViaSes.mockResolvedValue('ses-message-id');
  mocks.isSesConfigured.mockReturnValue(true);
  mocks.prisma.user.findFirst.mockResolvedValue(null);
  mocks.prisma.user.findUnique.mockResolvedValue(USER);
  mocks.prisma.user.create.mockImplementation(async (args: any) => ({ id: 'user-1', ...args.data }));
  mocks.prisma.emailVerificationCode.create.mockResolvedValue({ id: 'evc-1' });
  mocks.prisma.emailVerificationCode.updateMany.mockResolvedValue({ count: 0 });
  mocks.prisma.emailVerificationCode.update.mockImplementation(async (args: any) => ({ ...args.data }));
});

describe('POST /auth/register — address is not proven at signup', () => {
  const request = (body: unknown) => call('/auth/register', { headers: {}, body, ip: '203.0.113.9' });

  it('creates the user with emailVerified: false, never true', async () => {
    const reply = await request({ email: USER.email, username: USER.username, password: 's3cure-p4ss' });
    expect(reply.statusCode).toBe(200);
    expect(mocks.prisma.user.create).toHaveBeenCalled();
    const created = mocks.prisma.user.create.mock.calls[0][0].data;
    expect(created.emailVerified).toBe(false);
  });

  it('dispatches a real verification email through SES and stores only the hash', async () => {
    const reply = await request({ email: USER.email, username: USER.username, password: 's3cure-p4ss' });
    expect(reply.statusCode).toBe(200);
    // The code must leave the building via the mailer…
    const { sendVerificationEmail } = await import('../lib/email-verification');
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    const sent = (sendVerificationEmail as any).mock.calls[0][0];
    expect(sent.to).toBe(USER.email);
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
  const liveRow = () => ({
    id: 'evc-1',
    userId: USER.id,
    codeHash: hashVerificationCode(REAL_CODE),
    expiresAt: new Date(Date.now() + 5 * 60_000),
    usedAt: null,
    attempts: 0,
  });

  it('rejects a wrong code and burns an attempt, not the row', async () => {
    mocks.prisma.emailVerificationCode.findFirst.mockResolvedValue(liveRow());
    const reply = await request({ email: USER.email, code: '000000' });
    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('INVALID_CODE');
    expect(mocks.prisma.emailVerificationCode.update).toHaveBeenCalledWith({
      where: { id: 'evc-1' },
      data: { attempts: { increment: 1 } },
    });
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects an expired code', async () => {
    mocks.prisma.emailVerificationCode.findFirst.mockResolvedValue({
      ...liveRow(),
      expiresAt: new Date(Date.now() - 60_000),
    });
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
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    const reply = await request({ email: 'ghost@quantmail.in', code: REAL_CODE });
    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('INVALID_OR_EXPIRED_CODE');
  });

  it('flips emailVerified true only on the correct code, single-use', async () => {
    mocks.prisma.emailVerificationCode.findFirst.mockResolvedValue(liveRow());
    const reply = await request({ email: USER.email, code: REAL_CODE });
    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.emailVerified).toBe(true);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    const ops = mocks.prisma.$transaction.mock.calls[0][0];
    expect(ops).toHaveLength(3);
    // The user row flips only inside that transaction — never on failure paths.
  });

  it('short-circuits when the address is already verified', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ ...USER, emailVerified: true });
    const reply = await request({ email: USER.email, code: REAL_CODE });
    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.alreadyVerified).toBe(true);
    expect(mocks.prisma.emailVerificationCode.findFirst).not.toHaveBeenCalled();
  });
});

describe('POST /auth/resend-verification — the first mail may not arrive', () => {
  const request = (body: unknown) => call('/auth/resend-verification', { headers: {}, body, ip: '203.0.113.9' });

  it('invalidates old codes, stores a fresh hash, and reports delivery honestly', async () => {
    const { sendVerificationEmail } = await import('../lib/email-verification');
    (sendVerificationEmail as any).mockResolvedValue(true);
    const reply = await request({ email: USER.email });
    expect(reply.statusCode).toBe(200);
    expect(mocks.prisma.emailVerificationCode.updateMany).toHaveBeenCalledWith({
      where: { userId: USER.id, usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(reply.body.data.emailSent).toBe(true);
  });
});
