import type { FastifyInstance } from 'fastify';
import { createAppError } from '@quant/server-core';
import { RandomChatService } from '../services/random-chat.service';

export default async function randomChatRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma;
  const randomChatService = new RandomChatService(prisma);

  fastify.post('/find', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const partner = await randomChatService.findRandomPartner(userId);

    if (partner) {
      return reply.send({ matched: true, partnerId: partner });
    } else {
      return reply.send({ matched: false, status: 'waiting' });
    }
  });

  fastify.post('/end', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    const { partnerId } = request.body as any;

    if (!userId || !partnerId) {
      throw createAppError('Missing parameters', 400, 'BAD_REQUEST');
    }

    await randomChatService.endChat(userId, partnerId);
    return reply.send({ success: true });
  });
}
