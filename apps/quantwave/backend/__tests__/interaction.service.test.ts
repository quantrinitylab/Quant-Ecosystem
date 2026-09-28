import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InteractionService } from '../services/interaction.service';

function createMockPrisma() {
  return {
    post: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(async () => ({ shareCount: 1 })),
    },
    postVote: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    postBookmark: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  };
}

describe('InteractionService', () => {
  let service: InteractionService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new InteractionService(prisma as never);
  });

  describe('vote', () => {
    it('casts a fresh upvote and syncs likeCount to the net score', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', deletedAt: null });
      prisma.postVote.findUnique.mockResolvedValue(null);
      prisma.postVote.upsert.mockResolvedValue({});
      prisma.postVote.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0); // up=1, down=0

      const r = await service.vote('u1', 'p1', 'up');

      expect(r).toEqual({ userVote: 1, upvotes: 1, downvotes: 0, score: 1 });
      expect(prisma.postVote.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: { userId: 'u1', postId: 'p1', value: 1 } }),
      );
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { likeCount: 1 },
      });
    });

    it('toggles the vote off when the same direction is repeated', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', deletedAt: null });
      prisma.postVote.findUnique.mockResolvedValue({ value: 1 });
      prisma.postVote.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      const r = await service.vote('u1', 'p1', 'up');

      expect(prisma.postVote.delete).toHaveBeenCalled();
      expect(prisma.postVote.upsert).not.toHaveBeenCalled();
      expect(r.userVote).toBe(0);
    });

    it('flips an upvote to a downvote', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', deletedAt: null });
      prisma.postVote.findUnique.mockResolvedValue({ value: 1 });
      prisma.postVote.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1); // up=0, down=1

      const r = await service.vote('u1', 'p1', 'down');

      expect(prisma.postVote.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { value: -1 } }),
      );
      expect(r).toEqual({ userVote: -1, upvotes: 0, downvotes: 1, score: -1 });
    });

    it('throws for a missing/deleted post', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.vote('u', 'missing', 'up')).rejects.toThrow('Post not found');
    });
  });

  describe('toggleBookmark', () => {
    it('adds then removes a bookmark', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', deletedAt: null });
      prisma.postBookmark.findUnique.mockResolvedValueOnce(null);
      prisma.postBookmark.create.mockResolvedValue({});
      const added = await service.toggleBookmark('u1', 'p1');
      expect(added).toEqual({ bookmarked: true });

      prisma.postBookmark.findUnique.mockResolvedValueOnce({ id: 'b1' });
      const removed = await service.toggleBookmark('u1', 'p1');
      expect(removed).toEqual({ bookmarked: false });
      expect(prisma.postBookmark.delete).toHaveBeenCalled();
    });
  });

  describe('listBookmarks', () => {
    it('returns the bookmarked posts in bookmark order', async () => {
      prisma.postBookmark.findMany.mockResolvedValue([{ postId: 'p2' }, { postId: 'p1' }]);
      prisma.postBookmark.count.mockResolvedValue(2);
      prisma.post.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);

      const result = await service.listBookmarks('u1');
      expect(result.total).toBe(2);
      expect((result.data as Array<{ id: string }>).map((p) => p.id)).toEqual(['p2', 'p1']);
    });

    it('short-circuits with no post query when there are no bookmarks', async () => {
      prisma.postBookmark.findMany.mockResolvedValue([]);
      prisma.postBookmark.count.mockResolvedValue(0);
      const result = await service.listBookmarks('u1');
      expect(result.data).toHaveLength(0);
      expect(prisma.post.findMany).not.toHaveBeenCalled();
    });
  });

  describe('share', () => {
    it('increments shareCount', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', deletedAt: null });
      prisma.post.update.mockResolvedValue({ shareCount: 5 });
      const r = await service.share('p1');
      expect(r).toEqual({ shareCount: 5 });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { shareCount: { increment: 1 } },
      });
    });
  });
});
