import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReelService } from '../services/reel.service';

function createMockPrisma() {
  const prisma = {
    reel: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    reelLike: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    reelComment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    reelCommentLike: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return prisma;
}

describe('ReelService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ReelService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ReelService(prisma as never);
  });

  describe('getReel', () => {
    it('returns a shaped reel with viewer isLiked flag when found', async () => {
      prisma.reel.findUnique.mockResolvedValue({
        id: 'r1',
        creatorId: 'c1',
        videoUrl: 'v1',
        likeCount: 4,
        creator: { username: 'alice', avatarUrl: 'a.png' },
      });
      prisma.reelLike.findUnique.mockResolvedValue({ id: 'rl1' });

      const reel = await service.getReel('r1', 'viewer');

      expect(reel.id).toBe('r1');
      expect(reel.creator).toBe('alice');
      expect(reel.isLiked).toBe(true);
      expect(prisma.reelLike.findUnique).toHaveBeenCalledWith({
        where: { reelId_userId: { reelId: 'r1', userId: 'viewer' } },
      });
    });

    it('does not check likes when no viewerId is given', async () => {
      prisma.reel.findUnique.mockResolvedValue({
        id: 'r1',
        creatorId: 'c1',
        videoUrl: 'v1',
        creator: { username: 'alice', avatarUrl: null },
      });

      const reel = await service.getReel('r1');

      expect(reel.isLiked).toBe(false);
      expect(prisma.reelLike.findUnique).not.toHaveBeenCalled();
    });

    it('throws 404 REEL_NOT_FOUND when missing', async () => {
      prisma.reel.findUnique.mockResolvedValue(null);

      await expect(service.getReel('missing', 'viewer')).rejects.toMatchObject({
        statusCode: 404,
        code: 'REEL_NOT_FOUND',
      });
    });
  });

  describe('deleteReel', () => {
    it('hard-deletes the reel and cascades likes/comments for the owner', async () => {
      prisma.reel.findUnique.mockResolvedValue({ id: 'r1', creatorId: 'owner' });
      prisma.reelLike.deleteMany.mockResolvedValue({ count: 2 });
      prisma.reelComment.deleteMany.mockResolvedValue({ count: 3 });
      prisma.reel.delete.mockResolvedValue({ id: 'r1' });

      const result = await service.deleteReel('r1', 'owner');

      expect(result).toEqual({ deleted: true });
      expect(prisma.reelLike.deleteMany).toHaveBeenCalledWith({ where: { reelId: 'r1' } });
      expect(prisma.reelComment.deleteMany).toHaveBeenCalledWith({ where: { reelId: 'r1' } });
      expect(prisma.reel.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
    });

    it('throws 403 FORBIDDEN when the requester is not the owner', async () => {
      prisma.reel.findUnique.mockResolvedValue({ id: 'r1', creatorId: 'owner' });

      await expect(service.deleteReel('r1', 'intruder')).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });
      expect(prisma.reel.delete).not.toHaveBeenCalled();
      expect(prisma.reelLike.deleteMany).not.toHaveBeenCalled();
    });

    it('throws 404 REEL_NOT_FOUND when the reel is missing', async () => {
      prisma.reel.findUnique.mockResolvedValue(null);

      await expect(service.deleteReel('missing', 'owner')).rejects.toMatchObject({
        statusCode: 404,
        code: 'REEL_NOT_FOUND',
      });
      expect(prisma.reel.delete).not.toHaveBeenCalled();
    });
  });

  describe('getFeed', () => {
    it('ranks isFeatured > likeCount > createdAt and resolves isLiked', async () => {
      prisma.reel.findMany.mockResolvedValue([
        {
          id: 'r1',
          creatorId: 'c1',
          videoUrl: 'v1',
          likeCount: 5,
          isFeatured: true,
          creator: { username: 'a', avatarUrl: null },
        },
      ]);
      prisma.reelLike.findMany.mockResolvedValue([{ reelId: 'r1' }]);

      const reels = await service.getFeed('viewer', {});

      expect(reels[0].isLiked).toBe(true);
      const orderBy = (prisma.reel.findMany.mock.calls[0][0] as { orderBy: unknown }).orderBy;
      expect(orderBy).toEqual([
        { isFeatured: 'desc' },
        { likeCount: 'desc' },
        { createdAt: 'desc' },
      ]);
    });
  });

  describe('toggleLike', () => {
    it('likes when not liked', async () => {
      prisma.reel.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.reelLike.findUnique.mockResolvedValue(null);
      prisma.reelLike.create.mockResolvedValue({ id: 'rl1' });
      prisma.reel.update.mockResolvedValue({ id: 'r1', likeCount: 3 });

      const result = await service.toggleLike('r1', 'u1');

      expect(result).toEqual({ liked: true, likeCount: 3 });
      expect(prisma.reelLike.create).toHaveBeenCalledWith({ data: { reelId: 'r1', userId: 'u1' } });
    });

    it('unlikes when already liked', async () => {
      prisma.reel.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.reelLike.findUnique.mockResolvedValue({ id: 'rl1' });
      prisma.reelLike.delete.mockResolvedValue({ id: 'rl1' });
      prisma.reel.update.mockResolvedValue({ id: 'r1', likeCount: 2 });

      const result = await service.toggleLike('r1', 'u1');

      expect(result).toEqual({ liked: false, likeCount: 2 });
      expect(prisma.reelLike.delete).toHaveBeenCalled();
    });
  });

  describe('addComment', () => {
    it('creates a ReelComment and increments commentCount', async () => {
      prisma.reel.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.reelComment.create.mockResolvedValue({
        id: 'rc1',
        reelId: 'r1',
        userId: 'u1',
        content: 'fire',
        createdAt: new Date(),
      });
      prisma.reel.update.mockResolvedValue({ id: 'r1', commentCount: 1 });
      prisma.user.findUnique.mockResolvedValue({ username: 'bob', avatarUrl: null });

      const comment = await service.addComment('r1', 'u1', 'fire');

      expect(comment.content).toBe('fire');
      expect(comment.username).toBe('bob');
      expect(comment.parentId).toBeNull();
      expect(comment.replies).toEqual([]);
      expect(prisma.reel.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { commentCount: { increment: 1 } },
      });
    });

    it('creates a one-level reply under a comment on the same reel', async () => {
      prisma.reel.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.reelComment.findUnique.mockResolvedValue({
        id: 'root',
        reelId: 'r1',
        parentId: null,
      });
      prisma.reelComment.create.mockResolvedValue({
        id: 'reply',
        reelId: 'r1',
        userId: 'u2',
        parentId: 'root',
        content: 'reply',
        createdAt: new Date(),
      });
      prisma.reel.update.mockResolvedValue({ id: 'r1', commentCount: 2 });
      prisma.user.findUnique.mockResolvedValue({ username: 'sam', avatarUrl: null });

      const reply = await service.addComment('r1', 'u2', 'reply', 'root');

      expect(reply.parentId).toBe('root');
      expect(prisma.reelComment.create).toHaveBeenCalledWith({
        data: { reelId: 'r1', userId: 'u2', content: 'reply', parentId: 'root' },
      });
    });

    it('rejects replies to a comment from another reel', async () => {
      prisma.reel.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.reelComment.findUnique.mockResolvedValue({
        id: 'foreign-root',
        reelId: 'r2',
        parentId: null,
      });

      await expect(service.addComment('r1', 'u2', 'reply', 'foreign-root')).rejects.toMatchObject({
        statusCode: 404,
        code: 'PARENT_COMMENT_NOT_FOUND',
      });
      expect(prisma.reelComment.create).not.toHaveBeenCalled();
    });

    it('rejects replies deeper than one level', async () => {
      prisma.reel.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.reelComment.findUnique.mockResolvedValue({
        id: 'reply',
        reelId: 'r1',
        parentId: 'root',
      });

      await expect(service.addComment('r1', 'u3', 'nested', 'reply')).rejects.toMatchObject({
        statusCode: 400,
        code: 'REPLY_DEPTH_EXCEEDED',
      });
      expect(prisma.reelComment.create).not.toHaveBeenCalled();
    });
  });

  describe('getComments', () => {
    it('resolves usernames via batch user lookup', async () => {
      prisma.reelComment.findMany.mockResolvedValue([
        { id: 'rc1', reelId: 'r1', userId: 'u1', content: 'hi', createdAt: new Date() },
        { id: 'rc2', reelId: 'r1', userId: 'u2', content: 'yo', createdAt: new Date() },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'u1', username: 'one', avatarUrl: null },
        { id: 'u2', username: 'two', avatarUrl: null },
      ]);

      const comments = await service.getComments('r1');

      expect(comments.map((c) => c.username)).toEqual(['one', 'two']);
    });

    it('returns replies nested under their root and viewer like state', async () => {
      prisma.reelComment.findMany.mockResolvedValue([
        {
          id: 'root',
          reelId: 'r1',
          userId: 'u1',
          parentId: null,
          content: 'root',
          likeCount: 1,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          id: 'reply',
          reelId: 'r1',
          userId: 'u2',
          parentId: 'root',
          content: 'reply',
          likeCount: 3,
          createdAt: new Date('2026-01-01T00:01:00Z'),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'u1', username: 'one', avatarUrl: null },
        { id: 'u2', username: 'two', avatarUrl: null },
      ]);
      prisma.reelCommentLike.findMany.mockResolvedValue([{ commentId: 'reply' }]);

      const comments = await service.getComments('r1', 'viewer');

      expect(comments).toHaveLength(1);
      expect(comments[0].id).toBe('root');
      expect(comments[0].replies).toHaveLength(1);
      expect(comments[0].replies[0]).toMatchObject({
        id: 'reply',
        likeCount: 3,
        isLiked: true,
      });
    });
  });

  describe('toggleCommentLike', () => {
    it('likes a reel comment and increments the count', async () => {
      prisma.reelComment.findUnique.mockResolvedValue({ id: 'rc1', reelId: 'r1' });
      prisma.reelCommentLike.findUnique.mockResolvedValue(null);
      prisma.reelCommentLike.create.mockResolvedValue({ id: 'like1' });
      prisma.reelComment.update.mockResolvedValue({ id: 'rc1', likeCount: 1 });

      const result = await service.toggleCommentLike('r1', 'rc1', 'u1');

      expect(result).toEqual({ liked: true, likeCount: 1 });
      expect(prisma.reelCommentLike.create).toHaveBeenCalledWith({
        data: { commentId: 'rc1', userId: 'u1' },
      });
    });

    it('unlikes a reel comment and decrements the count', async () => {
      prisma.reelComment.findUnique.mockResolvedValue({ id: 'rc1', reelId: 'r1' });
      prisma.reelCommentLike.findUnique.mockResolvedValue({ id: 'like1' });
      prisma.reelCommentLike.delete.mockResolvedValue({ id: 'like1' });
      prisma.reelComment.update.mockResolvedValue({ id: 'rc1', likeCount: 0 });

      const result = await service.toggleCommentLike('r1', 'rc1', 'u1');

      expect(result).toEqual({ liked: false, likeCount: 0 });
      expect(prisma.reelCommentLike.delete).toHaveBeenCalledWith({
        where: { commentId_userId: { commentId: 'rc1', userId: 'u1' } },
      });
    });

    it('does not like a comment from another reel', async () => {
      prisma.reelComment.findUnique.mockResolvedValue({ id: 'rc1', reelId: 'r2' });

      await expect(service.toggleCommentLike('r1', 'rc1', 'u1')).rejects.toMatchObject({
        statusCode: 404,
        code: 'COMMENT_NOT_FOUND',
      });
      expect(prisma.reelCommentLike.create).not.toHaveBeenCalled();
    });
  });
});
