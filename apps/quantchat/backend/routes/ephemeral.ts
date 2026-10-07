import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { DisappearingService } from '../services/disappearing.service';

// ============================================================================
// Tasks 14.8 / 14.9 / 14.10: Ephemeral message routes
//
//   14.8 — POST   /conversations/:id/disappear-timer  (configure timer)
//   14.9 — POST   /conversations/messages/:messageId/view (mark viewed + schedule deletion)
//   14.10 — POST  /conversations/messages/:messageId/screenshot (notify sender)
//
// Mounted at /conversations.
// Requirements: 18.1, 18.2, 18.3
// ============================================================================

const setTimerSchema = z.object({
  seconds: z.number().int().min(0),
});

const viewSchema = z.object({
  timerSeconds: z.number().int().min(1),
});

const screenshotSchema = z.object({
  viewerName: z.string().min(1).max(100).optional(),
});

export default async function ephemeralRoutes(fastify: FastifyInstance) {
  // POST /conversations/:id/disappear-timer
  fastify.post<{ Params: { id: string } }>('/:id/disappear-timer', async (request, reply) => {
    const parseResult = setTimerSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new DisappearingService(prisma as never);
    const result = await service.setConversationTimer(request.params.id, parseResult.data.seconds);

    return reply.send({ success: true, data: result });
  });

  // POST /conversations/messages/:messageId/view
  fastify.post<{ Params: { messageId: string } }>(
    '/messages/:messageId/view',
    async (request, reply) => {
      const parseResult = viewSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw parseResult.error;
      }

      const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
      if (!userId) {
        throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const prisma = (fastify as unknown as { prisma: unknown }).prisma;
      const service = new DisappearingService(prisma as never);
      const result = await service.markViewedAndScheduleDeletion(
        request.params.messageId,
        parseResult.data.timerSeconds,
      );

      return reply.send({ success: true, data: result });
    },
  );

  // POST /conversations/messages/:messageId/screenshot
  fastify.post<{ Params: { messageId: string } }>(
    '/messages/:messageId/screenshot',
    async (request, reply) => {
      const parseResult = screenshotSchema.safeParse(request.body ?? {});
      if (!parseResult.success) {
        throw parseResult.error;
      }

      const auth = (request as unknown as { auth?: { userId?: string; username?: string } }).auth;
      const userId = auth?.userId;
      if (!userId) {
        throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const viewerName = parseResult.data.viewerName ?? auth?.username ?? 'Someone';

      const prisma = (fastify as unknown as { prisma: unknown }).prisma;
      const service = new DisappearingService(prisma as never);
      const result = await service.recordScreenshot(request.params.messageId, userId, viewerName);

      return reply.status(201).send({ success: true, data: result });
    },
  );
}
