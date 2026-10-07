import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { EmailTemplateService } from '../services/email-template.service';

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().min(1),
  shortcut: z.string().min(1).max(100).optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(500).optional(),
  bodyHtml: z.string().min(1).optional(),
  shortcut: z.string().min(1).max(100).nullable().optional(),
});

const renderSchema = z.object({
  vars: z.record(z.string(), z.string()),
});

export default async function emailTemplatesRoutes(fastify: FastifyInstance) {
  // POST /email-templates
  fastify.post('/', async (request, reply) => {
    const parseResult = createTemplateSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailTemplateService(prisma as never);
    const template = await service.createTemplate(userId, parseResult.data);

    return reply.status(201).send({ success: true, data: template });
  });

  // GET /email-templates
  fastify.get('/', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailTemplateService(prisma as never);
    const templates = await service.listTemplates(userId);

    return reply.send({ success: true, data: templates });
  });

  // GET /email-templates/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailTemplateService(prisma as never);
    const template = await service.getTemplate(request.params.id, userId);

    return reply.send({ success: true, data: template });
  });

  // PUT /email-templates/:id
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parseResult = updateTemplateSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailTemplateService(prisma as never);
    const template = await service.updateTemplate(request.params.id, userId, parseResult.data);

    return reply.send({ success: true, data: template });
  });

  // DELETE /email-templates/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailTemplateService(prisma as never);
    const template = await service.deleteTemplate(request.params.id, userId);

    return reply.send({ success: true, data: template });
  });

  // POST /email-templates/:id/render
  fastify.post<{ Params: { id: string } }>('/:id/render', async (request, reply) => {
    const parseResult = renderSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailTemplateService(prisma as never);
    const template = await service.getTemplate(request.params.id, userId);
    const rendered = service.render(template, parseResult.data.vars);

    return reply.send({ success: true, data: rendered });
  });
}
