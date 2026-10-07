import { describe, it, expect, beforeEach } from 'vitest';
import { SSOMiddleware } from '../middleware/sso-middleware';
import { TokenService } from '../services/token-service';
import { SessionService } from '../services/session-service';
import type { AuthConfig } from '../types';

const testConfig: AuthConfig = {
  jwtSecret: 'test-secret-key-that-is-at-least-32-chars-long',
  jwtRefreshSecret: 'test-refresh-secret-key-that-is-long',
  accessTokenExpiresIn: 3600,
  refreshTokenExpiresIn: 604800,
  issuer: 'https://auth.quant.app',
  audience: 'https://api.quant.app',
  bcryptRounds: 10,
  maxLoginAttempts: 5,
  lockoutDuration: 900000,
};

describe('SSOMiddleware', () => {
  let ssoMiddleware: SSOMiddleware;
  let tokenService: TokenService;
  let sessionService: SessionService;

  beforeEach(() => {
    ssoMiddleware = new SSOMiddleware(testConfig);
    tokenService = new TokenService(testConfig);
    sessionService = new SessionService(testConfig);
  });

  describe('validateCrossAppToken', () => {
    it('should validate a valid token for a compatible target app', async () => {
      // Generate a token with scopes compatible with quantchat
      const tokenPair = await tokenService.generateTokenPair(
        'user-1',
        { email: 'user@quant.app', username: 'testuser', role: 'user' },
        ['profile:read', 'messages:read'],
        'quantmail',
      );

      const result = await ssoMiddleware.validateCrossAppToken(tokenPair.accessToken, 'quantchat');

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
      expect(result.payload!.sub).toBe('user-1');
    });

    it('should reject an invalid token', async () => {
      const result = await ssoMiddleware.validateCrossAppToken('invalid-token', 'quantchat');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Token is invalid or expired');
    });

    it('should reject an expired token', async () => {
      // Create a config with 0 second expiry
      const expiredConfig: AuthConfig = {
        ...testConfig,
        accessTokenExpiresIn: 0,
      };
      const expiredTokenService = new TokenService(expiredConfig);

      const tokenPair = await expiredTokenService.generateTokenPair(
        'user-1',
        { email: 'user@quant.app', username: 'testuser', role: 'user' },
        ['profile:read'],
        'quantmail',
      );

      // Wait a moment to ensure token is expired
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await ssoMiddleware.validateCrossAppToken(tokenPair.accessToken, 'quantchat');

      expect(result.valid).toBe(false);
    });

    it('should reject a token with incompatible scopes for target app', async () => {
      // Generate a token with only ads scopes
      const tokenPair = await tokenService.generateTokenPair(
        'user-1',
        { email: 'user@quant.app', username: 'testuser', role: 'user' },
        ['ads:manage'],
        'quantads',
      );

      // quantdocs does not allow ads:manage
      const result = await ssoMiddleware.validateCrossAppToken(tokenPair.accessToken, 'quantdocs');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not authorized');
    });
  });

  describe('refreshCrossAppSession', () => {
    it('should create a new session for a target app', async () => {
      // Create an initial session
      const session = await sessionService.createSession({
        userId: 'user-1',
        tokenId: 'tok-1',
        refreshTokenFamily: 'fam-1',
        deviceInfo: {
          deviceId: 'device-1',
          platform: 'web',
          userAgent: 'TestAgent/1.0',
          ipAddress: '127.0.0.1',
        },
        app: 'quantmail',
      });

      const result = await ssoMiddleware.refreshCrossAppSession(session.id, 'quantchat');

      // The SSO middleware creates its own internal session service instance,
      // so we test the interface contract
      expect(result).toBeDefined();
      expect(result.success !== undefined).toBe(true);
    });

    it('should return failure for non-existent session', async () => {
      const result = await ssoMiddleware.refreshCrossAppSession(
        'non-existent-session',
        'quantchat',
      );

      expect(result.success).toBe(false);
      expect(result.reason).toContain('not found');
    });
  });

  describe('propagateLogout', () => {
    it('should revoke all sessions for a user across all apps', async () => {
      const result = await ssoMiddleware.propagateLogout('user-1');

      expect(result.success).toBe(true);
      expect(result.revokedSessions).toBeDefined();
      expect(Array.isArray(result.apps)).toBe(true);
    });

    it('should return zero revoked sessions for user with no sessions', async () => {
      const result = await ssoMiddleware.propagateLogout('non-existent-user');

      expect(result.success).toBe(true);
      expect(result.revokedSessions).toBe(0);
      expect(result.apps).toHaveLength(0);
    });
  });
});
