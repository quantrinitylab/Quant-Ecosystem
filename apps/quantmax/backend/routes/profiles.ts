import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ProfileService } from '../services/profile.service';

const createProfileSchema = z.object({
  displayName: z.string().min(1).max(100),
  bio: z.string().max(1000).optional(),
  age: z.number().int().min(18).max(120),
  gender: z.string().min(1),
  genderPreference: z.array(z.unknown()).optional(),
  location: z.record(z.unknown()).optional(),
  photos: z.array(z.unknown()).optional(),
  interests: z.array(z.string()).optional(),
});

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(1000).optional(),
  age: z.number().int().min(18).max(120).optional(),
  gender: z.string().min(1).optional(),
  genderPreference: z.array(z.unknown()).optional(),
  location: z.record(z.unknown()).optional(),
  photos: z.array(z.unknown()).optional(),
  interests: z.array(z.string()).optional(),
});

export default async function profilesRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const parseResult = createProfileSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ProfileService(prisma as never);
    const profile = await service.createProfile({ ...parseResult.data, userId });

    return reply.status(201).send({ success: true, data: profile });
  });

  fastify.get('/me', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ProfileService(prisma as never);
    const profile = await service.getProfile(userId);

    return reply.send({ success: true, data: profile });
  });

  fastify.get<{ Params: { userId: string } }>('/:userId', async (request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ProfileService(prisma as never);
    const profile = await service.getProfile(request.params.userId);

    return reply.send({ success: true, data: profile });
  });

  fastify.put('/', async (request, reply) => {
    const parseResult = updateProfileSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ProfileService(prisma as never);
    const profile = await service.updateProfile(userId, parseResult.data);

    return reply.send({ success: true, data: profile });
  });

  fastify.post('/deactivate', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ProfileService(prisma as never);
    const profile = await service.deactivateProfile(userId);

    return reply.send({ success: true, data: profile });
  });

  fastify.get('/score', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ProfileService(prisma as never);
    const score = await service.calculateProfileScore(userId);

    return reply.send({ success: true, data: { score } });
  });
}
