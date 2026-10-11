import type { FastifyPluginAsync } from 'fastify';
import { createAppError } from '@quant/server-core';
import { ReceiptService } from '../services/receipt.service';
import { publishConversationEvent } from '../services/realtime-publisher';

// QC-F-018 — identity forgery fix.
// Recipient/sender identity comes ONLY from the authenticated request context
// (`request.auth`, populated by the server-core auth plugin from the verified
// JWT). Body/query fields `recipientId` / `senderId` are NEVER trusted:
// previously they won over `(request as any).user?.id` — a field no auth code
// ever sets — so any caller could forge delivered/read receipts (and the
// realtime ticks broadcast from them) in any other user's name, and calls
// without auth were attributed to the fabricated identity 'unknown'.
// Missing auth now fails closed with 401, matching games/memories routes.
interface AuthedRequest {
  auth?: { userId?: string };
  user?: { id?: string };
}

function requireUserId(request: unknown): string {
  const r = request as AuthedRequest;
  const userId = r.auth?.userId ?? r.user?.id;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

/**
 * Resolve the conversation id for a message (needed to address the realtime
 * channel). Returns null when the store is unavailable — the REST receipt
 * itself still succeeds; only the live tick is skipped.
 */
async function conversationIdForMessage(
  fastify: Parameters<FastifyPluginAsync>[0],
  messageId: string,
): Promise<string | null> {
  try {
    const prisma = (fastify as unknown as { prisma?: unknown }).prisma as
      | { message?: { findUnique: (args: unknown) => Promise<{ conversationId?: string } | null> } }
      | undefined;
    if (!prisma?.message) return null;
    const row = await prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true },
    });
    return typeof row?.conversationId === 'string' ? row.conversationId : null;
  } catch {
    return null;
  }
}

const receiptsRoutes: FastifyPluginAsync = async (fastify) => {
  const receiptService = new ReceiptService(fastify.prisma);

  fastify.post('/:messageId/delivered', async (request, reply) => {
    const { messageId } = request.params as { messageId: string };
    const recipientId = requireUserId(request);
    const result = await receiptService.markMessageDelivered(messageId, recipientId);

    // K25 — realtime tick for REST-recorded delivery receipts (contract §28
    // `chat.message.receipt_updated.v1`). Never fails the REST response.
    const conversationId = await conversationIdForMessage(fastify, messageId);
    if (conversationId) {
      void publishConversationEvent(fastify, conversationId, {
        eventType: 'chat.message.receipt_updated.v1',
        resourceRef: messageId,
        data: { messageId, conversationId, userId: recipientId, receipt: 'delivered' },
      });
    }

    return reply.send({ success: true, data: result });
  });

  fastify.post('/:messageId/read', async (request, reply) => {
    const { messageId } = request.params as { messageId: string };
    const recipientId = requireUserId(request);
    const result = await receiptService.markMessageRead(messageId, recipientId);

    // K25 — realtime tick for REST-recorded read receipts.
    const conversationId = await conversationIdForMessage(fastify, messageId);
    if (conversationId) {
      void publishConversationEvent(fastify, conversationId, {
        eventType: 'chat.message.receipt_updated.v1',
        resourceRef: messageId,
        data: { messageId, conversationId, userId: recipientId, receipt: 'read' },
      });
    }

    return reply.send({ success: true, data: result });
  });

  fastify.get('/:messageId/status', async (request, reply) => {
    const { messageId } = request.params as { messageId: string };
    const senderId = requireUserId(request);
    const result = await receiptService.getMessageReceiptStatus(messageId, senderId);
    return reply.send({ success: true, data: result });
  });
};

export default receiptsRoutes;
