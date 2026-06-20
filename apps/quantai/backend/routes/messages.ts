import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ChatService } from '../services/chat.service';

const feedbackSchema = z.object({
  // 'POSITIVE' | 'NEGATIVE' to set, null to clear.
  feedback: z.union([z.enum(['POSITIVE', 'NEGATIVE']), z.null()]),
});

/**
 * Message-scoped routes mounted under the /sessions prefix. Currently exposes
 * thumbs-up / thumbs-down feedback on assistant messages, persisted on the
 * AIMessage record (drives the quality/eval loop).
 */
export default async function messagesRoutes(fastify: FastifyInstance) {
  // POST /sessions/:id/messages/:messageId/feedback
  fastify.post<{ Params: { id: string; messageId: string } }>(
    '/:id/messages/:messageId/feedback',
    async (request, reply) => {
      const parseResult = feedbackSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw parseResult.error;
      }

      const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
      if (!userId) {
        throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const prisma = (fastify as unknown as { prisma: unknown }).prisma;
      const service = new ChatService(prisma as never);
      const message = await service.setFeedback(
        request.params.id,
        userId,
        request.params.messageId,
        parseResult.data.feedback,
      );

      return reply.send({ success: true, data: message });
    },
  );
}
