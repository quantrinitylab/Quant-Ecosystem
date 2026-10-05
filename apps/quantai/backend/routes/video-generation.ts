// ============================================================================
// QuantAI — Fastify Routes: Vizion AI Video Generation & Camera Controls
// ============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  createVideoGenerationJob,
  processVideoJob,
  getVideoJobStatus,
  interpolatePromptFrames,
  validateCameraMotion,
  VALID_CAMERA_MOTIONS,
  VALID_ASPECT_RATIOS,
  CAMERA_MOTION_VECTORS,
  type VideoAspectRatio,
  type CameraMotion,
} from '../services/ai-video-generation.service';

const videoGenerateSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  negativePrompt: z.string().optional(),
  endFramePrompt: z.string().optional(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3']).optional().default('16:9'),
  durationSeconds: z.number().optional().default(5),
  motionStrength: z.number().min(1).max(10).optional().default(5),
  cameraMotion: z.string().optional().default('static'),
  seed: z.number().optional(),
  autoProcess: z.boolean().optional().default(false),
});

const interpolatePromptSchema = z.object({
  startPrompt: z.string().min(1, 'startPrompt is required'),
  endPrompt: z.string().min(1, 'endPrompt is required'),
  frameCount: z.number().int().min(1).max(300),
});

export default async function videoGenerationRoutes(fastify: FastifyInstance) {
  // POST /video/generate or /api/ai/video/generate
  const handleGenerate = async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = videoGenerateSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError(
        parseResult.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    const {
      prompt,
      negativePrompt,
      endFramePrompt,
      aspectRatio,
      durationSeconds,
      motionStrength,
      cameraMotion,
      seed,
      autoProcess,
    } = parseResult.data;

    if (!validateCameraMotion(cameraMotion)) {
      throw createAppError(
        `Invalid camera motion '${cameraMotion}'. Valid: ${VALID_CAMERA_MOTIONS.join(', ')}`,
        400,
        'INVALID_CAMERA_MOTION',
      );
    }

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
      let job = createVideoGenerationJob(userId, {
        prompt,
        negativePrompt,
        endFramePrompt,
        aspectRatio: aspectRatio as VideoAspectRatio,
        durationSeconds,
        motionStrength,
        cameraMotion: cameraMotion as CameraMotion,
        seed,
      });

      if (autoProcess) {
        job = await processVideoJob(job.id);
      }

      return reply.status(201).send({
        success: true,
        data: job,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw createAppError(error.message, 400, 'VIDEO_JOB_CREATION_FAILED');
    }
  };

  fastify.post('/video/generate', handleGenerate);
  fastify.post('/api/ai/video/generate', handleGenerate);

  // POST /video/jobs/:id/process or /api/ai/video/jobs/:id/process
  const handleProcessJob = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (!id) {
      throw createAppError('Job ID is required', 400, 'MISSING_JOB_ID');
    }

    // TODO(UNVERIFIED): job process is not user-scoped — the service API
    // visible in this file takes only an id (processVideoJob(id)). Verify
    // the service rejects jobs owned by other users, or add per-user
    // scoping here before exposing to clients.
    try {
      const job = await processVideoJob(id);
      return reply.send({
        success: true,
        data: job,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw createAppError(error.message, 404, 'VIDEO_JOB_PROCESS_FAILED');
    }
  };

  fastify.post('/video/jobs/:id/process', handleProcessJob);
  fastify.post('/api/ai/video/jobs/:id/process', handleProcessJob);

  // GET /video/jobs/:id or /api/ai/video/jobs/:id
  const handleGetJob = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    // TODO(UNVERIFIED): job read is not user-scoped — the service API
    // visible in this file takes only an id (getVideoJobStatus(id)). Verify
    // the service enforces job ownership, or add per-user scoping here.
    const job = getVideoJobStatus(id);
    if (!job) {
      throw createAppError(`Video job not found: ${id}`, 404, 'JOB_NOT_FOUND');
    }

    return reply.send({
      success: true,
      data: job,
    });
  };

  fastify.get('/video/jobs/:id', handleGetJob);
  fastify.get('/api/ai/video/jobs/:id', handleGetJob);

  // POST /video/interpolate or /api/ai/video/interpolate
  const handleInterpolate = async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = interpolatePromptSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError(
        parseResult.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    const { startPrompt, endPrompt, frameCount } = parseResult.data;
    const frames = interpolatePromptFrames(startPrompt, endPrompt, frameCount);

    return reply.send({
      success: true,
      data: {
        startPrompt,
        endPrompt,
        frameCount,
        frames,
      },
    });
  };

  fastify.post('/video/interpolate', handleInterpolate);
  fastify.post('/api/ai/video/interpolate', handleInterpolate);

  // GET /video/camera-motions or /api/ai/video/camera-motions
  const handleGetMotions = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      data: {
        cameraMotions: VALID_CAMERA_MOTIONS,
        motionVectors: CAMERA_MOTION_VECTORS,
        aspectRatios: VALID_ASPECT_RATIOS,
      },
    });
  };

  fastify.get('/video/camera-motions', handleGetMotions);
  fastify.get('/api/ai/video/camera-motions', handleGetMotions);
}
