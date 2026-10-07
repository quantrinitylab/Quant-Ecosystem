import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProfileService } from '../services/profile.service';

function createMockPrisma() {
  return {
    user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    post: { count: vi.fn() },
    userRelationship: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    closeFriend: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    notification: { create: vi.fn() },
  };
}

describe('ProfileService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ProfileService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ProfileService(prisma as never);
  });

  describe('getProfile', () => {
    it('derives counts and isFollowing', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        username: 'alice',
        displayName: 'Alice',
        bio: 'hi',
        avatarUrl: 'a.jpg',
        website: '',
        emailVerified: true,
        deletedAt: null,
      });
      prisma.post.count.mockResolvedValue(7);
      prisma.userRelationship.count.mockResolvedValueOnce(100).mockResolvedValueOnce(50);
      prisma.userRelationship.findFirst.mockResolvedValue({ id: 'r1' });

      const profile = await service.getProfile('u1', 'viewer');

      expect(profile.postCount).toBe(7);
      expect(profile.followerCount).toBe(100);
      expect(profile.followingCount).toBe(50);
      expect(profile.isFollowing).toBe(true);
      expect(profile.isVerified).toBe(true);
    });
  });

  describe('follow', () => {
    it('rejects self-follow with 400', async () => {
      await expect(service.follow('u1', 'u1')).rejects.toThrow('You cannot follow yourself');
      expect(prisma.userRelationship.upsert).not.toHaveBeenCalled();
    });

    it('upserts a FOLLOW edge and sends a best-effort notification', async () => {
      prisma.userRelationship.upsert.mockResolvedValue({ id: 'r1' });

      const result = await service.follow('follower', 'target');

      expect(result).toEqual({ following: true });
      const arg = prisma.userRelationship.upsert.mock.calls[0][0] as {
        create: Record<string, unknown>;
      };
      expect(arg.create).toMatchObject({
        followerId: 'follower',
        followingId: 'target',
        type: 'FOLLOW',
      });
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('unfollow', () => {
    it('deletes the FOLLOW edge', async () => {
      prisma.userRelationship.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.unfollow('follower', 'target');

      expect(result).toEqual({ following: false });
      expect(prisma.userRelationship.deleteMany).toHaveBeenCalledWith({
        where: { followerId: 'follower', followingId: 'target', type: 'FOLLOW' },
      });
    });
  });

  describe('listFollowers / listFollowing', () => {
    it('lists followers in edge order and flags which the viewer follows', async () => {
      // Two follower edges (newest first), follower ids f1, f2.
      prisma.userRelationship.findMany
        .mockResolvedValueOnce([{ followerId: 'f1' }, { followerId: 'f2' }])
        // viewer follows f2 only.
        .mockResolvedValueOnce([{ followingId: 'f2' }]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'f1', username: 'one', displayName: 'One', avatarUrl: null, emailVerified: true },
        { id: 'f2', username: 'two', displayName: 'Two', avatarUrl: null, emailVerified: false },
      ]);

      const users = await service.listFollowers('target', 'viewer');

      expect(users.map((u) => u.id)).toEqual(['f1', 'f2']);
      expect(users.find((u) => u.id === 'f1')!.isFollowing).toBe(false);
      expect(users.find((u) => u.id === 'f2')!.isFollowing).toBe(true);
      expect(users.find((u) => u.id === 'f1')!.isVerified).toBe(true);
    });

    it('returns following users without a viewer-follow query when there are none', async () => {
      prisma.userRelationship.findMany.mockResolvedValueOnce([]);
      const users = await service.listFollowing('target', 'viewer');
      expect(users).toEqual([]);
      // No second findMany (viewer follow set) and no user fetch.
      expect(prisma.userRelationship.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('omits the viewer-follow query for an anonymous viewer', async () => {
      prisma.userRelationship.findMany.mockResolvedValueOnce([{ followingId: 'a1' }]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'a1', username: 'a', displayName: 'A', avatarUrl: null, emailVerified: false },
      ]);

      const users = await service.listFollowing('target', '');

      expect(users[0]!.isFollowing).toBe(false);
      // Only the edge query ran (no follow-set query for an empty viewer).
      expect(prisma.userRelationship.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
