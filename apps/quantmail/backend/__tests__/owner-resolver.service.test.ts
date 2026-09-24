import { describe, it, expect, vi } from 'vitest';
import { resolveOwner, findRepositoryByOwnerAndName } from '../modules/code/services/owner-resolver.service';

function createMockPrisma() {
  return {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    organization: {
      findFirst: vi.fn(),
    },
    repository: {
      findFirst: vi.fn(),
    },
  };
}

describe('OwnerResolverService', () => {
  describe('resolveOwner', () => {
    it('returns null for empty or whitespace owner identifiers', async () => {
      const prisma = createMockPrisma();
      expect(await resolveOwner(prisma as never, '')).toBeNull();
      expect(await resolveOwner(prisma as never, '   ')).toBeNull();
      expect(await resolveOwner(prisma as never, null as never)).toBeNull();
    });

    it('resolves user by direct CUID lookup', async () => {
      const prisma = createMockPrisma();
      prisma.user.findUnique.mockResolvedValue({ id: 'cuid_user_123' });

      const result = await resolveOwner(prisma as never, 'cuid_user_123');
      expect(result).toEqual({ id: 'cuid_user_123', type: 'user' });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'cuid_user_123' },
        select: { id: true },
      });
    });

    it('resolves user by username when CUID lookup yields nothing', async () => {
      const prisma = createMockPrisma();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'user_alex_id' });

      const result = await resolveOwner(prisma as never, 'AlexTheDev');
      expect(result).toEqual({ id: 'user_alex_id', type: 'user' });
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          username: { equals: 'AlexTheDev', mode: 'insensitive' },
        },
        select: { id: true },
      });
    });

    it('resolves user by email prefix when username is not set', async () => {
      const prisma = createMockPrisma();
      prisma.user.findUnique.mockResolvedValue(null);
      // username findFirst returns null
      prisma.user.findFirst.mockResolvedValueOnce(null);
      // email prefix findFirst returns user
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'user_founder_id' });

      const result = await resolveOwner(prisma as never, 'founder');
      expect(result).toEqual({ id: 'user_founder_id', type: 'user' });
      expect(prisma.user.findFirst).toHaveBeenNthCalledWith(2, {
        where: {
          email: { startsWith: 'founder@', mode: 'insensitive' },
        },
        select: { id: true },
      });
    });

    it('resolves organization by slug when user lookup fails', async () => {
      const prisma = createMockPrisma();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.organization.findFirst.mockResolvedValue({ id: 'org_quant_corp' });

      const result = await resolveOwner(prisma as never, 'quant-corp');
      expect(result).toEqual({ id: 'org_quant_corp', type: 'org' });
      expect(prisma.organization.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { id: 'quant-corp' },
            { slug: { equals: 'quant-corp', mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
    });

    it('returns null when no user or organization matches', async () => {
      const prisma = createMockPrisma();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.organization.findFirst.mockResolvedValue(null);

      const result = await resolveOwner(prisma as never, 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findRepositoryByOwnerAndName', () => {
    it('queries repository using candidate IDs and ensures deletedAt is null', async () => {
      const prisma = createMockPrisma();
      prisma.user.findUnique.mockResolvedValue({ id: 'user_cuid_456' });

      const mockRepo = {
        id: 'repo_789',
        ownerId: 'user_cuid_456',
        name: 'quant-core',
        deletedAt: null,
      };
      prisma.repository.findFirst.mockResolvedValue(mockRepo);

      const repo = await findRepositoryByOwnerAndName(
        prisma as never,
        'user_cuid_456',
        'quant-core',
      );

      expect(repo).toEqual(mockRepo);
      expect(prisma.repository.findFirst).toHaveBeenCalledWith({
        where: {
          ownerId: { in: ['user_cuid_456', 'user_cuid_456'] },
          name: 'quant-core',
          deletedAt: null,
        },
      });
    });

    it('resolves handle to owner ID and queries with both resolved and input candidates', async () => {
      const prisma = createMockPrisma();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'resolved_user_id' });

      const mockRepo = {
        id: 'repo_111',
        ownerId: 'resolved_user_id',
        name: 'ai-engine',
        deletedAt: null,
      };
      prisma.repository.findFirst.mockResolvedValue(mockRepo);

      const repo = await findRepositoryByOwnerAndName(
        prisma as never,
        'alex-developer',
        'ai-engine',
        { isPrivate: false },
      );

      expect(repo).toEqual(mockRepo);
      expect(prisma.repository.findFirst).toHaveBeenCalledWith({
        where: {
          ownerId: { in: ['resolved_user_id', 'alex-developer'] },
          name: 'ai-engine',
          deletedAt: null,
          isPrivate: false,
        },
      });
    });
  });
});
