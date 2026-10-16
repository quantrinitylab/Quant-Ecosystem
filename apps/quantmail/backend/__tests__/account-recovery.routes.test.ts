/**
 * Account recovery — the out-of-band recovery email channel.
 *
 * What this replaces: password-reset links were mailed to the user's own
 * QuantMail inbox only. Locked out (forgot password, no active session) that
 * inbox is unreachable, so the reset was a dead letter and the lockout
 * permanent. The fix is a nullable User.recoveryEmail (migration 0091), a
 * settings surface to manage it while signed in, and the reset request mailing
 * the link to the recovery address too when one is set.
 *
 * Properties pinned here:
 *  1. The recovery address is mailed ONLY together with the primary address —
 *     never instead of it — and the request response stays non-committal (it
 *     reveals neither account existence nor whether a recovery email is set).
 *  2. Changing the recovery address requires an authenticated session
 *     (401 otherwise) — it is not part of the unauthenticated reset flow.
 *  3. Validation is honest: malformed addresses 400, the account's own inbox
 *     as "recovery" 400 (it is not out-of-band), clearing is explicit.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const prisma: any = {
    user: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    passwordResetToken: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    refreshToken: { updateMany: vi.fn() },
    $transaction: vi.fn((cb: (tx: any) => Promise<unknown>) => cb(prisma)),
  };
  return {
    prisma,
    sendViaSes: vi.fn(),
    isSesConfigured: vi.fn(() => true),
    argon2Hash: vi.fn(async (password: string) => `hashed_${password}`),
  };
});

vi.mock('@quant/auth/lib/prisma', () => ({ default: mocks.prisma, prisma: mocks.prisma }));

vi.mock('../lib/ses-sender', () => ({
  sendViaSes: mocks.sendViaSes,
  isSesConfigured: mocks.isSesConfigured,
}));

vi.mock('argon2', () => ({ hash: mocks.argon2Hash, verify: vi.fn(async () => true) }));

vi.mock('@quant/auth/services/token-service', () => ({
  TokenService: class {
    generateTokenPair = vi.fn();
    refreshToken = vi.fn();
  },
}));

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: () => 'test-access-secret',
  getJwtRefreshSecret: () => 'test-refresh-secret-long-enough-for-hs256',
}));

import { passwordResetRoutes } from '../routes/password-reset';
import {
  accountRecoveryRoutes,
  looksLikeEmail,
  normalizeEmail,
} from '../routes/account-recovery';

type RouteHandler = (request: any, reply: any) => Promise<unknown>;

/* A fake Fastify, deliberately loose: these suites are about the handlers. */
const loadHandlers = async () => {
  const handlers = new Map<string, RouteHandler>();
  const fake: any = {
    post: (path: string, opts: unknown, handler?: RouteHandler) =>
      handlers.set(`POST ${path}`, (handler ?? opts) as RouteHandler),
    get: (path: string, handler: RouteHandler) => handlers.set(`GET ${path}`, handler),
    put: (path: string, handler: RouteHandler) => handlers.set(`PUT ${path}`, handler),
  };
  await passwordResetRoutes(fake as never);
  await accountRecoveryRoutes(fake as never);
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
  };
  return reply;
};

const trustedHeaders = { origin: 'http://localhost:3000' };

const call = async (method: string, path: string, request: Record<string, unknown>) => {
  const handlers = await loadHandlers();
  const reply = makeReply();
  await handlers.get(`${method} ${path}`)!(request, reply);
  return reply;
};

