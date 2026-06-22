import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { AnonymousIdentityService } from '../services/anonymous-identity.service';

// ============================================================================
// QuantSync auth routes (mounted at /auth).
//
//   POST /auth/anonymous/toggle  { enabled }  -> { isAnonymous, anonymousAlias? }
//
// Authenticated: a user toggles their own ghost-mode (post-anonymously-by-default).
// Returns the pseudonymous alias they would post under when enabled.
// ============================================================================

const toggleSchema = z.object({ enabled: z.boolean() });

function aliasSecret(): string {
  return process.env['ANON_ALIAS_SECRET'] ?? process.env['JWT_SECRET'] ?? 'dev-anon-alias-secret';
}

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/anonymous/toggle', async (request, reply) => {
    const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    const parsed = toggleSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new AnonymousIdentityService(prisma as never, aliasSecret());
    const state = await service.setGhostMode(userId, parsed.data.enabled);
    return reply.send({ success: true, data: state });
  });
}
