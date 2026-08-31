/**
 * The two-factor HTTP surface.
 *
 * Each test here names a specific way the previous implementation was untrue:
 * `/auth/2fa/setup` stored nothing, `/auth/2fa/enable` accepted the secret back
 * from the client and checked the code with `/^\d{6}$/` inside a `catch` that
 * swallowed database failures, and `/auth/2fa/status` did not exist at all so the
 * settings screen offered "Enable 2FA" to accounts that already had it.
 *
 * Prisma, argon2, otplib and the token service are mocked: what is under test is
 * the decision each route makes, not the drivers underneath it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const REFRESH_SECRET = 'test-refresh-secret-long-enough-for-hs256-abcdef';
const USER_ID = 'user-1';
const PENDING_SECRET = 'PENDINGSECRETBASE32AAA';
const LIVE_SECRET = 'LIVESECRETBASE32BBBBBB';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    twoFactorBackupCode: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
  },
  generateTokenPair: vi.fn(),
  generateSecret: vi.fn(),
  totpVerify: vi.fn(),
  argon2Verify: vi.fn(),
}));

vi.mock('@quant/auth/lib/prisma', () => ({ default: mocks.prisma, prisma: mocks.prisma }));

vi.mock('@quant/auth', () => ({
  totpService: { generateSecret: mocks.generateSecret, verify: mocks.totpVerify },
}));

vi.mock('argon2', () => ({
  hash: vi.fn(async (password: string) => `hashed_${password}`),
  verify: mocks.argon2Verify,
}));

vi.mock('@quant/auth/services/token-service', () => ({
  TokenService: class {
    generateTokenPair = mocks.generateTokenPair;
    refreshToken = vi.fn();
  },
}));

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: () => 'test-access-secret',
  getJwtRefreshSecret: () => REFRESH_SECRET,
}));

import {
  hashBackupCode,
  signTwoFactorChallenge,
  totpReplayFloorAfter,
  totpStepFor,
} from '../lib/two-factor';
import { twoFactorRoutes } from '../routes/two-factor';

/* A fake Fastify, deliberately loose. */

type RouteHandler = (request: any, reply: any) => Promise<unknown>;

/**
 * A two-method fake app. The real `fastify.get('/auth/2fa/status', handler)`
 * passes the handler in the second position while every `post` here passes route
 * options first, so both shapes have to be accepted.
 */
const loadHandlers = async () => {
  const handlers = new Map<string, RouteHandler>();
  const register = (path: string, optionsOrHandler: unknown, maybeHandler?: RouteHandler) => {
    handlers.set(path, (maybeHandler ?? optionsOrHandler) as RouteHandler);
  };
  await twoFactorRoutes({ post: register, get: register } as never);
  return handlers;
};

const makeReply = () => {
  const reply: any = {
    statusCode: 200,
    body: undefined,
    cookie: undefined,
    code(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    send(body: unknown) {
      this.body = body;
      return body;
    },
    setCookie(name: string, value: string, options: unknown) {
      this.cookie = { name, value, options };
      return this;
    },
    clearCookie() {
      return this;
    },
  };
  return reply;
};

const trustedHeaders = { origin: 'http://localhost:3000' };

const authed = (body: unknown = {}) => ({
  auth: { userId: USER_ID },
  headers: trustedHeaders,
  body,
});

const baseUser = {
  id: USER_ID,
  email: 'kundan@quantmail.in',
  username: 'kundan',
  displayName: 'Kundan',
  role: 'USER',
  passwordHash: 'hashed_pw',
};

const offUser = (overrides: Record<string, unknown> = {}) => ({
  ...baseUser,
  twoFactorEnabled: false,
  twoFactorSecret: null,
  twoFactorPendingSecret: null,
  twoFactorConfirmedAt: null,
  twoFactorLastUsedStep: null,
  ...overrides,
});

const enabledUser = (overrides: Record<string, unknown> = {}) =>
  offUser({
    twoFactorEnabled: true,
    twoFactorSecret: LIVE_SECRET,
    twoFactorConfirmedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  });

/** The last `prisma.user.update` payload, which is where each route's truth lands. */
const lastUserUpdate = () => mocks.prisma.user.update.mock.calls.at(-1)?.[0]?.data;

const call = async (path: string, request: unknown) => {
  const handlers = await loadHandlers();
  const reply = makeReply();
  await handlers.get(path)!(request as any, reply);
  return reply;
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env['NODE_ENV'] = 'production';
  process.env['CORS_ORIGINS'] = 'http://localhost:3000,https://quantmail.in';
  mocks.generateSecret.mockReturnValue(PENDING_SECRET);
  mocks.totpVerify.mockReturnValue(true);
  mocks.argon2Verify.mockResolvedValue(true);
  mocks.generateTokenPair.mockResolvedValue({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 900,
    tokenType: 'Bearer',
  });
  mocks.prisma.user.update.mockResolvedValue({});
  mocks.prisma.twoFactorBackupCode.deleteMany.mockResolvedValue({ count: 0 });
  mocks.prisma.twoFactorBackupCode.createMany.mockResolvedValue({ count: 10 });
  mocks.prisma.twoFactorBackupCode.findMany.mockResolvedValue([]);
  mocks.prisma.twoFactorBackupCode.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.twoFactorBackupCode.count.mockResolvedValue(10);
});

