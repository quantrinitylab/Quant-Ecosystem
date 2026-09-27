import type { FastifyPluginAsync } from 'fastify';
import { ReceiptService } from '../services/receipt.service';

const receiptsRoutes: FastifyPluginAsync = async (fastify) => {
  const receiptService = new ReceiptService(fastify.prisma);

  fastify.post('/:messageId/delivered', async (request, reply) => {
    const { messageId } = request.params as { messageId: string };
    const body = request.body as { recipientId?: string };
    const recipientId = body.recipientId || (request as any).user?.id || 'unknown';
    const result = await receiptService.markMessageDelivered(messageId, recipientId);
    return reply.send({ success: true, data: result });
  });

  fastify.post('/:messageId/read', async (request, reply) => {
    const { messageId } = request.params as { messageId: string };
    const body = request.body as { recipientId?: string };
    const recipientId = body.recipientId || (request as any).user?.id || 'unknown';
    const result = await receiptService.markMessageRead(messageId, recipientId);
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
