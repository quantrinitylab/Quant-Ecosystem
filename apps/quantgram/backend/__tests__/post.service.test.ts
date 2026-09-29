import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PostService } from '../services/post.service';

type MockPrisma = ReturnType<typeof createMockPrisma>;

function createMockPrisma() {
  const prisma = {
    post: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
    comment: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    like: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    savedPost: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    userRelationship: {
      findMany: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return prisma;
}

describe('PostService', () => {
  let prisma: MockPrisma;
  let service: PostService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new PostService(prisma as never);
  });

  describe('createPost', () => {
    it('maps caption -> content and CAROUSEL -> IMAGE with publishedAt', async () => {
      prisma.post.create.mockResolvedValue({
        id: 'p1',
        userId: 'u1',
        type: 'IMAGE',
        content: 'hello',
        mediaUrls: ['a.jpg', 'b.jpg'],
        hashtags: [],
        visibility: 'PUBLIC',
        likeCount: 0,
        commentCount: 0,
        createdAt: new Date(),
        user: { username: 'alice', avatarUrl: 'av.jpg' },
      });

      const post = await service.createPost({
        userId: 'u1',
        caption: 'hello',
        mediaUrls: ['a.jpg', 'b.jpg'],
        type: 'CAROUSEL',
      });

      expect(post.caption).toBe('hello');
      expect(post.authorUsername).toBe('alice');
      const callArg = prisma.post.create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(callArg.data.content).toBe('hello');
      expect(callArg.data.type).toBe('IMAGE');
      expect(callArg.data.publishedAt).toBeInstanceOf(Date);
    });
  });

  describe('toggleLike', () => {
    it('adds a like, increments count, and notifies the owner on a NEW like', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', userId: 'owner', deletedAt: null });
      prisma.like.findUnique.mockResolvedValue(null);
      prisma.like.create.mockResolvedValue({ id: 'l1' });
      prisma.post.update.mockResolvedValue({ id: 'p1', likeCount: 6 });

      const result = await service.toggleLike('p1', 'liker');

      expect(result).toEqual({ liked: true, likeCount: 6 });
      expect(prisma.like.create).toHaveBeenCalledWith({ data: { userId: 'liker', postId: 'p1' } });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { likeCount: { increment: 1 } },
      });
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      const notifArg = prisma.notification.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(notifArg.data.type).toBe('like');
      expect(notifArg.data.userId).toBe('owner');
    });

    it('removes an existing like, decrements count, and does NOT notify', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', userId: 'owner', deletedAt: null });
      prisma.like.findUnique.mockResolvedValue({ id: 'l1' });
      prisma.like.delete.mockResolvedValue({ id: 'l1' });
      prisma.post.update.mockResolvedValue({ id: 'p1', likeCount: 4 });

      const result = await service.toggleLike('p1', 'liker');

      expect(result).toEqual({ liked: false, likeCount: 4 });
      expect(prisma.like.delete).toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('toggleSave', () => {
    it('saves when not already saved', async () => {
      prisma.savedPost.findUnique.mockResolvedValue(null);
      prisma.savedPost.create.mockResolvedValue({ id: 's1' });

      const result = await service.toggleSave('p1', 'u1');

      expect(result).toEqual({ saved: true });
      expect(prisma.savedPost.create).toHaveBeenCalledWith({
        data: { userId: 'u1', postId: 'p1' },
      });
    });

    it('unsaves when already saved', async () => {
      prisma.savedPost.findUnique.mockResolvedValue({ id: 's1' });
      prisma.savedPost.delete.mockResolvedValue({ id: 's1' });

      const result = await service.toggleSave('p1', 'u1');

      expect(result).toEqual({ saved: false });
      expect(prisma.savedPost.delete).toHaveBeenCalled();
    });
  });

  describe('addComment', () => {
    it('creates the comment and increments commentCount in a transaction', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', userId: 'owner', deletedAt: null });
      prisma.comment.create.mockResolvedValue({
        id: 'c1',
        postId: 'p1',
        userId: 'commenter',
        content: 'nice!',
        likeCount: 0,
        createdAt: new Date(),
        user: { username: 'bob', avatarUrl: null },
      });
      prisma.post.update.mockResolvedValue({ id: 'p1', commentCount: 1 });

      const comment = await service.addComment('p1', 'commenter', 'nice!');

      expect(comment.text).toBe('nice!');
      expect(comment.username).toBe('bob');
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { commentCount: { increment: 1 } },
      });
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('getFeed', () => {
    it('resolves isLiked/isSaved per viewer for followed users', async () => {
      prisma.userRelationship.findMany.mockResolvedValue([{ followingId: 'f1' }]);
      prisma.post.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 'f1',
          type: 'IMAGE',
          content: 'x',
          mediaUrls: [],
          hashtags: [],
          visibility: 'PUBLIC',
          likeCount: 1,
          commentCount: 0,
          createdAt: new Date(),
          user: { username: 'f', avatarUrl: null },
        },
        {
          id: 'p2',
          userId: 'me',
          type: 'IMAGE',
          content: 'y',
          mediaUrls: [],
          hashtags: [],
          visibility: 'PUBLIC',
          likeCount: 0,
          commentCount: 0,
          createdAt: new Date(),
          user: { username: 'me', avatarUrl: null },
        },
      ]);
      prisma.post.count.mockResolvedValue(2);
      prisma.like.findMany.mockResolvedValue([{ postId: 'p1' }]);
      prisma.savedPost.findMany.mockResolvedValue([{ postId: 'p2' }]);

      const result = await service.getFeed('me', { page: 1, pageSize: 20 });

      expect(result.total).toBe(2);
      expect(result.posts[0].isLiked).toBe(true);
      expect(result.posts[0].isSaved).toBe(false);
      expect(result.posts[1].isLiked).toBe(false);
      expect(result.posts[1].isSaved).toBe(true);
      // followed-users path, NOT the global fallback
      const whereArg = prisma.post.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(whereArg.where).toHaveProperty('userId');
    });

    it('falls back to the global PUBLIC feed when the viewer follows nobody', async () => {
      prisma.userRelationship.findMany.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([]);
      prisma.post.count.mockResolvedValue(0);

      await service.getFeed('lonely', {});

      const whereArg = prisma.post.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(whereArg.where).toMatchObject({ visibility: 'PUBLIC' });
      expect(whereArg.where).not.toHaveProperty('userId');
    });
  });

  describe('getSavedPosts', () => {
    it('preserves save order', async () => {
      prisma.savedPost.findMany.mockResolvedValue([{ postId: 'p2' }, { postId: 'p1' }]);
      prisma.savedPost.count.mockResolvedValue(2);
      prisma.post.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 'a',
          type: 'IMAGE',
          content: '1',
          mediaUrls: [],
          hashtags: [],
          visibility: 'PUBLIC',
          likeCount: 0,
          commentCount: 0,
          createdAt: new Date(),
          user: { username: 'a', avatarUrl: null },
        },
        {
          id: 'p2',
          userId: 'b',
          type: 'IMAGE',
          content: '2',
          mediaUrls: [],
          hashtags: [],
          visibility: 'PUBLIC',
          likeCount: 0,
          commentCount: 0,
          createdAt: new Date(),
          user: { username: 'b', avatarUrl: null },
        },
      ]);
      prisma.like.findMany.mockResolvedValue([]);

      const result = await service.getSavedPosts('me', {});

      expect(result.posts.map((p) => p.id)).toEqual(['p2', 'p1']);
      expect(result.posts.every((p) => p.isSaved)).toBe(true);
    });
  });
});
