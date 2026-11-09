/**
 * The passkey HTTP surface (backend/routes/passkeys.ts).
 *
 * Each test names a decision the route must make: the generic 404 that
 * hides account status on the public login legs, the counter-replay
 * rejection, the TOTP fall-through for assertions without user
 * verification, and the (id, userId) scoping on delete. Prisma, the
 * ceremony library and the token service are mocked; the route logic,
 * the challenge-token rules and the origin check are real.
 *
 * The fake Fastify records each route's preHandler so the step-up wiring
 * itself is asserted: registration and deletion must carry a preHandler,
 * the public login legs must not.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';

const mocks = vi.hoisted(() => {
  const prisma: any = {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    passkeyCredential: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  return {
    prisma,
    generateTokenPair: vi.fn(),
    generateRegistrationOptions: vi.fn(),
    verifyRegistration: vi.fn(),
    generateAuthenticationOptions: vi.fn(),
    verifyAuthentication: vi.fn(),
    signTwoFactorChallenge: vi.fn(),
  };
});

vi.mock('@quant/auth/lib/prisma', () => ({ default: mocks.prisma, prisma: mocks.prisma }));

vi.mock('@quant/auth/services/token-service', () => ({
  TokenService: class {
    generateTokenPair = mocks.generateTokenPair;
    refreshToken = vi.fn();
  },
}));

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: () => 'test-access-secret',
  getJwtRefreshSecret: () => 'test-refresh-secret-which-is-long-enough',
}));

vi.mock('@quant/auth/services/passkey-ceremony', () => ({
  generatePasskeyRegistrationOptions: mocks.generateRegistrationOptions,
  verifyPasskeyRegistration: mocks.verifyRegistration,
  generatePasskeyAuthenticationOptions: mocks.generateAuthenticationOptions,
  verifyPasskeyAuthentication: mocks.verifyAuthentication,
}));

vi.mock('../lib/two-factor', () => ({
  signTwoFactorChallenge: mocks.signTwoFactorChallenge,
}));

import { passkeyRoutes } from '../routes/passkeys';
import { signPasskeyChallenge } from '../lib/passkeys';

type RouteHandler = (request: any, reply: any) => Promise<unknown>;

interface RecordedRoute {
  handler: RouteHandler;
  options: any;
}

const loadRoutes = async () => {
  const routes = new Map<string, RecordedRoute>();
  const register = (path: string, optionsOrHandler: unknown, maybeHandler?: RouteHandler) => {
    const handler = (maybeHandler ?? optionsOrHandler) as RouteHandler;
    const options = maybeHandler ? optionsOrHandler : {};
    routes.set(path, { handler, options });
  };
  const fake = {
    post: register,
    get: register,
    delete: register,
    // The real app decorates this from the step-up plugin; the fake only
    // needs to record that the route asked for it.
    requireStepUp: () => 'step-up-prehandler',
  };
  await passkeyRoutes(fake as never);
  return routes;
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

const baseUser = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  email: 'kundan@quantmail.in',
  username: 'kundan',
  displayName: 'Kundan',
  role: 'USER',
  status: 'ACTIVE',
  deletedAt: null,
  twoFactorEnabled: false,
  twoFactorSecret: null,
  ...overrides,
});

const storedCredential = (overrides: Record<string, unknown> = {}) => ({
  id: 'cred-row-1',
  userId: USER_ID,
  credentialId: 'cred-id-1',
  publicKey: 'cHVibGljLWtleQ',
  counter: 5,
  transports: ['internal'],
  name: null,
  deviceType: 'single_device',
  backedUp: false,
  createdAt: new Date('2026-10-20T00:00:00.000Z'),
  lastUsedAt: null,
  ...overrides,
});

const call = async (
  routes: Map<string, RecordedRoute>,
  path: string,
  request: unknown,
) => {
  const reply = makeReply();
  await routes.get(path)!.handler(request as any, reply);
  return reply;
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env['NODE_ENV'] = 'production';
  process.env['CORS_ORIGINS'] = 'http://localhost:3000,https://quantmail.in';
  mocks.generateTokenPair.mockResolvedValue({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 900,
    tokenType: 'Bearer',
  });
  mocks.signTwoFactorChallenge.mockResolvedValue({
    challenge: 'totp-challenge',
    expiresIn: 300,
  });
  mocks.generateRegistrationOptions.mockResolvedValue({
    challenge: 'reg-challenge',
    rp: { name: 'QuantMail', id: 'localhost' },
  });
  mocks.generateAuthenticationOptions.mockResolvedValue({
    challenge: 'auth-challenge',
    rpId: 'localhost',
  });
  mocks.verifyRegistration.mockResolvedValue({
    verified: true,
    credential: {
      credentialId: 'cred-id-new',
      publicKey: 'bmV3LXB1YmxpYy1rZXk',
      counter: 0,
      transports: ['internal'],
      deviceType: 'single_device',
      backedUp: false,
    },
  });
  mocks.verifyAuthentication.mockResolvedValue({
    verified: true,
    newCounter: 6,
    userVerified: true,
    credentialDeviceType: 'single_device',
    credentialBackedUp: false,
  });
  mocks.prisma.passkeyCredential.update.mockResolvedValue({});
  mocks.prisma.passkeyCredential.deleteMany.mockResolvedValue({ count: 1 });
});

describe('step-up wiring', () => {
  it('registration and deletion carry a preHandler; login legs and list do not', async () => {
    const routes = await loadRoutes();
    expect(routes.get('/auth/passkeys/register/options')!.options.preHandler).toBeDefined();
    expect(routes.get('/auth/passkeys/register/verify')!.options.preHandler).toBeDefined();
    expect(routes.get('/auth/passkeys/:id')!.options.preHandler).toBeDefined();
    expect(routes.get('/auth/passkeys/login/options')!.options.preHandler).toBeUndefined();
    expect(routes.get('/auth/passkeys/login/verify')!.options.preHandler).toBeUndefined();
    expect(routes.get('/auth/passkeys')!.options.preHandler).toBeUndefined();
  });
});

describe('POST /auth/passkeys/login/options', () => {
  it('answers the same 404 for a missing account, a suspended account, and no passkeys', async () => {
    const routes = await loadRoutes();
    // Missing account.
    mocks.prisma.user.findMany.mockResolvedValue([]);
    let reply = await call(routes, '/auth/passkeys/login/options', {
      headers: trustedHeaders,
      body: { email: 'ghost@quantmail.in' },
    });
    expect(reply.statusCode).toBe(404);
    expect(reply.body.error.code).toBe('PASSKEY_NOT_AVAILABLE');

    // Suspended account with a passkey: status must not leak.
    mocks.prisma.user.findMany.mockResolvedValue([
      baseUser({ status: 'SUSPENDED' }),
    ]);
    mocks.prisma.passkeyCredential.findMany.mockResolvedValue([storedCredential()]);
    reply = await call(routes, '/auth/passkeys/login/options', {
      headers: trustedHeaders,
      body: { email: 'kundan@quantmail.in' },
    });
    expect(reply.statusCode).toBe(404);
    expect(reply.body.error.code).toBe('PASSKEY_NOT_AVAILABLE');

    // Live account, no passkeys.
    mocks.prisma.user.findMany.mockResolvedValue([baseUser()]);
    mocks.prisma.passkeyCredential.findMany.mockResolvedValue([]);
    reply = await call(routes, '/auth/passkeys/login/options', {
      headers: trustedHeaders,
      body: { email: 'kundan@quantmail.in' },
    });
    expect(reply.statusCode).toBe(404);
    expect(reply.body.error.code).toBe('PASSKEY_NOT_AVAILABLE');
  });

  it('returns options plus a challenge token for an account with passkeys', async () => {
    const routes = await loadRoutes();
    mocks.prisma.user.findMany.mockResolvedValue([baseUser()]);
    mocks.prisma.passkeyCredential.findMany.mockResolvedValue([storedCredential()]);
    const reply = await call(routes, '/auth/passkeys/login/options', {
      headers: trustedHeaders,
      body: { email: 'kundan@quantmail.in' },
    });
    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.options.challenge).toBe('auth-challenge');
    expect(typeof reply.body.data.challengeToken).toBe('string');
  });
});

describe('POST /auth/passkeys/login/verify', () => {
  const loginVerify = async (routes: Map<string, RecordedRoute>, overrides: any = {}) => {
    const { challengeToken } = await signPasskeyChallenge({
      userId: USER_ID,
      purpose: 'login',
      challenge: 'auth-challenge',
    });
    return call(routes, '/auth/passkeys/login/verify', {
      headers: trustedHeaders,
      body: {
        email: 'kundan@quantmail.in',
        response: { id: 'cred-id-1' },
        challengeToken,
        ...overrides.body,
      },
    });
  };

  const primeUserAndCredential = (userOverrides = {}, credOverrides = {}) => {
    mocks.prisma.user.findMany.mockResolvedValue([baseUser(userOverrides)]);
    mocks.prisma.passkeyCredential.findFirst.mockResolvedValue(
      storedCredential(credOverrides),
    );
  };

  it('mints a session for a verified assertion and advances the counter', async () => {
    const routes = await loadRoutes();
    primeUserAndCredential();
    const reply = await loginVerify(routes);
    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.accessToken).toBe('access-token');
    expect(mocks.prisma.passkeyCredential.update).toHaveBeenCalledWith({
      where: { id: 'cred-row-1' },
      data: expect.objectContaining({ counter: 6, lastUsedAt: expect.any(Date) }),
    });
  });

  it('rejects a counter that did not advance and issues no session', async () => {
    const routes = await loadRoutes();
    primeUserAndCredential();
    mocks.verifyAuthentication.mockResolvedValue({
      verified: true,
      newCounter: 5,
      userVerified: true,
    });
    const reply = await loginVerify(routes);
    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('PASSKEY_COUNTER_REPLAY');
    expect(mocks.prisma.passkeyCredential.update).not.toHaveBeenCalled();
  });

  it('falls through to the TOTP challenge when the assertion had no user verification on a TOTP account', async () => {
    const routes = await loadRoutes();
    primeUserAndCredential({ twoFactorEnabled: true, twoFactorSecret: 'live-secret' });
    mocks.verifyAuthentication.mockResolvedValue({
      verified: true,
      newCounter: 6,
      userVerified: false,
    });
    const reply = await loginVerify(routes);
    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.twoFactorRequired).toBe(true);
    expect(reply.body.data.challenge).toBe('totp-challenge');
    expect(reply.body.data.accessToken).toBeUndefined();
  });

  it('a verified assertion WITH user verification skips TOTP on a TOTP account', async () => {
    const routes = await loadRoutes();
    primeUserAndCredential({ twoFactorEnabled: true, twoFactorSecret: 'live-secret' });
    const reply = await loginVerify(routes);
    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.accessToken).toBe('access-token');
  });

  it('a challenge token minted for another user verifies nothing', async () => {
    const routes = await loadRoutes();
    primeUserAndCredential();
    const { challengeToken } = await signPasskeyChallenge({
      userId: OTHER_USER_ID,
      purpose: 'login',
      challenge: 'auth-challenge',
    });
    const reply = await call(routes, '/auth/passkeys/login/verify', {
      headers: trustedHeaders,
      body: { email: 'kundan@quantmail.in', response: { id: 'cred-id-1' }, challengeToken },
    });
    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('INVALID_PASSKEY');
  });
});

describe('POST /auth/passkeys/register/verify', () => {
  it('stores the verified credential and returns display metadata only', async () => {
    const routes = await loadRoutes();
    const { challengeToken } = await signPasskeyChallenge({
      userId: USER_ID,
      purpose: 'register',
      challenge: 'reg-challenge',
    });
    mocks.prisma.passkeyCredential.create.mockResolvedValue(
      storedCredential({ id: 'cred-row-new', credentialId: 'cred-id-new' }),
    );
    const reply = await call(routes, '/auth/passkeys/register/verify', {
      auth: { userId: USER_ID },
      headers: trustedHeaders,
      body: { response: { id: 'cred-id-new' }, challengeToken, name: 'MacBook' },
    });
    expect(reply.statusCode).toBe(200);
    expect(mocks.prisma.passkeyCredential.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        credentialId: 'cred-id-new',
        publicKey: 'bmV3LXB1YmxpYy1rZXk',
        name: 'MacBook',
      }),
    });
    expect(reply.body.data.passkey.publicKey).toBeUndefined();
  });

  it('a login-purpose token cannot complete a registration', async () => {
    const routes = await loadRoutes();
    const { challengeToken } = await signPasskeyChallenge({
      userId: USER_ID,
      purpose: 'login',
      challenge: 'reg-challenge',
    });
    const reply = await call(routes, '/auth/passkeys/register/verify', {
      auth: { userId: USER_ID },
      headers: trustedHeaders,
      body: { response: { id: 'cred-id-new' }, challengeToken },
    });
    expect(reply.statusCode).toBe(401);
    expect(mocks.prisma.passkeyCredential.create).not.toHaveBeenCalled();
  });
});

describe('DELETE /auth/passkeys/:id', () => {
  it('scopes the delete to the caller and 404s otherwise', async () => {
    const routes = await loadRoutes();
    mocks.prisma.passkeyCredential.deleteMany.mockResolvedValue({ count: 0 });
    const reply = await call(routes, '/auth/passkeys/:id', {
      auth: { userId: USER_ID },
      headers: trustedHeaders,
      params: { id: 'someone-elses-row' },
    });
    expect(reply.statusCode).toBe(404);
    expect(mocks.prisma.passkeyCredential.deleteMany).toHaveBeenCalledWith({
      where: { id: 'someone-elses-row', userId: USER_ID },
    });
  });
});
