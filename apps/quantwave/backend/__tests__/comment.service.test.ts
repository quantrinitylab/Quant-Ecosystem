import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommentService } from '../services/comment.service';

function createMockPrisma() {
  return {
    post: {
      findUnique: vi.fn(),
      update: vi.fn(async () => ({})),
    },
    comment: {
      findUnique: vi.fn(),
      create: vi.fn(async () => ({ id: 'c1' })),
      findMany: vi.fn(async (_args?: unknown) => [] as unknown[]),
      update: vi.fn(async () => ({})),
    },
  };
}

describe('CommentService', () => {
  let service: CommentService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new CommentService(prisma as never);
  });

  describe('createComment', () => {
    it('creates a top-level comment and increments the post commentCount', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', commentCount: 0, deletedAt: null });

      const c = await service.createComment('u1', 'p1', 'hello');

      expect(c).toEqual({ id: 'c1' });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { commentCount: { increment: 1 } },
      });
      // No parent → no replyCount bump.
      expect(prisma.comment.update).not.toHaveBeenCalled();
    });

    it('increments the parent replyCount for a reply', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', commentCount: 3, deletedAt: null });
      prisma.comment.findUnique.mockResolvedValue({
        id: 'parent1',
        postId: 'p1',
        userId: 'u9',
        parentId: null,
        replyCount: 0,
        deletedAt: null,
      });

      await service.createComment('u1', 'p1', 'a reply', 'parent1');

      expect(prisma.comment.update).toHaveBeenCalledWith({
        where: { id: 'parent1' },
        data: { replyCount: { increment: 1 } },
      });
    });

    it('throws for a missing/deleted post', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.createComment('u1', 'missing', 'hi')).rejects.toThrow('Post not found');
      expect(prisma.comment.create).not.toHaveBeenCalled();
    });

    it('rejects a reply whose parent belongs to a different post', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', commentCount: 0, deletedAt: null });
      prisma.comment.findUnique.mockResolvedValue({
        id: 'parent1',
        postId: 'OTHER',
        userId: 'u9',
        parentId: null,
        replyCount: 0,
        deletedAt: null,
      });
      await expect(service.createComment('u1', 'p1', 'x', 'parent1')).rejects.toThrow(
        'different post',
      );
    });

    it('rejects a reply to a soft-deleted parent', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', commentCount: 0, deletedAt: null });
      prisma.comment.findUnique.mockResolvedValue({
        id: 'parent1',
        postId: 'p1',
        userId: 'u9',
        parentId: null,
        replyCount: 0,
        deletedAt: new Date(),
      });
      await expect(service.createComment('u1', 'p1', 'x', 'parent1')).rejects.toThrow(
        'Parent comment not found',
      );
    });
  });

  describe('getComments', () => {
    it('excludes soft-deleted comments and their deleted replies', async () => {
      await service.getComments('p1');
      const args = prisma.comment.findMany.mock.calls[0]![0] as unknown as {
        where: Record<string, unknown>;
        include: { replies: { where: Record<string, unknown> } };
      };
      expect(args.where).toMatchObject({ postId: 'p1', parentId: null, deletedAt: null });
      expect(args.include.replies.where).toEqual({ deletedAt: null });
    });
  });

  describe('deleteComment', () => {
    it('soft-deletes and decrements the post commentCount (clamped)', async () => {
      prisma.comment.findUnique.mockResolvedValueOnce({
        id: 'c1',
        postId: 'p1',
        userId: 'u1',
        parentId: null,
        replyCount: 0,
        deletedAt: null,
      });
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', commentCount: 5, deletedAt: null });

      const r = await service.deleteComment('u1', 'c1');

      expect(r).toEqual({ success: true });
      expect(prisma.comment.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { commentCount: 4 },
      });
    });

    it('decrements the parent replyCount when deleting a reply', async () => {
      prisma.comment.findUnique
        .mockResolvedValueOnce({
          id: 'c2',
          postId: 'p1',
          userId: 'u1',
          parentId: 'parent1',
          replyCount: 0,
          deletedAt: null,
        })
        .mockResolvedValueOnce({
          id: 'parent1',
          postId: 'p1',
          userId: 'u9',
          parentId: null,
          replyCount: 2,
          deletedAt: null,
        });
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', commentCount: 3, deletedAt: null });

      await service.deleteComment('u1', 'c2');

      expect(prisma.comment.update).toHaveBeenCalledWith({
        where: { id: 'parent1' },
        data: { replyCount: 1 },
      });
    });

    it('is idempotent: deleting an already-deleted comment does not double-decrement', async () => {
      prisma.comment.findUnique.mockResolvedValueOnce({
        id: 'c1',
        postId: 'p1',
        userId: 'u1',
        parentId: null,
        replyCount: 0,
        deletedAt: new Date(),
      });

      const r = await service.deleteComment('u1', 'c1');

      expect(r).toEqual({ success: true });
      expect(prisma.comment.update).not.toHaveBeenCalled();
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('refuses to delete a comment the caller does not own', async () => {
      prisma.comment.findUnique.mockResolvedValueOnce({
        id: 'c1',
        postId: 'p1',
        userId: 'someone-else',
        parentId: null,
        replyCount: 0,
        deletedAt: null,
      });

      const r = await service.deleteComment('u1', 'c1');

      expect(r).toEqual({ success: false });
      expect(prisma.comment.update).not.toHaveBeenCalled();
    });
  });
});
