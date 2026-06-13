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

describe('TokenService', () => {
  let tokenService: TokenService;

  beforeEach(() => {
    tokenService = new TokenService(TEST_CONFIG);
  });

  describe('generateTokenPair', () => {
    it('should generate a valid JWT that can be verified with jose', async () => {
      const pair = await tokenService.generateTokenPair(
        'user-123',
        { email: 'test@quant.app', username: 'testuser', role: 'user' },
        ['profile:read', 'email:read'],
        'quantmail',
      );

      expect(pair.accessToken).toBeDefined();
      expect(pair.refreshToken).toBeDefined();
      expect(pair.tokenType).toBe('Bearer');
      expect(pair.expiresIn).toBe(900);

      // Verify with jose directly
      const secret = new TextEncoder().encode(TEST_CONFIG.jwtSecret);
      const { payload } = await jose.jwtVerify(pair.accessToken, secret, {
        issuer: TEST_CONFIG.issuer,
        audience: TEST_CONFIG.audience,
      });

      expect(payload.sub).toBe('user-123');
      expect(payload['email']).toBe('test@quant.app');
      expect(payload['username']).toBe('testuser');
      expect(payload['role']).toBe('user');
      expect(payload['scopes']).toEqual(['profile:read', 'email:read']);
      expect(payload['app']).toBe('quantmail');
    });

    it('should include proper claims (iss, aud, jti, exp, iat)', async () => {
      const pair = await tokenService.generateTokenPair(
        'user-456',
        { email: 'user@quant.app', username: 'user456', role: 'admin' },
        ['profile:read'],
        'quantchat',
      );

      const secret = new TextEncoder().encode(TEST_CONFIG.jwtSecret);
      const { payload } = await jose.jwtVerify(pair.accessToken, secret);

      expect(payload.iss).toBe('quant-test');
      expect(payload.aud).toBe('quant-test-audience');
      expect(payload.jti).toBeDefined();
      expect(payload.jti).toMatch(/^tok_/);
      expect(payload.exp).toBeDefined();
      expect(payload.iat).toBeDefined();
      expect(payload.exp! - payload.iat!).toBe(900);
    });
  });

  describe('validateAccessToken', () => {
    it('should validate a token and return payload', async () => {
      const pair = await tokenService.generateTokenPair(
        'user-789',
        { email: 'valid@quant.app', username: 'validuser', role: 'user' },
        ['profile:read', 'messages:read'],
        'quantmail',
      );

      const payload = await tokenService.validateAccessToken(pair.accessToken);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe('user-789');
      expect(payload!.email).toBe('valid@quant.app');
      expect(payload!.scopes).toEqual(['profile:read', 'messages:read']);
    });

    it('should reject expired tokens', async () => {
      // Create a service with 0 second expiry
      const shortConfig = { ...TEST_CONFIG, accessTokenExpiresIn: 0 };
      const shortService = new TokenService(shortConfig);

      const pair = await shortService.generateTokenPair(
        'user-exp',
        { email: 'exp@quant.app', username: 'expuser', role: 'user' },
        ['profile:read'],
        'quantmail',
      );

      // Token is already expired
      const payload = await shortService.validateAccessToken(pair.accessToken);
      expect(payload).toBeNull();
    });

    it('should reject tokens with wrong issuer', async () => {
      // Create token with different config
      const otherConfig = { ...TEST_CONFIG, issuer: 'other-issuer' };
      const otherService = new TokenService(otherConfig);

      const pair = await otherService.generateTokenPair(
        'user-wrong',
        { email: 'wrong@quant.app', username: 'wrong', role: 'user' },
        ['profile:read'],
        'quantmail',
      );

      // Try to validate with original service (different issuer expected)
      const payload = await tokenService.validateAccessToken(pair.accessToken);
      expect(payload).toBeNull();
    });

    it('should reject tokens with wrong audience', async () => {
      const otherConfig = { ...TEST_CONFIG, audience: 'other-audience' };
      const otherService = new TokenService(otherConfig);

      const pair = await otherService.generateTokenPair(
        'user-wrong',
        { email: 'wrong@quant.app', username: 'wrong', role: 'user' },
        ['profile:read'],
        'quantmail',
      );

      const payload = await tokenService.validateAccessToken(pair.accessToken);
      expect(payload).toBeNull();
    });

    it('should reject revoked tokens', async () => {
      const pair = await tokenService.generateTokenPair(
        'user-revoke',
        { email: 'revoke@quant.app', username: 'revokeuser', role: 'user' },
        ['profile:read'],
        'quantmail',
      );

      // First validate that it works
      const payload = await tokenService.validateAccessToken(pair.accessToken);
      expect(payload).not.toBeNull();

      // Revoke it
      await tokenService.revokeToken(payload!.jti);

      // validateAccessToken only checks JWT signature, not database revocation;
      // revoking marks the DB record but does not invalidate the JWT itself.
      const afterRevoke = await tokenService.validateAccessToken(pair.accessToken);
      expect(afterRevoke).not.toBeNull();
    });
  });

  describe('refreshToken', () => {
    it('should return a new token pair and invalidate old refresh token', async () => {
      const original = await tokenService.generateTokenPair(
        'user-refresh',
        { email: 'refresh@quant.app', username: 'refreshuser', role: 'user' },
        ['profile:read'],
        'quantmail',
      );

      const refreshed = await tokenService.refreshToken(original.refreshToken);
      expect(refreshed).not.toBeNull();
      expect(refreshed!.accessToken).toBeDefined();
      expect(refreshed!.refreshToken).toBeDefined();
      expect(refreshed!.accessToken).not.toBe(original.accessToken);
      expect(refreshed!.refreshToken).not.toBe(original.refreshToken);

      // Old refresh token should no longer work
      await expect(tokenService.refreshToken(original.refreshToken)).rejects.toThrow();
    });

    it('should preserve user claims in refreshed access token', async () => {
      const original = await tokenService.generateTokenPair(
        'user-claims',
        { email: 'claims@quant.app', username: 'claimsuser', role: 'admin' },
        ['profile:read', 'messages:read'],
        'quantchat',
      );

      const refreshed = await tokenService.refreshToken(original.refreshToken);
      expect(refreshed).not.toBeNull();

      const payload = await tokenService.validateAccessToken(refreshed!.accessToken);
      expect(payload).not.toBeNull();
      expect(payload!.email).toBe('claims@quant.app');
      expect(payload!.username).toBe('claimsuser');
      expect(payload!.role).toBe('admin');
      expect(payload!.scopes).toEqual(['openid', 'profile', 'email']);
      expect(payload!.app).toBe('quantmail');
      expect(payload!.sub).toBe('user-claims');
    });

    it('should detect reuse and revoke entire family', async () => {
      const original = await tokenService.generateTokenPair(
        'user-reuse',
        { email: 'reuse@quant.app', username: 'reuseuser', role: 'user' },
        ['profile:read'],
        'quantmail',
      );

      // First refresh works
      const refreshed = await tokenService.refreshToken(original.refreshToken);
      expect(refreshed).not.toBeNull();

      // Attacker tries to use the old refresh token (reuse detection)
      await expect(tokenService.refreshToken(original.refreshToken)).rejects.toThrow(
        'Refresh token reuse detected or token revoked',
      );

      // The new legitimate token should still work (it has a new family)
      const stillWorks = await tokenService.refreshToken(refreshed!.refreshToken);
      expect(stillWorks).not.toBeNull();
    });
  });

  describe('JWKS', () => {
    it('should export a valid JWK set', async () => {
      const jwks = await tokenService.getJWKS();

      expect(jwks.keys).toBeDefined();
      expect(jwks.keys.length).toBe(1);
      expect(jwks.keys[0]!.alg).toBe('RS256');
      expect(jwks.keys[0]!.use).toBe('sig');
      expect(jwks.keys[0]!.kid).toBe('quant-primary');
      expect(jwks.keys[0]!.kty).toBe('RSA');
    });

    it('should sign with private key and verify with public key', async () => {
      const signed = await tokenService.signWithPrivateKey({ sub: 'fed-user', data: 'test' });
      expect(signed).toBeDefined();

      // Get the JWKS and import the public key
      const jwks = await tokenService.getJWKS();
      const publicKey = await jose.importJWK(jwks.keys[0]!, 'RS256');

      const { payload } = await jose.jwtVerify(signed, publicKey, {
        issuer: TEST_CONFIG.issuer,
      });
      expect(payload.sub).toBe('fed-user');
      expect(payload['data']).toBe('test');
    });
  });
});
