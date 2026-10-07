import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { multiLLMRouterService, type SupportedEngine } from '../services/multi-llm-router.service';
import { embeddableChatbotService } from '../services/embeddable-chatbot.service';

const completeBodySchema = z.object({
  engine: z.enum(['openai', 'anthropic', 'gemini', 'deepseek', 'grok', 'quant-sovereign']),
  model: z.string().optional(),
  messages: z
    .array(
      z.object({
        role: z.string(),
        content: z.string(),
      }),
    )
    .min(1, 'At least one message is required'),
  stream: z.boolean().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export default async function engineRoutes(fastify: FastifyInstance) {
  // POST /api/ai/complete (and /complete when registered with prefix /api/ai)
  const handleComplete = async (request: any, reply: any) => {
    const parseResult = completeBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError(
        parseResult.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    const { engine, model, messages, stream, temperature } = parseResult.data;

    try {
      const result = await multiLLMRouterService.dispatchCompletion({
        engine: engine as SupportedEngine,
        model,
        messages,
        stream,
        temperature,
      });

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw createAppError(err.message, 500, 'ENGINE_DISPATCH_ERROR');
    }
  };

  fastify.post('/complete', handleComplete);
  fastify.post('/api/ai/complete', handleComplete);

  // GET /api/ai/embed/:botId/snippet (and /embed/:botId/snippet when registered with prefix /api/ai)
  const handleSnippet = async (request: any, reply: any) => {
    const { botId } = request.params as { botId: string };
    const query = (request.query || {}) as {
      theme?: 'light' | 'dark';
      primaryColor?: string;
      position?: 'bottom-right' | 'bottom-left';
      origin?: string;
    };

    if (query.origin) {
      const isAllowed = embeddableChatbotService.verifyEmbedOrigin(botId, query.origin);
      if (!isAllowed) {
        throw createAppError(
          'Origin not authorized to embed this chatbot',
          403,
          'FORBIDDEN_ORIGIN',
        );
      }
    }

    const snippet = embeddableChatbotService.generateEmbedSnippet(botId, {
      theme: query.theme,
      primaryColor: query.primaryColor,
      position: query.position,
    });

    return reply.send({
      success: true,
      data: {
        botId,
        snippet,
      },
    });
  };

  fastify.get('/embed/:botId/snippet', handleSnippet);
  fastify.get('/api/ai/embed/:botId/snippet', handleSnippet);
}
