import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  PromptTemplateService,
  listPromptTemplates,
  createCustomTemplate,
  substituteTemplateVariables,
  incrementTemplateUsage,
  type PromptCategory,
} from '../services/prompt-template.service';

const createSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(100000),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(100000).optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  isFavorite: z.boolean().optional(),
});

const listQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  favorites: z.enum(['true', 'false']).optional(),
});

const customTemplateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(1000),
  category: z.enum([
    'coding',
    'writing',
    'marketing',
    'sales',
    'finance',
    'legal',
    'hr',
    'support',
  ]),
  templateText: z.string().min(1, 'Template text is required').max(100000),
  tags: z.array(z.string().max(50)).optional(),
});

const templateListQuerySchema = z.object({
  category: z
    .enum(['coding', 'writing', 'marketing', 'sales', 'finance', 'legal', 'hr', 'support'])
    .optional(),
  search: z.string().optional(),
  tag: z.string().optional(),
});

const substituteBodySchema = z.object({
  variables: z.record(z.string()).optional().default({}),
});

function getUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

/**
 * Prompt library & Davinci AI Template Marketplace routes.
 * Backed by PromptTemplateService (legacy DB prompts) and Davinci AI Prompt Template engine.
 */
export default async function promptTemplateRoutes(fastify: FastifyInstance) {
  function getService(): PromptTemplateService {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    return new PromptTemplateService(prisma as never);
  }

  // ==========================================================================
  // Davinci AI Prompt Template Marketplace & Variable Parser Handlers
  // ==========================================================================

  // Handler: GET templates
  const handleListTemplates = async (request: any, reply: any) => {
    const parsed = templateListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.errors.map((e) => e.message).join(', '),
      });
    }

    const { category, search, tag } = parsed.data;
    const templates = listPromptTemplates({
      category: category as PromptCategory | undefined,
      search,
      tag,
    });

    return reply.send({
      success: true,
      data: templates,
      templates,
    });
  };

  // Handler: POST template (create custom)
  const handleCreateTemplate = async (request: any, reply: any) => {
    const parsed = customTemplateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.errors.map((e) => e.message).join(', '),
      });
    }

    const created = createCustomTemplate({
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      templateText: parsed.data.templateText,
      tags: parsed.data.tags ?? [],
    });
    return reply.status(201).send({
      success: true,
      data: created,
      template: created,
    });
  };

  // Handler: POST template substitute
  const handleSubstituteTemplate = async (request: any, reply: any) => {
    const { id } = request.params as { id: string };
    const parsed = substituteBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.errors.map((e) => e.message).join(', '),
      });
    }

    const templates = listPromptTemplates();
    const template = templates.find((t) => t.id === id);
    if (!template) {
      return reply.status(404).send({
        success: false,
        error: 'Prompt template not found',
      });
    }

    const { resultText, missingVariables } = substituteTemplateVariables(
      template.templateText,
      parsed.data.variables || {},
    );

    return reply.send({
      success: true,
      resultText,
      missingVariables,
      data: {
        templateId: id,
        resultText,
        missingVariables,
      },
    });
  };

  // Handler: POST template use (increment usage counter)
  const handleUseTemplate = async (request: any, reply: any) => {
    const { id } = request.params as { id: string };
    const updated = incrementTemplateUsage(id);
    if (!updated) {
      return reply.status(404).send({
        success: false,
        error: 'Prompt template not found',
      });
    }

    return reply.send({
      success: true,
      data: updated,
      template: updated,
      usageCount: updated.usageCount,
    });
  };

  const prefix = fastify.prefix ?? '';

  if (prefix === '/api/ai') {
    fastify.get('/templates', handleListTemplates);
    fastify.post('/templates', handleCreateTemplate);
    fastify.post('/templates/:id/substitute', handleSubstituteTemplate);
    fastify.post('/templates/:id/use', handleUseTemplate);
    return;
  }

  // If registered at root or custom prefix, support /api/ai/templates directly
  fastify.get('/api/ai/templates', handleListTemplates);
  fastify.post('/api/ai/templates', handleCreateTemplate);
  fastify.post('/api/ai/templates/:id/substitute', handleSubstituteTemplate);
  fastify.post('/api/ai/templates/:id/use', handleUseTemplate);

  fastify.get('/templates', handleListTemplates);
  fastify.post('/templates', handleCreateTemplate);
  fastify.post('/templates/:id/substitute', handleSubstituteTemplate);
  fastify.post('/templates/:id/use', handleUseTemplate);

  // ==========================================================================
  // Legacy /prompts Handlers (User-owned prompts)
  // ==========================================================================

  // GET /prompts - list (with optional search/category/favorites filters)
  fastify.get('/', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) throw parsed.error;
    const userId = getUserId(request);
    const data = await getService().list(userId, {
      search: parsed.data.search,
      category: parsed.data.category,
      favoritesOnly: parsed.data.favorites === 'true',
    });
    return reply.send({ success: true, data });
  });

  // GET /prompts/categories - distinct categories for the current user
  fastify.get('/categories', async (request, reply) => {
    const userId = getUserId(request);
    const data = await getService().getCategories(userId);
    return reply.send({ success: true, data });
  });

  // POST /prompts - create a new template
  fastify.post('/', async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = getUserId(request);
    const data = await getService().create(userId, parsed.data);
    return reply.status(201).send({ success: true, data });
  });

  // PUT /prompts/:id - update fields
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = getUserId(request);
    const data = await getService().update(request.params.id, userId, parsed.data);
    return reply.send({ success: true, data });
  });

  // POST /prompts/:id/favorite - toggle favorite
  fastify.post<{ Params: { id: string } }>('/:id/favorite', async (request, reply) => {
    const userId = getUserId(request);
    const data = await getService().toggleFavorite(request.params.id, userId);
    return reply.send({ success: true, data });
  });

  // POST /prompts/:id/use - record a usage (increments usageCount)
  fastify.post<{ Params: { id: string } }>('/:id/use', async (request, reply) => {
    const userId = getUserId(request);
    const data = await getService().recordUsage(request.params.id, userId);
    return reply.send({ success: true, data });
  });

  // DELETE /prompts/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = getUserId(request);
    await getService().delete(request.params.id, userId);
    return reply.send({ success: true });
  });
}
