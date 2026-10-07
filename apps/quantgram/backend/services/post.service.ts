import type { PrismaClient } from '../types';
import { createAppError } from '@quant/server-core';

export type NeonPostType = 'IMAGE' | 'VIDEO' | 'CAROUSEL';
export type NeonPostVisibility = 'PUBLIC' | 'FOLLOWERS_ONLY' | 'PRIVATE';

export interface ShapedPost {
  id: string;
  userId: string;
  authorUsername: string;
  authorAvatar: string | null;
  caption: string;
  mediaUrls: string[];
  hashtags: string[];
  type: string;
  visibility: string;
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  isSaved: boolean;
  createdAt: Date;
}

export interface ShapedComment {
  id: string;
  postId: string;
  userId: string;
  username: string;
  userAvatar: string | null;
  text: string;
  likes: number;
  createdAt: Date;
}

export interface CreatePostInput {
  userId: string;
  caption?: string;
  mediaUrls?: string[];
  hashtags?: string[];
  type?: NeonPostType;
  visibility?: NeonPostVisibility;
}

export interface FeedOptions {
  page?: number;
  pageSize?: number;
}

export interface FeedResult {
  posts: ShapedPost[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  return [];
}

/** Map the public API post type onto the shared `PostType` enum. */
function mapPostType(type?: NeonPostType): string {
  switch (type) {
    case 'VIDEO':
      return 'VIDEO';
    // Instagram-style carousels are persisted as IMAGE posts with many media.
    case 'CAROUSEL':
    case 'IMAGE':
    default:
      return 'IMAGE';
  }
}

export class PostService {
  constructor(private readonly prisma: PrismaClient) {}

  private shapePost(row: any, isLiked: boolean, isSaved: boolean): ShapedPost {
    return {
      id: row.id,
      userId: row.userId,
      authorUsername: row.user?.username ?? 'unknown',
      authorAvatar: row.user?.avatarUrl ?? null,
      caption: row.content ?? '',
      mediaUrls: toArray(row.mediaUrls),
      hashtags: toArray(row.hashtags),
      type: row.type,
      visibility: row.visibility,
      likeCount: row.likeCount ?? 0,
      commentCount: row.commentCount ?? 0,
      isLiked,
      isSaved,
      createdAt: row.createdAt,
    };
  }

  private shapeComment(row: any): ShapedComment {
    return {
      id: row.id,
      postId: row.postId,
      userId: row.userId,
      username: row.user?.username ?? 'unknown',
      userAvatar: row.user?.avatarUrl ?? null,
      text: row.content ?? '',
      likes: row.likeCount ?? 0,
      createdAt: row.createdAt,
    };
  }

  async createPost(input: CreatePostInput): Promise<ShapedPost> {
    const now = new Date();
    const row = await this.prisma.post.create({
      data: {
        userId: input.userId,
        type: mapPostType(input.type),
        content: input.caption ?? null,
        mediaUrls: input.mediaUrls ?? [],
        hashtags: input.hashtags ?? [],
        visibility: input.visibility ?? 'PUBLIC',
        publishedAt: now,
      },
      include: { user: true },
    });
    return this.shapePost(row, false, false);
  }

  /** Batch-resolve which of `postIds` the viewer has liked. */
  private async likedSet(viewerId: string, postIds: string[]): Promise<Set<string>> {
    if (!viewerId || postIds.length === 0) return new Set();
    const likes = await this.prisma.like.findMany({
      where: { userId: viewerId, postId: { in: postIds } },
    });
    return new Set(likes.map((l: any) => l.postId));
  }

  /** Batch-resolve which of `postIds` the viewer has saved. */
  private async savedSet(viewerId: string, postIds: string[]): Promise<Set<string>> {
    if (!viewerId || postIds.length === 0) return new Set();
    const saved = await this.prisma.savedPost.findMany({
      where: { userId: viewerId, postId: { in: postIds } },
    });
    return new Set(saved.map((s: any) => s.postId));
  }

  async getFeed(viewerId: string, options: FeedOptions = {}): Promise<FeedResult> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const following = await this.prisma.userRelationship.findMany({
      where: { followerId: viewerId, type: 'FOLLOW' },
    });
    const followingIds = following.map((r: any) => r.followingId);

    // When the viewer follows nobody, fall back to the global PUBLIC feed.
    const where =
      followingIds.length === 0
        ? { visibility: 'PUBLIC', deletedAt: null }
        : { userId: { in: [...followingIds, viewerId] }, deletedAt: null };

    const [rows, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.post.count({ where }),
    ]);

    const postIds = rows.map((r: any) => r.id);
    const [liked, saved] = await Promise.all([
      this.likedSet(viewerId, postIds),
      this.savedSet(viewerId, postIds),
    ]);