describe('POST /auth/2fa/setup', () => {
  it('stores the secret it issued instead of trusting the client to return it', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(offUser());

    const reply = await call('/auth/2fa/setup', authed());

    expect(reply.statusCode).toBe(200);
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { twoFactorPendingSecret: PENDING_SECRET },
    });
    expect(reply.body.data.secret).toBe(PENDING_SECRET);
  });

  /** Pending is not on. The old route set a flag and called that enrolment. */
  it('does not turn anything on', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(offUser());

    await call('/auth/2fa/setup', authed());

    expect(lastUserUpdate()).not.toHaveProperty('twoFactorEnabled');
    expect(lastUserUpdate()).not.toHaveProperty('twoFactorSecret');
  });

  /**
   * The URI contains the shared secret. It is returned for the browser to draw
   * locally — the previous version sent it to `api.qrserver.com`, which put every
   * user's second factor in a third party's access log.
   */
  it('returns an otpauth URI for local rendering, naming the account', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(offUser());

    const reply = await call('/auth/2fa/setup', authed());
    const uri: string = reply.body.data.otpauthUri;

    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).not.toContain('qrserver');
    expect(uri).not.toContain('http');
    expect(new URL(uri).searchParams.get('secret')).toBe(PENDING_SECRET);
    expect(reply.body.data.account).toBe(baseUser.email);
    expect(reply.body.data.issuer).toBe('QuantMail');
  });

  it('refuses an anonymous caller before reading any row', async () => {
    const reply = await call('/auth/2fa/setup', { headers: trustedHeaders, body: {} });

    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('UNAUTHORIZED');
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  /** Re-enrolling silently would strand whichever authenticator the user still trusts. */
  it('refuses to re-enrol an account that already has a live secret', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(enabledUser());

    const reply = await call('/auth/2fa/setup', authed());

    expect(reply.statusCode).toBe(409);
    expect(reply.body.error.code).toBe('ALREADY_ENABLED');
    expect(mocks.generateSecret).not.toHaveBeenCalled();
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  /** A flag with no secret is exactly the state the old enable route left behind. */
  it('lets an account with a flag but no secret enrol properly', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(
      offUser({ twoFactorEnabled: true, twoFactorSecret: null }),
    );

    const reply = await call('/auth/2fa/setup', authed());

    expect(reply.statusCode).toBe(200);
    expect(lastUserUpdate()).toEqual({ twoFactorPendingSecret: PENDING_SECRET });
  });
});

