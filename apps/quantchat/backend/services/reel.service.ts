// ============================================================================
// QuantChat — ReelService (Prisma-backed reels: feed, like, comment, share)
// ============================================================================
//
// Replaces the previous in-memory MOCK_REELS implementation with real
// persistence against the `Reel`, `ReelLike`, and `ReelComment` models. Reels
// carry denormalised engagement counters (likeCount/commentCount/shareCount)
// on the `Reel` row so the feed and the Spotlight ranker can read them cheaply;
// the per-user `ReelLike` rows give an exact, idempotent like toggle and drive
// the `isLikedByUser` flag.
// ============================================================================

import type { PrismaClient } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import type { SpotlightSourceReel } from './spotlight.service';

/** Reel shape returned to clients (matches the established feed contract). */
export interface ReelFeedItem {
  id: string;
  creatorId: string;
  creatorUsername: string;
  creatorAvatar: string;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  duration: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  watchThroughRate: number;
  createdAt: string;
  isLikedByUser: boolean;
}

export interface ReelFeedResult {
  reels: ReelFeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
  totalAvailable: number;
}

export interface CreateReelInput {
  creatorId: string;
  videoUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  duration: number;
}

const DEFAULT_AVATAR = 'https://api.dicebear.com/7.x/avataaars/svg?seed=quant';

/** A Reel row joined with the minimal creator fields the feed renders. */
interface ReelRowWithCreator {
  id: string;
  creatorId: string;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  duration: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  watchThroughRate: number;
  createdAt: Date;
  creator?: { username: string | null; avatarUrl: string | null } | null;
}

export class ReelService {
  constructor(private readonly prisma: PrismaClient) {}

  private toFeedItem(row: ReelRowWithCreator, isLikedByUser: boolean): ReelFeedItem {
    return {
      id: row.id,
      creatorId: row.creatorId,
      creatorUsername: row.creator?.username ?? 'unknown',
      creatorAvatar: row.creator?.avatarUrl ?? DEFAULT_AVATAR,
      videoUrl: row.videoUrl,
      thumbnailUrl: row.thumbnailUrl,
      caption: row.caption,
      duration: row.duration,
      likeCount: row.likeCount,
      commentCount: row.commentCount,
      shareCount: row.shareCount,
      watchThroughRate: row.watchThroughRate,
      createdAt: row.createdAt.toISOString(),
      isLikedByUser,
    };
  }

  /**
   * Cursor-paginated reel feed, newest first. The cursor is the id of the last
   * reel on the previous page; the next page is everything created strictly
   * before that reel's `createdAt` (ties broken by id) so pagination is stable
   * even as new reels arrive. `isLikedByUser` is resolved from `ReelLike` for
   * the authenticated viewer in a single batched query.
   */
  async getFeed(opts: {
    userId?: string;
    cursor?: string;
    limit?: number;
  }): Promise<ReelFeedResult> {
    const limit = Math.min(50, Math.max(1, opts.limit ?? 10));

    let createdBefore: Date | undefined;
    if (opts.cursor) {
      const cursorReel = await this.prisma.reel.findUnique({
        where: { id: opts.cursor },
        select: { createdAt: true },
      });
      if (cursorReel) createdBefore = cursorReel.createdAt;
    }

    const rows = (await this.prisma.reel.findMany({
      where: createdBefore ? { createdAt: { lt: createdBefore } } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { creator: { select: { username: true, avatarUrl: true } } },
    })) as unknown as ReelRowWithCreator[];

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    let likedSet = new Set<string>();
    if (opts.userId && page.length > 0) {
      const likes = await this.prisma.reelLike.findMany({
        where: { userId: opts.userId, reelId: { in: page.map((r) => r.id) } },
        select: { reelId: true },
      });
      likedSet = new Set(likes.map((l: { reelId: string }) => l.reelId));
    }

    const totalAvailable = await this.prisma.reel.count();

    return {
      reels: page.map((row) => this.toFeedItem(row, likedSet.has(row.id))),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
      hasMore,
      totalAvailable,
    };
  }

  private async requireReel(reelId: string): Promise<void> {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId }, select: { id: true } });
    if (!reel) {
      throw createAppError('Reel not found', 404, 'REEL_NOT_FOUND');
    }
  }

  /**
   * Idempotent like toggle. Liking is recorded as a unique `(reelId, userId)`
   * `ReelLike` row; the denormalised `likeCount` is kept in sync inside the same
   * transaction so concurrent toggles cannot drift the counter.
   */
  async likeReel(
    reelId: string,
    userId: string,
  ): Promise<{ id: string; likeCount: number; liked: boolean }> {
    await this.requireReel(reelId);

    const existing = await this.prisma.reelLike.findUnique({
      where: { reelId_userId: { reelId, userId } },
      select: { id: true },
    });

    const reel = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.reelLike.delete({ where: { reelId_userId: { reelId, userId } } });
        return tx.reel.update({
          where: { id: reelId },
          data: { likeCount: { decrement: 1 } },
          select: { likeCount: true },
        });
      }
      await tx.reelLike.create({ data: { reelId, userId } });
      return tx.reel.update({
        where: { id: reelId },
        data: { likeCount: { increment: 1 } },
        select: { likeCount: true },
      });
    });

    // Guard against a negative counter if data ever drifts.
    const likeCount = Math.max(0, reel.likeCount);
    return { id: reelId, likeCount, liked: !existing };
  }

  /** Add a comment and bump the denormalised comment counter atomically. */
  async commentReel(
    reelId: string,
    userId: string,
    content: string,
  ): Promise<{ id: string; reelId: string; userId: string; content: string; createdAt: string }> {
    await this.requireReel(reelId);

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.reelComment.create({
        data: { reelId, userId, content },
      });
      await tx.reel.update({ where: { id: reelId }, data: { commentCount: { increment: 1 } } });
      return created;
    });

    return {
      id: comment.id,
      reelId: comment.reelId,
      userId: comment.userId,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
    };
  }

  /** Increment the share counter. */
  async shareReel(reelId: string): Promise<{ id: string; shareCount: number }> {
    await this.requireReel(reelId);
    const reel = await this.prisma.reel.update({
      where: { id: reelId },
      data: { shareCount: { increment: 1 } },
      select: { shareCount: true },
    });
    return { id: reelId, shareCount: reel.shareCount };
  }

  /** Create a reel. The creator is the authenticated user. */
  async createReel(input: CreateReelInput): Promise<ReelFeedItem> {
    const row = (await this.prisma.reel.create({
      data: {
        creatorId: input.creatorId,
        videoUrl: input.videoUrl,
        thumbnailUrl: input.thumbnailUrl ?? `${input.videoUrl}#t=0.1`,
        caption: input.caption ?? '',
        duration: Math.round(input.duration),
      },
      include: { creator: { select: { username: true, avatarUrl: true } } },
    })) as unknown as ReelRowWithCreator;

    return this.toFeedItem(row, false);
  }

  /**
   * Source reels for the Spotlight engagement ranker. Returns the most recent
   * reels (bounded) mapped to the ranker's input shape. `isLikedByUser` is not
   * viewer-specific here (Spotlight ranking is global), so it defaults to false.
   */
  async getRankableReels(limit = 200): Promise<SpotlightSourceReel[]> {
    const rows = (await this.prisma.reel.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { creator: { select: { username: true, avatarUrl: true } } },
    })) as unknown as ReelRowWithCreator[];

    return rows.map((row) => ({
      ...this.toFeedItem(row, false),
    }));
  }
}
