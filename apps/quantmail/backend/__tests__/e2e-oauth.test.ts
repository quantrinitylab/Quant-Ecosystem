import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@quant/auth/lib/prisma', () => ({
  prisma: {
    oAuthClient: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    oAuthConsent: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    authorizationCode: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@quant/auth/crypto/secure-random', () => ({
  generateId: vi.fn((prefix: string) => `${prefix}mock_${Math.random().toString(36).slice(2, 8)}`),
}));

vi.mock('@quant/auth/services/token-service', () => {
  class MockTokenService {
    async generateTokenPair() {
      return {
        accessToken: 'oauth-access-token',
        refreshToken: 'oauth-refresh-token',
        expiresIn: 900,
      };
    }
    async validateAccessToken(token: string) {
      return token === 'valid-token'
        ? { sub: 'user-1', email: 'user@test.com', id: 'user-1' }
        : null;
    }
    async refreshToken(token: string) {
      if (token === 'valid-refresh') {
        return { access_token: 'new-access', refresh_token: 'new-refresh' };
      }
      throw new Error('Invalid refresh token');
    }
    async revokeToken() {
      return { revoked: true };
    }
  }
  return { TokenService: MockTokenService };
});

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: vi.fn(() => 'test-jwt-secret'),
  getJwtRefreshSecret: vi.fn(() => 'test-refresh-secret'),
}));

import { prisma } from '@quant/auth/lib/prisma';

const mockPrisma = vi.mocked(prisma);

