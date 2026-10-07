import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { EmailService, type Label } from '../services/email.service';

const createLabelSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().optional(),
});

const updateLabelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().optional(),
});

const applyLabelSchema = z.object({
  emailId: z.string().min(1),
  labelId: z.string().min(1),
});

// Minimal typed view of the Prisma `label` delegate. The Label model is accessed
// through the same cast convention used by EmailService.getLabels().
interface LabelDelegate {
  create: (args: { data: Omit<Label, 'id'> }) => Promise<Label>;
  update: (args: { where: { id: string }; data: Partial<Label> }) => Promise<Label>;
  findUnique: (args: { where: { id: string } }) => Promise<Label | null>;
  delete: (args: { where: { id: string } }) => Promise<Label>;
}

function getUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function getLabelDelegate(fastify: FastifyInstance): LabelDelegate {
  return (fastify as unknown as { prisma: { label: LabelDelegate } }).prisma.label;
}

export default async function labelsRoutes(fastify: FastifyInstance) {
  // GET /labels — list the current user's labels
  fastify.get('/', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailService(prisma as never);
    const labels = await service.getLabels(userId);

    return reply.send({ success: true, data: labels });
  });

  // POST /labels — create a label
  fastify.post('/', async (request, reply) => {
    const parseResult = createLabelSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = getUserId(request);
    const label = await getLabelDelegate(fastify).create({
      data: { userId, ...parseResult.data },
    });

    return reply.status(201).send({ success: true, data: label });
  });

  // PUT /labels/:id — update a label
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parseResult = updateLabelSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = getUserId(request);
    const delegate = getLabelDelegate(fastify);
    const existing = await delegate.findUnique({ where: { id: request.params.id } });
    if (!existing) {
      throw createAppError('Label not found', 404, 'LABEL_NOT_FOUND');
    }
    if (existing.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    const label = await delegate.update({
      where: { id: request.params.id },
      data: parseResult.data,
    });

    return reply.send({ success: true, data: label });
  });

  // DELETE /labels/:id — delete a label
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = getUserId(request);
    const delegate = getLabelDelegate(fastify);
    const existing = await delegate.findUnique({ where: { id: request.params.id } });
    if (!existing) {
      throw createAppError('Label not found', 404, 'LABEL_NOT_FOUND');
    }
    if (existing.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    const label = await delegate.delete({ where: { id: request.params.id } });

    return reply.send({ success: true, data: label });
  });

  // POST /labels/apply — apply a label to an email
  fastify.post('/apply', async (request, reply) => {
    const parseResult = applyLabelSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = getUserId(request);
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailService(prisma as never);
    const email = await service.applyLabel(
      parseResult.data.emailId,
      parseResult.data.labelId,
      userId,
    );

    return reply.send({ success: true, data: email });
  });
}
