/**
 * 2FA recovery for the both-factors-lost lockout (fix/qm-2fa-recovery-flow).
 *
 * What it replaces: losing the authenticator AND the backup codes meant
 * permanent lockout, because the (correct) hardening "password reset never
 * clears 2FA" left no path back in. The recovery channel is the VERIFIED
 * recovery email (migration 0102 lifecycle): no session exists in this flow,
 * so instead of step-up the channel is strongly re-verified at challenge time
 * with a fresh single-use, 15-minute-bounded, attempt-capped code, plus the
 * current password.
 *
 * Properties pinned here:
 *  1. POST /auth/2fa/recover answers the SAME non-committal 200 for unknown
 *     addresses, 2FA-off accounts, and unverified/legacy recovery rows —
 *     nothing is mailed and no challenge row is minted in those cases.
 *  2. Only an account with 2FA actually on AND a verified recovery address
 *     gets a challenge: the code goes ONLY to the verified recovery address
 *     (never the primary inbox, which is unreachable in this lockout), only
 *     its SHA-256 digest is stored, and a superseded pending is replaced.
 *  3. Confirm re-proves the password and consumes the code before ANYTHING
 *     is cleared; wrong password/unknown address are one 401 answer (no
 *     enumeration); wrong/expired/exhausted codes fail honestly and never
 *     touch 2FA; a challenge mailed to an address the owner has since
 *     replaced is inert.
 *  4. A successful confirm atomically clears the TOTP secret + enrolment
 *     state, burns every backup code, revokes every session, and burns the
 *     challenge — and emits an audit row plus a notification to the PRIMARY
 *     inbox. No session is issued.
 *  5. Password reset STILL never clears 2FA (regression pin).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const prisma: any = {
    user: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    passwordResetToken: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    twoFactorRecoveryChallenge: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    twoFactorBackupCode: { deleteMany: vi.fn() },
    refreshToken: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    // The suite is about the handler's decisions, not the database: the
    // transaction runs against these same mocks so call-shape assertions keep
    // working through the boundary.
    $transaction: vi.fn((cb: (tx: any) => Promise<unknown>) => cb(prisma)),
  };
  return {
    prisma,
    sendViaSes: vi.fn(),
    isSesConfigured: vi.fn(() => true),
    argon2Hash: vi.fn(async (password: string) => `hashed_${password}`),
    argon2Verify: vi.fn(async () => true),
  };
});

vi.mock('@quant/auth/lib/prisma', () => ({ default: mocks.prisma, prisma: mocks.prisma }));

vi.mock('../lib/ses-sender', () => ({
  sendViaSes: mocks.sendViaSes,
  isSesConfigured: mocks.isSesConfigured,
}));

vi.mock('argon2', () => ({ hash: mocks.argon2Hash, verify: mocks.argon2Verify }));

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
import { twoFactorRecoveryRoutes } from '../routes/two-factor-recovery';
import { hashVerificationCode } from '../lib/email-verification';

type RouteHandler = (request: any, reply: any) => Promise<unknown>;

/* A fake Fastify, deliberately loose: these suites are about the handlers.
 * Route registration options are captured because the trusted-origin gate is
 * real code (lib/auth-session) that the harness DOES execute. */
