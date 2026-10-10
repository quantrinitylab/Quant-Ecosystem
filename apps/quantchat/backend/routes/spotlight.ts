// ============================================================================
// QuantChat - Spotlight Backend Routes (Tasks 13.5, 13.6, 13.7, 13.8)
//
//   GET /spotlight   curated feed of top reels ranked by engagement
//                    (likes, comments, shares, watch-through rate). Ranking is
//                    cached and refreshed at most every 15 minutes (13.6).
//                    If @quant/recommendation is available, the per-viewer
//                    order is personalized; otherwise it falls back to
//                    engagement-only ordering (13.8).
// ============================================================================
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ReelService } from '../services/reel.service';
import {
  SpotlightService,
  applyPersonalization,
  type RankedSpotlightReel,
} from '../services/spotlight.service';

const spotlightQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  refresh: z.coerce.boolean().optional(),
});

interface AuthedRequest {
  auth?: { userId?: string };
  user?: { id?: string };
}

function optionalUserId(request: unknown): string | undefined {
  const r = request as AuthedRequest;
  return r.auth?.userId ?? r.user?.id ?? undefined;
}

function serializeReel(reel: RankedSpotlightReel) {
  return {
    id: reel.id,
    creatorId: reel.creatorId,
    creatorUsername: reel.creatorUsername,
    creatorAvatar: reel.creatorAvatar,
    videoUrl: reel.videoUrl,
    thumbnailUrl: reel.thumbnailUrl,
    caption: reel.caption,
    duration: reel.duration,
    likeCount: reel.likeCount,
    commentCount: reel.commentCount,
    shareCount: reel.shareCount,
    watchThroughRate: reel.watchThroughRate,
    createdAt: reel.createdAt,
    isLikedByUser: reel.isLikedByUser,
    engagementScore: reel.engagementScore,
    isFeatured: reel.isFeatured,
  };
}

export default async function spotlightRoutes(fastify: FastifyInstance) {
  // One ranking cache per backend instance (15-minute TTL — Task 13.6).
  const spotlight = new SpotlightService();
  const reelService = new ReelService((fastify as unknown as { prisma: PrismaClient }).prisma);

  fastify.get('/', async (request, reply) => {
    const parsed = spotlightQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Invalid query parameters' });
    }
    const userId = optionalUserId(request);

    const source = await reelService.getRankableReels();
    const ranking = spotlight.getEngagementRanking(source, {
      forceRefresh: parsed.data.refresh ?? false,
    });

    // QM-UIUX-054: Task 13.7 previously "notified" creators of newly featured
    // reels here via `fastify.notifications.dispatcher.dispatch()` — the
    // @quant/notifications facade, which only computed routing decisions in
    // memory, never persisted or sent anything, and whose result was
    // discarded. The call (and its dedupe set) was theater and has been
    // removed with the facade. A real "your reel is featured" notification
    // belongs in the Prisma `Notification` path the other apps use
    // (see QuantMail QM-UIUX-052), not a routing-decision calculator.

    // Task 13.8: personalize per viewer when possible (graceful fallback).
    let ordered = ranking.reels;
    if (userId) {
      ordered = await applyPersonalization(userId, ranking.reels);
    }

    const limit = parsed.data.limit ?? ordered.length;
    const reels = ordered.slice(0, limit).map(serializeReel);

    return reply.send({
      success: true,
      data: {
        reels,
        rankedAt: new Date(ranking.rankedAt).toISOString(),
        refreshIntervalMs: 15 * 60 * 1000,
        personalized: Boolean(userId),
        total: ordered.length,
      },
    });
  });
}