describe('POST /auth/2fa/enable', () => {
  it('verifies the code against the stored pending secret, not one from the body', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(
      offUser({ twoFactorPendingSecret: PENDING_SECRET }),
    );

    const reply = await call(
      '/auth/2fa/enable',
      authed({ code: '123456', secret: 'ATTACKER-CHOSEN-SECRET' }),
    );

    expect(reply.statusCode).toBe(200);
    expect(mocks.totpVerify).toHaveBeenCalledWith('123456', PENDING_SECRET);
    expect(lastUserUpdate().twoFactorSecret).toBe(PENDING_SECRET);
  });

  it('promotes the pending secret and records the confirmation', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(
      offUser({ twoFactorPendingSecret: PENDING_SECRET }),
    );

    const reply = await call('/auth/2fa/enable', authed({ code: '123456' }));
    const data = lastUserUpdate();

    expect(data.twoFactorEnabled).toBe(true);
    expect(data.twoFactorSecret).toBe(PENDING_SECRET);
    expect(data.twoFactorPendingSecret).toBeNull();
    expect(data.twoFactorConfirmedAt).toBeInstanceOf(Date);
    expect(reply.body.data.confirmedAt).toBe(data.twoFactorConfirmedAt.toISOString());
  });

  /** Enrolment closes the current step so the code just typed cannot also log in. */
  it('arms the replay floor at enrolment', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(
      offUser({ twoFactorPendingSecret: PENDING_SECRET }),
    );

    await call('/auth/2fa/enable', authed({ code: '123456' }));

    expect(lastUserUpdate().twoFactorLastUsedStep).toBe(totpReplayFloorAfter(totpStepFor()));
  });

  it('rejects a code the authenticator did not produce', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(
      offUser({ twoFactorPendingSecret: PENDING_SECRET }),
    );
    mocks.totpVerify.mockReturnValue(false);

    const reply = await call('/auth/2fa/enable', authed({ code: '000000' }));

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('INVALID_CODE');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
    expect(mocks.prisma.twoFactorBackupCode.createMany).not.toHaveBeenCalled();
  });

  /** The old route's entire check. It must no longer be sufficient on its own. */
  it('is not satisfied by six digits alone', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(
      offUser({ twoFactorPendingSecret: PENDING_SECRET }),
    );
    mocks.totpVerify.mockReturnValue(false);

    for (const code of ['000000', '111111', '999999']) {
      const reply = await call('/auth/2fa/enable', authed({ code }));
      expect(reply.statusCode).toBe(400);
    }
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects a malformed code before reaching the crypto', async () => {
    for (const code of ['12345', 'abcdef', '', undefined, 123456]) {
      const reply = await call('/auth/2fa/enable', authed({ code }));
      expect(reply.statusCode).toBe(400);
      expect(reply.body.error.code).toBe('INVALID_CODE');
    }
    expect(mocks.totpVerify).not.toHaveBeenCalled();
  });

  it('refuses when no enrolment is waiting', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(offUser());

    const reply = await call('/auth/2fa/enable', authed({ code: '123456' }));

    expect(reply.statusCode).toBe(409);
    expect(reply.body.error.code).toBe('NO_PENDING_SETUP');
    expect(mocks.totpVerify).not.toHaveBeenCalled();
  });

  it('refuses an anonymous caller', async () => {
    const reply = await call('/auth/2fa/enable', {
      headers: trustedHeaders,
      body: { code: '123456' },
    });

    expect(reply.statusCode).toBe(401);
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('recovery codes issued at enable', () => {
  const enableWithPending = async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(
      offUser({ twoFactorPendingSecret: PENDING_SECRET }),
    );
    return call('/auth/2fa/enable', authed({ code: '123456' }));
  };

  it('hands out a full batch exactly once, in the clear, in the response', async () => {
    const reply = await enableWithPending();
    const codes: string[] = reply.body.data.backupCodes;

    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]{5}-[A-HJ-KM-NP-Z2-9]{5}$/);
  });

  /** A readable table would hand over every second factor at once. */
  it('stores only digests', async () => {
    const reply = await enableWithPending();
    const codes: string[] = reply.body.data.backupCodes;
    const written = mocks.prisma.twoFactorBackupCode.createMany.mock.calls[0]![0].data as Array<{
      userId: string;
      codeHash: string;
    }>;

    expect(written).toHaveLength(10);
    expect(written.map((row) => row.codeHash).sort()).toEqual(codes.map(hashBackupCode).sort());
    for (const row of written) {
      expect(row.userId).toBe(USER_ID);
      for (const code of codes) expect(row.codeHash).not.toContain(code);
    }
    expect(JSON.stringify(written)).not.toContain(codes[0]!.replace('-', ''));
  });

  it('replaces any codes left over from an abandoned enrolment', async () => {
    await enableWithPending();

    expect(mocks.prisma.twoFactorBackupCode.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
    expect(mocks.prisma.twoFactorBackupCode.deleteMany.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.prisma.twoFactorBackupCode.createMany.mock.invocationCallOrder[0]!,
    );
  });

  /**
   * Codes before the flag, deliberately. A failure between the two writes leaves
   * 2FA off with a few unused codes attached — harmless — rather than 2FA on with
   * no way back in.
   */
  it('writes the codes before switching the factor on', async () => {
    await enableWithPending();

    expect(mocks.prisma.twoFactorBackupCode.createMany.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.prisma.user.update.mock.invocationCallOrder[0]!,
    );
  });
});

