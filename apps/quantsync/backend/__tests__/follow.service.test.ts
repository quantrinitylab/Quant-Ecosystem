import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FollowService } from '../services/follow.service';

function createMockPrisma() {
  return {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(async (_args?: unknown) => [] as any[]),
    },
    userRelationship: {
      upsert: vi.fn(),
      deleteMany: vi.fn(async () => ({ count: 1 })),
      findUnique: vi.fn(),
      findMany: vi.fn(async (_args?: unknown) => [] as any[]),
    },
    post: {
      findMany: vi.fn(async (_args?: unknown) => [] as any[]),
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
    it('rejects self-follow', async () => {
      await expect(service.follow('u1', 'u1')).rejects.toThrow('cannot follow yourself');
      expect(prisma.userRelationship.upsert).not.toHaveBeenCalled();
    });

    it('rejects an unknown/deleted target', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.follow('u1', 'ghost')).rejects.toThrow('User not found');
      prisma.user.findUnique.mockResolvedValue({ id: 'd1', deletedAt: new Date() });
      await expect(service.follow('u1', 'd1')).rejects.toThrow('User not found');
    });

    it('upserts a FOLLOW edge idempotently', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'target', deletedAt: null });
      const result = await service.follow('follower', 'target');
      expect(result).toEqual({ following: true });
      const arg = prisma.userRelationship.upsert.mock.calls[0]![0] as {
        where: Record<string, unknown>;
        create: Record<string, unknown>;
      };
      expect(arg.where).toEqual({
        followerId_followingId: { followerId: 'follower', followingId: 'target' },
      });
      expect(arg.create).toMatchObject({
        followerId: 'follower',
        followingId: 'target',
        type: 'FOLLOW',
      });
    });
  });

  describe('unfollow', () => {
    it('deletes the FOLLOW edge', async () => {
      const result = await service.unfollow('follower', 'target');
      expect(result).toEqual({ following: false });
      expect(prisma.userRelationship.deleteMany).toHaveBeenCalledWith({
        where: { followerId: 'follower', followingId: 'target', type: 'FOLLOW' },
      });
    });

    it('rejects self-unfollow', async () => {
      await expect(service.unfollow('u1', 'u1')).rejects.toThrow('cannot unfollow yourself');
    });
  });

  describe('isFollowing', () => {
    it('reflects edge presence', async () => {
      prisma.userRelationship.findUnique.mockResolvedValueOnce({ id: 'r1' });
      expect(await service.isFollowing('a', 'b')).toBe(true);
      prisma.userRelationship.findUnique.mockResolvedValueOnce(null);
      expect(await service.isFollowing('a', 'c')).toBe(false);
    });
  });

  describe('listFollowers / listFollowing', () => {
    it('lists followers in edge order and flags the viewer follow state', async () => {
      prisma.userRelationship.findMany
        .mockResolvedValueOnce([{ followerId: 'f1' }, { followerId: 'f2' }])
        .mockResolvedValueOnce([{ followingId: 'f2' }]); // viewer follows f2 only
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

    it('short-circuits with no user query when there are no edges', async () => {
      prisma.userRelationship.findMany.mockResolvedValueOnce([]);
      const users = await service.listFollowing('target', 'viewer');
      expect(users).toEqual([]);
      expect(prisma.userRelationship.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getFollowingFeed', () => {
    it('returns public posts from followed authors, newest first', async () => {
      prisma.userRelationship.findMany.mockResolvedValueOnce([
        { followingId: 'a1' },
        { followingId: 'a2' },
      ]);
      prisma.post.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);

      const feed = await service.getFollowingFeed('me');

      expect(feed.map((p: { id: string }) => p.id)).toEqual(['p1', 'p2']);
      const arg = prisma.post.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
      expect(arg.where).toMatchObject({
        userId: { in: ['a1', 'a2'] },
        visibility: 'PUBLIC',
        deletedAt: null,
      });
    });

    it('returns an empty feed when the caller follows no one', async () => {
      prisma.userRelationship.findMany.mockResolvedValueOnce([]);
      const feed = await service.getFollowingFeed('me');
      expect(feed).toEqual([]);
      expect(prisma.post.findMany).not.toHaveBeenCalled();
    });
  });
});
