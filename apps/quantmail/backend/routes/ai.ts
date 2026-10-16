import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError, enableIdempotency } from '@quant/server-core';
import { AIEmailService } from '../services/ai-email.service';
import { MailAIService } from '@quant/ai';
import { AIEngine } from '@quant/ai';

const composeAssistSchema = z.object({
  instructions: z.string().min(1).max(2000),
  context: z
    .object({
      recipient: z.string().optional(),
      subject: z.string().optional(),
      tone: z.string().optional(),
    })
    .optional(),
});

export default async function aiRoutes(fastify: FastifyInstance) {
  // WR-MAIL-104: honor Idempotency-Key on the AI mutation routes; summarize
  // is an active catalog command (mail.ai.summarize writes a cached aiSummary)
  // and REQUIRES a valid key.
  enableIdempotency(fastify);

  function getAIService(): AIEmailService {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const engine = new AIEngine();
    const mailAI = new MailAIService(engine);
    return new AIEmailService(prisma as never, mailAI);
  }

  // POST /emails/:id/summarize
  // WR-MAIL-104: mail.ai.summarize is an active catalog command (cached
  // aiSummary write) — key required. fix/qm-idempotency-ttl-3: this is the
  // slowest mutating AI route (LLM call over a potentially large thread
  // body), so it declares an honest 15-minute in-flight claim window. The
  // generic path still heartbeats the claim while the handler runs — the TTL
  // is a floor, not a wall-clock bound on handler duration.
  fastify.post<{ Params: { id: string } }>(
    '/:id/summarize',
    { config: { idempotencyRequired: true, idempotencyProcessingTtlSeconds: 900 } },
    async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const service = getAIService();
    const result = await service.summarize(request.params.id, userId);

    return reply.send({ success: true, data: result });
  });

  // POST /emails/compose-assist
  fastify.post('/compose-assist', async (request, reply) => {
    const parseResult = composeAssistSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const service = getAIService();
    const result = await service.composeAssistant(
      userId,
      parseResult.data.instructions,
      parseResult.data.context ?? {},
    );

    return reply.send({ success: true, data: result });
  });

  // POST /emails/:id/classify-priority
  fastify.post<{ Params: { id: string } }>('/:id/classify-priority', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const service = getAIService();
    const result = await service.classifyPriority(request.params.id, userId);

    return reply.send({ success: true, data: result });
  });

  // POST /emails/:id/detect-phishing
  fastify.post<{ Params: { id: string } }>('/:id/detect-phishing', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const service = getAIService();
    const result = await service.detectPhishing(request.params.id, userId);

    return reply.send({ success: true, data: result });
  });

  // GET /emails/:id/reply-suggestions
  fastify.get<{ Params: { id: string } }>('/:id/reply-suggestions', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const service = getAIService();
    const result = await service.suggestReplies(request.params.id, userId);

    return reply.send({ success: true, data: result });
  });

  // POST /emails/:id/send-preview — QM-QUANTY-002 preview before mutation.
  // Returns the exact MutationPreview the user reviews before
  // POST /emails/:id/send runs. Read-only: never queues or sends.
  fastify.post<{ Params: { id: string } }>('/:id/send-preview', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const service = getAIService();
    const preview = await service.prepareSendPreview(request.params.id, userId);

    return reply.send({ success: true, data: preview });
  });
}
