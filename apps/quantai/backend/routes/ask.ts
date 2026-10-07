import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { UnifiedAIService } from '@quant/ai';
import {
  UserModelPreferenceService,
  DEFAULT_USER_MODEL,
} from '../services/user-model-preference.service';

const askBodySchema = z.object({
  question: z.string().min(1, 'Question is required'),
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
});

const setPreferenceSchema = z.object({
  model: z.string().min(1).max(120),
});

export default async function askRoutes(fastify: FastifyInstance) {
  const aiService = new UnifiedAIService();

  function prefService(): UserModelPreferenceService | null {
    const prisma = (fastify as unknown as { prisma?: unknown }).prisma;
    if (!prisma) return null;
    return new UserModelPreferenceService(prisma as never);
  }

  function requireUserId(request: unknown): string {
    const userId = (request as { auth?: { userId?: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    return userId;
  }

  // GET /ai/model-preference - the caller's stored default model (or null).
  fastify.get('/ai/model-preference', async (request, reply) => {
    const userId = requireUserId(request);
    const svc = prefService();
    const model = svc ? await svc.getPreference(userId) : null;
    return reply.send({ success: true, data: { model } });
  });

  // PUT /ai/model-preference - set the caller's default model.
  fastify.put('/ai/model-preference', async (request, reply) => {
    const parsed = setPreferenceSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request);
    const svc = prefService();
    if (!svc) {
      throw createAppError('Model preferences are not available', 503, 'SERVICE_UNAVAILABLE');
    }
    const model = await svc.setPreference(userId, parsed.data.model);
    return reply.send({ success: true, data: { model } });
  });

  // POST /api/ask - Single-shot Q&A
  fastify.post('/ask', async (request, reply) => {
    const parseResult = askBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError(
        parseResult.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    const userId = requireUserId(request);

    const { question, model, systemPrompt } = parseResult.data;

    // Per-user routing: request model wins, else the user's stored preference,
    // else the platform default. Falls back gracefully when the store is absent.
    const svc = prefService();
    const resolvedModel = svc
      ? (await svc.resolve(userId, model)).model
      : model?.trim() || DEFAULT_USER_MODEL;

    const response = await aiService.generateText(question, {
      model: resolvedModel,
      systemPrompt,
      userId,
    });

    return reply.send({
      success: true,
      data: {
        answer: response.content,
        model: response.model,
        usage: response.usage,
      },
    });
  });
}
