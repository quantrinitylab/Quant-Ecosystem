// ============================================================================
// QuantAI — Fastify Routes: FluxGPT Prompt Enhancement & LoRA Style Presets
// ============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  listLoraStyles,
  getLoraStyle,
  enhancePrompt,
  computeDimensions,
  type LoraStyleId,
} from '../services/flux-styles.service';

const enhancePromptSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  styleId: z.string().optional(),
  aspectRatio: z.string().optional(),
  creativity: z.number().min(0).max(1).optional(),
});

export default async function fluxStylesRoutes(fastify: FastifyInstance) {
  // GET /flux/styles or /api/ai/flux/styles
  const handleListStyles = async (_request: FastifyRequest, reply: FastifyReply) => {
    const styles = listLoraStyles();
    return reply.status(200).send({
      success: true,
      count: styles.length,
      styles,
    });
  };

  // GET /flux/styles/:id or /api/ai/flux/styles/:id
  const handleGetStyle = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const { id } = request.params;
    const style = getLoraStyle(id as LoraStyleId);
    if (!style) {
      throw createAppError(`Style preset '${id}' not found`, 404, 'STYLE_NOT_FOUND');
    }
    return reply.status(200).send({
      success: true,
      style,
    });
  };

  // POST /flux/enhance or /api/ai/flux/enhance
  const handleEnhancePrompt = async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = enhancePromptSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError(
        parseResult.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    const { prompt, styleId, aspectRatio, creativity } = parseResult.data;
    const result = enhancePrompt(prompt, {
      styleId: styleId as LoraStyleId,
      aspectRatio,
      creativity,
    });

    return reply.status(200).send({
      success: true,
      result,
    });
  };

  // GET /flux/dimensions or /api/ai/flux/dimensions?aspectRatio=16:9
  const handleComputeDimensions = async (
    request: FastifyRequest<{ Querystring: { aspectRatio?: string } }>,
    reply: FastifyReply,
  ) => {
    const aspectRatio = request.query.aspectRatio || '1:1';
    const dimensions = computeDimensions(aspectRatio);

    return reply.status(200).send({
      success: true,
      aspectRatio,
      ...dimensions,
    });
  };

  // Register on both route prefixes
  fastify.get('/flux/styles', handleListStyles);
  fastify.get('/flux/styles/:id', handleGetStyle);
  fastify.post('/flux/enhance', handleEnhancePrompt);
  fastify.get('/flux/dimensions', handleComputeDimensions);
}
