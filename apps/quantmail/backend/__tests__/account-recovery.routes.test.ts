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
 * CODEX-REVIEW 6241280732 (war-room #902, 2026-10-18) corrective on #1254:
 * #1254 activated the address on session identity alone — authenticated PUT
 * with only {email} -> 200, then a usable reset link mailed to the UNVERIFIED
 * address. No current password or fresh challenge. Two corrections pinned
 * here:
 *  1. PUT /auth/account/recovery-email, POST .../verify, and the clear path
 *     cross the sensitive-action boundary (fastify.requireStepUp()): a stale
 *     session gets 401 STEP_UP_REQUIRED, not a channel redirect. The harness
 *     does not execute preHandlers (it calls handlers directly, like every
 *     sibling suite), so the boundary is pinned at REGISTRATION — the real
 *     Fastify app runs it.
 *  2. A new address starts PENDING: the code is mailed to the NEW address and
 *     only consumption flips users.recoveryEmailVerifiedAt. Legacy #1254 rows
 *     (recoveryEmail set, verifiedAt NULL) are INERT — the reset request
 *     mails them nothing until re-verified.
 *
 * Properties pinned here:
 *  1. The recovery address is mailed ONLY together with the primary address —
 *     never instead of it — and only when VERIFIED; the request response
 *     stays non-committal (it reveals neither account existence, nor whether
 *     a recovery email is set, nor whether it is verified).
 *  2. Setting, verifying, and clearing the recovery address require a FRESH
 *     session (step-up boundary registered on all three mutations) — it is
 *     not part of the unauthenticated reset flow.
 *  3. Validation is honest: malformed addresses 400, the account's own inbox
 *     as "recovery" 400 (it is not out-of-band), clearing is explicit.
 *  4. Consuming a code writes ONLY { recoveryEmail, recoveryEmailVerifiedAt }
 *     — 2FA, password, and every other credential stay untouched.
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
    recoveryEmailVerification: {
      create: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
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

// Deterministic codes; the real hash/match/expiry primitives stay in place so
// the digest storage and attempt-capping under test are the production ones.
vi.mock('../lib/email-verification', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    generateVerificationCode: () => '123456',
  };
});

import { passwordResetRoutes } from '../routes/password-reset';
import {
  accountRecoveryRoutes,
  looksLikeEmail,
  normalizeEmail,
} from '../routes/account-recovery';
import { hashVerificationCode } from '../lib/email-verification';

type RouteHandler = (request: any, reply: any) => Promise<unknown>;

/* A fake Fastify, deliberately loose: these suites are about the handlers.
 * Route REGISTRATION options are captured too, because the step-up boundary
 * (preHandler) is the enforcement point for stale sessions and the harness
 * never executes it — pinning registration is how this suite proves the
 * boundary is wired. */
const loadHandlers = async () => {
  const handlers = new Map<string, RouteHandler>();
  const routeOpts = new Map<string, unknown>();
  const fake: any = {
    // The step-up boundary runs in the real Fastify app; here it is a no-op
    // stub so registration succeeds (its PRESENCE is pinned by the boundary
    // tests via routeOpts).
    requireStepUp: () => async () => {},
    post: (path: string, opts: unknown, handler?: RouteHandler) => {
      handlers.set(`POST ${path}`, (handler ?? opts) as RouteHandler);
      routeOpts.set(`POST ${path}`, opts);
    },
    get: (path: string, handler: RouteHandler) => handlers.set(`GET ${path}`, handler),
    put: (path: string, opts: unknown, handler?: RouteHandler) => {
      handlers.set(`PUT ${path}`, (handler ?? opts) as RouteHandler);
      routeOpts.set(`PUT ${path}`, opts);
    },
  };
  await passwordResetRoutes(fake as never);
  await accountRecoveryRoutes(fake as never);
  return { handlers, routeOpts };
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
  const { handlers } = await loadHandlers();
  const reply = makeReply();
  await handlers.get(`${method} ${path}`)!(request, reply);
  return reply;
};

const registrationOpts = async (method: string, path: string) => {
  const { routeOpts } = await loadHandlers();
  return routeOpts.get(`${method} ${path}`) as { preHandler?: unknown } | undefined;
};

