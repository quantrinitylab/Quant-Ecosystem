// Quanty Feed service tests (Q8).
// Covers: instructions save/load, post pagination, like/dislike toggle,
// discuss context, and the honesty rule (external posts need real URLs).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  QuantyFeedService,
  FeedValidationError,
  FEED_PROVENANCE_AGENT_BRIEF,
  FEED_PROVENANCE_EXTERNAL,
  type FeedPrisma,
} from '../services/quanty-feed.service';

function createMockPrisma() {
  return {
    feedInstruction: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    feedPost: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    feedReaction: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  };
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

describe('QuantyFeedService', () => {
  let prisma: MockPrisma;
  let service: QuantyFeedService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new QuantyFeedService(prisma as unknown as FeedPrisma);
    vi.clearAllMocks();
  });

  describe('instructions save/load', () => {
    it('loads saved instructions for a user', async () => {
      prisma.feedInstruction.findUnique.mockResolvedValue({
        id: 'i1',
        userId: 'u1',
        prompt: 'AI news',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const result = await service.getInstructions('u1');
      expect(result?.prompt).toBe('AI news');
      expect(prisma.feedInstruction.findUnique).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    });

    it('returns null when the user has no instructions', async () => {
      prisma.feedInstruction.findUnique.mockResolvedValue(null);
      expect(await service.getInstructions('u1')).toBeNull();
    });

    it('saves (upserts) instructions', async () => {
      prisma.feedInstruction.upsert.mockResolvedValue({ id: 'i1', userId: 'u1', prompt: 'Tech' });
      const result = await service.saveInstructions('u1', '  Tech  ');
      expect(result.prompt).toBe('Tech');
      expect(prisma.feedInstruction.upsert).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        create: { userId: 'u1', prompt: 'Tech' },
        update: { prompt: 'Tech' },
      });
    });

    it('rejects empty instructions', async () => {
      await expect(service.saveInstructions('u1', '   ')).rejects.toBeInstanceOf(FeedValidationError);
    });

    it('rejects overlong instructions', async () => {
      await expect(service.saveInstructions('u1', 'x'.repeat(2001))).rejects.toBeInstanceOf(
        FeedValidationError,
      );
    });
  });

  describe('createPost honesty rule', () => {
    it('creates agent_brief posts without a source URL', async () => {
      prisma.feedPost.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
        id: 'p1',
        createdAt: new Date(),
        ...args.data,
      }));
      const post = await service.createPost({
        userId: 'u1',
        title: 'Brief',
        excerpt: 'Summary',
        provenance: FEED_PROVENANCE_AGENT_BRIEF,
      });
      expect(post.provenance).toBe('agent_brief');
      expect(post.likeCount).toBe(0);
    });

    it('creates external posts with a real URL', async () => {
      prisma.feedPost.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
        id: 'p1',
        createdAt: new Date(),
        ...args.data,
      }));
      const post = await service.createPost({
        userId: 'u1',
        title: 'Real article',
        excerpt: 'Summary',
        sourceUrl: 'https://example.com/article',
        sourceName: 'Example',
        provenance: FEED_PROVENANCE_EXTERNAL,
      });
      expect(post.sourceUrl).toBe('https://example.com/article');
    });

    it('rejects external posts without a URL (no fabricated sources)', async () => {
      await expect(
        service.createPost({
          userId: 'u1',
          title: 'Fake news',
          excerpt: 'Invented',
          provenance: FEED_PROVENANCE_EXTERNAL,
        }),
      ).rejects.toBeInstanceOf(FeedValidationError);
      expect(prisma.feedPost.create).not.toHaveBeenCalled();
    });

    it('rejects external posts with non-http(s) URLs', async () => {
      await expect(
        service.createPost({
          userId: 'u1',
          title: 'X',
          excerpt: 'Y',
          sourceUrl: 'javascript:alert(1)',
          provenance: FEED_PROVENANCE_EXTERNAL,
        }),
      ).rejects.toBeInstanceOf(FeedValidationError);
    });

    it('rejects empty title/excerpt', async () => {
      await expect(
        service.createPost({ userId: 'u1', title: ' ', excerpt: 'Y', provenance: FEED_PROVENANCE_AGENT_BRIEF }),
      ).rejects.toBeInstanceOf(FeedValidationError);
    });
  });

  describe('getFeed pagination', () => {
    it('returns paginated posts newest-first with reaction counts', async () => {
      const now = new Date();
      prisma.feedPost.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 'u1',
          title: 'T1',
          excerpt: 'E1',
          sourceUrl: null,
          sourceName: null,
          imageUrl: null,
          emoji: '📰',
          provenance: 'agent_brief',
          createdAt: now,
          reactions: [{ kind: 'like' }],
        },
      ]);
      prisma.feedPost.count.mockResolvedValue(25);
      prisma.feedReaction.findMany.mockResolvedValue([
        { postId: 'p1', kind: 'like' },
        { postId: 'p1', kind: 'like' },
        { postId: 'p1', kind: 'dislike' },
      ]);

      const page = await service.getFeed('u1', 1, 20);
      expect(page.posts).toHaveLength(1);
      expect(page.posts[0].likeCount).toBe(2);
      expect(page.posts[0].dislikeCount).toBe(1);
      expect(page.posts[0].myReaction).toBe('like');
      expect(page.total).toBe(25);
      expect(page.hasMore).toBe(true);
      expect(prisma.feedPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20, orderBy: { createdAt: 'desc' } }),
      );
    });

    it('computes hasMore=false on the last page', async () => {
      const rows = Array.from({ length: 20 }, (_, i) => ({
        id: `p${i}`,
        userId: 'u1',
        title: `T${i}`,
        excerpt: 'E',
        sourceUrl: null,
        sourceName: null,
        imageUrl: null,
        emoji: null,
        provenance: 'agent_brief',
        createdAt: new Date(),
        reactions: [],
      }));
      prisma.feedPost.findMany.mockResolvedValue(rows);
      prisma.feedPost.count.mockResolvedValue(20);
      prisma.feedReaction.findMany.mockResolvedValue([]);
      const page = await service.getFeed('u1', 1, 20);
      expect(page.hasMore).toBe(false);
    });

    it('clamps page/limit to safe bounds', async () => {
      prisma.feedPost.findMany.mockResolvedValue([]);
      prisma.feedPost.count.mockResolvedValue(0);
      await service.getFeed('u1', -3, 500);
      expect(prisma.feedPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50 }),
      );
    });
  });

  describe('react toggle', () => {
    const post = {
      id: 'p1',
      userId: 'u1',
      title: 'T',
      excerpt: 'E',
      sourceUrl: null,
      sourceName: null,
      imageUrl: null,
      emoji: null,
      provenance: 'agent_brief',
      createdAt: new Date(),
    };

    it('likes a post with no existing reaction', async () => {
      prisma.feedPost.findUnique.mockResolvedValue(post);
      prisma.feedReaction.findUnique.mockResolvedValue(null);
      prisma.feedReaction.findMany.mockResolvedValue([{ postId: 'p1', kind: 'like' }]);

      const result = await service.react('u1', 'p1', 'like');
      expect(result.myReaction).toBe('like');
      expect(result.likeCount).toBe(1);
      expect(prisma.feedReaction.upsert).toHaveBeenCalled();
    });

    it('toggling the same kind again removes the reaction', async () => {
      prisma.feedPost.findUnique.mockResolvedValue(post);
      prisma.feedReaction.findUnique.mockResolvedValue({ kind: 'like' });
      prisma.feedReaction.findMany.mockResolvedValue([]);

      const result = await service.react('u1', 'p1', 'like');
      expect(result.myReaction).toBeNull();
      expect(prisma.feedReaction.delete).toHaveBeenCalledWith({
        where: { postId_userId: { postId: 'p1', userId: 'u1' } },
      });
    });

    it('switching kind updates the reaction', async () => {
      prisma.feedPost.findUnique.mockResolvedValue(post);
      prisma.feedReaction.findUnique.mockResolvedValue({ kind: 'like' });
      prisma.feedReaction.findMany.mockResolvedValue([{ postId: 'p1', kind: 'dislike' }]);

      const result = await service.react('u1', 'p1', 'dislike');
      expect(result.myReaction).toBe('dislike');
      expect(result.dislikeCount).toBe(1);
      expect(prisma.feedReaction.delete).not.toHaveBeenCalled();
    });

    it('rejects reacting to another user\'s post', async () => {
      prisma.feedPost.findUnique.mockResolvedValue({ ...post, userId: 'u2' });
      await expect(service.react('u1', 'p1', 'like')).rejects.toBeInstanceOf(FeedValidationError);
    });

    it('rejects reacting to a missing post', async () => {
      prisma.feedPost.findUnique.mockResolvedValue(null);
      await expect(service.react('u1', 'nope', 'like')).rejects.toBeInstanceOf(FeedValidationError);
    });
  });

  describe('discuss context', () => {
    it('builds an opening prompt labeled as a Quanty brief', async () => {
      prisma.feedPost.findUnique.mockResolvedValue({
        id: 'p1',
        userId: 'u1',
        title: 'AI breakthroughs',
        excerpt: 'Models got smaller.',
        sourceUrl: null,
        sourceName: null,
        provenance: 'agent_brief',
      });
      const ctx = await service.getDiscussContext('u1', 'p1');
      expect(ctx.postId).toBe('p1');
      expect(ctx.openingPrompt).toContain('AI breakthroughs');
      expect(ctx.openingPrompt).toContain('Quanty brief');
      expect(ctx.provenance).toBe('agent_brief');
    });

    it('labels external posts with their real source', async () => {
      prisma.feedPost.findUnique.mockResolvedValue({
        id: 'p2',
        userId: 'u1',
        title: 'Real story',
        excerpt: 'Things happened.',
        sourceUrl: 'https://example.com/s',
        sourceName: 'Example News',
        provenance: 'external',
      });
      const ctx = await service.getDiscussContext('u1', 'p2');
      expect(ctx.openingPrompt).toContain('Example News');
      expect(ctx.sourceUrl).toBe('https://example.com/s');
    });

    it('rejects discussing another user\'s post', async () => {
      prisma.feedPost.findUnique.mockResolvedValue({ id: 'p1', userId: 'u2' });
      await expect(service.getDiscussContext('u1', 'p1')).rejects.toBeInstanceOf(FeedValidationError);
    });
  });
});
