import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  generatePersonalAccessToken,
  verifyPersonalAccessToken,
} from '../services/personal-access-token.service';

function prismaFor(record: Record<string, unknown> | null) {
  return {
    personalAccessToken: {
      findUnique: vi.fn(async () => record),
      update: vi.fn(async () => record),
    },
  } as unknown as PrismaClient;
}

describe('Personal Access Tokens', () => {
  it('generates qcp tokens with a public lookup id and SHA-256 digest', () => {
    const generated = generatePersonalAccessToken();
    expect(generated.token).toMatch(/^qcp_[0-9a-f]{24}_[A-Za-z0-9_-]{43}$/);
    expect(generated.tokenId).toMatch(/^[0-9a-f]{24}$/);
    expect(generated.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(generated.tokenHash).not.toContain(generated.token);
  });

  it('verifies possession and returns user identity and scopes', async () => {
    const generated = generatePersonalAccessToken();
    const now = new Date('2026-09-12T00:00:00Z');
    const prisma = prismaFor({
      id: 'pat-1',
      tokenId: generated.tokenId,
      tokenHash: generated.tokenHash,
      userId: 'user-1',
      scopes: ['repo:read'],
      expiresAt: new Date('2026-09-13T00:00:00Z'),
      revokedAt: null,
      lastUsedAt: null,
    });

    await expect(verifyPersonalAccessToken(prisma, generated.token, now)).resolves.toEqual({
      userId: 'user-1',
      scopes: ['repo:read'],
      tokenRecordId: 'pat-1',
    });
    expect(prisma.personalAccessToken.update).toHaveBeenCalledWith({
      where: { id: 'pat-1' },
      data: { lastUsedAt: now },
    });
  });

  it('rejects a correct tokenId with the wrong secret', async () => {
    const generated = generatePersonalAccessToken();
    const other = generatePersonalAccessToken();
    const forged = `qcp_${generated.tokenId}_${other.token.split('_')[2]}`;
    const prisma = prismaFor({
      id: 'pat-1',
      tokenId: generated.tokenId,
      tokenHash: generated.tokenHash,
      userId: 'user-1',
      scopes: ['repo:read'],
      expiresAt: new Date('2026-09-13T00:00:00Z'),
      revokedAt: null,
      lastUsedAt: null,
    });

    await expect(
      verifyPersonalAccessToken(prisma, forged, new Date('2026-09-12T00:00:00Z')),
    ).resolves.toBeNull();
  });

  it('rejects revoked tokens after proving possession', async () => {
    const generated = generatePersonalAccessToken();
    const prisma = prismaFor({
      id: 'pat-1',
      tokenId: generated.tokenId,
      tokenHash: generated.tokenHash,
      userId: 'user-1',
      scopes: ['repo:read'],
      expiresAt: new Date('2026-09-13T00:00:00Z'),
      revokedAt: new Date('2026-09-11T00:00:00Z'),
      lastUsedAt: null,
    });
    await expect(
      verifyPersonalAccessToken(prisma, generated.token, new Date('2026-09-12T00:00:00Z')),
    ).resolves.toBeNull();
  });

  it('rejects expired tokens', async () => {
    const generated = generatePersonalAccessToken();
    const prisma = prismaFor({
      id: 'pat-1',
      tokenId: generated.tokenId,
      tokenHash: generated.tokenHash,
      userId: 'user-1',
      scopes: ['repo:read'],
      expiresAt: new Date('2026-09-11T00:00:00Z'),
      revokedAt: null,
      lastUsedAt: null,
    });
    await expect(
      verifyPersonalAccessToken(prisma, generated.token, new Date('2026-09-12T00:00:00Z')),
    ).resolves.toBeNull();
  });
});
