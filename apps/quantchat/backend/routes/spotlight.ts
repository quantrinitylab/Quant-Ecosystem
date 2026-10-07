// ============================================================================
// QuantChat - Spotlight Backend Routes (Tasks 13.5, 13.6, 13.7, 13.8)
//
//   GET /spotlight   curated feed of top reels ranked by engagement
//                    (likes, comments, shares, watch-through rate). Ranking is
//                    cached and refreshed at most every 15 minutes (13.6).
//                    When the ranking is (re)computed, creators of newly
//                    featured reels are notified via push (13.7). If
//                    @quant/recommendation is available, the per-viewer order
//                    is personalized; otherwise it falls back to engagement-only
//                    ordering (13.8).
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

interface NotificationsDispatcher {
  dispatcher: {
    dispatch(input: {
      type: string;
      title: string;
      body: string;
      recipientIds: string[];
      priority?: string;
      data?: Record<string, unknown>;
    }): unknown;
  };
}

function getNotifications(fastify: FastifyInstance): NotificationsDispatcher | null {
  const n = (fastify as unknown as { notifications?: NotificationsDispatcher }).notifications;
  return n ?? null;
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
  // Reels whose creators have already received a "Featured" notification, so a
  // reel that stays featured across refreshes is not re-notified (Task 13.7).
  const notifiedFeatured = new Set<string>();

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

    // Task 13.7: on a fresh ranking, notify creators of newly featured reels.
    if (ranking.refreshed) {
      const notifications = getNotifications(fastify);
      for (const reel of ranking.reels) {
        if (reel.isFeatured && !notifiedFeatured.has(reel.id)) {
          notifiedFeatured.add(reel.id);
          if (notifications) {
            try {
              notifications.dispatcher.dispatch({
                type: 'achievement',
                title: 'Your reel is featured in Spotlight! ✨',
                body: `"${reel.caption}" is trending across QuantChat.`,
                recipientIds: [reel.creatorId],
                priority: 'high',
                data: { reelId: reel.id, deepLink: `/spotlight?reel=${reel.id}` },
              });
            } catch (err) {
              fastify.log.error(
                { err, reelId: reel.id },
                'Failed to dispatch Featured notification',
              );
            }
          }
        }
      }
      // Drop notification records for reels that are no longer featured so they
      // can be re-celebrated if they trend again later.
      const stillFeatured = new Set(ranking.reels.filter((r) => r.isFeatured).map((r) => r.id));
      for (const id of [...notifiedFeatured]) {
        if (!stillFeatured.has(id)) notifiedFeatured.delete(id);
      }
    }

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
