import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['VIDEO', 'PHOTO', 'COLLAGE']),
});

export default async function projectsRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma;

  fastify.post('/', async (request, reply) => {
    const parseResult = createProjectSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const project = await prisma.editProject.create({
      data: {
        ...parseResult.data,
        createdBy: userId,
      },
    });

    return reply.send(project);
  });

  fastify.get('/', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const projects = await prisma.editProject.findMany({
      where: { createdBy: userId },
    });

    return reply.send(projects);
  });
}