/** The fire-and-forget sends are started synchronously, but their catch is not. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

const USER = {
  id: 'user-1',
  email: 'Kundan@quantmail.in',
  username: 'kundan',
  displayName: 'Kundan',
  passwordHash: 'hashed_old-password',
  recoveryEmail: null as string | null,
  recoveryEmailVerifiedAt: null as Date | null,
  twoFactorEnabled: true,
  twoFactorSecret: 'totp-secret',
};

const SENT_MESSAGE =
  "If an account exists with that address, reset instructions have been sent to the account's email — and to its recovery email, if one was set.";

const authed = (extra: Record<string, unknown> = {}) => ({
  headers: trustedHeaders,
  ip: '203.0.113.9',
  auth: { userId: 'user-1' },
  ...extra,
});

const pendingRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'rev-1',
  userId: 'user-1',
  email: 'backup@example.com',
  codeHash: hashVerificationCode('123456'),
  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  attempts: 0,
  usedAt: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env['CORS_ORIGINS'] = 'http://localhost:3000';
  process.env['PASSWORD_RESET_APP_URL'] = 'https://quantmail.in';
  mocks.isSesConfigured.mockReturnValue(true);
  mocks.sendViaSes.mockResolvedValue('ses-message-id');
  mocks.argon2Hash.mockImplementation(async (password: string) => `hashed_${password}`);
  mocks.prisma.user.findFirst.mockResolvedValue(null);
  mocks.prisma.user.findUnique.mockResolvedValue({ ...USER });
  mocks.prisma.user.update.mockImplementation(async (args: any) => ({
    recoveryEmail: args?.data?.recoveryEmail ?? null,
    recoveryEmailVerifiedAt: args?.data?.recoveryEmailVerifiedAt ?? null,
  }));
  mocks.prisma.passwordResetToken.create.mockResolvedValue({ id: 'prt-1' });
  mocks.prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
  mocks.prisma.passwordResetToken.findMany.mockResolvedValue([]);
  mocks.prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
  mocks.prisma.recoveryEmailVerification.create.mockImplementation(async (args: any) => ({
    id: 'rev-1',
    ...args.data,
  }));
  mocks.prisma.recoveryEmailVerification.findFirst.mockResolvedValue(null);
  mocks.prisma.recoveryEmailVerification.deleteMany.mockResolvedValue({ count: 0 });
  mocks.prisma.recoveryEmailVerification.update.mockImplementation(async (args: any) => args.data);
});

const mailRecipients = (): string[][] =>
  mocks.sendViaSes.mock.calls.map((args: any[]) => args[0]?.to as string[]);

describe('POST /auth/password-reset — recovery-email channel', () => {
  const request = (body: unknown) =>
    call('POST', '/auth/password-reset', { headers: trustedHeaders, body, ip: '203.0.113.9' });

  it('mails the link to BOTH the inbox and the recovery email when it is VERIFIED', async () => {
    mocks.prisma.user.findFirst.mockResolvedValue({
      ...USER,
      recoveryEmail: 'backup@example.com',
      recoveryEmailVerifiedAt: new Date('2026-10-18T00:00:00Z'),
    });

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

  it('mails ONLY the inbox when the recovery email is UNVERIFIED (legacy #1254 row)', async () => {
    // The CODEX-REVIEW 6241280732 gap: an address activated by session
    // identity alone must be inert until its destination is verified.
    mocks.prisma.user.findFirst.mockResolvedValue({
      ...USER,
      recoveryEmail: 'backup@example.com',
      recoveryEmailVerifiedAt: null,
    });

    const reply = await request({ email: 'Kundan@quantmail.in' });
    await settle();

    expect(reply.statusCode).toBe(200);
    expect(mailRecipients()).toEqual([['Kundan@quantmail.in']]);
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

  it('returns the stored recovery email with verified:true when verified', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      recoveryEmail: 'backup@example.com',
      recoveryEmailVerifiedAt: new Date('2026-10-18T00:00:00Z'),
    });

    const reply = await call('GET', '/auth/account/recovery-email', authed());

    expect(reply.statusCode).toBe(200);
    expect(reply.body).toEqual({
      success: true,
      data: {
        recoveryEmail: 'backup@example.com',
        verified: true,
        pendingEmail: null,
      },
    });
  });

  it('reports verified:false for a legacy #1254 row (address set, never verified)', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      recoveryEmail: 'backup@example.com',
      recoveryEmailVerifiedAt: null,
    });

    const reply = await call('GET', '/auth/account/recovery-email', authed());

    expect(reply.body.data).toEqual({
      recoveryEmail: 'backup@example.com',
      verified: false,
      pendingEmail: null,
    });
  });

  it('surfaces the pending address while verification is outstanding', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ ...USER });
    mocks.prisma.recoveryEmailVerification.findFirst.mockResolvedValue(pendingRow());

    const reply = await call('GET', '/auth/account/recovery-email', authed());

    expect(reply.body.data).toEqual({
      recoveryEmail: null,
      verified: false,
      pendingEmail: 'backup@example.com',
    });
  });

  it('returns nulls when none is set', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ ...USER });

    const reply = await call('GET', '/auth/account/recovery-email', authed());

    expect(reply.body).toEqual({
      success: true,
      data: { recoveryEmail: null, verified: false, pendingEmail: null },
    });
  });
});

describe('PUT /auth/account/recovery-email — sensitive-action boundary', () => {
  it('registers the step-up preHandler (stale sessions are rejected by real Fastify)', async () => {
    // The harness calls handlers directly and never executes preHandlers, so
    // this is how the suite proves the boundary is wired: without it, a
    // stolen-but-stale session could redirect the channel — the #1254 gap.
    const opts = await registrationOpts('PUT', '/auth/account/recovery-email');
    expect(opts).toBeDefined();
    expect(typeof opts?.preHandler).toBe('function');
  });

  it('401s without a session', async () => {
    const reply = await call('PUT', '/auth/account/recovery-email', {
      headers: trustedHeaders,
      body: { email: 'backup@example.com' },
    });
    expect(reply.statusCode).toBe(401);
    expect(mocks.prisma.recoveryEmailVerification.create).not.toHaveBeenCalled();
  });

  it('does NOT activate the address: it creates a PENDING verification and mails the code to the NEW address', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ ...USER });

    const reply = await call(
      'PUT',
      '/auth/account/recovery-email',
      authed({ body: { email: '  Backup@Example.COM ' } }),
    );

    expect(reply.statusCode).toBe(200);
    // The channel is NOT written yet — activation waits for the code.
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
    // One pending address per user: superseded pendings are replaced.
    expect(mocks.prisma.recoveryEmailVerification.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(mocks.prisma.recoveryEmailVerification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        email: 'backup@example.com',
        codeHash: hashVerificationCode('123456'),
      }),
    });
    // Only the digest is stored — a leaked table is not live codes.
    const stored = mocks.prisma.recoveryEmailVerification.create.mock.calls[0][0].data;
    expect(stored.codeHash).not.toContain('123456');
    // The code goes to the NEW address itself, with honest copy.
    expect(mocks.sendViaSes).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['backup@example.com'],
        subject: 'Confirm your QuantMail recovery email',
      }),
    );
    expect(reply.body).toEqual({
      success: true,
      data: {
        recoveryEmail: null,
        verified: false,
        pendingEmail: 'backup@example.com',
        pendingVerification: true,
        codeDelivered: true,
      },
    });
  });

  it('answers codeDelivered:false honestly when the code email cannot go out', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ ...USER });
    mocks.isSesConfigured.mockReturnValue(false);

    const reply = await call(
      'PUT',
      '/auth/account/recovery-email',
      authed({ body: { email: 'backup@example.com' } }),
    );

    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.codeDelivered).toBe(false);
    expect(reply.body.data.pendingVerification).toBe(true);
    // Still pending — never claim an activation that cannot be completed.
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('re-submitting the already-verified address is idempotent (no code-spam)', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      ...USER,
      recoveryEmail: 'backup@example.com',
      recoveryEmailVerifiedAt: new Date('2026-10-18T00:00:00Z'),
    });

    const reply = await call(
      'PUT',
      '/auth/account/recovery-email',
      authed({ body: { email: 'backup@example.com' } }),
    );

    expect(reply.statusCode).toBe(200);
    expect(mocks.prisma.recoveryEmailVerification.create).not.toHaveBeenCalled();
    expect(mocks.sendViaSes).not.toHaveBeenCalled();
    expect(reply.body.data).toMatchObject({ recoveryEmail: 'backup@example.com', verified: true });
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
    expect(mocks.prisma.recoveryEmailVerification.create).not.toHaveBeenCalled();
  });

  it('does not wipe the channel on an absent field', async () => {
    // {} must not clear a set address — clearing is explicit (null/blank).
    const reply = await call('PUT', '/auth/account/recovery-email', authed({ body: {} }));

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('VALIDATION_ERROR');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('clears the channel AND any pending verification on null', async () => {
    const reply = await call(
      'PUT',
      '/auth/account/recovery-email',
      authed({ body: { email: null } }),
    );

    expect(reply.statusCode).toBe(200);
    expect(mocks.prisma.recoveryEmailVerification.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { recoveryEmail: null, recoveryEmailVerifiedAt: null },
    });
    expect(reply.body).toEqual({
      success: true,
      data: { recoveryEmail: null, verified: false, pendingEmail: null },
    });
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
      data: { recoveryEmail: null, recoveryEmailVerifiedAt: null },
    });
  });

  it('rejects the account’s own inbox as its recovery email', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ ...USER });

    const reply = await call(
      'PUT',
      '/auth/account/recovery-email',
      authed({ body: { email: 'kundan@quantmail.in' } }),
    );

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('RECOVERY_EMAIL_SAME_AS_ACCOUNT');
    expect(mocks.prisma.recoveryEmailVerification.create).not.toHaveBeenCalled();
  });
});

describe('POST /auth/account/recovery-email/verify', () => {
  it('registers the step-up preHandler', async () => {
    const opts = await registrationOpts('POST', '/auth/account/recovery-email/verify');
    expect(opts).toBeDefined();
    expect(typeof opts?.preHandler).toBe('function');
  });

  it('401s without a session', async () => {
    const reply = await call('POST', '/auth/account/recovery-email/verify', {
      headers: trustedHeaders,
      body: { code: '123456' },
    });
    expect(reply.statusCode).toBe(401);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('400s when no address is waiting for verification', async () => {
    mocks.prisma.recoveryEmailVerification.findFirst.mockResolvedValue(null);

    const reply = await call(
      'POST',
      '/auth/account/recovery-email/verify',
      authed({ body: { code: '123456' } }),
    );

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('NO_PENDING_VERIFICATION');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects a malformed code honestly', async () => {
    const reply = await call(
      'POST',
      '/auth/account/recovery-email/verify',
      authed({ body: { code: 'abcdef' } }),
    );

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a wrong code, counts the attempt, and does NOT activate', async () => {
    // The typo'd/unverifiable destination case: the guess fails honestly and
    // the channel stays exactly as it was.
    mocks.prisma.recoveryEmailVerification.findFirst.mockResolvedValue(pendingRow());

    const reply = await call(
      'POST',
      '/auth/account/recovery-email/verify',
      authed({ body: { code: '654321' } }),
    );

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('INVALID_VERIFICATION_CODE');
    expect(mocks.prisma.recoveryEmailVerification.update).toHaveBeenCalledWith({
      where: { id: 'rev-1' },
      data: { attempts: 1 },
    });
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects an expired code', async () => {
    mocks.prisma.recoveryEmailVerification.findFirst.mockResolvedValue(
      pendingRow({ expiresAt: new Date(Date.now() - 1000) }),
    );

    const reply = await call(
      'POST',
      '/auth/account/recovery-email/verify',
      authed({ body: { code: '123456' } }),
    );

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('VERIFICATION_CODE_EXPIRED');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects after the attempt cap is exhausted', async () => {
    mocks.prisma.recoveryEmailVerification.findFirst.mockResolvedValue(
      pendingRow({ attempts: 5 }),
    );

    const reply = await call(
      'POST',
      '/auth/account/recovery-email/verify',
      authed({ body: { code: '123456' } }),
    );

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('VERIFICATION_ATTEMPTS_EXCEEDED');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('activates the pending address on the right code — and writes ONLY the recovery fields', async () => {
    // 2FA preservation: the activation must not touch any credential.
    mocks.prisma.recoveryEmailVerification.findFirst.mockResolvedValue(pendingRow());

    const reply = await call(
      'POST',
      '/auth/account/recovery-email/verify',
      authed({ body: { code: '123456' } }),
    );

    expect(reply.statusCode).toBe(200);
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        recoveryEmail: 'backup@example.com',
        recoveryEmailVerifiedAt: expect.any(Date),
      },
    });
    const written = mocks.prisma.user.update.mock.calls[0][0].data;
    expect(Object.keys(written).sort()).toEqual(['recoveryEmail', 'recoveryEmailVerifiedAt']);
    // The consumed code is marked used...
    expect(mocks.prisma.recoveryEmailVerification.update).toHaveBeenCalledWith({
      where: { id: 'rev-1' },
      data: { usedAt: expect.any(Date) },
    });
    expect(reply.body).toEqual({
      success: true,
      data: { recoveryEmail: 'backup@example.com', verified: true, pendingEmail: null },
    });
  });

  it('a consumed code cannot be replayed', async () => {
    // First consume succeeds; the second attempt finds nothing pending.
    mocks.prisma.recoveryEmailVerification.findFirst
      .mockResolvedValueOnce(pendingRow())
      .mockResolvedValueOnce(null);

    const first = await call(
      'POST',
      '/auth/account/recovery-email/verify',
      authed({ body: { code: '123456' } }),
    );
    expect(first.statusCode).toBe(200);

    const second = await call(
      'POST',
      '/auth/account/recovery-email/verify',
      authed({ body: { code: '123456' } }),
    );
    expect(second.statusCode).toBe(400);
    expect(second.body.error.code).toBe('NO_PENDING_VERIFICATION');
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
