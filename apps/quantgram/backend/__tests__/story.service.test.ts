import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StoryService } from '../services/story.service';

function createMockPrisma() {
  return {
    story: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    storyView: {
      upsert: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    userRelationship: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    closeFriend: { findMany: vi.fn(), findFirst: vi.fn() },
  };
}

describe('StoryService — distinct viewer tracking', () => {
  let service: StoryService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new StoryService(prisma as never);
  });

  const future = () => new Date(Date.now() + 60 * 60 * 1000);

  describe('createStory', () => {
    it('sets a 24h expiry', async () => {
      prisma.story.create.mockImplementation(async ({ data }: any) => ({ id: 's1', ...data }));
      const before = Date.now();
      const story = await service.createStory({
        userId: 'u1',
        type: 'IMAGE',
        mediaUrl: 'https://x/y.jpg',
      });
      const ttl = new Date(story.expiresAt).getTime() - before;
      // ~24h (allow a small window for execution time).
      expect(ttl).toBeGreaterThan(23.9 * 3600_000);
      expect(ttl).toBeLessThan(24.1 * 3600_000);
    });
  });

  describe('viewStory', () => {
    it('records ONE distinct view and sets viewCount to the distinct count', async () => {
      prisma.story.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'owner',
        expiresAt: future(),
        viewCount: 0,
      });
      prisma.storyView.upsert.mockResolvedValue({});
      prisma.storyView.count.mockResolvedValue(1);
      prisma.story.update.mockImplementation(async ({ data }: any) => ({
        id: 's1',
        userId: 'owner',
        viewCount: data.viewCount,
      }));

      const result = await service.viewStory('s1', 'viewer-1');

      expect(prisma.storyView.upsert).toHaveBeenCalledWith({
        where: { storyId_viewerId: { storyId: 's1', viewerId: 'viewer-1' } },
        create: { storyId: 's1', viewerId: 'viewer-1' },
        update: {},
      });
      expect(result.viewCount).toBe(1);
    });

    it('does not count the owner viewing their own story', async () => {
      prisma.story.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'owner',
        expiresAt: future(),
        viewCount: 3,
      });
      const result = await service.viewStory('s1', 'owner');
      expect(prisma.storyView.upsert).not.toHaveBeenCalled();
      expect(prisma.story.update).not.toHaveBeenCalled();
      expect(result.viewCount).toBe(3);
    });

    it('is idempotent on re-view (upsert no-op keeps the distinct count)', async () => {
      prisma.story.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'owner',
        expiresAt: future(),
        viewCount: 1,
      });
      prisma.storyView.upsert.mockResolvedValue({});
      prisma.storyView.count.mockResolvedValue(1); // still 1 distinct viewer
      prisma.story.update.mockImplementation(async ({ data }: any) => ({
        id: 's1',
        viewCount: data.viewCount,
      }));

      const result = await service.viewStory('s1', 'viewer-1');
      expect(result.viewCount).toBe(1);
    });

    it('rejects viewing an expired story', async () => {
      prisma.story.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'owner',
        expiresAt: new Date(Date.now() - 1000),
        viewCount: 0,
      });
      await expect(service.viewStory('s1', 'viewer-1')).rejects.toMatchObject({
        code: 'STORY_EXPIRED',
      });
    });

    it('rejects viewing a missing story', async () => {
      prisma.story.findUnique.mockResolvedValue(null);
      await expect(service.viewStory('ghost', 'viewer-1')).rejects.toMatchObject({
        code: 'STORY_NOT_FOUND',
      });
    });
  });

  describe('getViewers', () => {
    it('returns the distinct viewer list for the owner', async () => {
      prisma.story.findUnique.mockResolvedValue({ id: 's1', userId: 'owner' });
      prisma.storyView.findMany.mockResolvedValue([
        { viewerId: 'v2', viewedAt: new Date(2000) },
        { viewerId: 'v1', viewedAt: new Date(1000) },
      ]);

      const result = await service.getViewers('s1', 'owner');
      expect(result.viewCount).toBe(2);
      expect(result.viewers.map((v) => v.viewerId)).toEqual(['v2', 'v1']);
    });

    it('denies a non-owner', async () => {
      prisma.story.findUnique.mockResolvedValue({ id: 's1', userId: 'owner' });
      await expect(service.getViewers('s1', 'mallory')).rejects.toMatchObject({
        code: 'NOT_STORY_OWNER',
      });
    });
  });

  describe('close-friends audience', () => {
    it('blocks a non-close-friend from viewing a CLOSE_FRIENDS story', async () => {
      prisma.story.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'owner',
        audience: 'CLOSE_FRIENDS',
        expiresAt: future(),
        viewCount: 0,
      });
      prisma.closeFriend.findFirst.mockResolvedValue(null);
      await expect(service.viewStory('s1', 'stranger')).rejects.toMatchObject({
        code: 'STORY_NOT_VISIBLE',
      });
      expect(prisma.storyView.upsert).not.toHaveBeenCalled();
    });

    it('allows a close friend to view a CLOSE_FRIENDS story', async () => {
      prisma.story.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'owner',
        audience: 'CLOSE_FRIENDS',
        expiresAt: future(),
        viewCount: 0,
      });
      prisma.closeFriend.findFirst.mockResolvedValue({ id: 'cf1' });
      prisma.storyView.upsert.mockResolvedValue({});
      prisma.storyView.count.mockResolvedValue(1);
      prisma.story.update.mockImplementation(async ({ data }: any) => ({
        id: 's1',
        viewCount: data.viewCount,
      }));
      const result = await service.viewStory('s1', 'bestie');
      expect(result.viewCount).toBe(1);
    });

    it('hides CLOSE_FRIENDS stories from a non-close-friend in getActiveStories', async () => {
      prisma.story.findMany.mockResolvedValue([
        { id: 'a', userId: 'owner', audience: 'ALL', expiresAt: future() },
        { id: 'b', userId: 'owner', audience: 'CLOSE_FRIENDS', expiresAt: future() },
      ]);
      prisma.closeFriend.findFirst.mockResolvedValue(null);
      const result = await service.getActiveStories('owner', 'stranger');
      expect(result.map((s) => s.id)).toEqual(['a']);
    });

    it('shows all stories to the owner (no viewer filter)', async () => {
      prisma.story.findMany.mockResolvedValue([
        { id: 'a', userId: 'owner', audience: 'ALL', expiresAt: future() },
        { id: 'b', userId: 'owner', audience: 'CLOSE_FRIENDS', expiresAt: future() },
      ]);
      const result = await service.getActiveStories('owner');
      expect(result.map((s) => s.id)).toEqual(['a', 'b']);
      expect(prisma.closeFriend.findFirst).not.toHaveBeenCalled();
    });
  });
});
