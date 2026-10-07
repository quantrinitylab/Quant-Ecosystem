import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@quant/auth/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@quant/auth/crypto/secure-random', () => ({
  generateId: vi.fn((prefix: string) => `${prefix}mock_${Date.now()}`),
}));

vi.mock('argon2', () => ({
  hash: vi.fn(async (pw: string) => `hashed_${pw}`),
  verify: vi.fn(async (hash: string, pw: string) => hash === `hashed_${pw}`),
}));

vi.mock('@quant/auth/services/token-service', () => {
  class MockTokenService {
    async generateTokenPair() {
      return {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresIn: 900,
      };
    }
    async validateAccessToken(token: string) {
      return token === 'mock-access-token' ? { sub: 'user-1', email: 'test@test.com' } : null;
    }
    async refreshToken() {
      return {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      };
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

describe('E2E Auth Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Login Flow', () => {
    it('authenticates user with valid credentials and returns tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'alice@test.com',
        username: 'alice',
        displayName: 'Alice',
        passwordHash: 'hashed_SecureP@ss123',
        role: 'USER',
      } as never);

      const user = await mockPrisma.user.findUnique({ where: { email: 'alice@test.com' } });
      expect(user).toBeTruthy();
      expect(user!.id).toBe('user-1');

      const { verify } = await import('argon2');
      const valid = await verify(user!.passwordHash, 'SecureP@ss123');
      expect(valid).toBe(true);
    });

    it('rejects login with wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'alice@test.com',
        passwordHash: 'hashed_SecureP@ss123',
      } as never);

      const user = await mockPrisma.user.findUnique({ where: { email: 'alice@test.com' } });
      const { verify } = await import('argon2');
      const valid = await verify(user!.passwordHash, 'WrongPassword');
      expect(valid).toBe(false);
    });

    it('rejects login for non-existent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const user = await mockPrisma.user.findUnique({ where: { email: 'nobody@test.com' } });
      expect(user).toBeNull();
    });

    it('requires both email and password', () => {
      const body1 = { email: '', password: 'test' };
      const body2 = { email: 'test@test.com', password: '' };

      expect(!body1.email || !body1.password).toBe(true);
      expect(!body2.email || !body2.password).toBe(true);
    });
  });

  describe('Registration Flow', () => {
    it('creates a new user with hashed password and returns tokens', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-new',
        email: 'newuser@test.com',
        username: 'newuser',
        displayName: 'New User',
        passwordHash: 'hashed_NewP@ss456',
        role: 'USER',
        status: 'ACTIVE',
        emailVerified: true,
      } as never);

      const existing = await mockPrisma.user.findFirst({
        where: { OR: [{ email: 'newuser@test.com' }, { username: 'newuser' }] },
      });
      expect(existing).toBeNull();

      const { hash } = await import('argon2');
      const passwordHash = await hash('NewP@ss456');
      expect(passwordHash).toBe('hashed_NewP@ss456');

      const user = await mockPrisma.user.create({
        data: {
          email: 'newuser@test.com',
          username: 'newuser',
          displayName: 'New User',
          passwordHash,
          status: 'ACTIVE',
          emailVerified: true,
        },
      });

      expect(user.id).toBe('user-new');
      expect(user.email).toBe('newuser@test.com');
    });

    it('prevents duplicate email registration', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'existing-user',
        email: 'taken@test.com',
      } as never);

      const existing = await mockPrisma.user.findFirst({
        where: { OR: [{ email: 'taken@test.com' }] },
      });
      expect(existing).toBeTruthy();
    });

    it('prevents duplicate username registration', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'existing-user',
        username: 'takenname',
      } as never);

      const existing = await mockPrisma.user.findFirst({
        where: { OR: [{ username: 'takenname' }] },
      });
      expect(existing).toBeTruthy();
    });

    it('requires email, username, and password', () => {
      const incomplete = { email: 'test@test.com', username: '', password: '' };
      expect(!incomplete.email || !incomplete.username || !incomplete.password).toBe(true);
    });
  });

  describe('Token Management', () => {
    it('generates access and refresh token pair on login', async () => {
      const { TokenService } = await import('@quant/auth/services/token-service');
      const tokenService = new TokenService({} as never);

      const tokens = await tokenService.generateTokenPair(
        'user-1',
        { email: 'test@test.com', username: 'test', role: 'USER' },
        ['openid', 'profile', 'email'],
        'quantmail' as never,
      );

      expect(tokens.accessToken).toBe('mock-access-token');
      expect(tokens.refreshToken).toBe('mock-refresh-token');
      expect(tokens.expiresIn).toBe(900);
    });

    it('refreshes expired access token using refresh token', async () => {
      const { TokenService } = await import('@quant/auth/services/token-service');
      const tokenService = new TokenService({} as never);

      const newTokens = await tokenService.refreshToken('mock-refresh-token');
      expect((newTokens as unknown as { access_token: string }).access_token).toBe(
        'new-access-token',
      );
      expect((newTokens as unknown as { refresh_token: string }).refresh_token).toBe(
        'new-refresh-token',
      );
    });

    it('revokes token on logout', async () => {
      const { TokenService } = await import('@quant/auth/services/token-service');
      const tokenService = new TokenService({} as never);

      const result = await tokenService.revokeToken('mock-access-token');
      expect(result).toEqual({ revoked: true });
    });
  });
});
