// ============================================================================
// QuantAI — Fastify Routes: Artifism v6.6.0 AI Image Inpainting & Mask Brush
// ============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  createInpaintingJob,
  processInpaintingJob,
  getInpaintingJobStatus,
  calculateMaskCoverage,
  type InpaintingJobParams,
  type MaskBoundingBox,
} from '../services/image-inpainting.service';

const maskBoundingBoxSchema = z.object({
  x: z.number().min(0, 'x must be >= 0'),
  y: z.number().min(0, 'y must be >= 0'),
  width: z.number().positive('width must be > 0'),
  height: z.number().positive('height must be > 0'),
  featherRadiusPx: z.number().optional(),
});

const inpaintingGenerateSchema = z.object({
  originalImageUrl: z.string().min(1, 'originalImageUrl is required'),
  maskBox: maskBoundingBoxSchema,
  prompt: z.string().min(1, 'Prompt is required'),
  negativePrompt: z.string().optional(),
  blendingStrength: z.number().optional(),
  seed: z.number().optional(),
  autoProcess: z.boolean().optional().default(false),
});

const maskCoverageSchema = z.object({
  box: maskBoundingBoxSchema,
  imageDimensions: z.object({
    width: z.number().positive('width must be > 0'),
    height: z.number().positive('height must be > 0'),
  }),
});

export default async function imageInpaintingRoutes(fastify: FastifyInstance) {
  // POST /image/inpaint or /api/ai/image/inpaint
  const handleCreateInpainting = async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = inpaintingGenerateSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError(
        parseResult.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    const {
      originalImageUrl,
      maskBox,
      prompt,
      negativePrompt,
      blendingStrength,
      seed,
      autoProcess,
    } = parseResult.data;

    // P0 fix: fail closed — only verified auth middleware identity is accepted.
    // Never trust client-supplied identity headers, never fall back to a default identity.
    const authUserId =
      (request as unknown as { auth?: { userId?: string } }).auth?.userId ??
      (request as unknown as { user?: { id?: string } }).user?.id;
    if (!authUserId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    const userId = authUserId;

    try {
      let job = createInpaintingJob(userId, {
        originalImageUrl,
        maskBox: maskBox as MaskBoundingBox,
        prompt,
        negativePrompt,
        blendingStrength,
        seed,
      });

      if (autoProcess) {
        job = await processInpaintingJob(job.id);
      }

      return reply.status(201).send({
        success: true,
        data: job,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw createAppError(error.message, 400, 'INPAINTING_JOB_CREATION_FAILED');
    }
  };

  fastify.post('/image/inpaint', handleCreateInpainting);
  fastify.post('/api/ai/image/inpaint', handleCreateInpainting);

  // POST /image/inpaint/jobs/:id/process
  const handleProcessInpainting = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const { id } = request.params;
    if (!id) {
      throw createAppError('Job ID is required', 400, 'MISSING_JOB_ID');
    }

    try {
      const job = await processInpaintingJob(id);
      return reply.send({
        success: true,
        data: job,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const statusCode = error.message.includes('not found') ? 404 : 500;
      throw createAppError(error.message, statusCode, 'INPAINTING_PROCESS_FAILED');
    }
  };

  fastify.post('/image/inpaint/jobs/:id/process', handleProcessInpainting);
  fastify.post('/api/ai/image/inpaint/jobs/:id/process', handleProcessInpainting);

  // GET /image/inpaint/jobs/:id
  const handleGetInpaintingStatus = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const { id } = request.params;
    const job = getInpaintingJobStatus(id);

    if (!job) {
      throw createAppError(`Inpainting job not found: ${id}`, 404, 'JOB_NOT_FOUND');
    }

    return reply.send({
      success: true,
      data: job,
    });
  };

  fastify.get('/image/inpaint/jobs/:id', handleGetInpaintingStatus);
  fastify.get('/api/ai/image/inpaint/jobs/:id', handleGetInpaintingStatus);

  // POST /image/inpaint/coverage
  const handleCalculateCoverage = async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = maskCoverageSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError(
        parseResult.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    const { box, imageDimensions } = parseResult.data;
    const coveragePercentage = calculateMaskCoverage(box as MaskBoundingBox, imageDimensions);

    return reply.send({
      success: true,
      data: {
        coveragePercentage,
      },
    });
  };

  fastify.post('/image/inpaint/coverage', handleCalculateCoverage);
  fastify.post('/api/ai/image/inpaint/coverage', handleCalculateCoverage);
}