describe('POST /auth/2fa/verify', () => {
  const publicReq = (body: unknown, headers: Record<string, unknown> = trustedHeaders) => ({
    headers,
    body,
  });

  const liveChallenge = async () => (await signTwoFactorChallenge(USER_ID)).challenge;

  it('completes the login and issues the same hardened session as /auth/login', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(enabledUser());

    const reply = await call(
      '/auth/2fa/verify',
      publicReq({ challenge: await liveChallenge(), code: '123456' }),
    );

    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.accessToken).toBe('access-token');
    expect(reply.body.data).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(reply.body)).not.toContain('refresh-token');
    expect(reply.cookie).toEqual({
      name: 'quantmail_refresh',
      value: 'refresh-token',
      options: expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/auth',
        maxAge: 2_592_000,
      }),
    });
    expect(mocks.totpVerify).toHaveBeenCalledWith('123456', LIVE_SECRET);
  });

  it('raises the replay floor past the code it just accepted', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(enabledUser());

    await call('/auth/2fa/verify', publicReq({ challenge: await liveChallenge(), code: '123456' }));

    expect(lastUserUpdate()).toEqual({
      twoFactorLastUsedStep: totpReplayFloorAfter(totpStepFor()),
    });
  });

  /**
   * The ±1-step tolerance keeps a captured code valid for up to 90 seconds. The
   * floor is what closes that, and it must not be reachable a second time.
   */
  it('refuses a correct code whose step has already been spent', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(
      enabledUser({ twoFactorLastUsedStep: totpReplayFloorAfter(totpStepFor()) }),
    );

    const reply = await call(
      '/auth/2fa/verify',
      publicReq({ challenge: await liveChallenge(), code: '123456' }),
    );

    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('CODE_ALREADY_USED');
    expect(reply.cookie).toBeUndefined();
    expect(mocks.generateTokenPair).not.toHaveBeenCalled();
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  /** A wrong code is never reported as a reused one — that would be a hint. */
  it('reports a wrong code as wrong even when the step is spent', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(
      enabledUser({ twoFactorLastUsedStep: totpReplayFloorAfter(totpStepFor()) }),
    );
    mocks.totpVerify.mockReturnValue(false);

    const reply = await call(
      '/auth/2fa/verify',
      publicReq({ challenge: await liveChallenge(), code: '000000' }),
    );

    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('INVALID_CODE');
  });

  it('rejects a forged challenge without touching the database', async () => {
    const reply = await call(
      '/auth/2fa/verify',
      publicReq({ challenge: 'not.a.challenge', code: '123456' }),
    );

    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('CHALLENGE_EXPIRED');
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.totpVerify).not.toHaveBeenCalled();
  });

  it('rejects an expired challenge', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(enabledUser());
    const stale = (await signTwoFactorChallenge(USER_ID, Date.now() - 3_600_000)).challenge;

    const reply = await call('/auth/2fa/verify', publicReq({ challenge: stale, code: '123456' }));

    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('CHALLENGE_EXPIRED');
    expect(mocks.generateTokenPair).not.toHaveBeenCalled();
  });

  /** Expired, forged and "2FA went off in another tab" are one answer. */
  it('rejects a live challenge for an account that no longer has a secret', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(
      enabledUser({ twoFactorEnabled: true, twoFactorSecret: null }),
    );

    const reply = await call(
      '/auth/2fa/verify',
      publicReq({ challenge: await liveChallenge(), code: '123456' }),
    );

    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('CHALLENGE_EXPIRED');
    expect(mocks.totpVerify).not.toHaveBeenCalled();
  });

  it('rejects a missing or non-string challenge or code', async () => {
    for (const body of [{}, { challenge: 'x' }, { code: '123456' }, { challenge: 1, code: 2 }]) {
      const reply = await call('/auth/2fa/verify', publicReq(body));
      expect(reply.statusCode).toBe(400);
      expect(reply.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects a code that is neither shape', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(enabledUser());

    const reply = await call(
      '/auth/2fa/verify',
      publicReq({ challenge: await liveChallenge(), code: 'hello' }),
    );

    expect(reply.statusCode).toBe(400);
    expect(reply.body.error.code).toBe('INVALID_CODE');
    expect(mocks.totpVerify).not.toHaveBeenCalled();
  });

  /** Public route, so it carries its own CSRF floor rather than inheriting one. */
  it('refuses a missing or untrusted Origin before verifying anything', async () => {
    const challenge = await liveChallenge();

    for (const headers of [{}, { origin: 'https://attacker.example' }]) {
      const reply = await call(
        '/auth/2fa/verify',
        publicReq({ challenge, code: '123456' }, headers),
      );
      expect(reply.statusCode).toBe(403);
      expect(reply.body.error.code).toBe('UNTRUSTED_ORIGIN');
    }
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.generateTokenPair).not.toHaveBeenCalled();
  });
});

