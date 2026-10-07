import type { FastifyInstance } from 'fastify';
import { templateService } from '@quant/agentic';

export default async function templatesRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const templates = templateService.getAllTemplates();
    return reply.send(templates);
  });

  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const template = templateService.getTemplate(id);

    if (!template) {
      return reply.code(404).send({ error: 'Template not found' });
    }

    return reply.send(template);
  });

  fastify.get('/category/:category', async (request, reply) => {
    const { category } = request.params as { category: string };
    const templates = templateService.getTemplatesByCategory(category);
    return reply.send(templates);
  });
}
