import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { GameLeaderboardService, LeaderboardValidationError } from '@quant/cross-app-gaming';

// ============================================================================
// QuantChat in-chat games → shared cross-app leaderboard (mounted at /games).
//
// QuantChat's games were frontend-only and persisted nothing. These routes
// write score events to the SAME shared `GameScore` table QuantNeon writes to,
// tagged `app: 'quantchat'`, so a player's rank for a game (uno/ludo/...) is
// aggregated across the whole ecosystem — the vision's cross-app rank graph.
//
//   POST /games/score                  -> submit the caller's score
//   GET  /games/:gameId/leaderboard    -> top players (cross-app, or ?app=)
//   GET  /games/:gameId/rank           -> the caller's best score + rank
//
// All routes are authenticated (the global auth hook rejects anonymous callers)
// and the score is always attributed to the authenticated user — a client can
// never submit a score on someone else's behalf.
// ============================================================================

const APP_ID = 'quantchat';

const submitScoreSchema = z.object({
  gameId: z.string().min(1).max(64),
  score: z.number().int(),
  displayName: z.string().max(120).optional(),
  region: z.string().max(64).optional(),
});

const leaderboardQuerySchema = z.object({
  app: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function service(fastify: FastifyInstance): GameLeaderboardService {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  return new GameLeaderboardService(prisma as never);
}

export default async function gamesRoutes(fastify: FastifyInstance) {
  fastify.post('/score', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = submitScoreSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    try {
      const result = await service(fastify).submitScore({
        gameId: parsed.data.gameId,
        userId,
        app: APP_ID,
        score: parsed.data.score,
        ...(parsed.data.displayName ? { displayName: parsed.data.displayName } : {}),
        ...(parsed.data.region ? { region: parsed.data.region } : {}),
      });
      return reply.status(201).send({ success: true, data: result });
    } catch (err) {
      if (err instanceof LeaderboardValidationError) {
        throw createAppError(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  });

  fastify.get<{ Params: { gameId: string } }>('/:gameId/leaderboard', async (request, reply) => {
    requireUserId(request);
    const parsed = leaderboardQuerySchema.safeParse(request.query);
    if (!parsed.success) throw parsed.error;
    const entries = await service(fastify).getLeaderboard(request.params.gameId, {
      ...(parsed.data.app ? { app: parsed.data.app } : {}),
      ...(parsed.data.limit ? { limit: parsed.data.limit } : {}),
    });
    return reply.send({ success: true, data: { entries } });
  });

  fastify.get<{ Params: { gameId: string }; Querystring: { app?: string } }>(
    '/:gameId/rank',
    async (request, reply) => {
      const userId = requireUserId(request);
      const parsed = leaderboardQuerySchema.safeParse(request.query);
      if (!parsed.success) throw parsed.error;
      const rank = await service(fastify).getUserRank(request.params.gameId, userId, {
        ...(parsed.data.app ? { app: parsed.data.app } : {}),
      });
      return reply.send({ success: true, data: { rank } });
    },
  );
}
