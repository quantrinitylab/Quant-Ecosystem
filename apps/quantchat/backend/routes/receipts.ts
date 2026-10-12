import type { FastifyPluginAsync } from 'fastify';
import { createAppError } from '@quant/server-core';
import { ReceiptService } from '../services/receipt.service';
import { getPrivacyService } from '../services/privacy.service';
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
  const ref = await messageRefForMessage(fastify, messageId);
  return ref?.conversationId ?? null;
}

/**
 * Resolve a message's conversation id + sender id. The sender id drives the
 * QC-F-042 amend (gap 3) live-tick exclusion below. Returns null under the
 * same conditions as {@link conversationIdForMessage}.
 */
async function messageRefForMessage(
  fastify: Parameters<FastifyPluginAsync>[0],
  messageId: string,
): Promise<{ conversationId: string; senderId: string | null } | null> {
  try {
    const prisma = (fastify as unknown as { prisma?: unknown }).prisma as
      | {
          message?: {
            findUnique: (
              args: unknown,
            ) => Promise<{ conversationId?: string; senderId?: string } | null>;
          };
        }
      | undefined;
    if (!prisma?.message) return null;
    const row = await prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true, senderId: true },
    });
    if (typeof row?.conversationId !== 'string') return null;
    return {
      conversationId: row.conversationId,
      senderId: typeof row.senderId === 'string' ? row.senderId : null,
    };
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

    // QC-F-042: the reader's showReadReceipts was off — nothing was
    // persisted, so no realtime tick may be fanned out either (a tick for
    // an unrecorded receipt would be a fabricated read signal).
    if (result.suppressed) {
      return reply.send({ success: true, data: result });
    }

    // K25 — realtime tick for REST-recorded read receipts.
    // QC-F-042 amend (gap 3): sender-side reciprocity applies to the LIVE
    // tick too, not just the REST status view — a sender whose own
    // showReadReceipts is off must not receive the live read event (the
    // WS recordAndFan path applies the identical exclusion). Other room
    // members still receive it; the exclusion is per-recipient.
    const ref = await messageRefForMessage(fastify, messageId);
    if (ref) {
      let excludeUserIds: string[] | undefined;
      if (ref.senderId && ref.senderId !== recipientId) {
        const { prefs } = await getPrivacyService(
          (fastify as unknown as { prisma?: unknown }).prisma,
        ).resolve(ref.senderId);
        if (!prefs.showReadReceipts) excludeUserIds = [ref.senderId];
      }
      void publishConversationEvent(fastify, ref.conversationId, {
        eventType: 'chat.message.receipt_updated.v1',
        resourceRef: messageId,
        data: { messageId, conversationId: ref.conversationId, userId: recipientId, receipt: 'read' },
        excludeUserIds,
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
