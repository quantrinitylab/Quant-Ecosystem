/**
 * /auth/login → new-device alert wiring.
 *
 * The detector itself is unit-tested in auth-new-device-alert.test.ts. What
 * is pinned here is the wiring, because the wiring has the one footgun:
 * detection must run BEFORE issueBrowserSession records the new device, or
 * the check self-matches and never alerts. The call-order assertion locks
 * that in.
 *
 * Contract:
 * - Detector says new device → the alert is sent (to the account address,
 *   with the request's device/IP) and login still succeeds.
 * - Detector says known device → no alert, login still succeeds.
 * - Detector throws → login still succeeds, no alert (advisory, never a
 *   gate); a detector outage must not lock the user out.
 * - Wrong password → no detection, no alert, generic 401.
 *
 * The new-device-alert module is mocked wholesale here (same reason the
 * email-verification module is mocked in auth-login-liveness.test.ts: the
 * real module's SES chain cannot resolve under vitest in a worktree).
 *
 * HARD RULE: email only. No phone/SMS anywhere in this file or the code it
 * tests — phone OTP was removed by user order.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => {
  const users = new Map<string, any>();
  const order: string[] = [];
  let seq = 0;
  return {
    users,
    order,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
  };
});

const alertMocks = vi.hoisted(() => ({
  isNewDeviceSignIn: vi.fn(async () => false),
  sendNewDeviceAlert: vi.fn(async () => true),
}));

vi.mock('@quant/auth/lib/prisma', () => ({
  default: {
    user: {
      findMany: async ({ where, take }: any) => {
        const out = [...fakes.users.values()].filter((u: any) => {
          if (where?.deletedAt === null && u.deletedAt != null) return false;
          if (where?.email) {
            const lhs = String(u.email ?? '');
            const rhs = String(where.email.equals);
            if (where.email.mode === 'insensitive'
              ? lhs.toLowerCase() !== rhs.toLowerCase()
              : lhs !== rhs) return false;
          }
          return true;
        });
        return (take === undefined ? out : out.slice(0, take)).map((u: any) => ({ ...u }));
      },
    },
    refreshToken: { findMany: async () => [] },
  },
  prisma: {},
}));

vi.mock('../lib/email-verification', () => ({
  MAX_VERIFICATION_ATTEMPTS: 5,
  generateVerificationCode: () => '123456',
  hashVerificationCode: (code: string) => `hash_${code}`,
  isVerificationCodeExpired: () => false,
  looksLikeVerificationCode: (code: unknown) => typeof code === 'string' && /^\d{6}$/.test(code),
  sendVerificationEmail: vi.fn(async () => true),
  verificationCodeExpiry: () => new Date(Date.now() + 15 * 60 * 1000),
  verificationCodeMatches: (a: unknown, b: unknown) => a === b,
}));

vi.mock('argon2', () => ({
  hash: vi.fn(async (password: string) => `hashed_${password}`),
  verify: vi.fn(async () => true),
}));

vi.mock('../lib/auth-session', () => ({
  REFRESH_COOKIE_NAME: 'qm_refresh',
  createTokenService: () => ({}),
  fail: (reply: any, statusCode: number, code: string, message: string) => {
    reply.statusCode = statusCode;
    return reply.send({ success: false, error: { code, message } });
  },
  requireTrustedOrigin: () => true,
  sessionMetadataFromRequest: (request: any) => ({
    source: 'browser',
    userAgent: request.headers?.['user-agent'],
    ipAddress: request.ip,
  }),
  setRefreshCookie: () => {},
  clearRefreshCookie: () => {},
  sessionUserPayload: (u: any) => ({ id: u.id, email: u.email }),
  authenticatedUserId: () => undefined,
  issueBrowserSession: vi.fn(async (_t: unknown, _r: unknown, user: any) => {
    fakes.order.push('issue');
    return {
      success: true as const,
      data: { userId: user.id, user: { id: user.id, email: user.email } },
    };
  }),
}));

vi.mock('../lib/new-device-alert', () => ({
  isNewDeviceSignIn: (...args: unknown[]) => {
    fakes.order.push('detect');
    return (alertMocks.isNewDeviceSignIn as any)(...args);
  },
  sendNewDeviceAlert: alertMocks.sendNewDeviceAlert,
}));

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: () => 'test-access-secret',
  getJwtRefreshSecret: () => 'test-refresh-secret-long-enough-for-hs256',
}));

import * as argon2 from 'argon2';
import { authRoutes } from '../routes/auth';

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
    passwordHash: 'hashed_correctpw',
    emailVerified: true,
    status: 'ACTIVE',
    deletedAt: null,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    ...overrides,
  };
  fakes.users.set(row.id, row);
  return row;
};

const LOGIN_REQUEST = {
  headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) NewDevice/1.0' },
  ip: '198.51.100.23',
  body: { email: 'alice@quantmail.in', password: 'correctpw' },
};

beforeEach(() => {
  vi.clearAllMocks();
  fakes.users.clear();
  fakes.order.length = 0;
  (argon2.verify as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  alertMocks.isNewDeviceSignIn.mockResolvedValue(false);
  alertMocks.sendNewDeviceAlert.mockResolvedValue(true);
});

describe('POST /auth/login — new-device alert wiring', () => {
  it('new device: alert sent with the request device/IP, detection before issuance, login succeeds', async () => {
    seedUser();
    alertMocks.isNewDeviceSignIn.mockResolvedValueOnce(true);
    const reply = await call('/auth/login', LOGIN_REQUEST);

    expect(reply.statusCode).toBe(200);
    expect(reply.body.success).toBe(true);
    expect(fakes.order).toEqual(['detect', 'issue']);
    expect(alertMocks.sendNewDeviceAlert).toHaveBeenCalledTimes(1);
    expect(alertMocks.sendNewDeviceAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alice@quantmail.in',
        name: 'Alice',
        userAgent: 'Mozilla/5.0 (Macintosh) NewDevice/1.0',
        ipAddress: '198.51.100.23',
      }),
    );
  });

  it('known device: no alert, login succeeds', async () => {
    seedUser();
    const reply = await call('/auth/login', LOGIN_REQUEST);

    expect(reply.statusCode).toBe(200);
    expect(reply.body.success).toBe(true);
    expect(alertMocks.isNewDeviceSignIn).toHaveBeenCalledTimes(1);
    expect(alertMocks.sendNewDeviceAlert).not.toHaveBeenCalled();
  });

  it('detector failure never fails the login and sends no alert', async () => {
    seedUser();
    alertMocks.isNewDeviceSignIn.mockRejectedValueOnce(new Error('db down'));
    const reply = await call('/auth/login', LOGIN_REQUEST);

    expect(reply.statusCode).toBe(200);
    expect(reply.body.success).toBe(true);
    expect(alertMocks.sendNewDeviceAlert).not.toHaveBeenCalled();
  });

  it('wrong password: no detection, no alert, generic 401', async () => {
    seedUser();
    (argon2.verify as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    const reply = await call('/auth/login', LOGIN_REQUEST);

    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(alertMocks.isNewDeviceSignIn).not.toHaveBeenCalled();
    expect(alertMocks.sendNewDeviceAlert).not.toHaveBeenCalled();
  });
});
