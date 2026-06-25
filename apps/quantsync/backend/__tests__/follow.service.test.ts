import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FollowService } from '../services/follow.service';

function createMockPrisma() {
  return {
    userRelationship: {
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  };
}

describe('FollowService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: FollowService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new FollowService(prisma as never);
  });

  describe('follow', () => {
    it('rejects following yourself', async () => {
      await expect(service.follow('u1', 'u1')).rejects.toMatchObject({ code: 'SELF_FOLLOW' });
      expect(prisma.userRelationship.create).not.toHaveBeenCalled();
    });

    it('rejects following a non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.follow('u1', 'ghost')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
      expect(prisma.userRelationship.create).not.toHaveBeenCalled();
    });

    it('creates a follow edge', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2' });
      prisma.userRelationship.findUnique.mockResolvedValue(null);
      prisma.userRelationship.create.mockResolvedValue({});

      const res = await service.follow('u1', 'u2');

      expect(res).toEqual({ following: true });
      expect(prisma.userRelationship.create).toHaveBeenCalledWith({
        data: { followerId: 'u1', followingId: 'u2', type: 'FOLLOW' },
      });
    });

    it('is idempotent when already following', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2' });
      prisma.userRelationship.findUnique.mockResolvedValue({ id: 'rel-1' });

      const res = await service.follow('u1', 'u2');

      expect(res).toEqual({ following: true });
      expect(prisma.userRelationship.create).not.toHaveBeenCalled();
    });
  });

  describe('unfollow', () => {
    it('removes the follow edge and reports not following', async () => {
      prisma.userRelationship.deleteMany.mockResolvedValue({ count: 1 });

      const res = await service.unfollow('u1', 'u2');

      expect(res).toEqual({ following: false });
      expect(prisma.userRelationship.deleteMany).toHaveBeenCalledWith({
        where: { followerId: 'u1', followingId: 'u2' },
      });
    });
  });

  describe('isFollowing', () => {
    it('returns true when an edge exists', async () => {
      prisma.userRelationship.findUnique.mockResolvedValue({ id: 'rel-1' });
      expect(await service.isFollowing('u1', 'u2')).toBe(true);
    });

    it('returns false when no edge exists', async () => {
      prisma.userRelationship.findUnique.mockResolvedValue(null);
      expect(await service.isFollowing('u1', 'u2')).toBe(false);
    });
  });

  describe('listFollowingIds / counts', () => {
    it('maps following rows to ids', async () => {
      prisma.userRelationship.findMany.mockResolvedValue([
        { followingId: 'a' },
        { followingId: 'b' },
      ]);
      expect(await service.listFollowingIds('u1')).toEqual(['a', 'b']);
    });

    it('returns follower/following counts', async () => {
      prisma.userRelationship.count.mockResolvedValueOnce(5).mockResolvedValueOnce(3);
      expect(await service.counts('u1')).toEqual({ followers: 5, following: 3 });
    });
  });
});