/** The fire-and-forget sends are started synchronously, but their catch is not. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

const USER = {
  id: 'user-1',
  email: 'Kundan@quantmail.in',
  username: 'kundan',
  displayName: 'Kundan',
  passwordHash: 'hashed_old-password',
};

const SENT_MESSAGE =
  "If an account exists with that address, reset instructions have been sent to the account's email — and to its recovery email, if one was set.";

const authed = (extra: Record<string, unknown> = {}) => ({
  headers: trustedHeaders,
  ip: '203.0.113.9',
  auth: { userId: 'user-1' },
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env['CORS_ORIGINS'] = 'http://localhost:3000';
  process.env['PASSWORD_RESET_APP_URL'] = 'https://quantmail.in';
  mocks.isSesConfigured.mockReturnValue(true);
  mocks.sendViaSes.mockResolvedValue('ses-message-id');
  mocks.argon2Hash.mockImplementation(async (password: string) => `hashed_${password}`);
  mocks.prisma.user.findFirst.mockResolvedValue(null);
  mocks.prisma.user.findUnique.mockResolvedValue(USER);
  mocks.prisma.user.update.mockImplementation(async (args: any) => ({
    recoveryEmail: args?.data?.recoveryEmail ?? null,
  }));
  mocks.prisma.passwordResetToken.create.mockResolvedValue({ id: 'prt-1' });
  mocks.prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
  mocks.prisma.passwordResetToken.findMany.mockResolvedValue([]);
  mocks.prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
});

const mailRecipients = (): string[][] =>
  mocks.sendViaSes.mock.calls.map((args: any[]) => args[0]?.to as string[]);

describe('POST /auth/password-reset — recovery-email channel', () => {
  const request = (body: unknown) =>
    call('POST', '/auth/password-reset', { headers: trustedHeaders, body, ip: '203.0.113.9' });

  it('mails the link to BOTH the inbox and the recovery email when one is set', async () => {
    mocks.prisma.user.findFirst.mockResolvedValue({ ...USER, recoveryEmail: 'backup@example.com' });

    const reply = await request({ email: 'Kundan@quantmail.in' });
    await settle();

    expect(reply.statusCode).toBe(200);
    expect(reply.body).toEqual({ success: true, data: { message: SENT_MESSAGE } });
    const recipients = mailRecipients();
    expect(recipients).toHaveLength(2);
    expect(recipients[0]).toEqual(['Kundan@quantmail.in']);
    expect(recipients[1]).toEqual(['backup@example.com']);
    // The same link rides both mails: the recovery copy must not be a
    // different, already-burned token.
    const urls = mocks.sendViaSes.mock.calls.map((args: any[]) => args[0]?.bodyHtml as string);
    const tokens = urls.map(
      (html: string) => html.match(/reset-password\?token=([A-Za-z0-9_-]+)/)?.[1],
    );
    expect(tokens[0]).toBeTruthy();
    expect(tokens[1]).toBe(tokens[0]);
  });

  it('mails ONLY the inbox when no recovery email is set', async () => {
    mocks.prisma.user.findFirst.mockResolvedValue({ ...USER, recoveryEmail: null });

    const reply = await request({ email: 'Kundan@quantmail.in' });
    await settle();

    expect(reply.statusCode).toBe(200);
    expect(mailRecipients()).toEqual([['Kundan@quantmail.in']]);
  });

  it('treats a blank recovery email as unset', async () => {
    mocks.prisma.user.findFirst.mockResolvedValue({ ...USER, recoveryEmail: '   ' });

    await request({ email: 'Kundan@quantmail.in' });
    await settle();

    expect(mailRecipients()).toEqual([['Kundan@quantmail.in']]);
  });

  it('still answers non-committally for unknown addresses (no enumeration)', async () => {
    mocks.prisma.user.findFirst.mockResolvedValue(null);

    const reply = await request({ email: 'nobody@quantmail.in' });
    await settle();

    expect(reply.statusCode).toBe(200);
    expect(reply.body).toEqual({ success: true, data: { message: SENT_MESSAGE } });
    expect(mocks.sendViaSes).not.toHaveBeenCalled();
  });
});

describe('GET /auth/account/recovery-email', () => {
  it('401s without a session', async () => {
    const reply = await call('GET', '/auth/account/recovery-email', {
      headers: trustedHeaders,
    });
    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns the stored recovery email', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ recoveryEmail: 'backup@example.com' });

    const reply = await call('GET', '/auth/account/recovery-email', authed());

    expect(reply.statusCode).toBe(200);
    expect(reply.body).toEqual({ success: true, data: { recoveryEmail: 'backup@example.com' } });
  });

  it('returns null when none is set', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ recoveryEmail: null });

    const reply = await call('GET', '/auth/account/recovery-email', authed());

    expect(reply.body).toEqual({ success: true, data: { recoveryEmail: null } });
  });
});

describe('PUT /auth/account/recovery-email', () => {
  it('401s without a session', async () => {
    const reply = await call('PUT', '/auth/account/recovery-email', {
      headers: trustedHeaders,
      body: { email: 'backup@example.com' },
    });
    expect(reply.statusCode).toBe(401);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('sets and normalizes a valid address', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ email: 'Kundan@quantmail.in' });

    const reply = await call('PUT', '/auth/account/recovery-email', authed({ body: { email: '  Backup@Example.COM ' } }));

    expect(reply.statusCode).toBe(200);
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { recoveryEmail: 'backup@example.com' },
      select: { recoveryEmail: true },
    });
    expect(reply.body).toEqual({ success: true, data: { recoveryEmail: 'backup@example.com' } });
  });

  it('rejects a malformed address honestly', async () => {
    for (const bad of ['not-an-email', 'a@b', 'a b@c.com', 42, 'x'.repeat(300) + '@e.com']) {
      const reply = await call(
        'PUT',
        '/auth/account/recovery-email',
        authed({ body: { email: bad } }),
      );
      expect(reply.statusCode).toBe(400);
      expect(reply.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('does not wipe the channel on an absent field', async () => {
    // {} must not clear a set address — clearing is explicit (null/blank).
    const reply = await call('PUT', '/auth/account/recovery-email', authed({ body: {} }));

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('VALIDATION_ERROR');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('clears the channel on a blank string too', async () => {
    const reply = await call(
      'PUT',
      '/auth/account/recovery-email',
      authed({ body: { email: '   ' } }),
    );

    expect(reply.statusCode).toBe(200);
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { recoveryEmail: null },
    });
  });

  it('rejects the account’s own inbox as its recovery email', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ email: 'Kundan@quantmail.in' });

    const reply = await call(
      'PUT',
      '/auth/account/recovery-email',
      authed({ body: { email: 'kundan@quantmail.in' } }),
    );

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('RECOVERY_EMAIL_SAME_AS_ACCOUNT');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('clears the channel on null', async () => {
    const reply = await call('PUT', '/auth/account/recovery-email', authed({ body: { email: null } }));

    expect(reply.statusCode).toBe(200);
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { recoveryEmail: null },
    });
    expect(reply.body).toEqual({ success: true, data: { recoveryEmail: null } });
  });
});

describe('recovery email validation helpers', () => {
  it('looksLikeEmail accepts real addresses, rejects junk', () => {
    expect(looksLikeEmail('backup@example.com')).toBe(true);
    expect(looksLikeEmail('a.b+tag@sub.domain.co')).toBe(true);
    expect(looksLikeEmail('not-an-email')).toBe(false);
    expect(looksLikeEmail('a@b')).toBe(false);
    expect(looksLikeEmail('')).toBe(false);
    expect(looksLikeEmail(null)).toBe(false);
    expect(looksLikeEmail(42)).toBe(false);
  });

  it('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail('  Backup@Example.COM ')).toBe('backup@example.com');
  });
});
