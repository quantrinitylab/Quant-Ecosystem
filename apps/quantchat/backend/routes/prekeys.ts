import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PrekeyService } from '../services/prekey.service';
import { createAppError } from '@quant/server-core';

const publishSchema = z.object({
  identityKey: z.string().min(1),
  signedPrekey: z.object({
    key: z.string().min(1),
    signature: z.string().min(1),
  }),
  oneTimePrekeys: z.array(z.string().min(1)).min(1),
});

const userParamsSchema = z.object({
  userId: z.string().min(1),
});

export default async function prekeysRoutes(fastify: FastifyInstance) {
  const service = new PrekeyService(fastify.prisma);

  // POST /prekeys - Registers caller's public prekey bundle
  fastify.post('/prekeys', async (request, reply) => {
    const userId = request.auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const parseResult = publishSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    await service.publishPrekeyBundle(userId, parseResult.data);

    return reply.status(201).send({
      success: true,
      data: { message: 'Prekey bundle published successfully' },
    });
  });

  // GET /prekeys/:userId - Retrieves bundle for initiating encrypted conversation
  fastify.get<{ Params: { userId: string } }>('/prekeys/:userId', async (request, reply) => {
    const userId = request.auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const parseResult = userParamsSchema.safeParse(request.params);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const bundle = await service.fetchPrekeyBundle(parseResult.data.userId);

    return reply.send({
      success: true,
      data: bundle,
    });
  });
}
