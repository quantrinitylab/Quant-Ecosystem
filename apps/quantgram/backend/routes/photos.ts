import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { PhotoService } from '../services/photo.service';

const uploadPhotoSchema = z.object({
  albumId: z.string().optional(),
  caption: z.string().max(2200).optional(),
  imageUrl: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fileSize: z.number().positive(),
  filter: z.string().optional(),
  location: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

const createAlbumSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE', 'FRIENDS_ONLY']).optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export default async function photosRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const parseResult = uploadPhotoSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PhotoService(prisma as never);
    const photo = await service.uploadPhoto({ ...parseResult.data, userId });

    return reply.status(201).send({ success: true, data: photo });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PhotoService(prisma as never);
    const photo = await service.getPhoto(request.params.id);

    return reply.send({ success: true, data: photo });
  });

  fastify.get('/user/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const queryResult = paginationSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PhotoService(prisma as never);
    const result = await service.listByUser(userId, queryResult.data);

    return reply.send({ success: true, data: result });
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PhotoService(prisma as never);
    const photo = await service.deletePhoto(request.params.id, userId);

    return reply.send({ success: true, data: photo });
  });

  fastify.post<{ Params: { id: string } }>('/:id/like', async (request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PhotoService(prisma as never);
    const photo = await service.likePhoto(request.params.id);

    return reply.send({ success: true, data: photo });
  });

  fastify.post('/albums', async (request, reply) => {
    const parseResult = createAlbumSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PhotoService(prisma as never);
    const album = await service.createAlbum({ ...parseResult.data, userId });

    return reply.status(201).send({ success: true, data: album });
  });

  fastify.get('/albums', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PhotoService(prisma as never);
    const albums = await service.listAlbumsByUser(userId);

    return reply.send({ success: true, data: albums });
  });

  fastify.get<{ Params: { id: string } }>('/albums/:id', async (request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PhotoService(prisma as never);
    const album = await service.getAlbum(request.params.id);

    return reply.send({ success: true, data: album });
  });

  fastify.get<{ Params: { id: string } }>('/albums/:id/photos', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const queryResult = paginationSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new PhotoService(prisma as never);
    // Verify the album exists / is accessible before listing its photos.
    await service.getAlbum(request.params.id);
    const result = await service.listByAlbum(request.params.id, queryResult.data);

    return reply.send({ success: true, data: result });
  });
}
