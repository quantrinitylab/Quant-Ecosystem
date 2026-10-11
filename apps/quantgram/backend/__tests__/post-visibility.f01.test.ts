/**
 * F-01 regression pins — QuantGram post visibility gate.
 *
 * Before the fix, `PostService.getPost` returned PRIVATE / FOLLOWERS_ONLY
 * posts (with their comments) to ANY viewer, including the anonymous public
 * route (viewerId ''), and `getComments` applied no gate at all. `getFeed`'s
 * followed branch and `getUserPosts` also leaked PRIVATE posts across users.
 *
 * These tests FAIL against the pre-fix service and PASS with the gate.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PostService } from '../services/post.service';

const AUTHOR = 'author-1';
const FOLLOWER = 'follower-1';
const STRANGER = 'stranger-1';
const GUEST = '';

function createMockPrisma() {
  return {
    post: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    comment: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    like: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
    savedPost: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
    userRelationship: { findMany: vi.fn(), findFirst: vi.fn() },
    notification: { create: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaRef.current)),
  };
}

type MockPrisma = ReturnType<typeof createMockPrisma>;
// Stable indirection so $transaction above can reference the current mock.
const prismaRef: { current: MockPrisma | null } = { current: null };

function postRow(visibility: string) {
  return {
    id: 'post-1',
    userId: AUTHOR,
    type: 'IMAGE',
    content: 'secret caption',
    mediaUrls: [],
    hashtags: [],
    visibility,
    likeCount: 3,
    commentCount: 1,
    deletedAt: null,
    createdAt: new Date('2026-10-10T00:00:00Z'),
    user: { username: 'author', avatarUrl: null },
    comments: [
      {
        id: 'comment-1',
        postId: 'post-1',
        userId: AUTHOR,
        content: 'secret comment',
        likeCount: 0,
        createdAt: new Date('2026-10-10T01:00:00Z'),
        user: { username: 'author', avatarUrl: null },
      },
    ],
  };
}

describe('F-01 PostService visibility gate', () => {
  let prisma: MockPrisma;
  let service: PostService;

  beforeEach(() => {
    prisma = createMockPrisma();
    prismaRef.current = prisma;
    service = new PostService(prisma as never);
    prisma.like.findMany.mockResolvedValue([]);
    prisma.savedPost.findMany.mockResolvedValue([]);
    prisma.userRelationship.findFirst.mockResolvedValue(null);
  });

  describe('getPost', () => {
    it('denies a PRIVATE post to a stranger (404, no existence oracle)', async () => {
      prisma.post.findUnique.mockResolvedValue(postRow('PRIVATE'));
      await expect(service.getPost('post-1', STRANGER)).rejects.toMatchObject({
        statusCode: 404,
        code: 'POST_NOT_FOUND',
      });
    });

    it('denies a PRIVATE post to an anonymous guest (viewerId "")', async () => {
      prisma.post.findUnique.mockResolvedValue(postRow('PRIVATE'));
      await expect(service.getPost('post-1', GUEST)).rejects.toMatchObject({
        statusCode: 404,
        code: 'POST_NOT_FOUND',
      });
    });

    it('allows the owner to read their own PRIVATE post', async () => {
      prisma.post.findUnique.mockResolvedValue(postRow('PRIVATE'));
      const post = await service.getPost('post-1', AUTHOR);
      expect(post.id).toBe('post-1');
      expect(post.comments).toHaveLength(1);
    });

    it('denies a FOLLOWERS_ONLY post to a non-follower', async () => {
      prisma.post.findUnique.mockResolvedValue(postRow('FOLLOWERS_ONLY'));
      prisma.userRelationship.findFirst.mockResolvedValue(null);
      await expect(service.getPost('post-1', STRANGER)).rejects.toMatchObject({
        statusCode: 404,
        code: 'POST_NOT_FOUND',
      });
    });

    it('allows a FOLLOWERS_ONLY post to an active follower', async () => {
      prisma.post.findUnique.mockResolvedValue(postRow('FOLLOWERS_ONLY'));
      prisma.userRelationship.findFirst.mockResolvedValue({
        followerId: FOLLOWER,
        followingId: AUTHOR,
        type: 'FOLLOW',
      });
      const post = await service.getPost('post-1', FOLLOWER);
      expect(post.id).toBe('post-1');
      expect(prisma.userRelationship.findFirst).toHaveBeenCalledWith({
        where: { followerId: FOLLOWER, followingId: AUTHOR, type: 'FOLLOW' },
      });
    });

    it('still allows anyone (incl. guests) to read a PUBLIC post', async () => {
      prisma.post.findUnique.mockResolvedValue(postRow('PUBLIC'));
      const post = await service.getPost('post-1', GUEST);
      expect(post.id).toBe('post-1');
    });
  });

  describe('getComments', () => {
    it('denies comments of a PRIVATE post to a stranger', async () => {
      prisma.post.findUnique.mockResolvedValue(postRow('PRIVATE'));
      prisma.comment.findMany.mockResolvedValue([]);
      await expect(service.getComments('post-1', STRANGER)).rejects.toMatchObject({
        statusCode: 404,
        code: 'POST_NOT_FOUND',
      });
      expect(prisma.comment.findMany).not.toHaveBeenCalled();
    });

    it('returns comments of a PUBLIC post to a guest', async () => {
      prisma.post.findUnique.mockResolvedValue(postRow('PUBLIC'));
      prisma.comment.findMany.mockResolvedValue(postRow('PUBLIC').comments);
      const comments = await service.getComments('post-1', GUEST);
      expect(comments).toHaveLength(1);
      expect(comments[0]?.text).toBe('secret comment');
    });
  });

  describe('cross-user listings', () => {
    it('getUserPosts: a stranger only gets PUBLIC posts of the target', async () => {
      prisma.post.findMany.mockResolvedValue([]);
      prisma.post.count.mockResolvedValue(0);
      await service.getUserPosts(AUTHOR, STRANGER, {});
      const where = prisma.post.findMany.mock.calls[0]?.[0]?.where;
      expect(where.OR).toEqual([{ visibility: 'PUBLIC' }]);
    });

    it('getUserPosts: a follower additionally gets FOLLOWERS_ONLY posts', async () => {
      prisma.post.findMany.mockResolvedValue([]);
      prisma.post.count.mockResolvedValue(0);
      prisma.userRelationship.findFirst.mockResolvedValue({
        followerId: FOLLOWER,
        followingId: AUTHOR,
        type: 'FOLLOW',
      });
      await service.getUserPosts(AUTHOR, FOLLOWER, {});
      const where = prisma.post.findMany.mock.calls[0]?.[0]?.where;
      expect(where.OR).toEqual([{ visibility: 'PUBLIC' }, { visibility: 'FOLLOWERS_ONLY' }]);
    });

    it('getFeed: the followed branch never returns another user\'s PRIVATE posts', async () => {
      prisma.userRelationship.findMany.mockResolvedValue([
        { followerId: STRANGER, followingId: AUTHOR, type: 'FOLLOW' },
      ]);
      prisma.post.findMany.mockResolvedValue([]);
      prisma.post.count.mockResolvedValue(0);
      await service.getFeed(STRANGER, {});
      const where = prisma.post.findMany.mock.calls[0]?.[0]?.where;
      expect(where.OR).toEqual([
        { visibility: 'PUBLIC' },
        { visibility: 'FOLLOWERS_ONLY' },
        { userId: STRANGER },
      ]);
    });
  });
});
