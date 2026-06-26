import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { GameError, NeonGamesService } from '../services/neon-games.service';
import { LeaderboardService } from '../services/leaderboard.service';

// ============================================================================
// QuantNeon in-feed games routes (mounted at /games).
//
//   GET  /games                 -> catalog (+ ?gameId for active sessions)
//   GET  /games/sessions/:id    -> a session's current state
//   POST /games/:gameId/start   -> create a session (caller is host)
//   POST /games/:id/join        -> join a waiting session
//   POST /games/:id/action      -> submit a move (turn-based)
//
// Authenticated; the NeonGamesService singleton is decorated on the app.
// ============================================================================

function getUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function getService(fastify: FastifyInstance): NeonGamesService {
  return (fastify as unknown as { neonGames: NeonGamesService }).neonGames;
}

const actionSchema = z.object({ cell: z.coerce.number().int().min(0).max(8) });

const ERROR_STATUS: Record<GameError['code'], number> = {
  GAME_NOT_FOUND: 404,
  SESSION_NOT_FOUND: 404,
  GAME_NOT_PLAYABLE: 409,
  SESSION_FULL: 409,
  SESSION_NOT_ACTIVE: 409,
  NOT_YOUR_TURN: 409,
  ALREADY_JOINED: 409,
  INVALID_MOVE: 422,
};

function handle<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof GameError) {
      throw createAppError(err.message, ERROR_STATUS[err.code], err.code);
    }
    throw err;
  }
}

export default async function gamesRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    getUserId(request);
    const svc = getService(fastify);
    const gameId = (request.query as { gameId?: string } | undefined)?.gameId;
    return reply.send({
      success: true,
      data: { games: svc.listGames(), activeSessions: svc.listActiveSessions(gameId) },
    });
  });

  fastify.get<{ Params: { id: string } }>('/sessions/:id', async (request, reply) => {
    getUserId(request);
    const session = handle(() => getService(fastify).getSession(request.params.id));
    return reply.send({ success: true, data: { session } });
  });

  fastify.post<{ Params: { gameId: string } }>('/:gameId/start', async (request, reply) => {
    const userId = getUserId(request);
    const session = handle(() => getService(fastify).startGame(request.params.gameId, userId));
    return reply.status(201).send({ success: true, data: { session } });
  });

  fastify.post<{ Params: { id: string } }>('/:id/join', async (request, reply) => {
    const userId = getUserId(request);
    const session = handle(() => getService(fastify).joinGame(request.params.id, userId));
    return reply.send({ success: true, data: { session } });
  });

  fastify.post<{ Params: { id: string } }>('/:id/action', async (request, reply) => {
    const userId = getUserId(request);
    const parsed = actionSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const session = handle(() =>
      getService(fastify).submitMove(request.params.id, userId, parsed.data),
    );
    return reply.send({ success: true, data: { session } });
  });

  // --- Cross-app leaderboard (shared GameScore table) ---
  const leaderboard = () =>
    new LeaderboardService((fastify as unknown as { prisma: never }).prisma);

  const submitScoreSchema = z.object({
    gameId: z.string().min(1).max(64),
    score: z.coerce.number().int(),
    displayName: z.string().max(120).optional(),
    region: z.string().max(64).optional(),
  });
  const boardQuerySchema = z.object({
    gameId: z.string().min(1).max(64),
    app: z.string().max(32).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  });

  // Record a score for the caller (this app = quantneon).
  fastify.post('/score', async (request, reply) => {
    const userId = getUserId(request);
    const parsed = submitScoreSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const result = await leaderboard().submitScore({
      gameId: parsed.data.gameId,
      userId,
      app: 'quantneon',
      score: parsed.data.score,
      displayName: parsed.data.displayName,
      region: parsed.data.region,
    });
    return reply.status(201).send({ success: true, data: result });
  });

  // Cross-app leaderboard for a game (?app= to scope to one app).
  fastify.get('/leaderboard', async (request, reply) => {
    getUserId(request);
    const parsed = boardQuerySchema.safeParse(request.query);
    if (!parsed.success) throw parsed.error;
    const entries = await leaderboard().getLeaderboard(parsed.data.gameId, {
      app: parsed.data.app,
      limit: parsed.data.limit,
    });
    return reply.send({ success: true, data: { entries } });
  });

  // The caller's own rank for a game.
  fastify.get('/leaderboard/me', async (request, reply) => {
    const userId = getUserId(request);
    const parsed = boardQuerySchema.safeParse(request.query);
    if (!parsed.success) throw parsed.error;
    const rank = await leaderboard().getUserRank(parsed.data.gameId, userId, {
      app: parsed.data.app,
    });
    return reply.send({ success: true, data: { rank } });
  });
}
