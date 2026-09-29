import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FeedService } from '../services/feed.service';

function createMockPrisma() {
  return {
    post: {
      findMany: vi.fn(),
    },
  };
}

describe('FeedService', () => {
  let service: FeedService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new FeedService(prisma as never);
  });

  describe('getFeed', () => {
    it('returns public non-deleted posts ordered by createdAt desc', async () => {
      prisma.post.findMany.mockResolvedValue([
        { id: 'post-2', userId: 'user-2' },
        { id: 'post-1', userId: 'user-3' },
      ]);

      const result = await service.getFeed('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('post-2');
      expect(result[1].id).toBe('post-1');
    });

    it('filters by visibility=PUBLIC and deletedAt=null', async () => {
      prisma.post.findMany.mockResolvedValue([]);

      await service.getFeed('user-1');

      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            visibility: 'PUBLIC',
            deletedAt: null,
          },
        }),
      );
    });

    it('applies pagination with skip and take', async () => {
      prisma.post.findMany.mockResolvedValue([]);

      await service.getFeed('user-1', 2, 10);

      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10, // (page - 1) * pageSize = (2 - 1) * 10
          take: 10,
        }),
      );
    });

    it('defaults to page=1 pageSize=20', async () => {
      prisma.post.findMany.mockResolvedValue([]);

      await service.getFeed('user-1');

      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        }),
      );
    });

    it('returns empty array when no posts match', async () => {
      prisma.post.findMany.mockResolvedValue([]);

      const result = await service.getFeed('user-1', 1, 10);

      expect(result).toEqual([]);
    });
  });

  describe('getPostsByHashtag', () => {
    it('queries by normalized tag via array_contains plus PUBLIC and deletedAt=null', async () => {
      prisma.post.findMany.mockResolvedValue([]);

      await service.getPostsByHashtag('photo');

      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            visibility: 'PUBLIC',
            deletedAt: null,
            hashtags: {
              array_contains: 'photo',
            },
          },
        }),
      );
    });

    it('normalizes the tag by stripping a leading # and lowercasing', async () => {
      prisma.post.findMany.mockResolvedValue([]);

      await service.getPostsByHashtag('  #Nature ');

      const call = prisma.post.findMany.mock.calls[0][0];
      expect(call.where.hashtags.array_contains).toBe('nature');
    });

    it('applies pagination with skip and take', async () => {
      prisma.post.findMany.mockResolvedValue([]);

      await service.getPostsByHashtag('photo', 3, 10);

      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (page - 1) * pageSize = (3 - 1) * 10
          take: 10,
        }),
      );
    });

    it('defaults to page=1 pageSize=20', async () => {
      prisma.post.findMany.mockResolvedValue([]);

      await service.getPostsByHashtag('photo');

      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        }),
      );
    });

    it('orders by createdAt desc', async () => {
      prisma.post.findMany.mockResolvedValue([]);

      await service.getPostsByHashtag('photo');

      const call = prisma.post.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('returns the posts from prisma', async () => {
      prisma.post.findMany.mockResolvedValue([{ id: 'post-1' }, { id: 'post-2' }]);

      const result = await service.getPostsByHashtag('photo');

      expect(result).toHaveLength(2);
    });
  });

  describe('getTrendingPosts', () => {
    it('returns trending posts from the last 24 hours', async () => {
      prisma.post.findMany.mockResolvedValue([
        { id: 'post-1' },
        { id: 'post-2' },
        { id: 'post-3' },
      ]);

      const result = await service.getTrendingPosts(5);

      expect(result).toHaveLength(3);
    });

    it('filters by visibility=PUBLIC and a createdAt >= 24h ago', async () => {
      prisma.post.findMany.mockResolvedValue([]);

      await service.getTrendingPosts(10);

      const call = prisma.post.findMany.mock.calls[0][0];
      expect(call.where.visibility).toBe('PUBLIC');
      expect(call.where.createdAt.gte).toBeInstanceOf(Date);
      // createdAt.gte should be within the last 24 hours
      const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
      expect(call.where.createdAt.gte.getTime()).toBeGreaterThanOrEqual(twentyFourHoursAgo - 1000);
      expect(call.where.createdAt.gte.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('respects the limit parameter', async () => {
      prisma.post.findMany.mockResolvedValue([]);

      await service.getTrendingPosts(3);

      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 3,
        }),
      );
    });

    it('defaults limit to 20', async () => {
      prisma.post.findMany.mockResolvedValue([]);

      await service.getTrendingPosts();

      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
        }),
      );
    });

    it('returns empty array when no trending posts exist', async () => {
      prisma.post.findMany.mockResolvedValue([]);

      const result = await service.getTrendingPosts();

      expect(result).toEqual([]);
    });
  });
});
