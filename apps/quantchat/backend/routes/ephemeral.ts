import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { DisappearingService } from '../services/disappearing.service';
import { publishConversationEvent } from '../services/realtime-publisher';

// ============================================================================
// Tasks 14.8 / 14.9 / 14.10: Ephemeral message routes
//
//   14.8 — POST   /conversations/:id/disappear-timer  (configure timer)
//   14.9 — POST   /conversations/messages/:messageId/view (mark viewed + schedule deletion)
//   14.10 — POST  /conversations/messages/:messageId/screenshot (notify sender)
//
// Phase 1B additions:
//   1B-1 — POST /conversations/messages/:messageId/revoke
//          Sender revokes an UNVIEWED disappearing message.
//          409 MESSAGE_ALREADY_VIEWED when the recipient already viewed it.
//   1B-2 — POST /conversations/messages/:messageId/keep-request
//          Recipient asks to keep a disappearing message. The request alone
//          keeps NOTHING — the sender must consent first.
//   1B-3 — POST /conversations/messages/:messageId/keep-consent
//          Sender grants/denies the keep request. Granted = expiry
//          cancelled, message kept. Denied = expiry stays armed.
//   1B-4 — POST /conversations/:id/disappearing-default
//          Per-contact (DIRECT) / per-conversation disappearing default —
//          thin alias over DisappearingService.setConversationTimer
//          (Task 14.8) with contact-facing labels.
//
// Mounted at /conversations.
// Requirements: 18.1, 18.2, 18.3 (Phase 1B).
// ============================================================================

const setTimerSchema = z.object({
  seconds: z.number().int().min(0),
});

const viewSchema = z.object({
  timerSeconds: z.number().int().min(1),
});

// QC-F-038: the screenshot system message names the viewer — that name must
// come from the verified auth identity, never from the request body (a
// body-supplied name let any caller forge "<anyone> took a screenshot").
// Unknown body keys are stripped by zod, so old clients that still send
// `viewerName` are silently ignored rather than rejected.
const screenshotSchema = z.object({});

// Phase 1B: sender's decision on a recipient's keep request.
const keepConsentSchema = z.object({
  decision: z.enum(['granted', 'denied']),
});

// Phase 1B: contact-facing labels for the per-contact disappearing default.
// 'off' clears the timer (seconds: 0 → null). Explicit `seconds` wins over
// `mode` when both are given. Seconds must still be one of
// DisappearingService.VALID_TIMER_SECONDS — the service enforces it (400
// INVALID_TIMER); note the Flutter DisappearingTimerOption d7/d90 presets
// are NOT in that list today (see Phase 1B decision log).
const disappearingDefaultSchema = z.object({
  mode: z.enum(['off', '24h']).optional(),
  seconds: z.number().int().min(0).optional(),
});

function resolveDefaultSeconds(data: z.infer<typeof disappearingDefaultSchema>): number {
  if (data.seconds !== undefined) return data.seconds;
  if (data.mode === '24h') return 24 * 60 * 60;
  return 0; // 'off' or omitted → disable
}

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
    const result = await service.setConversationTimer(
      request.params.id,
      parseResult.data.seconds,
      userId,
    );

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
        userId,
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

      // QC-F-038: name comes only from the verified auth identity. The
      // truthiness check also covers an empty-string username claim (the old
      // `??` chain let "" through, producing " took a screenshot").
      const viewerName = auth?.username ? auth.username : 'Someone';

      const prisma = (fastify as unknown as { prisma: unknown }).prisma;
      const service = new DisappearingService(prisma as never);
      const result = await service.recordScreenshot(request.params.messageId, userId, viewerName);

      return reply.status(201).send({ success: true, data: result });
    },
  );

  // POST /conversations/messages/:messageId/revoke (Phase 1B-1)
  fastify.post<{ Params: { messageId: string } }>(
    '/messages/:messageId/revoke',
    async (request, reply) => {
      const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
      if (!userId) {
        throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const prisma = (fastify as unknown as { prisma: unknown }).prisma;
      const service = new DisappearingService(prisma as never);
      const result = await service.revokeDisappearingMessage(request.params.messageId, userId);

      // K25 — realtime fan-out so live clients remove the revoked message
      // immediately (same shape as the delete path in routes/messages.ts).
      void publishConversationEvent(fastify, result.conversationId, {
        eventType: 'chat.message.deleted.v1',
        resourceRef: result.messageId,
        aggregateVersion: 1,
        data: {
          id: result.messageId,
          conversationId: result.conversationId,
          reason: 'revoked',
        },
      });

      return reply.send({ success: true, data: result });
    },
  );

  // POST /conversations/messages/:messageId/keep-request (Phase 1B-2)
  fastify.post<{ Params: { messageId: string } }>(
    '/messages/:messageId/keep-request',
    async (request, reply) => {
      const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
      if (!userId) {
        throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const prisma = (fastify as unknown as { prisma: unknown }).prisma;
      const service = new DisappearingService(prisma as never);
      const result = await service.requestKeep(request.params.messageId, userId);

      return reply.status(201).send({ success: true, data: result });
    },
  );

  // POST /conversations/messages/:messageId/keep-consent (Phase 1B-3)
  fastify.post<{ Params: { messageId: string } }>(
    '/messages/:messageId/keep-consent',
    async (request, reply) => {
      const parseResult = keepConsentSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw parseResult.error;
      }

      const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
      if (!userId) {
        throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const prisma = (fastify as unknown as { prisma: unknown }).prisma;
      const service = new DisappearingService(prisma as never);
      const result = await service.resolveKeepConsent(
        request.params.messageId,
        userId,
        parseResult.data.decision,
      );

      return reply.send({ success: true, data: result });
    },
  );

  // POST /conversations/:id/disappearing-default (Phase 1B-4)
  fastify.post<{ Params: { id: string } }>(
    '/:id/disappearing-default',
    async (request, reply) => {
      const parseResult = disappearingDefaultSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw parseResult.error;
      }

      const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
      if (!userId) {
        throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const prisma = (fastify as unknown as { prisma: unknown }).prisma;
      const service = new DisappearingService(prisma as never);
      // Reuses the Task 14.8 timer config (same presets, same 403
      // NOT_A_MEMBER gate) — this is the per-contact-facing alias.
      const result = await service.setConversationTimer(
        request.params.id,
        resolveDefaultSeconds(parseResult.data),
        userId,
      );

      return reply.send({ success: true, data: result });
    },
  );
}

