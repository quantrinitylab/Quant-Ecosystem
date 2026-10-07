import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { FolderService } from '../services/folder.service';

const createFolderSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['INBOX', 'SENT', 'DRAFTS', 'SPAM', 'TRASH', 'ARCHIVE', 'CUSTOM']).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

const updateFolderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

export default async function foldersRoutes(fastify: FastifyInstance) {
  // POST /folders
  fastify.post('/', async (request, reply) => {
    const parseResult = createFolderSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new FolderService(prisma as never);
    const folder = await service.createFolder({
      userId,
      ...parseResult.data,
    });

    return reply.status(201).send({ success: true, data: folder });
  });

  // GET /folders
  fastify.get('/', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new FolderService(prisma as never);
    const folders = await service.listFolders(userId);

    return reply.send({ success: true, data: folders });
  });

  // PUT /folders/:id
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parseResult = updateFolderSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new FolderService(prisma as never);
    const folder = await service.updateFolder(request.params.id, userId, parseResult.data);

    return reply.send({ success: true, data: folder });
  });

  // DELETE /folders/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new FolderService(prisma as never);
    const folder = await service.deleteFolder(request.params.id, userId);

    return reply.send({ success: true, data: folder });
  });
}
