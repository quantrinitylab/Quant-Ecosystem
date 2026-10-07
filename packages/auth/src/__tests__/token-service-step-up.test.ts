import { describe, it, expect, beforeEach } from 'vitest';
import * as jose from 'jose';
import { TokenService } from '../services/token-service';
import type { AuthConfig } from '../types';

const TEST_CONFIG: AuthConfig = {
  jwtSecret: 'test-secret-key-for-unit-tests-minimum-length',
  jwtRefreshSecret: 'test-refresh-secret-key-for-unit-tests',
  accessTokenExpiresIn: 900, // 15 minutes
  refreshTokenExpiresIn: 604800, // 7 days
  issuer: 'quant-test',
  audience: 'quant-test-audience',
  bcryptRounds: 10,
  maxLoginAttempts: 5,
  lockoutDuration: 900,
};

const decodeAccess = async (token: string) => {
  const secret = new TextEncoder().encode(TEST_CONFIG.jwtSecret);
  const { payload } = await jose.jwtVerify(token, secret, {
    issuer: TEST_CONFIG.issuer,
    audience: TEST_CONFIG.audience,
  });
  return payload;
};

const decodeRefresh = async (token: string) => {
  const secret = new TextEncoder().encode(TEST_CONFIG.jwtRefreshSecret);
  const { payload } = await jose.jwtVerify(token, secret, {
    issuer: TEST_CONFIG.issuer,
    audience: TEST_CONFIG.audience,
  });
  return payload;
};

describe('TokenService lastStrongAuthAt (K6 step-up)', () => {
  let tokenService: TokenService;

  beforeEach(() => {
    tokenService = new TokenService(TEST_CONFIG);
  });

  it('stamps lastStrongAuthAt=now on the access token by default (fresh login)', async () => {
    const before = Math.floor(Date.now() / 1000);
    const pair = await tokenService.generateTokenPair(
      'user-123',
      { email: 'test@quant.app', username: 'testuser', role: 'user' },
      ['openid', 'profile', 'email'],
      'quantmail',
    );
    const after = Math.floor(Date.now() / 1000);

    const payload = await decodeAccess(pair.accessToken);
    expect(typeof payload['lastStrongAuthAt']).toBe('number');
    expect(payload['lastStrongAuthAt'] as number).toBeGreaterThanOrEqual(before);
    expect(payload['lastStrongAuthAt'] as number).toBeLessThanOrEqual(after);
  });

  it('carries lastStrongAuthAt on the refresh token as well', async () => {
    const pair = await tokenService.generateTokenPair(
      'user-123',
      { email: 'test@quant.app', username: 'testuser', role: 'user' },
      ['openid', 'profile', 'email'],
      'quantmail',
    );
    const refreshPayload = await decodeRefresh(pair.refreshToken);
    expect(typeof refreshPayload['lastStrongAuthAt']).toBe('number');
  });

  it('preserves an explicit lastStrongAuthAt on both tokens', async () => {
    const pair = await tokenService.generateTokenPair(
      'user-123',
      { email: 'test@quant.app', username: 'testuser', role: 'user' },
      ['openid', 'profile', 'email'],
      'quantmail',
      undefined,
      1_700_000_000,
    );
    const accessPayload = await decodeAccess(pair.accessToken);
    const refreshPayload = await decodeRefresh(pair.refreshToken);
    expect(accessPayload['lastStrongAuthAt']).toBe(1_700_000_000);
    expect(refreshPayload['lastStrongAuthAt']).toBe(1_700_000_000);
  });

  it('carries lastStrongAuthAt forward unchanged across refresh rotation', async () => {
    const original = await tokenService.generateTokenPair(
      'user-refresh',
      { email: 'refresh@quant.app', username: 'refreshuser', role: 'user' },
      ['openid'],
      'quantmail',
      undefined,
      1_700_000_000,
    );

    const refreshed = await tokenService.refreshToken(original.refreshToken);
    const accessPayload = await decodeAccess(refreshed.accessToken);
    const refreshPayload = await decodeRefresh(refreshed.refreshToken);

    // Rotation is not re-authentication: the timestamp must not move.
    expect(accessPayload['lastStrongAuthAt']).toBe(1_700_000_000);
    expect(refreshPayload['lastStrongAuthAt']).toBe(1_700_000_000);
  });

  it('fails closed: a legacy refresh token without the claim yields a stale timestamp', async () => {
    // Build a refresh token exactly like a pre-step-up issuer would: same
    // claims, but no lastStrongAuthAt. It must still rotate (the session is
    // valid) yet the new access token must be visibly stale (0) so step-up
    // guards challenge it on sensitive routes.
    const legacyJti = `tok-legacy-${Date.now()}`;
    const legacyFamily = `fam-legacy-${Date.now()}`;
    const now = Math.floor(Date.now() / 1000);
    const refreshSecret = new TextEncoder().encode(TEST_CONFIG.jwtRefreshSecret);
    const legacyRefreshToken = await new jose.SignJWT({
      sub: 'user-legacy',
      jti: legacyJti,
      family: legacyFamily,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + TEST_CONFIG.refreshTokenExpiresIn)
      .setIssuer(TEST_CONFIG.issuer)
      .setAudience(TEST_CONFIG.audience)
      .setJti(legacyJti)
      .setSubject('user-legacy')
      .sign(refreshSecret);

    const { createHash } = await import('node:crypto');
    const stored = {
      id: legacyJti,
      userId: 'user-legacy',
      token: createHash('sha256').update(legacyRefreshToken).digest('hex'),
      family: legacyFamily,
      isRevoked: false,
      expiresAt: new Date((now + TEST_CONFIG.refreshTokenExpiresIn) * 1000),
    };
    const mockPrisma = {
      refreshToken: {
        create: async () => ({}),
        findUnique: async () => stored,
        updateMany: async () => ({ count: 1 }),
      },
      user: {
        findUnique: async () => ({
          id: 'user-legacy',
          email: 'legacy@quant.app',
          username: 'legacyuser',
          role: 'user',
        }),
      },
    };
    const isolated = new TokenService(TEST_CONFIG, mockPrisma as never);

    const refreshed = await isolated.refreshToken(legacyRefreshToken);
    const accessPayload = await decodeAccess(refreshed.accessToken);
    expect(accessPayload['lastStrongAuthAt']).toBe(0);
  });
});
