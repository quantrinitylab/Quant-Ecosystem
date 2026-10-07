// ============================================================================
// QuantAI — Fastify Routes: 3-Step Guided Image Creation Wizard (Task W39-A06)
// ============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ImageWizardService } from '../services/image-wizard.service';

const synthesizeImagePromptSchema = z.object({
  idea: z.string().min(1, 'Idea is required').max(1500),
  style: z.string().optional(),
  mood: z.string().optional(),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3']).optional(),
  customKeywords: z.union([z.array(z.string()), z.string()]).optional(),
});

const getTemplatesQuerySchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
});

export default async function imageWizardRoutes(fastify: FastifyInstance) {
  function getService(): ImageWizardService {
    let service = (fastify as unknown as { imageWizardService?: ImageWizardService })
      .imageWizardService;
    if (!service) {
      service = new ImageWizardService();
      (fastify as unknown as { imageWizardService: ImageWizardService }).imageWizardService =
        service;
    }
    return service;
  }

  // GET /presets (or /image-wizard/presets when mounted at prefix)
  fastify.get('/presets', async (_request: FastifyRequest, reply: FastifyReply) => {
    const service = getService();
    const presets = service.getAllPresets();
    return reply.send({
      success: true,
      data: presets,
    });
  });

  // GET /templates
  fastify.get('/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    const service = getService();
    const parseResult = getTemplatesQuerySchema.safeParse(request.query);
    const { category, search } = parseResult.success
      ? parseResult.data
      : { category: undefined, search: undefined };
    const templates = service.getTemplates(category, search);
    return reply.send({
      success: true,
      data: templates,
      total: templates.length,
    });
  });

  // GET /templates/:id
  fastify.get(
    '/templates/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const service = getService();
      const template = service.getTemplateById(request.params.id);
      if (!template) {
        return reply.status(404).send({
          success: false,
          error: `Template not found: ${request.params.id}`,
        });
      }
      return reply.send({
        success: true,
        data: template,
      });
    },
  );

  // POST /synthesize (or /image-wizard/synthesize when mounted at prefix)
  fastify.post('/synthesize', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = synthesizeImagePromptSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const service = getService();
    const synthesized = service.synthesizePrompt(parseResult.data);

    return reply.send({
      success: true,
      data: synthesized,
    });
  });
}
