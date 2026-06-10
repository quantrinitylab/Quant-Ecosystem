import type { FastifyInstance } from 'fastify';
import { createAppError } from '@quant/server-core';
import { paymentEngine } from '@quant/payment';

export default async function paymentRoutes(fastify: FastifyInstance) {
  fastify.post('/methods', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const method = await paymentEngine.addPaymentMethod(userId, request.body as any);
    return reply.send(method);
  });

  fastify.post('/process', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { amount, currency, type, metadata } = request.body as any;
    const transaction = await paymentEngine.processPayment(
      userId,
      amount,
      currency,
      type,
      metadata,
    );
    return reply.send(transaction);
  });

  fastify.get('/transactions', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const transactions = await paymentEngine.getUserTransactions(userId);
    return reply.send(transactions);
  });
}
