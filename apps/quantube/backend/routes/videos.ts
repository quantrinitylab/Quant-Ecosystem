import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { VideoService } from '../services/video.service';

const uploadVideoSchema = z.object({
  channelId: z.string(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  videoUrl: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  duration: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fileSize: z.number().positive(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  visibility: z.enum(['PUBLIC', 'UNLISTED', 'PRIVATE']).optional(),
});

const updateVideoSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  thumbnailUrl: z.string().url().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  visibility: z.enum(['PUBLIC', 'UNLISTED', 'PRIVATE']).optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const processingStatusSchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']),
});

export default async function videosRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const parseResult = uploadVideoSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new VideoService(prisma as never);
    const video = await service.uploadVideo({
      ...parseResult.data,
      userId,
      fileSize: BigInt(parseResult.data.fileSize),
    });

    return reply.status(201).send({ success: true, data: video });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new VideoService(prisma as never);
    const video = await service.getVideo(request.params.id);

    return reply.send({ success: true, data: video });
  });

  fastify.get('/channel/:channelId', async (request, reply) => {
    const { channelId } = request.params as { channelId: string };
    const queryResult = paginationSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new VideoService(prisma as never);
    const result = await service.listByChannel(channelId, queryResult.data);

    return reply.send({ success: true, data: result });
  });

  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parseResult = updateVideoSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new VideoService(prisma as never);
    const video = await service.updateVideo(request.params.id, userId, parseResult.data);

    return reply.send({ success: true, data: video });
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new VideoService(prisma as never);
    const video = await service.deleteVideo(request.params.id, userId);

    return reply.send({ success: true, data: video });
  });

  fastify.post<{ Params: { id: string } }>('/:id/view', async (request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new VideoService(prisma as never);
    const video = await service.incrementView(request.params.id);

    return reply.send({ success: true, data: video });
  });

  fastify.post<{ Params: { id: string } }>('/:id/processing-status', async (request, reply) => {
    const parseResult = processingStatusSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new VideoService(prisma as never);
    const video = await service.setProcessingStatus(
      request.params.id,
      userId,
      parseResult.data.status,
    );

    return reply.send({ success: true, data: video });
  });

  fastify.post<{ Params: { id: string } }>('/:id/publish', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new VideoService(prisma as never);
    const video = await service.setProcessingStatus(request.params.id, userId, 'COMPLETED');

    return reply.send({ success: true, data: video });
  });

  fastify.get('/search', async (request, reply) => {
    const { q } = request.query as { q?: string };
    if (!q) {
      throw createAppError('Search query is required', 400, 'MISSING_QUERY');
    }

    const queryResult = paginationSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new VideoService(prisma as never);
    const result = await service.search(q, queryResult.data);

    return reply.send({ success: true, data: result });
  });
}