    const posts = rows.map((r: any) => this.shapePost(r, liked.has(r.id), saved.has(r.id)));
    return { posts, page, pageSize, total, hasMore: skip + rows.length < total };
  }

  async getPost(
    postId: string,
    viewerId: string,
  ): Promise<ShapedPost & { comments: ShapedComment[] }> {
    const row = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        user: true,
        comments: { include: { user: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!row || row.deletedAt) {
      throw createAppError('Post not found', 404, 'POST_NOT_FOUND');
    }

    const [liked, saved] = await Promise.all([
      this.likedSet(viewerId, [postId]),
      this.savedSet(viewerId, [postId]),
    ]);

    const shaped = this.shapePost(row, liked.has(postId), saved.has(postId));
    const comments = (row.comments ?? []).map((c: any) => this.shapeComment(c));
    return { ...shaped, comments };
  }

  async toggleLike(postId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.deletedAt) {
      throw createAppError('Post not found', 404, 'POST_NOT_FOUND');
    }

    const existing = await this.prisma.like.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.like.delete({ where: { userId_postId: { userId, postId } } });
        const updated = await tx.post.update({
          where: { id: postId },
          data: { likeCount: { decrement: 1 } },
        });
        return { liked: false, likeCount: updated.likeCount };
      }
      await tx.like.create({ data: { userId, postId } });
      const updated = await tx.post.update({
        where: { id: postId },
        data: { likeCount: { increment: 1 } },
      });
      return { liked: true, likeCount: updated.likeCount };
    });

    // Best-effort notification to the post owner on a new like.
    if (result.liked && post.userId !== userId) {
      try {
        await this.prisma.notification.create({
          data: {
            userId: post.userId,
            type: 'like',
            title: 'New like',
            body: 'Someone liked your post',
            sourceApp: 'quantneon',
            sourceUserId: userId,
            sourceEntityId: postId,
          },
        });
      } catch {
        /* notifications are best-effort */
      }
    }

    return result;
  }

  async toggleSave(postId: string, userId: string): Promise<{ saved: boolean }> {
    const existing = await this.prisma.savedPost.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (existing) {
      await this.prisma.savedPost.delete({ where: { userId_postId: { userId, postId } } });
      return { saved: false };
    }
    await this.prisma.savedPost.create({ data: { userId, postId } });
    return { saved: true };
  }

  async getSavedPosts(viewerId: string, options: FeedOptions = {}): Promise<FeedResult> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [saves, total] = await Promise.all([
      this.prisma.savedPost.findMany({
        where: { userId: viewerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.savedPost.count({ where: { userId: viewerId } }),
    ]);

    const orderedIds = saves.map((s: any) => s.postId);
    if (orderedIds.length === 0) {
      return { posts: [], page, pageSize, total, hasMore: false };
    }

    const rows = await this.prisma.post.findMany({
      where: { id: { in: orderedIds }, deletedAt: null },
      include: { user: true },
    });
    const byId = new Map(rows.map((r: any) => [r.id, r]));
    const liked = await this.likedSet(viewerId, orderedIds);

    // Preserve the save order (newest save first).
    const posts = orderedIds
      .map((id) => byId.get(id))
      .filter((r): r is any => Boolean(r))
      .map((r: any) => this.shapePost(r, liked.has(r.id), true));

    return { posts, page, pageSize, total, hasMore: skip + saves.length < total };
  }

  async addComment(postId: string, userId: string, text: string): Promise<ShapedComment> {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.deletedAt) {
      throw createAppError('Post not found', 404, 'POST_NOT_FOUND');
    }

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: { postId, userId, content: text },
        include: { user: true },
      });
      await tx.post.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } },
      });
      return created;
    });

    if (post.userId !== userId) {
      try {
        await this.prisma.notification.create({
          data: {
            userId: post.userId,
            type: 'comment',
            title: 'New comment',
            body: text.slice(0, 140),
            sourceApp: 'quantneon',
            sourceUserId: userId,
            sourceEntityId: postId,
          },
        });
      } catch {
        /* notifications are best-effort */
      }
    }

    return this.shapeComment(comment);
  }

  async getComments(postId: string): Promise<ShapedComment[]> {
    const rows = await this.prisma.comment.findMany({
      where: { postId, deletedAt: null },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((c: any) => this.shapeComment(c));
  }

  async getUserPosts(
    targetUserId: string,
    viewerId: string,
    options: FeedOptions = {},
  ): Promise<FeedResult> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where = { userId: targetUserId, deletedAt: null };
    const [rows, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.post.count({ where }),
    ]);

    const postIds = rows.map((r: any) => r.id);
    const [liked, saved] = await Promise.all([
      this.likedSet(viewerId, postIds),
      this.savedSet(viewerId, postIds),
    ]);

    const posts = rows.map((r: any) => this.shapePost(r, liked.has(r.id), saved.has(r.id)));
    return { posts, page, pageSize, total, hasMore: skip + rows.length < total };
  }
}
