import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

const createDocSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().optional(),
  isPublic: z.boolean().optional(),
});

export default async function documentsRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma;

  fastify.post('/', async (request, reply) => {
    const parseResult = createDocSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const doc = await prisma.document.create({
      data: {
        title: parseResult.data.title,
        content: parseResult.data.content || '',
        createdBy: userId,
        isPublic: parseResult.data.isPublic || false,
      },
    });

    return reply.send(doc);
  });

  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const doc = await prisma.document.findUnique({
      where: { id },
    });

    if (!doc) {
      throw createAppError('Document not found', 404, 'NOT_FOUND');
    }

    return reply.send(doc);
  });
}
