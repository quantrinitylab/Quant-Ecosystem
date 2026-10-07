import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { createVideoChatService } from '../services/video-chat.service';

// ============================================================================
// QuantMax video-chat routes (mounted at /videochat).
//
//   POST /videochat/join  { interests?, ageRange?, genders?, language?, ... }
//   POST /videochat/skip
//   POST /videochat/end
//
// All authenticated. The service is instantiated once per plugin registration
// (a singleton), so its in-memory matchmaking queue survives across requests.
// ============================================================================

const prefsSchema = z
  .object({
    interests: z.array(z.string()).optional(),
    ageRange: z.object({ min: z.number(), max: z.number() }).optional(),
    genders: z.array(z.string()).optional(),
    language: z.string().optional(),
    enableTextFallback: z.boolean().optional(),
    enableGames: z.boolean().optional(),
  })
  .optional();

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function videochatRoutes(fastify: FastifyInstance) {
  const service = createVideoChatService((fastify as unknown as { prisma: never }).prisma);

  fastify.post('/join', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = prefsSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const result = await service.join(userId, parsed.data ?? {});
    return reply.send({ success: true, data: result });
  });

  fastify.post('/skip', async (request, reply) => {
    const userId = requireUserId(request);
    const result = await service.skip(userId);
    return reply.send({ success: true, data: result });
  });

  fastify.post('/end', async (request, reply) => {
    const userId = requireUserId(request);
    const result = await service.end(userId);
    return reply.send({ success: true, data: result });
  });
}
