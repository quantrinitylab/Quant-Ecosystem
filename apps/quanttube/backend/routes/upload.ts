import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { transcodeQueue } from '../services/transcode-queue';

const uploadVideoSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  visibility: z.enum(['PUBLIC', 'UNLISTED', 'PRIVATE']).optional(),
  tags: z.array(z.string()).optional(),
});

export default async function uploadRoutes(fastify: FastifyInstance) {
  fastify.post('/videos', async (request, reply) => {
    const parseResult = uploadVideoSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { title, description, visibility, tags } = parseResult.data;

    const videoId = 'video_' + Date.now();
    const filePath = '/tmp/' + videoId; // TODO: Get from multipart upload

    // Add to transcoding queue
    const jobId = transcodeQueue.addJob(videoId, filePath);

    return reply.send({
      success: true,
      videoId,
      jobId,
      title,
      status: 'queued',
      message: 'Video added to transcoding queue',
    });
  });
}
