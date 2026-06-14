import type { FastifyInstance } from 'fastify';
import { createAppError } from '@quant/server-core';
import { paymentEngine } from '@quant/payment';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return escapeHtml(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      out[key] = sanitizeValue(nestedValue);
    }
    return out;
  }
  return value;
}

export default async function paymentRoutes(fastify: FastifyInstance) {
  fastify.post('/methods', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const type = body.type;
    const isDefault = body.isDefault;
    const details = body.details;

    if (type !== 'card' && type !== 'paypal' && type !== 'crypto') {
      throw createAppError('Invalid payment method type', 400, 'INVALID_PAYMENT_METHOD_TYPE');
    }

    if (typeof isDefault !== 'boolean') {
      throw createAppError('Invalid isDefault value', 400, 'INVALID_PAYMENT_METHOD_DEFAULT');
    }

    const sanitizedMethod = {
      type,
      isDefault,
      details: (sanitizeValue(details ?? {}) as Record<string, unknown>),
    };

    const method = await paymentEngine.addPaymentMethod(userId, sanitizedMethod as any);
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
