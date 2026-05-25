import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PostService } from '../services/post.service';

function createMockPrisma() {
  return {
    post: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe('PostService', () => {
  let service: PostService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new PostService(prisma as never);
  });

  describe('createPost', () => {
    it('creates a post with default values', async () => {
      const mockPost = {
        id: 'post-1',
        userId: 'user-1',
        type: 'TEXT',
        content: 'Hello world',
        mediaUrls: [],
        hashtags: [],
        mentions: [],
        replyToId: null,
        communityId: null,
        visibility: 'PUBLIC',
        likeCount: 0,
        commentCount: 0,
        repostCount: 0,
        viewCount: 0,
        isEdited: false,
        isPinned: false,
        moderationStatus: 'APPROVED',
        publishedAt: expect.any(Date),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      prisma.post.create.mockResolvedValue(mockPost);

      const result = await service.createPost({
        userId: 'user-1',
        content: 'Hello world',
      });

      expect(result).toEqual(mockPost);
      expect(prisma.post.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          type: 'TEXT',
          content: 'Hello world',
          mediaUrls: [],
          hashtags: [],
          mentions: [],
          replyToId: null,
          communityId: null,
          visibility: 'PUBLIC',
          likeCount: 0,
          commentCount: 0,
          repostCount: 0,
          viewCount: 0,
          isEdited: false,
          isPinned: false,
          moderationStatus: 'APPROVED',
          publishedAt: expect.any(Date),
        },
      });
    });

    it('creates a post with custom type and community', async () => {
      prisma.post.create.mockResolvedValue({ id: 'post-2' });

      await service.createPost({
        userId: 'user-1',
        content: 'Check this image',
        type: 'IMAGE',
        communityId: 'comm-1',
        visibility: 'COMMUNITY_ONLY',
        hashtags: ['photo', 'nature'],
      });

      expect(prisma.post.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'IMAGE',
          communityId: 'comm-1',
          visibility: 'COMMUNITY_ONLY',
          hashtags: ['photo', 'nature'],
        }),
      });
    });
  });

  describe('likePost', () => {
    it('increments like count', async () => {
      prisma.post.findUnique.mockResolvedValue({
        id: 'post-1',
        likeCount: 5,
        deletedAt: null,
      });
      prisma.post.update.mockResolvedValue({
        id: 'post-1',
        likeCount: 6,
      });

      const result = await service.likePost('post-1');

      expect(result.likeCount).toBe(6);
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { likeCount: { increment: 1 } },
      });
    });

    it('throws POST_NOT_FOUND for deleted post', async () => {
      prisma.post.findUnique.mockResolvedValue({
        id: 'post-1',
        deletedAt: new Date(),
      });

      await expect(service.likePost('post-1')).rejects.toThrow('Post not found');
    });
  });

  describe('deletePost', () => {
    it('soft-deletes a post when called by owner', async () => {
      prisma.post.findUnique.mockResolvedValue({
        id: 'post-1',
        userId: 'user-1',
        deletedAt: null,
      });
      prisma.post.update.mockResolvedValue({
        id: 'post-1',
        deletedAt: expect.any(Date),
      });

      const result = await service.deletePost('post-1', 'user-1');

      expect(result.deletedAt).toBeDefined();
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('throws NOT_POST_OWNER if different user tries to delete', async () => {
      prisma.post.findUnique.mockResolvedValue({
        id: 'post-1',
        userId: 'user-1',
        deletedAt: null,
      });

      await expect(service.deletePost('post-1', 'user-2')).rejects.toThrow(
        'Only the author can delete this post',
      );
    });
  });

  describe('listByUser', () => {
    it('returns paginated posts for a user', async () => {
      const posts = [
        { id: 'post-1', content: 'First' },
        { id: 'post-2', content: 'Second' },
      ];
      prisma.post.findMany.mockResolvedValue(posts);
      prisma.post.count.mockResolvedValue(15);

      const result = await service.listByUser('user-1', { page: 1, pageSize: 10 });

      expect(result.data).toEqual(posts);
      expect(result.total).toBe(15);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBe(2);
      expect(result.hasNext).toBe(true);
      expect(result.hasPrev).toBe(false);
    });

    it('uses default pagination', async () => {
      prisma.post.findMany.mockResolvedValue([]);
      prisma.post.count.mockResolvedValue(0);

      await service.listByUser('user-1');

      expect(prisma.post.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', deletedAt: null },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('repost', () => {
    it('creates a repost and increments original repost count', async () => {
      prisma.post.findUnique.mockResolvedValue({
        id: 'post-1',
        content: 'Original content',
        repostCount: 3,
        deletedAt: null,
      });
      prisma.post.update.mockResolvedValue({ id: 'post-1', repostCount: 4 });
      prisma.post.create.mockResolvedValue({
        id: 'post-repost',
        type: 'REPOST',
        userId: 'user-2',
        replyToId: 'post-1',
      });

      const result = await service.repost('post-1', 'user-2');

      expect(result.type).toBe('REPOST');
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { repostCount: { increment: 1 } },
      });
    });
  });
});
