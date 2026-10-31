import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ThreadCaptureService, type ScreenCaptureKind } from '../services/thread-capture.service';
import { publishConversationEvent } from '../services/realtime-publisher';

// ============================================================================
// QuantChat — Phase 2B: conversation-level screen-capture notice route.
//
//   2B-1 — POST /conversations/:id/screen-capture
//          Body: { kind: 'screenshot' | 'screen_recording' }.
//          The client calls this when it DETECTS a screenshot or a screen
//          recording of the chat surface. The backend posts an in-thread
//          system notice ("<name> took a screenshot" / "<name> started a
//          screen recording") and fans it out live so connected clients
//          render the dismissible banner pill.
//
//          Detection + notice ONLY — this endpoint cannot and does not
//          prevent captures, and no copy here claims otherwise.
//
// Mounted at /conversations.
// ============================================================================

const screenCaptureSchema = z.object({
  kind: z.enum(['screenshot', 'screen_recording']),
});

export default async function threadCaptureRoutes(fastify: FastifyInstance) {
  // POST /conversations/:id/screen-capture
  fastify.post<{ Params: { id: string } }>('/:id/screen-capture', async (request, reply) => {
    const parseResult = screenCaptureSchema.safeParse(request.body ?? {});
    if (!parseResult.success) {
      throw parseResult.error;
    }

    // Identity comes ONLY from the verified auth context (QC-F-038).
    // Unknown body keys are stripped by zod, so a body-supplied
    // `viewerName` is silently ignored rather than trusted.
    const auth = (request as unknown as { auth?: { userId?: string; username?: string } }).auth;
    const userId = auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    const viewerName = auth?.username ? auth.username : 'Someone';

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ThreadCaptureService(prisma as never);
    const kind = parseResult.data.kind as ScreenCaptureKind;
    const result = await service.recordScreenCapture(
      request.params.id,
      userId,
      viewerName,
      kind,
    );

    // K25 — realtime fan-out so live clients render the banner pill
    // immediately (same envelope shape as the send path in
    // routes/messages.ts: chat.message.created.v1 carrying the row).
    if (result.notified && result.systemMessage) {
      const row = result.systemMessage as { id?: unknown; version?: unknown };
      void publishConversationEvent(fastify, result.conversationId, {
        eventType: 'chat.message.created.v1',
        resourceRef: typeof row.id === 'string' ? row.id : result.systemMessageId ?? '',
        aggregateVersion: typeof row.version === 'number' ? row.version : 1,
        data: result.systemMessage,
      });
    }

    return reply.status(201).send({ success: true, data: result });
  });
}
