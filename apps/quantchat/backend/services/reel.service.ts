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
import { assertMediaUrlAllowed } from '../lib/media-url';
import { getPrivacyService, type PrivacyService } from './privacy.service';
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

/**
 * QC-F-447: fetch window for the viewer-filtered feed — filtering happens
 * inside the window (stories feed precedent, routes/stories.ts take: 500),
 * so a page is exact as long as fewer than (window − limit) rows in it are
 * block-hidden; beyond that the cursor still advances past hidden rows on
 * the next fetch, so nothing hidden ever leaks and nothing visible is
 * skipped permanently.
 */
const REEL_FEED_WINDOW = 500;

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
  private readonly privacy: PrivacyService;

  /**
   * @param privacy Block-pair resolver for the QC-F-447 gates. Defaults to
   *   the shared {@link getPrivacyService} instance bound to the same
   *   Prisma client (the MessageService pattern), so existing callers
   *   (`new ReelService(prisma)`) keep working unchanged.
   */
  constructor(
    private readonly prisma: PrismaClient,
    privacy?: PrivacyService,
  ) {
    this.privacy = privacy ?? getPrivacyService(prisma);
  }

  /**
   * QC-F-447 action gate for like/comment/share: a blocked pair (either
   * direction) gets the reel's own 404 — the feed already hides the reel
   * from this actor, so a 403 would leak both its existence and the
   * block. An unreadable pair (malformed prefs / failed read) fails
   * closed with the QC-F-359 503 shape. Runs BEFORE any row or counter
   * write. The actor's own reel passes (pair self-check = 'clear').
   */
  private async assertReelNotBlockedPair(
    actorId: string,
    creatorId: string,
  ): Promise<void> {
    const verdict = await this.privacy.checkBlockedPair(actorId, creatorId);
    if (verdict === 'blocked') {
      throw createAppError('Reel not found', 404, 'REEL_NOT_FOUND');
    }
    if (verdict === 'unavailable') {
      throw createAppError(
        'Privacy preferences are temporarily unavailable',
        503,
        'UPSTREAM_UNAVAILABLE',
      );
    }
  }

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

    // QC-F-447: with a viewer, the feed is a leak surface — reels whose
    // creator is in a blocked pair with the viewer (either direction, or
    // unproven) are cut. Filtering must happen BEFORE paging, so the
    // fetch widens to a bounded window (the stories feed's take:500
    // precedent) and the page/hasMore/total are computed on the filtered
    // window: hasMore means "more VISIBLE reels beyond this page", and
    // totalAvailable stops counting creators this viewer may not see
    // (the old global reel.count() counted blocked creators too).
    // Without a viewer (service-contract callers) the historic path is
    // byte-for-byte unchanged.
    const windowed = Boolean(opts.userId);
    const rows = (await this.prisma.reel.findMany({
      where: createdBefore ? { createdAt: { lt: createdBefore } } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: windowed ? REEL_FEED_WINDOW : limit + 1,
      include: { creator: { select: { username: true, avatarUrl: true } } },
    })) as unknown as ReelRowWithCreator[];

    let visible = rows;
    if (opts.userId) {
      const { excluded, uncertain } = await this.privacy.blockedExclusionsFor(
        opts.userId,
        rows.map((r) => r.creatorId),
      );
      if (excluded.size > 0 || uncertain.size > 0) {
        const hidden = new Set([...excluded, ...uncertain]);
        visible = rows.filter((r) => !hidden.has(r.creatorId));
      }
    }

    const hasMore = visible.length > limit;
    const page = visible.slice(0, limit);

    let likedSet = new Set<string>();
    if (opts.userId && page.length > 0) {
      const likes = await this.prisma.reelLike.findMany({
        where: { userId: opts.userId, reelId: { in: page.map((r) => r.id) } },
        select: { reelId: true },
      });
      likedSet = new Set(likes.map((l: { reelId: string }) => l.reelId));
    }

    const totalAvailable = windowed
      ? visible.length
      : await this.prisma.reel.count();

    return {
      reels: page.map((row) => this.toFeedItem(row, likedSet.has(row.id))),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
      hasMore,
      totalAvailable,
    };
  }

  private async requireReel(
    reelId: string,
  ): Promise<{ id: string; creatorId: string }> {
    const reel = await this.prisma.reel.findUnique({
      where: { id: reelId },
      select: { id: true, creatorId: true },
    });
    if (!reel) {
      throw createAppError('Reel not found', 404, 'REEL_NOT_FOUND');
    }
    return reel;
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
    const reelRow = await this.requireReel(reelId);
    await this.assertReelNotBlockedPair(userId, reelRow.creatorId);

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
    const reelRow = await this.requireReel(reelId);
    // QC-F-447: the gate runs before the transaction — a blocked comment
    // leaves no row and no counter change (QC-F-359's rule).
    await this.assertReelNotBlockedPair(userId, reelRow.creatorId);

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

  /**
   * Increment the share counter. QC-F-447: the actor is now a real
   * parameter (the route used to authenticate and then DISCARD the user
   * id, so no pair gate was even possible); the per-user share record
   * itself is QC-F-057's slice, which builds on this signature.
   */
  async shareReel(
    reelId: string,
    userId: string,
  ): Promise<{ id: string; shareCount: number }> {
    const reelRow = await this.requireReel(reelId);
    await this.assertReelNotBlockedPair(userId, reelRow.creatorId);
    const reel = await this.prisma.reel.update({
      where: { id: reelId },
      data: { shareCount: { increment: 1 } },
      select: { shareCount: true },
    });
    return { id: reelId, shareCount: reel.shareCount };
  }

  /** Create a reel. The creator is the authenticated user. */
  async createReel(input: CreateReelInput): Promise<ReelFeedItem> {
    // QC-F-330: a reel's videoUrl/thumbnailUrl are loaded verbatim by
    // every feed/discover viewer's player — they must be own-storage.
    // No shipped client sends `data:` video, so data is rejected here.
    // The derived thumbnail (`${videoUrl}#t=0.1`) comes from the already
    // validated videoUrl and needs no separate check.
    assertMediaUrlAllowed(input.videoUrl, { ownerId: input.creatorId, allowData: false });
    if (input.thumbnailUrl) {
      assertMediaUrlAllowed(input.thumbnailUrl, { ownerId: input.creatorId, allowData: false });
    }
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
