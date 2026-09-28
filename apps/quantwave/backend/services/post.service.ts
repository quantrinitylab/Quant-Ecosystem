import type { PrismaClient } from '../types';
import { createAppError } from '@quant/server-core';

export interface Post {
  id: string;
  userId: string;
  type: string;
  content: string;
  mediaUrls: unknown;
  hashtags: unknown;
  mentions: unknown;
  replyToId: string | null;
  communityId: string | null;
  visibility: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  viewCount: number;
  isEdited: boolean;
  isPinned: boolean;
  moderationStatus: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export type FeedSpace = 'main' | 'verified' | 'anonymous';

export interface CreatePostInput {
  userId: string;
  type?: string;
  content: string;
  mediaUrls?: unknown[];
  hashtags?: string[];
  mentions?: string[];
  replyToId?: string;
  communityId?: string;
  visibility?: string;
  /** Which feed space the post targets. Defaults to 'main'. */
  space?: FeedSpace;
}

export interface UpdatePostInput {
  content?: string;
  mediaUrls?: unknown[];
  hashtags?: string[];
  mentions?: string[];
  visibility?: string;
}

export class PostService {
  constructor(private readonly prisma: PrismaClient) {}

  async createPost(input: CreatePostInput): Promise<Post> {
    let space: FeedSpace = input.space ?? 'main';

    // Replies INHERIT the parent's space. A reply into a Verified conversation
    // is itself a Verified-space post, so the verified-account gate below applies
    // to it — a non-verified user cannot sneak a 'main' reply onto a Verified
    // post by omitting `space`.
    if (input.replyToId) {
      const parent = await this.prisma.post.findUnique({ where: { id: input.replyToId } });
      if (!parent || parent.deletedAt) {
        throw createAppError('Cannot reply: parent post not found', 404, 'POST_NOT_FOUND');
      }
      if (parent.space === 'verified') {
        space = 'verified';
      }
    }

    // Verified-space enforcement (server-side authoritative gate). The
    // frontend gates the composer too, but a direct API call MUST NOT be able
    // to post OR reply into the Verified space without a verified account.
    if (space === 'verified') {
      const author = await this.prisma.user.findUnique({ where: { id: input.userId } });
      if (!author) {
        throw createAppError('Author not found', 404, 'USER_NOT_FOUND');
      }
      if (!author.isVerified) {
        throw createAppError(
          'Only verified accounts can post or reply in QuantSync Verified',
          403,
          'NOT_VERIFIED',
        );
      }
    }

    const post = await this.prisma.post.create({
      data: {
        userId: input.userId,
        type: input.type ?? 'TEXT',
        content: input.content,
        mediaUrls: input.mediaUrls ?? [],
        hashtags: input.hashtags ?? [],
        mentions: input.mentions ?? [],
        replyToId: input.replyToId ?? null,
        communityId: input.communityId ?? null,
        visibility: input.visibility ?? 'PUBLIC',
        space,
        likeCount: 0,
        commentCount: 0,
        repostCount: 0,
        viewCount: 0,
        isEdited: false,
        isPinned: false,
        moderationStatus: 'APPROVED',
        publishedAt: new Date(),
      },
    });

    return post;
  }

  async getPost(postId: string): Promise<Post> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post || post.deletedAt) {
      throw createAppError('Post not found', 404, 'POST_NOT_FOUND');
    }

    return post;
  }

  async listByUser(
    userId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Post>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.post.findMany({
        where: { userId, deletedAt: null },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.post.count({ where: { userId, deletedAt: null } }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async listByCommunity(
    communityId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Post>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.post.findMany({
        where: { communityId, deletedAt: null },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.post.count({ where: { communityId, deletedAt: null } }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async updatePost(postId: string, userId: string, input: UpdatePostInput): Promise<Post> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post || post.deletedAt) {
      throw createAppError('Post not found', 404, 'POST_NOT_FOUND');
    }

    if (post.userId !== userId) {
      throw createAppError('Only the author can edit this post', 403, 'NOT_POST_OWNER');
    }

    return this.prisma.post.update({
      where: { id: postId },
      data: {
        ...input,
        isEdited: true,
        updatedAt: new Date(),
      },
    });
  }

  async deletePost(postId: string, userId: string): Promise<Post> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post || post.deletedAt) {
      throw createAppError('Post not found', 404, 'POST_NOT_FOUND');
    }

    if (post.userId !== userId) {
      throw createAppError('Only the author can delete this post', 403, 'NOT_POST_OWNER');
    }

    return this.prisma.post.update({
      where: { id: postId },
      data: { deletedAt: new Date() },
    });
  }

  async likePost(postId: string): Promise<Post> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post || post.deletedAt) {
      throw createAppError('Post not found', 404, 'POST_NOT_FOUND');
    }

    return this.prisma.post.update({
      where: { id: postId },
      data: { likeCount: { increment: 1 } },
    });
  }

  async repost(postId: string, userId: string): Promise<Post> {
    const original = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!original || original.deletedAt) {
      throw createAppError('Original post not found', 404, 'POST_NOT_FOUND');
    }

    // Increment repost count on original
    await this.prisma.post.update({
      where: { id: postId },
      data: { repostCount: { increment: 1 } },
    });

    // Create a new repost
    return this.prisma.post.create({
      data: {
        userId,
        type: 'REPOST',
        content: original.content,
        mediaUrls: [],
        hashtags: [],
        mentions: [],
        replyToId: postId,
        communityId: null,
        visibility: 'PUBLIC',
        likeCount: 0,
        commentCount: 0,
        repostCount: 0,
        viewCount: 0,
        isEdited: false,
        isPinned: false,
        moderationStatus: 'APPROVED',
        publishedAt: new Date(),
      },
    });
  }
}
