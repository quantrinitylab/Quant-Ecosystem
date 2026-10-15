/**
 * Refresh-token rotation must respect account liveness.
 *
 * Companion to the /auth/login gate (queue L639): blocking a soft-deleted or
 * admin-disabled account at login is not enough if an unrevoked refresh token
 * keeps minting new access tokens via TokenService.refreshToken.
 *
 * The contract pinned here:
 * - tombstoned user (deletedAt set) → rejects exactly like a missing user
 *   ('User not found'), and the whole refresh family is revoked
 * - SUSPENDED → rejects 'Account suspended', family revoked
 * - DEACTIVATED → rejects 'Account deactivated', family revoked
 * - ACTIVE / PENDING_VERIFICATION → rotation succeeds as before
 *
 * Uses real jose signing (EnvConfigJwtKms, test secrets) and a stateful
 * in-memory prisma injected through the constructor — no database needed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
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

const USER_INFO = { email: 'liveness@quant.app', username: 'livenessuser', role: 'user' };

interface MockPrisma {
  _tokens: Map<string, any>;
  _updateManyCalls: Array<{ where: any; data: any }>;
  refreshToken: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  user: { findUnique: ReturnType<typeof vi.fn> };
}

const makePrisma = (userRow: any): MockPrisma => {
  const tokens = new Map<string, any>();
  const updateManyCalls: Array<{ where: any; data: any }> = [];
  const matches = (t: any, where: any): boolean => {
    if (where.id !== undefined && t.id !== where.id) return false;
    if (where.isRevoked !== undefined && t.isRevoked !== where.isRevoked) return false;
    if (where.family !== undefined && t.family !== where.family) return false;
    return true;
  };
  return {
    _tokens: tokens,
    _updateManyCalls: updateManyCalls,
    refreshToken: {
      create: vi.fn(async ({ data }: any) => {
        const row = { ...data, isRevoked: false };
        tokens.set(row.id, row);
        return { ...row };
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const row = tokens.get(where.id);
        return row ? { ...row } : null;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        updateManyCalls.push({ where, data });
        let count = 0;
        for (const t of tokens.values()) {
          if (matches(t, where)) {
            Object.assign(t, data);
            count++;
          }
        }
        return { count };
      }),
    },
    user: {
      findUnique: vi.fn(async () => (userRow ? { ...userRow } : null)),
    },
  };
};

const liveUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-1',
  email: USER_INFO.email,
  username: USER_INFO.username,
  role: 'user',
  status: 'ACTIVE',
  deletedAt: null,
  ...overrides,
});

const mintPair = async (service: TokenService) =>
  service.generateTokenPair('user-1', USER_INFO, ['openid'], 'quantmail');

describe('TokenService.refreshToken — account-liveness gate', () => {
  let mockPrisma: MockPrisma;
  let service: TokenService;

  beforeEach(() => {
    mockPrisma = makePrisma(liveUser());
    service = new TokenService(TEST_CONFIG, mockPrisma as never);
  });

  it('refuses a tombstoned account exactly like a missing user, and revokes the family', async () => {
    mockPrisma = makePrisma(liveUser({ deletedAt: new Date('2026-01-01T00:00:00Z'), status: 'DEACTIVATED' }));
    service = new TokenService(TEST_CONFIG, mockPrisma as never);
    const pair = await mintPair(service);
    const createCalls = (mockPrisma.refreshToken.create as ReturnType<typeof vi.fn>).mock.calls;
    const family = createCalls[0]?.[0]?.data?.family as string | undefined;
    if (!family) throw new Error('test setup: no refresh token was minted');

    await expect(service.refreshToken(pair.refreshToken)).rejects.toThrow('User not found');

    // Whole family revoked — no sibling token in it can rotate again.
    const familyRevoke = mockPrisma._updateManyCalls.find(
      (c) => c.where.family === family && c.data.isRevoked === true,
    );
    expect(familyRevoke).toBeDefined();
    for (const t of mockPrisma._tokens.values()) {
      if (t.family === family) expect(t.isRevoked).toBe(true);
    }
  });

  it('refuses a suspended account with an honest error, and revokes the family', async () => {
    mockPrisma = makePrisma(liveUser({ status: 'SUSPENDED' }));
    service = new TokenService(TEST_CONFIG, mockPrisma as never);
    const pair = await mintPair(service);

    await expect(service.refreshToken(pair.refreshToken)).rejects.toThrow('Account suspended');

    const familyRevoke = mockPrisma._updateManyCalls.find(
      (c) => c.where.family !== undefined && c.data.isRevoked === true,
    );
    expect(familyRevoke).toBeDefined();
  });

  it('refuses a deactivated account with an honest error, and revokes the family', async () => {
    mockPrisma = makePrisma(liveUser({ status: 'DEACTIVATED' }));
    service = new TokenService(TEST_CONFIG, mockPrisma as never);
    const pair = await mintPair(service);

    await expect(service.refreshToken(pair.refreshToken)).rejects.toThrow('Account deactivated');

    const familyRevoke = mockPrisma._updateManyCalls.find(
      (c) => c.where.family !== undefined && c.data.isRevoked === true,
    );
    expect(familyRevoke).toBeDefined();
  });

  it('active accounts still rotate normally', async () => {
    const pair = await mintPair(service);
    const refreshed = await service.refreshToken(pair.refreshToken);
    expect(refreshed.accessToken).toBeDefined();
    expect(refreshed.refreshToken).not.toBe(pair.refreshToken);
    // Old token is spent: reuse is rejected.
    await expect(service.refreshToken(pair.refreshToken)).rejects.toThrow();
  });

  it('pending-verification accounts still rotate (address proof gates actions, not sessions)', async () => {
    mockPrisma = makePrisma(liveUser({ status: 'PENDING_VERIFICATION' }));
    service = new TokenService(TEST_CONFIG, mockPrisma as never);
    const pair = await mintPair(service);
    const refreshed = await service.refreshToken(pair.refreshToken);
    expect(refreshed.accessToken).toBeDefined();
  });
});
