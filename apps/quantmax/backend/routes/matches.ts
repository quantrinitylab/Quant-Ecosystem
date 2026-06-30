import type { FastifyInstance } from 'fastify';
import { createAppError } from '@quant/server-core';
import { MatchService } from '../services/match.service';

// ============================================================================
// QuantMax matches routes (mounted at /matches).
//
//   GET    /matches        -> list the caller's REAL mutual matches (newest-first)
//   GET    /matches/:id     -> a single match the caller participates in
//   DELETE /matches/:id     -> unmatch (delete the match row)
//
// All authenticated (the global auth hook rejects anonymous callers; we also
// defensively require an auth.userId here).
//
// IMPORTANT: this `/matches` prefix is DISTINCT from `/matching`. `/matching`
// returns swipe *candidates* (profiles not yet acted on); `/matches` returns
// actual Match rows (mutual right-swipes).
// ============================================================================

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function buildService(fastify: FastifyInstance): MatchService {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  return new MatchService(prisma as never);
}

export default async function matchesRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const userId = requireUserId(request);
    const matches = await buildService(fastify).listMatches(userId);
    return reply.send({ success: true, data: matches });
  });

  fastify.get('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const { id } = request.params as { id: string };
    const match = await buildService(fastify).getMatch(userId, id);
    return reply.send({ success: true, data: match });
  });

  fastify.delete('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const { id } = request.params as { id: string };
    const result = await buildService(fastify).unmatch(userId, id);
    return reply.send({ success: true, data: result });
  });
}
