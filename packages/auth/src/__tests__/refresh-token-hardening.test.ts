import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  id: 'user-refresh-hardening',
  email: 'refresh@quantrinity.in',
  username: 'refresh-user',
  role: 'USER',
};

describe('refresh token hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('revokes the full family when the presented credential does not match its stored digest', async () => {
    let persisted: Record<string, unknown> | undefined;
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      refreshToken: {
        create: vi.fn(async ({ data }) => {
          persisted = { ...data, isRevoked: false };
          return persisted;
        }),
        findUnique: vi.fn(async () => ({ ...persisted, token: '0'.repeat(64) })),
        updateMany,
      },
      user: { findUnique: vi.fn() },
    };
    const service = new TokenService(TEST_CONFIG, prisma as never);

    const pair = await service.generateTokenPair(
      USER.id,
      { email: USER.email, username: USER.username, role: USER.role },
      ['profile:read'],
      'quantmail',
    );

    await expect(service.refreshToken(pair.refreshToken)).rejects.toThrow(
      'Refresh token reuse detected or token revoked',
    );
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { family: persisted?.family },
      data: { isRevoked: true },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('fails closed and revokes the family when another caller wins the rotation race', async () => {
    let persisted: Record<string, unknown> | undefined;
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const prisma = {
      refreshToken: {
        create: vi.fn(async ({ data }) => {
          persisted = { ...data, isRevoked: false };
          return persisted;
        }),
        findUnique: vi.fn(async () => persisted),
        updateMany,
      },
      user: { findUnique: vi.fn() },
    };
    const service = new TokenService(TEST_CONFIG, prisma as never);

    const pair = await service.generateTokenPair(
      USER.id,
      { email: USER.email, username: USER.username, role: USER.role },
      ['profile:read'],
      'quantmail',
    );

    await expect(service.refreshToken(pair.refreshToken)).rejects.toThrow(
      'Refresh token reuse detected or token revoked',
    );
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: persisted?.id, isRevoked: false },
      data: { isRevoked: true },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { family: persisted?.family },
      data: { isRevoked: true },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('enforces issuer and audience before reading refresh-token state', async () => {
    let persisted: Record<string, unknown> | undefined;
    const issuerPrisma = {
      refreshToken: {
        create: vi.fn(async ({ data }) => {
          persisted = { ...data, isRevoked: false };
          return persisted;
        }),
      },
    };
    const issuer = new TokenService(TEST_CONFIG, issuerPrisma as never);
    const pair = await issuer.generateTokenPair(
      USER.id,
      { email: USER.email, username: USER.username, role: USER.role },
      ['profile:read'],
      'quantmail',
    );

    const findUnique = vi.fn(async () => persisted);
    const verifier = new TokenService(
      { ...TEST_CONFIG, audience: 'a-different-audience' },
      { refreshToken: { findUnique } } as never,
    );

    await expect(verifier.refreshToken(pair.refreshToken)).rejects.toThrow(
      'Invalid refresh token',
    );
    expect(findUnique).not.toHaveBeenCalled();
  });
});
