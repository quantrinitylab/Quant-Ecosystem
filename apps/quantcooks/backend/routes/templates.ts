import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { TemplateService, TemplateNotFoundError } from '../services/template.service';

// ============================================================================
// QuantEdit templates routes (mounted at /templates).
//
//   GET  /templates            -> catalog (+ ?category)
//   GET  /templates/:id        -> a template
//   POST /templates/:id/apply  -> a ready-to-edit project draft from the template
// ============================================================================

const service = new TemplateService();

const listSchema = z.object({
  category: z.enum(['social', 'youtube', 'marketing', 'story', 'post']).optional(),
});

const applySchema = z.object({ name: z.string().max(200).optional() });

export default async function templatesRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const parsed = listSchema.safeParse(request.query);
    if (!parsed.success) throw parsed.error;
    return reply.send({
      success: true,
      data: { templates: service.listTemplates(parsed.data.category) },
    });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      return reply.send({
        success: true,
        data: { template: service.getTemplate(request.params.id) },
      });
    } catch (err) {
      if (err instanceof TemplateNotFoundError) throw createAppError(err.message, 404, 'NOT_FOUND');
      throw err;
    }
  });

  fastify.post<{ Params: { id: string } }>('/:id/apply', async (request, reply) => {
    const parsed = applySchema.safeParse(request.body ?? {});
    if (!parsed.success) throw parsed.error;
    try {
      const draft = service.applyTemplate(request.params.id, parsed.data);
      return reply.status(201).send({ success: true, data: { draft } });
    } catch (err) {
      if (err instanceof TemplateNotFoundError) throw createAppError(err.message, 404, 'NOT_FOUND');
      throw err;
    }
  });
}