describe('recovery codes at the login boundary', () => {
  const CODE = 'ABCDE-FGHJK';

  const verifyWith = async (code: string) => {
    mocks.prisma.user.findUnique.mockResolvedValue(enabledUser());
    const challenge = (await signTwoFactorChallenge(USER_ID)).challenge;
    return call('/auth/2fa/verify', { headers: trustedHeaders, body: { challenge, code } });
  };

  it('signs in with an unused code and marks it spent rather than deleting it', async () => {
    mocks.prisma.twoFactorBackupCode.findMany.mockResolvedValue([
      { id: 'bc-1', codeHash: hashBackupCode(CODE) },
    ]);

    const reply = await verifyWith(CODE);

    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.accessToken).toBe('access-token');
    expect(mocks.prisma.twoFactorBackupCode.updateMany).toHaveBeenCalledWith({
      where: { id: 'bc-1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('accepts the code however the user retyped it', async () => {
    mocks.prisma.twoFactorBackupCode.findMany.mockResolvedValue([
      { id: 'bc-1', codeHash: hashBackupCode(CODE) },
    ]);

    for (const spelling of ['abcde-fghjk', 'ABCDEFGHJK', ' abcde fghjk ']) {
      const reply = await verifyWith(spelling);
      expect(reply.statusCode).toBe(200);
    }
  });

  /** Only unused rows are even considered; the query, not the comparison, excludes them. */
  it('only looks at codes that have not been spent', async () => {
    mocks.prisma.twoFactorBackupCode.findMany.mockResolvedValue([]);

    const reply = await verifyWith(CODE);

    expect(mocks.prisma.twoFactorBackupCode.findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, usedAt: null },
    });
    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('INVALID_CODE');
    expect(mocks.prisma.twoFactorBackupCode.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a code that belongs to nobody without writing anything', async () => {
    mocks.prisma.twoFactorBackupCode.findMany.mockResolvedValue([
      { id: 'bc-1', codeHash: hashBackupCode('ZZZZZ-YYYYY') },
    ]);

    const reply = await verifyWith(CODE);

    expect(reply.statusCode).toBe(401);
    expect(mocks.prisma.twoFactorBackupCode.updateMany).not.toHaveBeenCalled();
    expect(mocks.generateTokenPair).not.toHaveBeenCalled();
  });

  /**
   * The double-spend: two requests read the same unused row, and the `usedAt:
   * null` scope on the write means one updates a row and the other updates none.
   * The loser must be rejected, not logged in on a zero-row update.
   */
  it('rejects the loser of a concurrent double-spend', async () => {
    mocks.prisma.twoFactorBackupCode.findMany.mockResolvedValue([
      { id: 'bc-1', codeHash: hashBackupCode(CODE) },
    ]);
    mocks.prisma.twoFactorBackupCode.updateMany.mockResolvedValue({ count: 0 });

    const reply = await verifyWith(CODE);

    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('INVALID_CODE');
    expect(reply.cookie).toBeUndefined();
    expect(mocks.generateTokenPair).not.toHaveBeenCalled();
  });

  /** A recovery code is not a TOTP code: spending one must not move the step floor. */
  it('leaves the TOTP replay floor alone', async () => {
    mocks.prisma.twoFactorBackupCode.findMany.mockResolvedValue([
      { id: 'bc-1', codeHash: hashBackupCode(CODE) },
    ]);

    await verifyWith(CODE);

    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
    expect(mocks.totpVerify).not.toHaveBeenCalled();
  });
});

describe('GET /auth/2fa/status', () => {
  it('reports an enabled account with its confirmation date and codes left', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(enabledUser());
    mocks.prisma.twoFactorBackupCode.count.mockResolvedValue(7);

    const reply = await call('/auth/2fa/status', authed());

    expect(reply.body.data).toEqual({
      enabled: true,
      pendingSetup: false,
      confirmedAt: '2026-08-01T00:00:00.000Z',
      backupCodesRemaining: 7,
    });
    expect(mocks.prisma.twoFactorBackupCode.count).toHaveBeenCalledWith({
      where: { userId: USER_ID, usedAt: null },
    });
  });

  /**
   * The lie this endpoint exists to end: a flag with no secret used to read as
   * "on", which is why the settings screen offered "Enable 2FA" to accounts it
   * thought were protected and demanded codes nothing could verify.
   */
  it('reports a flag with no secret as off', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(
      offUser({ twoFactorEnabled: true, twoFactorSecret: null }),
    );

    const reply = await call('/auth/2fa/status', authed());

    expect(reply.body.data.enabled).toBe(false);
    expect(reply.body.data.backupCodesRemaining).toBe(0);
    expect(mocks.prisma.twoFactorBackupCode.count).not.toHaveBeenCalled();
  });

  it('surfaces an abandoned enrolment so the UI can offer to finish it', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(
      offUser({ twoFactorPendingSecret: PENDING_SECRET }),
    );

    const reply = await call('/auth/2fa/status', authed());

    expect(reply.body.data).toEqual({
      enabled: false,
      pendingSetup: true,
      confirmedAt: null,
      backupCodesRemaining: 0,
    });
  });

  /** A pending secret alongside a live one is re-enrolment noise, not a prompt. */
  it('does not call an enabled account pending', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(
      enabledUser({ twoFactorPendingSecret: PENDING_SECRET }),
    );

    const reply = await call('/auth/2fa/status', authed());

    expect(reply.body.data.enabled).toBe(true);
    expect(reply.body.data.pendingSetup).toBe(false);
  });

  it('never returns the secret in any form', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(enabledUser());

    const reply = await call('/auth/2fa/status', authed());

    expect(JSON.stringify(reply.body)).not.toContain(LIVE_SECRET);
  });

  it('refuses an anonymous caller', async () => {
    const reply = await call('/auth/2fa/status', { headers: trustedHeaders });

    expect(reply.statusCode).toBe(401);
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('POST /auth/2fa/disable', () => {
  it('clears every column and every recovery code', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(enabledUser());

    const reply = await call('/auth/2fa/disable', authed({ password: 'pw' }));

    expect(reply.statusCode).toBe(200);
    expect(lastUserUpdate()).toEqual({
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorPendingSecret: null,
      twoFactorConfirmedAt: null,
      twoFactorLastUsedStep: null,
    });
    expect(mocks.prisma.twoFactorBackupCode.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
  });

  it('requires the password to be present and to be right', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(enabledUser());

    const missing = await call('/auth/2fa/disable', authed({}));
    expect(missing.statusCode).toBe(400);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');

    mocks.argon2Verify.mockResolvedValue(false);
    const wrong = await call('/auth/2fa/disable', authed({ password: 'nope' }));
    expect(wrong.statusCode).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
    expect(mocks.prisma.twoFactorBackupCode.deleteMany).not.toHaveBeenCalled();
  });

  /** A corrupt stored hash makes argon2 throw. That is a failed check, not a 500. */
  it('treats an argon2 failure as a wrong password', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(enabledUser());
    mocks.argon2Verify.mockRejectedValue(new Error('pchstr must contain a $ as first char'));

    const reply = await call('/auth/2fa/disable', authed({ password: 'pw' }));

    expect(reply.statusCode).toBe(401);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  /**
   * Deliberately password-gated rather than code-gated: the person most likely to
   * be here has lost the authenticator, and demanding it to remove it is how an
   * account becomes permanently unusable.
   */
  it('does not ask for a current code', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(enabledUser());

    await call('/auth/2fa/disable', authed({ password: 'pw' }));

    expect(mocks.totpVerify).not.toHaveBeenCalled();
  });

  it('refuses an anonymous caller', async () => {
    const reply = await call('/auth/2fa/disable', {
      headers: trustedHeaders,
      body: { password: 'pw' },
    });

    expect(reply.statusCode).toBe(401);
    expect(mocks.argon2Verify).not.toHaveBeenCalled();
  });
});

describe('POST /auth/2fa/backup-codes', () => {
  it('replaces the whole set and returns the new codes once', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(enabledUser());

    const reply = await call('/auth/2fa/backup-codes', authed({ password: 'pw' }));
    const codes: string[] = reply.body.data.backupCodes;

    expect(reply.statusCode).toBe(200);
    expect(codes).toHaveLength(10);
    expect(reply.body.data.count).toBe(10);
    expect(mocks.prisma.twoFactorBackupCode.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
    const written = mocks.prisma.twoFactorBackupCode.createMany.mock.calls[0]![0].data as Array<{
      codeHash: string;
    }>;
    expect(written.map((row) => row.codeHash).sort()).toEqual(codes.map(hashBackupCode).sort());
  });

  /** Half-replacing would leave the user unsure which printout is live. */
  it('invalidates the old set before writing the new one', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(enabledUser());

    await call('/auth/2fa/backup-codes', authed({ password: 'pw' }));

    expect(mocks.prisma.twoFactorBackupCode.deleteMany.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.prisma.twoFactorBackupCode.createMany.mock.invocationCallOrder[0]!,
    );
  });

  it('refuses when the factor is not actually on', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(
      offUser({ twoFactorEnabled: true, twoFactorSecret: null }),
    );

    const reply = await call('/auth/2fa/backup-codes', authed({ password: 'pw' }));

    expect(reply.statusCode).toBe(409);
    expect(reply.body.error.code).toBe('NOT_ENABLED');
    expect(mocks.prisma.twoFactorBackupCode.createMany).not.toHaveBeenCalled();
  });

  it('requires the password to be present and to be right', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(enabledUser());

    const missing = await call('/auth/2fa/backup-codes', authed({}));
    expect(missing.statusCode).toBe(400);

    mocks.argon2Verify.mockResolvedValue(false);
    const wrong = await call('/auth/2fa/backup-codes', authed({ password: 'nope' }));
    expect(wrong.statusCode).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(mocks.prisma.twoFactorBackupCode.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses an anonymous caller', async () => {
    const reply = await call('/auth/2fa/backup-codes', {
      headers: trustedHeaders,
      body: { password: 'pw' },
    });

    expect(reply.statusCode).toBe(401);
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