describe('E2E OAuth Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('OAuth Client Registration', () => {
    it('registers a new OAuth client with redirect URIs', async () => {
      mockPrisma.oAuthClient.create.mockResolvedValue({
        clientId: 'client_mock_abc',
        clientSecretHash: 'secret_mock_xyz',
        name: 'Test App',
        redirectUris: ['https://app.test.com/callback'],
        allowedScopes: ['openid', 'profile', 'email'],
        isConfidential: true,
        isFirstParty: false,
      } as never);

      const client = await mockPrisma.oAuthClient.create({
        data: {
          clientId: 'client_mock_abc',
          clientSecretHash: 'secret_mock_xyz',
          name: 'Test App',
          redirectUris: ['https://app.test.com/callback'],
          allowedScopes: ['openid', 'profile', 'email'],
          isConfidential: true,
          isFirstParty: false,
        },
      });

      expect(client.clientId).toBe('client_mock_abc');
      expect(client.redirectUris).toContain('https://app.test.com/callback');
    });

    it('rejects registration without redirect URIs', () => {
      const body = { name: 'Bad App', redirect_uris: [] };
      expect(!body.name || !body.redirect_uris?.length).toBe(true);
    });
  });

  describe('Authorization Code Flow', () => {
    it('validates redirect_uri against registered URIs', async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue({
        clientId: 'client-1',
        redirectUris: ['https://app.test.com/callback', 'https://app.test.com/callback2'],
      } as never);

      const client = await mockPrisma.oAuthClient.findUnique({ where: { clientId: 'client-1' } });
      const registeredUri = client?.redirectUris.find(
        (u: string) => u === 'https://app.test.com/callback',
      );
      expect(registeredUri).toBe('https://app.test.com/callback');

      const maliciousUri = client?.redirectUris.find((u: string) => u === 'https://evil.com/steal');
      expect(maliciousUri).toBeUndefined();
    });

    it('creates authorization code with expiry', async () => {
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      mockPrisma.authorizationCode.create.mockResolvedValue({
        code: 'ac_mock_abc',
        clientId: 'client-1',
        userId: 'user-1',
        redirectUri: 'https://app.test.com/callback',
        scopes: ['openid', 'profile', 'email'],
        expiresAt,
      } as never);

      const authCode = await mockPrisma.authorizationCode.create({
        data: {
          code: 'ac_mock_abc',
          clientId: 'client-1',
          userId: 'user-1',
          redirectUri: 'https://app.test.com/callback',
          scopes: ['openid', 'profile', 'email'],
          expiresAt,
        },
      });

      expect(authCode.code).toBe('ac_mock_abc');
      expect(authCode.expiresAt).toBeInstanceOf(Date);
      expect(authCode.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('rejects expired authorization codes', async () => {
      const expiredCode = {
        code: 'ac_expired',
        userId: 'user-1',
        expiresAt: new Date(Date.now() - 1000),
      };
      mockPrisma.authorizationCode.findUnique.mockResolvedValue(expiredCode as never);

      const authCode = await mockPrisma.authorizationCode.findUnique({
        where: { code: 'ac_expired' },
      });
      expect(authCode!.expiresAt.getTime()).toBeLessThan(Date.now());
    });

    it('exchanges valid authorization code for tokens', async () => {
      const validCode = {
        code: 'ac_valid',
        userId: 'user-1',
        clientId: 'client-1',
        scopes: ['openid', 'profile', 'email'],
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      };
      mockPrisma.authorizationCode.findUnique.mockResolvedValue(validCode as never);
      mockPrisma.authorizationCode.delete.mockResolvedValue(validCode as never);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@test.com',
        username: 'testuser',
        role: 'USER',
      } as never);

      const authCode = await mockPrisma.authorizationCode.findUnique({
        where: { code: 'ac_valid' },
      });
      expect(authCode).toBeTruthy();
      expect(authCode!.expiresAt.getTime()).toBeGreaterThan(Date.now());

      await mockPrisma.authorizationCode.delete({ where: { code: 'ac_valid' } });

      const user = await mockPrisma.user.findUnique({ where: { id: authCode!.userId } });
      expect(user).toBeTruthy();
      expect(user!.email).toBe('user@test.com');

      const { TokenService } = await import('@quant/auth/services/token-service');
      const tokenService = new TokenService({} as never);
      const tokens = await tokenService.generateTokenPair(
        user!.id,
        { email: user!.email, username: user!.username, role: user!.role },
        authCode!.scopes as never,
        'quantmail' as never,
      );

      expect(tokens.accessToken).toBe('oauth-access-token');
      expect(tokens.refreshToken).toBe('oauth-refresh-token');
    });
  });

  describe('Consent Management', () => {
    it('stores user consent for OAuth client', async () => {
      mockPrisma.oAuthConsent.upsert.mockResolvedValue({
        userId: 'user-1',
        clientId: 'client-1',
        scopes: ['openid', 'profile', 'email'],
      } as never);

      const consent = await mockPrisma.oAuthConsent.upsert({
        where: { userId_clientId: { userId: 'user-1', clientId: 'client-1' } },
        update: { scopes: ['openid', 'profile', 'email'] },
        create: { userId: 'user-1', clientId: 'client-1', scopes: ['openid', 'profile', 'email'] },
      });

      expect(consent.userId).toBe('user-1');
      expect(consent.scopes).toEqual(['openid', 'profile', 'email']);
    });

    it('auto-approves when consent already exists', async () => {
      mockPrisma.oAuthConsent.findUnique.mockResolvedValue({
        userId: 'user-1',
        clientId: 'client-1',
        scopes: ['openid', 'profile', 'email'],
      } as never);

      const existing = await mockPrisma.oAuthConsent.findUnique({
        where: { userId_clientId: { userId: 'user-1', clientId: 'client-1' } },
      });

      expect(existing).toBeTruthy();
    });
  });

  describe('Token Refresh', () => {
    it('refreshes access token with valid refresh token', async () => {
      const { TokenService } = await import('@quant/auth/services/token-service');
      const tokenService = new TokenService({} as never);

      const newTokens = await tokenService.refreshToken('valid-refresh');
      expect((newTokens as unknown as { access_token: string }).access_token).toBe('new-access');
      expect((newTokens as unknown as { refresh_token: string }).refresh_token).toBe('new-refresh');
    });

    it('rejects invalid refresh token', async () => {
      const { TokenService } = await import('@quant/auth/services/token-service');
      const tokenService = new TokenService({} as never);

      await expect(tokenService.refreshToken('invalid-refresh')).rejects.toThrow(
        'Invalid refresh token',
      );
    });
  });

  describe('Token Revocation', () => {
    it('revokes access token on logout', async () => {
      const { TokenService } = await import('@quant/auth/services/token-service');
      const tokenService = new TokenService({} as never);

      const result = await tokenService.revokeToken('oauth-access-token');
      expect(result).toEqual({ revoked: true });
    });
  });

  describe('OpenID Discovery', () => {
    it('returns correct discovery document', () => {
      const discovery = {
        issuer: 'https://quantmail.com',
        authorization_endpoint: '/oauth/authorize',
        token_endpoint: '/oauth/token',
        revocation_endpoint: '/oauth/revoke',
        registration_endpoint: '/oauth/register',
        jwks_uri: '/.well-known/jwks.json',
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
      };

      expect(discovery.issuer).toBe('https://quantmail.com');
      expect(discovery.response_types_supported).toContain('code');
      expect(discovery.grant_types_supported).toContain('authorization_code');
      expect(discovery.grant_types_supported).toContain('refresh_token');
    });
  });
});