const loadHandlers = async () => {
  const handlers = new Map<string, RouteHandler>();
  const fake: any = {
    post: (path: string, opts: unknown, handler?: RouteHandler) => {
      handlers.set(`POST ${path}`, (handler ?? opts) as RouteHandler);
    },
    get: (path: string, handler: RouteHandler) => handlers.set(`GET ${path}`, handler),
    put: (path: string, opts: unknown, handler?: RouteHandler) => {
      handlers.set(`PUT ${path}`, (handler ?? opts) as RouteHandler);
    },
  };
  await twoFactorRecoveryRoutes(fake as never);
  await passwordResetRoutes(fake as never);
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

/** The fire-and-forget request mail is started synchronously, but its catch is not. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

const NON_COMMITTAL = {
  success: true,
  data: {
    message:
      'If an account exists with that address, has two-factor authentication on, and has a verified recovery email, a recovery code has been sent to the recovery address.',
  },
};

const USER = {
  id: 'user-1',
  email: 'Kundan@quantmail.in',
  username: 'kundan',
  displayName: 'Kundan',
  passwordHash: 'hashed_correct-password',
  twoFactorEnabled: true,
  twoFactorSecret: 'totp-secret',
  twoFactorPendingSecret: null,
  twoFactorConfirmedAt: new Date('2026-10-10T00:00:00Z'),
  twoFactorLastUsedStep: 12345,
  recoveryEmail: 'backup@example.com',
  recoveryEmailVerifiedAt: new Date('2026-10-18T00:00:00Z'),
};

const challengeRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'tfr-1',
  userId: 'user-1',
  email: 'backup@example.com',
  codeHash: hashVerificationCode('123456'),
  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  attempts: 0,
  usedAt: null,
  ...overrides,
});

const requestRecovery = (body: unknown, headers: Record<string, string> = trustedHeaders) =>
  call('POST', '/auth/2fa/recover', { headers, body, ip: '203.0.113.9' });

const confirmRecovery = (body: unknown, headers: Record<string, string> = trustedHeaders) =>
  call('POST', '/auth/2fa/recover/confirm', { headers, body, ip: '203.0.113.9' });

const mailRecipients = (): string[][] =>
  mocks.sendViaSes.mock.calls.map((args: any[]) => args[0]?.to as string[]);

beforeEach(() => {
  vi.clearAllMocks();
  process.env['CORS_ORIGINS'] = 'http://localhost:3000';
  mocks.isSesConfigured.mockReturnValue(true);
  mocks.sendViaSes.mockResolvedValue('ses-message-id');
  mocks.argon2Verify.mockResolvedValue(true);
  mocks.prisma.user.findMany.mockResolvedValue([{ ...USER }]);
  mocks.prisma.user.update.mockResolvedValue({});
  mocks.prisma.twoFactorRecoveryChallenge.create.mockImplementation(async (args: any) => ({
    id: 'tfr-1',
    ...args.data,
  }));
  mocks.prisma.twoFactorRecoveryChallenge.findFirst.mockResolvedValue(null);
  mocks.prisma.twoFactorRecoveryChallenge.findUnique.mockResolvedValue(null);
  mocks.prisma.twoFactorRecoveryChallenge.deleteMany.mockResolvedValue({ count: 0 });
  mocks.prisma.twoFactorRecoveryChallenge.update.mockResolvedValue({});
  // The success-path burn inside the transaction is a conditional write: it
  // only burns when the row is still unused, unexpired, under the attempt
  // cap and on the current channel — count 1 means this request won the burn.
  mocks.prisma.twoFactorRecoveryChallenge.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.twoFactorBackupCode.deleteMany.mockResolvedValue({ count: 8 });
  mocks.prisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });
  mocks.prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
});

describe('POST /auth/2fa/recover — the request', () => {
  it('answers the same non-committal 200 for an unknown address (no enumeration)', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([]);

    const reply = await requestRecovery({ email: 'nobody@quantmail.in' });
    await settle();

    expect(reply.statusCode).toBe(200);
    expect(reply.body).toEqual(NON_COMMITTAL);
    expect(mocks.prisma.twoFactorRecoveryChallenge.create).not.toHaveBeenCalled();
    expect(mocks.sendViaSes).not.toHaveBeenCalled();
  });

  it('answers identically when 2FA is off — no challenge, no mail', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([{ ...USER, twoFactorEnabled: false }]);

    const reply = await requestRecovery({ email: 'Kundan@quantmail.in' });
    await settle();

    expect(reply.body).toEqual(NON_COMMITTAL);
    expect(mocks.prisma.twoFactorRecoveryChallenge.create).not.toHaveBeenCalled();
    expect(mocks.sendViaSes).not.toHaveBeenCalled();
  });

  it('answers identically when 2FA was never armed (flag without a secret)', async () => {
    // The old enrolment bug's state: flag on, secret missing. Recovery must
    // not offer to reset what was never armed.
    mocks.prisma.user.findMany.mockResolvedValue([{
      ...USER,
      twoFactorEnabled: true,
      twoFactorSecret: null,
    }]);

    const reply = await requestRecovery({ email: 'Kundan@quantmail.in' });
    await settle();

    expect(reply.body).toEqual(NON_COMMITTAL);
    expect(mocks.prisma.twoFactorRecoveryChallenge.create).not.toHaveBeenCalled();
    expect(mocks.sendViaSes).not.toHaveBeenCalled();
  });

  it('answers identically for a legacy UNVERIFIED recovery address — it is inert', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([{
      ...USER,
      recoveryEmail: 'backup@example.com',
      recoveryEmailVerifiedAt: null,
    }]);

    const reply = await requestRecovery({ email: 'Kundan@quantmail.in' });
    await settle();

    expect(reply.body).toEqual(NON_COMMITTAL);
    expect(mocks.prisma.twoFactorRecoveryChallenge.create).not.toHaveBeenCalled();
    expect(mocks.sendViaSes).not.toHaveBeenCalled();
  });

  it('answers identically when no recovery email is set', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([{
      ...USER,
      recoveryEmail: null,
      recoveryEmailVerifiedAt: null,
    }]);

    const reply = await requestRecovery({ email: 'Kundan@quantmail.in' });
    await settle();

    expect(reply.body).toEqual(NON_COMMITTAL);
    expect(mocks.prisma.twoFactorRecoveryChallenge.create).not.toHaveBeenCalled();
    expect(mocks.sendViaSes).not.toHaveBeenCalled();
  });

  it('refuses an untrusted or missing Origin before touching anything', async () => {
    for (const headers of [{}, { origin: 'https://attacker.example' }]) {
      const reply = await requestRecovery(
        { email: 'Kundan@quantmail.in' },
        headers as Record<string, string>,
      );

      expect(reply.statusCode).toBe(403);
      expect(reply.body.error.code).toBe('UNTRUSTED_ORIGIN');
    }
    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('rejects a malformed email honestly', async () => {
    const reply = await requestRecovery({ email: 'not-an-email' });

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('VALIDATION_ERROR');
    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('mints a challenge and mails the code ONLY to the verified recovery address', async () => {
    const reply = await requestRecovery({ email: '  Kundan@QuantMail.in ' });
    await settle();

    // The response still says nothing — it is identical to the unknown case.
    expect(reply.body).toEqual(NON_COMMITTAL);

    // One live challenge per account: superseded pendings are replaced.
    expect(mocks.prisma.twoFactorRecoveryChallenge.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', usedAt: null },
    });
    expect(mocks.prisma.twoFactorRecoveryChallenge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        email: 'backup@example.com',
        codeHash: hashVerificationCode('123456'),
      }),
    });
    // Only the digest is stored — a leaked table is not live codes.
    const stored = mocks.prisma.twoFactorRecoveryChallenge.create.mock.calls[0][0].data;
    expect(stored.codeHash).not.toContain('123456');

    // The code rides the recovery channel only — NOT the primary inbox, which
    // is exactly what is unreachable in this lockout.
    expect(mocks.sendViaSes).toHaveBeenCalledTimes(1);
    expect(mocks.sendViaSes).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['backup@example.com'],
        subject: 'Recover your QuantMail two-factor authentication',
      }),
    );
    expect(mailRecipients()).toEqual([['backup@example.com']]);
  });

  it('mints nothing and mails nothing for case-colliding rows — still the non-committal 200', async () => {
    // Two legacy rows differing only by case: there is no single account a
    // challenge could belong to, so the request must not resolve
    // first-row-wins — and the answer must stay non-committal, unlike login,
    // so this endpoint never becomes an oracle for colliding rows.
    mocks.prisma.user.findMany.mockResolvedValue([
      { ...USER, id: 'user-1', email: 'Kundan@quantmail.in' },
      { ...USER, id: 'user-2', email: 'kundan@quantmail.in' },
    ]);

    const reply = await requestRecovery({ email: 'Kundan@quantmail.in' });
    await settle();

    expect(reply.body).toEqual(NON_COMMITTAL);
    expect(mocks.prisma.twoFactorRecoveryChallenge.create).not.toHaveBeenCalled();
    expect(mocks.prisma.twoFactorRecoveryChallenge.deleteMany).not.toHaveBeenCalled();
    expect(mocks.sendViaSes).not.toHaveBeenCalled();
  });
});

describe('POST /auth/2fa/recover/confirm — the explicitly-confirmed reset', () => {
  const validConfirm = () => ({
    email: 'Kundan@quantmail.in',
    password: 'correct-password',
    code: '123456',
  });

  beforeEach(() => {
    mocks.prisma.twoFactorRecoveryChallenge.findFirst.mockResolvedValue(challengeRow());
    // The transaction re-validates against a FRESH user read inside the unit
    // of work; by default the account has not moved since the pre-checks.
    mocks.prisma.user.findUnique.mockResolvedValue({ ...USER });
  });

  it('refuses an untrusted or missing Origin before touching anything', async () => {
    for (const headers of [{}, { origin: 'https://attacker.example' }]) {
      const reply = await confirmRecovery(
        validConfirm(),
        headers as Record<string, string>,
      );

      expect(reply.statusCode).toBe(403);
      expect(reply.body.error.code).toBe('UNTRUSTED_ORIGIN');
    }
    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('rejects malformed fields honestly', async () => {
    for (const body of [
      { password: 'x', code: '123456' },
      { email: 'Kundan@quantmail.in', code: '123456' },
      { email: 'Kundan@quantmail.in', password: '', code: '123456' },
      { email: 'Kundan@quantmail.in', password: 'x', code: 'abcdef' },
      { email: 'Kundan@quantmail.in', password: 'x', code: '12345' },
    ]) {
      const reply = await confirmRecovery(body);
      expect(reply.statusCode).toBe(400);
      expect(reply.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('answers 401 for an unknown address without checking the password', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([]);

    const reply = await confirmRecovery(validConfirm());

    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(mocks.argon2Verify).not.toHaveBeenCalled();
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('answers the SAME 401 for a wrong password (no enumeration)', async () => {
    mocks.argon2Verify.mockResolvedValue(false);

    const reply = await confirmRecovery(validConfirm());

    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
    expect(mocks.prisma.twoFactorBackupCode.deleteMany).not.toHaveBeenCalled();
  });

  it('409s EMAIL_CASE_CONFLICT for case-colliding rows before any password check', async () => {
    // No single twin can own the password proof: resolving first-row-wins
    // would let one twin's password reset the other twin's 2FA. Login
    // already discloses this condition pre-password, so nothing new leaks.
    mocks.prisma.user.findMany.mockResolvedValue([
      { ...USER, id: 'user-1', email: 'Kundan@quantmail.in' },
      { ...USER, id: 'user-2', email: 'kundan@quantmail.in' },
    ]);

    const reply = await confirmRecovery(validConfirm());

    expect(reply.statusCode).toBe(409);
    expect(reply.body.error.code).toBe('EMAIL_CASE_CONFLICT');
    expect(mocks.argon2Verify).not.toHaveBeenCalled();
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
    expect(mocks.prisma.twoFactorBackupCode.deleteMany).not.toHaveBeenCalled();
  });

  it('401s for a suspended account after the password check — no 2FA reset', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([{ ...USER, status: 'SUSPENDED' }]);

    const reply = await confirmRecovery(validConfirm());

    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect(mocks.argon2Verify).toHaveBeenCalled();
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('401s for a deactivated account after the password check — no 2FA reset', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([{ ...USER, status: 'DEACTIVATED' }]);

    const reply = await confirmRecovery(validConfirm());

    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('ACCOUNT_DEACTIVATED');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('aborts inside the transaction when the account is suspended mid-flight', async () => {
    // The pre-checks passed, then an admin suspended the account before the
    // burn: the in-transaction re-validation refuses and writes nothing.
    mocks.prisma.user.findUnique.mockResolvedValue({ ...USER, status: 'SUSPENDED' });

    const reply = await confirmRecovery(validConfirm());

    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
    expect(mocks.prisma.twoFactorBackupCode.deleteMany).not.toHaveBeenCalled();
  });

  it('409s when 2FA is not on — there is nothing to recover', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([{ ...USER, twoFactorEnabled: false }]);

    const reply = await confirmRecovery(validConfirm());

    expect(reply.statusCode).toBe(409);
    expect(reply.body.error.code).toBe('TWO_FACTOR_NOT_ENABLED');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('409s when the recovery address was never verified', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([{
      ...USER,
      recoveryEmail: 'backup@example.com',
      recoveryEmailVerifiedAt: null,
    }]);

    const reply = await confirmRecovery(validConfirm());

    expect(reply.statusCode).toBe(409);
    expect(reply.body.error.code).toBe('NO_VERIFIED_RECOVERY_EMAIL');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('400s when no recovery code was requested', async () => {
    mocks.prisma.twoFactorRecoveryChallenge.findFirst.mockResolvedValue(null);

    const reply = await confirmRecovery(validConfirm());

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('NO_PENDING_RECOVERY');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects a wrong code, counts the attempt atomically, and leaves 2FA untouched', async () => {
    const reply = await confirmRecovery({ ...validConfirm(), code: '654321' });

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('INVALID_RECOVERY_CODE');
    // Bounded atomic increment: one conditional UPDATE per wrong guess —
    // never a read-modify-write off the stale snapshot, so parallel wrong
    // guesses each count instead of all storing attempts=1.
    expect(mocks.prisma.twoFactorRecoveryChallenge.updateMany).toHaveBeenCalledWith({
      where: { id: 'tfr-1', usedAt: null, attempts: { lt: 5 } },
      data: { attempts: { increment: 1 } },
    });
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
    expect(mocks.prisma.twoFactorBackupCode.deleteMany).not.toHaveBeenCalled();
    expect(mocks.prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an expired code', async () => {
    mocks.prisma.twoFactorRecoveryChallenge.findFirst.mockResolvedValue(
      challengeRow({ expiresAt: new Date(Date.now() - 1000) }),
    );

    const reply = await confirmRecovery(validConfirm());

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('RECOVERY_CODE_EXPIRED');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects after the attempt cap is exhausted', async () => {
    mocks.prisma.twoFactorRecoveryChallenge.findFirst.mockResolvedValue(
      challengeRow({ attempts: 5 }),
    );

    const reply = await confirmRecovery(validConfirm());

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('RECOVERY_ATTEMPTS_EXCEEDED');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects a code mailed to a recovery address the owner has since replaced', async () => {
    // The owner set a NEW address behind a fresh session after the code went
    // out: the old challenge is inert and must not reset 2FA.
    mocks.prisma.twoFactorRecoveryChallenge.findFirst.mockResolvedValue(
      challengeRow({ email: 'old-backup@example.com' }),
    );

    const reply = await confirmRecovery(validConfirm());

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('RECOVERY_CHANNEL_CHANGED');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('a consumed code cannot be replayed', async () => {
    mocks.prisma.twoFactorRecoveryChallenge.findFirst
      .mockResolvedValueOnce(challengeRow())
      .mockResolvedValueOnce(null);

    const first = await confirmRecovery(validConfirm());
    expect(first.statusCode).toBe(200);

    const second = await confirmRecovery(validConfirm());
    expect(second.statusCode).toBe(400);
    expect(second.body.error.code).toBe('NO_PENDING_RECOVERY');
  });

  describe('a confirm that goes through', () => {
    it('clears the TOTP secret and its enrolment state — and nothing else credential-shaped', async () => {
      const reply = await confirmRecovery(validConfirm());

      expect(reply.statusCode).toBe(200);
      expect(mocks.prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorPendingSecret: null,
          twoFactorConfirmedAt: null,
          twoFactorLastUsedStep: null,
          failedLoginAttempts: 0,
          lockoutUntil: null,
        },
      });
      // The password hash is never part of this write — this endpoint does
      // not rotate the password, so it must not touch it.
      const written = mocks.prisma.user.update.mock.calls[0][0].data;
      expect(written).not.toHaveProperty('passwordHash');
    });

    it('burns every backup code', async () => {
      await confirmRecovery(validConfirm());

      expect(mocks.prisma.twoFactorBackupCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('revokes every live session', async () => {
      await confirmRecovery(validConfirm());

      expect(mocks.prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { isRevoked: true },
      });
    });

    it('burns the challenge with a conditional single-use write', async () => {
      await confirmRecovery(validConfirm());

      // The burn only lands on a row that is still unused, unexpired, under
      // the attempt cap, and on the current channel — a parallel confirm
      // finds no burnable row and gets an honest conflict instead of a
      // second 2FA clear.
      expect(mocks.prisma.twoFactorRecoveryChallenge.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'tfr-1',
          userId: 'user-1',
          usedAt: null,
          expiresAt: { gt: expect.any(Date) },
          attempts: { lt: 5 },
          email: 'backup@example.com',
        },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('emits an audit row naming the recovery channel', async () => {
      await confirmRecovery(validConfirm());

      expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: 'TWO_FACTOR_RECOVERY_CONFIRMED',
          resource: 'user',
          metadata: expect.objectContaining({ channel: 'verified-recovery-email' }),
        }),
      });
    });

    it('notifies the PRIMARY inbox — the account-takeover signal', async () => {
      const reply = await confirmRecovery(validConfirm());

      expect(mocks.sendViaSes).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['Kundan@quantmail.in'],
          subject: 'Your QuantMail two-factor authentication was turned off',
        }),
      );
      expect(reply.body).toEqual({
        success: true,
        data: {
          message:
            'Two-factor authentication is off. Sign in with your password, then set up a new authenticator in Settings → Security.',
          notifiedPrimaryInbox: true,
        },
      });
    });

    it('answers honestly when the inbox notification cannot go out', async () => {
      mocks.isSesConfigured.mockReturnValue(false);

      const reply = await confirmRecovery(validConfirm());

      expect(reply.statusCode).toBe(200);
      expect(reply.body.data.notifiedPrimaryInbox).toBe(false);
      // The recovery still completed — a notification failure must not roll
      // back the security action.
      expect(mocks.prisma.user.update).toHaveBeenCalled();
    });

    it('issues no session, no token and no cookie', async () => {
      const reply = await confirmRecovery(validConfirm());

      expect(reply.body.data).not.toHaveProperty('accessToken');
      expect(reply.body.data).not.toHaveProperty('refreshToken');
      expect(reply.body.data).not.toHaveProperty('sessionId');
    });
  });
});

describe('confirm consumption is single-use and race-proof', () => {
  const validConfirm = () => ({
    email: 'Kundan@quantmail.in',
    password: 'correct-password',
    code: '123456',
  });

  beforeEach(() => {
    mocks.prisma.twoFactorRecoveryChallenge.findFirst.mockResolvedValue(challengeRow());
    mocks.prisma.user.findUnique.mockResolvedValue({ ...USER });
  });

  it('two concurrent confirms yield exactly one winner — the loser 409s and writes nothing', async () => {
    // Mocked transaction concurrency: both requests read the same pending
    // snapshot, but the conditional burn lets exactly one through. This is
    // the in-harness model of the PostgreSQL
    // updateMany({ where: { usedAt: null, ... } }) barrier — the row lock the
    // database provides is what serializes the two burns; the harness pins
    // the handler's decision logic (burn-first, loser-writes-nothing).
    mocks.prisma.twoFactorRecoveryChallenge.updateMany
      .mockResolvedValueOnce({ count: 1 }) // the winner burns the challenge
      .mockResolvedValue({ count: 0 }); // every later burn finds no burnable row
    mocks.prisma.twoFactorRecoveryChallenge.findUnique.mockResolvedValue(
      challengeRow({ usedAt: new Date() }),
    );

    const [first, second] = await Promise.all([
      confirmRecovery(validConfirm()),
      confirmRecovery(validConfirm()),
    ]);

    const codes = [first.statusCode, second.statusCode].sort();
    expect(codes).toEqual([200, 409]);
    const loser = first.statusCode === 409 ? first : second;
    // Honest conflict — it asks the client to re-request instead of lying
    // about what happened.
    expect(loser.body.error.code).toBe('RECOVERY_CONFLICT');
    // Exactly one 2FA clear: the loser wrote nothing inside its transaction,
    // so a parallel consume can never clear freshly re-enrolled TOTP state.
    expect(mocks.prisma.user.update).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.twoFactorBackupCode.deleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
  });

  it('a stale replay after the challenge was consumed 409s and writes nothing', async () => {
    // The pause-confirm replay: the request's snapshot predates the burn,
    // but the conditional write inside the transaction finds no burnable
    // row — the replay cannot reuse the old channel proof.
    mocks.prisma.twoFactorRecoveryChallenge.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.twoFactorRecoveryChallenge.findUnique.mockResolvedValue(
      challengeRow({ usedAt: new Date() }),
    );

    const reply = await confirmRecovery(validConfirm());

    expect(reply.statusCode).toBe(409);
    expect(reply.body.error.code).toBe('RECOVERY_CONFLICT');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
    expect(mocks.prisma.twoFactorBackupCode.deleteMany).not.toHaveBeenCalled();
    expect(mocks.prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('a recovery-channel change between the pre-checks and the write aborts inside the transaction', async () => {
    // The owner set a NEW recovery address behind a fresh session after the
    // pre-checks read the account: the in-transaction re-validation sees the
    // fresh channel and refuses — the stale channel proof is inert.
    mocks.prisma.user.findUnique.mockResolvedValue({
      ...USER,
      recoveryEmail: 'new-backup@example.com',
    });

    const reply = await confirmRecovery(validConfirm());

    expect(reply.statusCode).toBe(409);
    expect(reply.body.error.code).toBe('RECOVERY_CHANNEL_CHANGED');
    expect(mocks.prisma.twoFactorRecoveryChallenge.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('a burn lost to expiry between pre-check and write names the expiry honestly', async () => {
    mocks.prisma.twoFactorRecoveryChallenge.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.twoFactorRecoveryChallenge.findUnique.mockResolvedValue(
      challengeRow({ expiresAt: new Date(Date.now() - 1000) }),
    );

    const reply = await confirmRecovery(validConfirm());

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('RECOVERY_CODE_EXPIRED');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('five parallel wrong-code attempts each increment — attempts ends at 5, not 1', async () => {
    // An in-memory model of the atomic UPDATE ... SET attempts = attempts+1:
    // each conditional write adds exactly one, the way PostgreSQL executes
    // the increment. The old read-modify-write would leave this at 1.
    let dbAttempts = 0;
    mocks.prisma.twoFactorRecoveryChallenge.updateMany.mockImplementation(async (args: any) => {
      dbAttempts += args?.data?.attempts?.increment ?? 0;
      return { count: 1 };
    });

    const replies = await Promise.all(
      Array.from({ length: 5 }, () =>
        confirmRecovery({ ...validConfirm(), code: '654321' }),
      ),
    );

    for (const reply of replies) {
      expect(reply.statusCode).toBe(400);
      expect(reply.body.error.code).toBe('INVALID_RECOVERY_CODE');
    }
    expect(dbAttempts).toBe(5);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
    expect(mocks.prisma.twoFactorBackupCode.deleteMany).not.toHaveBeenCalled();
  });
});

describe('regression: password reset still never clears 2FA', () => {
  it('the confirm writes carry no twoFactor keys even for a 2FA-armed account', async () => {
    // The hardening that made the both-factors-lost lockout possible in the
    // first place must survive this flow: mailbox control stays not-a-factor.
    mocks.prisma.user.findUnique.mockResolvedValue({ ...USER });
    mocks.prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'prt-1',
      userId: 'user-1',
      tokenHash: 'digest',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      usedAt: null,
    });
    mocks.prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    mocks.argon2Hash.mockResolvedValue('hashed_new-password');

    await call('POST', '/auth/password-reset/confirm', {
      headers: trustedHeaders,
      body: { token: 'reset-token-'.padEnd(43, 'x'), newPassword: 'CorrectHorse1!' },
      ip: '203.0.113.9',
    });
    await settle();

    const updateCalls = mocks.prisma.user.update.mock.calls;
    expect(updateCalls.length).toBeGreaterThan(0);
    for (const [args] of updateCalls) {
      const keys = Object.keys(args?.data ?? {});
      expect(keys.some((key) => key.startsWith('twoFactor'))).toBe(false);
      expect(JSON.stringify(args?.data ?? {})).not.toContain('twoFactor');
    }
  });
});
