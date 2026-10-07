import { describe, it, expect, beforeEach } from 'vitest';
import { SignInWithQuantSDK } from '../services/sign-in-with-quant-sdk';
import { generateCodeChallenge } from '../crypto/pkce';
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

describe('SignInWithQuantSDK', () => {
  let sdk: SignInWithQuantSDK;

  beforeEach(() => {
    sdk = new SignInWithQuantSDK(testConfig);
  });

  describe('generateAuthUrl', () => {
    it('should generate an auth URL with PKCE parameters', async () => {
      const result = await sdk.generateAuthUrl('client-123', 'https://myapp.com/callback', [
        'profile:read',
        'email:read',
      ]);

      expect(result.url).toContain('https://auth.quant.app/oauth2/authorize');
      expect(result.url).toContain('client_id=client-123');
      expect(result.url).toContain('redirect_uri=');
      expect(result.url).toContain('response_type=code');
      expect(result.url).toContain('scope=profile%3Aread+email%3Aread');
      expect(result.url).toContain('code_challenge=');
      expect(result.url).toContain('code_challenge_method=S256');
      expect(result.codeVerifier).toBeDefined();
      expect(result.codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(result.state).toBeDefined();
    });

    it('should use provided state parameter', async () => {
      const result = await sdk.generateAuthUrl(
        'client-123',
        'https://myapp.com/callback',
        ['profile:read'],
        'my-custom-state',
      );

      expect(result.url).toContain('state=my-custom-state');
      expect(result.state).toBe('my-custom-state');
    });

    it('should generate unique code verifiers for each call', async () => {
      const result1 = await sdk.generateAuthUrl('client-123', 'https://myapp.com/callback', [
        'profile:read',
      ]);
      const result2 = await sdk.generateAuthUrl('client-123', 'https://myapp.com/callback', [
        'profile:read',
      ]);

      expect(result1.codeVerifier).not.toBe(result2.codeVerifier);
    });
  });

  describe('handleCallback', () => {
    it('should exchange a valid authorization code for tokens', async () => {
      // Create an authorization code
      const codeVerifier = 'a'.repeat(43); // Valid length verifier
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      const code = sdk.createAuthorizationCode(
        'client-123',
        'https://myapp.com/callback',
        ['profile:read', 'email:read'],
        codeChallenge,
        'user-1',
      );

      const result = await sdk.handleCallback(
        code,
        'client-123',
        'client-secret',
        'https://myapp.com/callback',
        codeVerifier,
      );

      expect(result).not.toBeNull();
      expect(result!.accessToken).toBeDefined();
      expect(result!.refreshToken).toBeDefined();
      expect(result!.expiresIn).toBe(3600);
      expect(result!.tokenType).toBe('Bearer');
      expect(result!.scope).toEqual(['profile:read', 'email:read']);
    });

    it('should return null for an invalid authorization code', async () => {
      const result = await sdk.handleCallback(
        'invalid-code',
        'client-123',
        'client-secret',
        'https://myapp.com/callback',
        'verifier',
      );

      expect(result).toBeNull();
    });

    it('should return null for mismatched client ID', async () => {
      const codeVerifier = 'b'.repeat(43);
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      const code = sdk.createAuthorizationCode(
        'client-123',
        'https://myapp.com/callback',
        ['profile:read'],
        codeChallenge,
        'user-1',
      );

      const result = await sdk.handleCallback(
        code,
        'wrong-client',
        'client-secret',
        'https://myapp.com/callback',
        codeVerifier,
      );

      expect(result).toBeNull();
    });

    it('should return null for invalid PKCE verifier', async () => {
      const codeVerifier = 'c'.repeat(43);
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      const code = sdk.createAuthorizationCode(
        'client-123',
        'https://myapp.com/callback',
        ['profile:read'],
        codeChallenge,
        'user-1',
      );

      const result = await sdk.handleCallback(
        code,
        'client-123',
        'client-secret',
        'https://myapp.com/callback',
        'wrong-verifier-that-is-at-least-43-chars-long!!',
      );

      expect(result).toBeNull();
    });

    it('should not allow reusing an authorization code', async () => {
      const codeVerifier = 'd'.repeat(43);
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      const code = sdk.createAuthorizationCode(
        'client-123',
        'https://myapp.com/callback',
        ['profile:read'],
        codeChallenge,
        'user-1',
      );

      // First use succeeds
      const result1 = await sdk.handleCallback(
        code,
        'client-123',
        'client-secret',
        'https://myapp.com/callback',
        codeVerifier,
      );
      expect(result1).not.toBeNull();

      // Second use fails
      const result2 = await sdk.handleCallback(
        code,
        'client-123',
        'client-secret',
        'https://myapp.com/callback',
        codeVerifier,
      );
      expect(result2).toBeNull();
    });
  });

  describe('getUserProfile', () => {
    it('should return user profile from a valid access token', async () => {
      // Create an authorization code and get tokens
      const codeVerifier = 'e'.repeat(43);
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      const code = sdk.createAuthorizationCode(
        'client-123',
        'https://myapp.com/callback',
        ['profile:read'],
        codeChallenge,
        'user-42',
      );

      const tokens = await sdk.handleCallback(
        code,
        'client-123',
        'client-secret',
        'https://myapp.com/callback',
        codeVerifier,
      );

      const profile = await sdk.getUserProfile(tokens!.accessToken);

      expect(profile).not.toBeNull();
      expect(profile!.id).toBe('user-42');
    });

    it('should return null for an invalid access token', async () => {
      const profile = await sdk.getUserProfile('invalid-token');
      expect(profile).toBeNull();
    });
  });

  describe('refreshToken', () => {
    it('should refresh an access token using a refresh token', async () => {
      // Create tokens first
      const codeVerifier = 'f'.repeat(43);
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      const code = sdk.createAuthorizationCode(
        'client-123',
        'https://myapp.com/callback',
        ['profile:read'],
        codeChallenge,
        'user-1',
      );

      const tokens = await sdk.handleCallback(
        code,
        'client-123',
        'client-secret',
        'https://myapp.com/callback',
        codeVerifier,
      );

      // Refresh the token
      const refreshed = await sdk.refreshToken(tokens!.refreshToken, 'client-123', 'client-secret');

      expect(refreshed).not.toBeNull();
      expect(refreshed!.accessToken).toBeDefined();
      expect(refreshed!.refreshToken).toBeDefined();
      expect(refreshed!.expiresIn).toBe(3600);
      expect(refreshed!.tokenType).toBe('Bearer');
    });

    it('should return null for an invalid refresh token', async () => {
      const result = await sdk.refreshToken('invalid-refresh-token', 'client-123', 'client-secret');

      expect(result).toBeNull();
    });

    it('should reject token refresh with mismatched client ID', async () => {
      const codeVerifier = 'g'.repeat(43);
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      const code = sdk.createAuthorizationCode(
        'client-123',
        'https://myapp.com/callback',
        ['profile:read'],
        codeChallenge,
        'user-1',
      );

      const tokens = await sdk.handleCallback(
        code,
        'client-123',
        'client-secret',
        'https://myapp.com/callback',
        codeVerifier,
      );

      // Try to refresh with wrong client ID
      const result = await sdk.refreshToken(tokens!.refreshToken, 'wrong-client', 'client-secret');

      expect(result).toBeNull();
    });
  });
});
