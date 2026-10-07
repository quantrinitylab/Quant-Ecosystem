import type { FastifyPluginAsync } from 'fastify';
import { ReceiptService } from '../services/receipt.service';
import { publishConversationEvent } from '../services/realtime-publisher';

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
    const body = request.body as { recipientId?: string };
    const recipientId = body.recipientId || (request as any).user?.id || 'unknown';
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
    const body = request.body as { recipientId?: string };
    const recipientId = body.recipientId || (request as any).user?.id || 'unknown';
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
    const query = request.query as { senderId?: string };
    const senderId = query.senderId || (request as any).user?.id || 'unknown';
    const result = await receiptService.getMessageReceiptStatus(messageId, senderId);
    return reply.send({ success: true, data: result });
  });
};

export default receiptsRoutes;
