import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { RecordingService } from '../services/recording.service';
import { StorageClient } from '@quant/storage';

const startRecordingSchema = z.object({
  userId: z.string().min(1),
});

const roomIdParamSchema = z.object({
  roomId: z.string().min(1),
});

const idParamSchema = z.object({
  id: z.string().min(1),
});

export default async function recordingsRoutes(fastify: FastifyInstance) {
  const storage = new StorageClient({
    endpoint: process.env['STORAGE_ENDPOINT'] ?? 'http://localhost:9000',
    region: process.env['STORAGE_REGION'] ?? 'us-east-1',
    bucket: process.env['STORAGE_BUCKET'] ?? 'quant-recordings',
    accessKeyId: process.env['STORAGE_ACCESS_KEY_ID'] ?? 'minioadmin',
    secretAccessKey: process.env['STORAGE_SECRET_ACCESS_KEY'] ?? 'minioadmin',
    forcePathStyle: true,
  });
  const recordingService = new RecordingService(storage);

  fastify.post<{ Params: { roomId: string } }>('/:roomId/start', async (request, reply) => {
    const paramResult = roomIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw createAppError('Invalid room ID', 400, 'VALIDATION_ERROR');
    }

    const bodyResult = startRecordingSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw createAppError('Invalid recording data', 400, 'VALIDATION_ERROR');
    }

    const recording = recordingService.startRecording(
      paramResult.data.roomId,
      bodyResult.data.userId,
    );
    return reply.status(201).send({ success: true, data: recording });
  });

  fastify.post<{ Params: { id: string } }>('/:id/stop', async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw createAppError('Invalid recording ID', 400, 'VALIDATION_ERROR');
    }

    const recording = recordingService.stopRecording(paramResult.data.id);
    return reply.send({ success: true, data: recording });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw createAppError('Invalid recording ID', 400, 'VALIDATION_ERROR');
    }

    const recording = recordingService.getRecording(paramResult.data.id);
    return reply.send({ success: true, data: recording });
  });

  fastify.get<{ Params: { roomId: string } }>('/room/:roomId', async (request, reply) => {
    const paramResult = roomIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      throw createAppError('Invalid room ID', 400, 'VALIDATION_ERROR');
    }

    const recordings = recordingService.listRecordings(paramResult.data.roomId);
    return reply.send({ success: true, data: recordings });
  });
}
