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

export const OUTLOOK_COLOR_CATEGORIES = [
  { name: 'Red', color: '#EF4444' },
  { name: 'Orange', color: '#FF6B35' },
  { name: 'Yellow', color: '#F59E0B' },
  { name: 'Green', color: '#10B981' },
  { name: 'Blue', color: '#38BDF8' },
  { name: 'Purple', color: '#8B5CF6' },
] as const;

export default async function labelsRoutes(fastify: FastifyInstance) {
  // POST /labels/categories/seed — seed default 6 Outlook color categories
  fastify.post('/categories/seed', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailService(prisma as never);
    const existingLabels = await service.getLabels(userId);
    const delegate = getLabelDelegate(fastify);

    const seeded: Label[] = [];
    for (const cat of OUTLOOK_COLOR_CATEGORIES) {
      const match = existingLabels.find(
        (l) =>
          l.name.toLowerCase() === cat.name.toLowerCase() ||
          l.name.toLowerCase() === `${cat.name.toLowerCase()} category`,
      );
      if (match) {
        seeded.push(match);
      } else {
        const created = await delegate.create({
          data: {
            userId,
            name: cat.name,
            color: cat.color,
          },
        });
        seeded.push(created);
      }
    }

    return reply.status(201).send({ success: true, data: seeded });
  });

  // GET /labels/categories — list default or user color categories
  fastify.get('/categories', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailService(prisma as never);
    const existingLabels = await service.getLabels(userId);
    const matching = existingLabels.filter((l) =>
      OUTLOOK_COLOR_CATEGORIES.some(
        (c) =>
          c.name.toLowerCase() === l.name.toLowerCase() ||
          `${c.name.toLowerCase()} category` === l.name.toLowerCase(),
      ),
    );
    return reply.send({
      success: true,
      data: matching.length > 0 ? matching : OUTLOOK_COLOR_CATEGORIES,
    });
  });

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

  // POST /labels/remove — remove a label from an email. The row-level label
  // picker needs this; apply alone would make the picker a one-way door.
  fastify.post('/remove', async (request, reply) => {
    const parseResult = applyLabelSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = getUserId(request);
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailService(prisma as never);
    const email = await service.removeLabel(
      parseResult.data.emailId,
      parseResult.data.labelId,
      userId,
    );

    return reply.send({ success: true, data: email });
  });
}
