import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /auth/change-password must revoke every OTHER live refresh-token
 * session: a password change is the "I may be compromised" remediation path,
 * and Google's standard behavior is to sign the user out everywhere except
 * the browser they are changing the password from. Before the fix the handler
 * only rewrote the argon2 hash and left every other 30-day refresh-token
 * family live, so an attacker with a stolen session stayed signed in.
 */

const tx = {
  user: {
    update: vi.fn(),
  },
  refreshToken: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
};

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    refreshToken: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  argon2Verify: vi.fn(),
  argon2Hash: vi.fn(),
}));

vi.mock('@quant/auth/lib/prisma', () => ({
  default: mocks.prisma,
  prisma: mocks.prisma,
}));

vi.mock('argon2', () => ({
  hash: (...args: unknown[]) => mocks.argon2Hash(...args),
  verify: (...args: unknown[]) => mocks.argon2Verify(...args),
}));

vi.mock('@quant/auth/services/token-service', () => ({
  TokenService: class {},
}));

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: () => 'test-access-secret',
  getJwtRefreshSecret: () => 'test-refresh-secret',
}));

import { authRoutes } from '../routes/auth';

type RouteHandler = (request: any, reply: any) => Promise<unknown>;

const loadRoutes = async () => {
  const routes = new Map<string, { options: any; handler: RouteHandler }>();
  const registerRoute = (path: string, optionsOrHandler: unknown, maybeHandler?: RouteHandler) => {
    if (maybeHandler) {
      routes.set(path, { options: optionsOrHandler, handler: maybeHandler });
    } else {
      routes.set(path, { options: undefined, handler: optionsOrHandler as RouteHandler });
    }
  };
  const app = {
    post: registerRoute,
    get: registerRoute,
    patch: registerRoute,
    put: registerRoute,
    delete: registerRoute,
    requireStepUp: () => async () => {},
  };
  await authRoutes(app as never);
  return routes;
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

const digestOf = (token: string) => createHash('sha256').update(token).digest('hex');

const validUser = () => ({
  id: 'user-1',
  email: 'user@quantmail.in',
  username: 'user',
  passwordHash: 'hashed_old-password',
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.user.findUnique.mockResolvedValue(validUser());
  mocks.argon2Verify.mockResolvedValue(true);
  mocks.argon2Hash.mockImplementation(async (password: string) => `hashed_${password}`);
  // Run the transaction body against the tx mock, like a real commit.
  mocks.prisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
});

const callChangePassword = async (request: any) => {
  const routes = await loadRoutes();
  const reply = makeReply();
  await routes.get('/auth/change-password')!.handler(request, reply);
  return reply;
};

describe('POST /auth/change-password', () => {
  it('requires authentication', async () => {
    const reply = await callChangePassword({
      cookies: {},
      body: { currentPassword: 'old-password', newPassword: 'new-password-1' },
    });
    expect(reply.statusCode).toBe(401);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a wrong current password without touching sessions', async () => {
    mocks.argon2Verify.mockResolvedValue(false);
    const reply = await callChangePassword({
      auth: { userId: 'user-1' },
      cookies: { quantmail_refresh: 'current-token' },
      body: { currentPassword: 'wrong-password', newPassword: 'new-password-1' },
    });
    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('revokes every other live family but keeps the current session', async () => {
    mocks.prisma.refreshToken.findFirst.mockResolvedValue({ family: 'fam-current' });
    tx.refreshToken.findMany.mockResolvedValue([
      { family: 'fam-a' },
      { family: 'fam-b' },
      { family: 'fam-b' }, // rotation rows share a family: revoke it once
      { family: 'fam-oauth-grant' }, // third-party grant must die too
    ]);
    tx.user.update.mockResolvedValue({ id: 'user-1' });

    const reply = await callChangePassword({
      auth: { userId: 'user-1' },
      cookies: { quantmail_refresh: 'current-token' },
      body: { currentPassword: 'old-password', newPassword: 'new-password-1' },
    });

    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.message).toBe('Password updated.');
    expect(reply.body.data.revokedSessions).toBe(3);
    expect(reply.body.data.note).toBeUndefined();

    // The current session is identified from the refresh cookie digest,
    // exactly like /auth/sessions/revoke-others.
    expect(mocks.prisma.refreshToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          token: digestOf('current-token'),
          userId: 'user-1',
          isRevoked: false,
        }),
      }),
    );

    // Hash rewrite and revocation commit atomically in one transaction.
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: 'hashed_new-password-1' },
    });

    // Only OTHER live families are targeted — the current one excluded.
    expect(tx.refreshToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          isRevoked: false,
          family: { not: 'fam-current' },
        }),
      }),
    );
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', family: { in: ['fam-a', 'fam-b', 'fam-oauth-grant'] } },
      data: { isRevoked: true },
    });
  });

  it('reports honestly when there is nothing else to revoke', async () => {
    mocks.prisma.refreshToken.findFirst.mockResolvedValue({ family: 'fam-current' });
    tx.refreshToken.findMany.mockResolvedValue([]);

    const reply = await callChangePassword({
      auth: { userId: 'user-1' },
      cookies: { quantmail_refresh: 'current-token' },
      body: { currentPassword: 'old-password', newPassword: 'new-password-1' },
    });

    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.revokedSessions).toBe(0);
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
    // The password itself is still rewritten — revocation is additive.
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: 'hashed_new-password-1' },
    });
  });

  it('fail-safe: revokes EVERYTHING when the current session cannot be identified', async () => {
    // No cookie at all: the change-password remediation must still succeed,
    // and every session — including the caller's — dies. The caller proved
    // knowledge of the current password; the short-lived access token keeps
    // working for ~15 minutes, so re-sign-in is one step away.
    tx.refreshToken.findMany.mockResolvedValue([
      { family: 'fam-current' },
      { family: 'fam-attacker' },
    ]);

    const reply = await callChangePassword({
      auth: { userId: 'user-1' },
      cookies: {},
      body: { currentPassword: 'old-password', newPassword: 'new-password-1' },
    });

    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.revokedSessions).toBe(2);
    expect(reply.body.data.note).toContain('signed out too');
    expect(mocks.prisma.refreshToken.findFirst).not.toHaveBeenCalled();
    // No family excluded: everything is revoked.
    expect(tx.refreshToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', isRevoked: false },
      }),
    );
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', family: { in: ['fam-current', 'fam-attacker'] } },
      data: { isRevoked: true },
    });
  });

  it('rolls back the password change when the transaction fails', async () => {
    mocks.prisma.$transaction.mockRejectedValue(new Error('db unavailable'));

    await expect(
      callChangePassword({
        auth: { userId: 'user-1' },
        cookies: { quantmail_refresh: 'current-token' },
        body: { currentPassword: 'old-password', newPassword: 'new-password-1' },
      }),
    ).rejects.toThrow('db unavailable');

    // The rejection propagates without a 200: Fastify's global handler turns
    // it into a 500 rather than reporting "Password updated." on a
    // half-applied change.
  });
});
