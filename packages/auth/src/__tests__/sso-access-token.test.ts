// generateAccessToken — access-only mint for the SSO ticket exchange.
//
// The exchange endpoint mints an access token without a refresh pair (the
// receiving app owns its session lifetime via its own cookie), so a refresh
// row here would be an orphaned credential that is never delivered to anyone.
// These tests pin:
//   1. the minted token carries the same claims/TTL/issuer/audience as the
//      access half of generateTokenPair (no drift between the two call sites)
//   2. NO refresh-token row is persisted
//   3. the token validates via validateAccessToken
import { describe, expect, it, vi } from 'vitest';
import * as jose from 'jose';
import { TokenService } from '../services/token-service';
import type { AuthConfig } from '../types';

const TEST_CONFIG: AuthConfig = {
  jwtSecret: 'test-secret-key-for-unit-tests-minimum-length',
  jwtRefreshSecret: 'test-refresh-secret-key-for-unit-tests',
  accessTokenExpiresIn: 900,
  refreshTokenExpiresIn: 604800,
  issuer: 'quant-test',
  audience: 'quant-test-audience',
  bcryptRounds: 10,
  maxLoginAttempts: 5,
  lockoutDuration: 900,
};

const USER = {
  id: 'user-sso-exchange',
  email: 'sso@quantrinity.in',
  username: 'sso-user',
  role: 'user',
};

describe('generateAccessToken', () => {
  it('mints a valid access token with the pair-equivalent claims and no refresh row', async () => {
    const refreshCreate = vi.fn();
    const prisma = { refreshToken: { create: refreshCreate } };
    const service = new TokenService(TEST_CONFIG, prisma as never);

    const minted = await service.generateAccessToken(
      USER.id,
      { email: USER.email, username: USER.username, role: USER.role },
      ['openid', 'profile', 'email'],
      'quantmail',
    );

    expect(minted.tokenType).toBe('Bearer');
    expect(minted.expiresIn).toBe(900);
    expect(typeof minted.accessToken).toBe('string');
    // No refresh credential is ever persisted for an access-only mint.
    expect(refreshCreate).not.toHaveBeenCalled();

    // The token validates under the service's own verifier.
    const payload = await service.validateAccessToken(minted.accessToken);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe(USER.id);
    expect(payload?.email).toBe(USER.email);
    expect(payload?.username).toBe(USER.username);
    expect(payload?.role).toBe(USER.role);
    expect(payload?.iss).toBe('quant-test');
    expect(payload?.aud).toBe('quant-test-audience');

    // Claims, TTL and envelope match the access half of a full pair.
    const pair = await service.generateTokenPair(
      USER.id,
      { email: USER.email, username: USER.username, role: USER.role },
      ['openid', 'profile', 'email'],
      'quantmail',
    );
    const pairClaims = jose.decodeJwt(pair.accessToken);
    const soloClaims = jose.decodeJwt(minted.accessToken);
    for (const claim of ['email', 'username', 'role', 'iss', 'aud', 'sub'] as const) {
      expect(soloClaims[claim]).toBe(pairClaims[claim]);
    }
    expect(soloClaims['scopes']).toEqual(pairClaims['scopes']);
    expect(soloClaims['app']).toBe(pairClaims['app']);
    expect((soloClaims.exp ?? 0) - (soloClaims.iat ?? 0)).toBe(900);
  });
});
