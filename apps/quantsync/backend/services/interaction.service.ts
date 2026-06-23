// ============================================================================
// QuantSync - Interaction Service (votes / bookmarks / shares)
// ============================================================================
//
// Backs the (previously dead) /interactions surface. Replaces the old fake
// PostService.likePost (a bare `likeCount + 1` with no per-user record) with
// real, idempotent, per-user voting + bookmarking, plus share counting.
//
// DI'd narrow prisma for unit-testability.

import { createAppError } from '@quant/server-core';

export type VoteDirection = 'up' | 'down';

export interface VoteResult {
  userVote: -1 | 0 | 1;
  upvotes: number;
  downvotes: number;
  score: number;
}

export interface InteractionPrisma {
  post: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
  };
  postVote: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<any>;
    upsert: (args: {
      where: Record<string, unknown>;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => Promise<any>;
    delete: (args: { where: Record<string, unknown> }) => Promise<any>;
    count: (args: Record<string, unknown>) => Promise<number>;
  };
  postBookmark: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<any>;
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    delete: (args: { where: Record<string, unknown> }) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    count: (args: Record<string, unknown>) => Promise<number>;
  };
}

export class InteractionService {
  constructor(private readonly prisma: InteractionPrisma) {}

  private async requireVisiblePost(postId: string): Promise<Record<string, unknown>> {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.deletedAt) {
      throw createAppError('Post not found', 404, 'POST_NOT_FOUND');
    }
    return post;
  }

  /**
   * Cast (or toggle off) the caller's up/down vote. Idempotent per user: voting
   * the same direction again clears the vote; voting the opposite flips it. The
   * post's likeCount is kept in sync with the net score.
   */
  async vote(userId: string, postId: string, direction: VoteDirection): Promise<VoteResult> {
    await this.requireVisiblePost(postId);
    const value = direction === 'up' ? 1 : -1;

    const existing = await this.prisma.postVote.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    let userVote: -1 | 0 | 1;
    if (existing && existing.value === value) {
      await this.prisma.postVote.delete({ where: { userId_postId: { userId, postId } } });
      userVote = 0;
    } else {
      await this.prisma.postVote.upsert({
        where: { userId_postId: { userId, postId } },
        create: { userId, postId, value },
        update: { value },
      });
      userVote = value as -1 | 1;
    }

    const [upvotes, downvotes] = await Promise.all([
      this.prisma.postVote.count({ where: { postId, value: 1 } }),
      this.prisma.postVote.count({ where: { postId, value: -1 } }),
    ]);
    const score = upvotes - downvotes;

    // Keep the post's headline like count aligned with net upvotes.
    await this.prisma.post.update({ where: { id: postId }, data: { likeCount: score } });

    return { userVote, upvotes, downvotes, score };
  }

  /** Toggle the caller's bookmark on a post. */
  async toggleBookmark(userId: string, postId: string): Promise<{ bookmarked: boolean }> {
    await this.requireVisiblePost(postId);
    const existing = await this.prisma.postBookmark.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (existing) {
      await this.prisma.postBookmark.delete({ where: { userId_postId: { userId, postId } } });
      return { bookmarked: false };
    }
    await this.prisma.postBookmark.create({ data: { userId, postId } });
    return { bookmarked: true };
  }

  /** The caller's bookmarked posts, newest bookmark first. */
  async listBookmarks(
    userId: string,
    options: { page?: number; pageSize?: number } = {},
  ): Promise<{ data: unknown[]; total: number; page: number; pageSize: number }> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [marks, total] = await Promise.all([
      this.prisma.postBookmark.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.postBookmark.count({ where: { userId } }),
    ]);

    const postIds = marks.map((m: { postId: string }) => m.postId);
    const posts: Array<{ id: string }> = postIds.length
      ? await this.prisma.post.findMany({ where: { id: { in: postIds }, deletedAt: null } })
      : [];
    const byId = new Map(posts.map((p) => [p.id, p]));
    const data = postIds
      .map((id: string) => byId.get(id))
      .filter((p: unknown): p is { id: string } => Boolean(p));

    return { data, total, page, pageSize };
  }

  /** Record a share; bumps the post's shareCount. */
  async share(postId: string): Promise<{ shareCount: number }> {
    await this.requireVisiblePost(postId);
    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: { shareCount: { increment: 1 } },
    });
    return { shareCount: Number(updated.shareCount ?? 0) };
  }
}
