import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { EncryptionService } from '../services/encryption.service';
import { createKeyStorage } from '../services/key-storage-factory';

export const uploadBundleSchema = z.object({
  identityKey: z.string().min(1),
  signedPreKey: z.string().min(1),
  signedPreKeySignature: z.string().min(1),
  oneTimePreKey: z.string().optional(),
  registrationId: z.number().int().min(0),
});

const establishSessionSchema = z.object({
  responderId: z.string().min(1),
});

export default async function encryptionRoutes(fastify: FastifyInstance) {
  // Config-driven key storage (Requirements 3.5, 3.6): durable PrismaKeyStorage
  // by default; volatile InMemoryKeyStorage only when KEY_STORAGE=memory.
  const service = new EncryptionService(createKeyStorage(fastify.prisma));

  // POST /encryption/keys - Upload prekey bundle
  fastify.post('/keys', async (request, reply) => {
    const parseResult = uploadBundleSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    await service.uploadPreKeyBundle(userId, parseResult.data);

    return reply.status(201).send({ success: true, data: { message: 'Prekey bundle uploaded' } });
  });

  // GET /encryption/keys/:userId - Get prekey bundle
  fastify.get<{ Params: { userId: string } }>('/keys/:userId', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const bundle = await service.getPreKeyBundle(request.params.userId);
    return reply.send({ success: true, data: bundle });
  });

  // POST /encryption/sessions - Establish encrypted session
  fastify.post('/sessions', async (request, reply) => {
    const parseResult = establishSessionSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const session = await service.establishSession(userId, parseResult.data.responderId);

    return reply.status(201).send({
      success: true,
      data: {
        sessionId: session.id,
        established: session.established,
        createdAt: session.createdAt,
      },
    });
  });
}
