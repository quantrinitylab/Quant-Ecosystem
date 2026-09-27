import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  initiateChunkedUpload,
  uploadChunk,
  getUploadSessionStatus,
  completeChunkedUpload,
  cancelChunkedUpload,
} from '../services/chunked-upload.service';

const InitChunkedUploadSchema = z.object({
  fileName: z.string().min(1, 'fileName is required'),
  fileSize: z.number().int().nonnegative('fileSize must be non-negative'),
  mimeType: z.string().min(1, 'mimeType is required'),
  chunkSize: z.number().int().positive().optional(),
  workspaceId: z.string().optional(),
});

const UploadChunkPartSchema = z.object({
  uploadId: z.string().min(1, 'uploadId is required'),
  chunkIndex: z.number().int().nonnegative('chunkIndex must be non-negative'),
  chunkData: z.union([z.string(), z.instanceof(Buffer), z.any()]),
});

const UploadIdParamSchema = z.object({
  uploadId: z.string().min(1, 'uploadId is required'),
});

function handleServiceError(error: unknown, reply: FastifyReply) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('UPLOAD_SESSION_NOT_FOUND')) {
    return reply.code(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message,
      },
    });
  }
  if (message.includes('INVALID_CHUNK_INDEX') || message.includes('INCOMPLETE_CHUNKS')) {
    return reply.code(400).send({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message,
      },
    });
  }
  if (message.includes('UPLOAD_ALREADY_COMPLETED')) {
    return reply.code(409).send({
      success: false,
      error: {
        code: 'CONFLICT',
        message,
      },
    });
  }
  return reply.code(500).send({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message,
    },
  });
}

export const chunkedUploadRoutes: FastifyPluginAsync = async (app) => {
  const prefixes = ['/api/drive/chunked', '/drive/chunked'];

  for (const prefix of prefixes) {
    /**
     * POST /api/drive/chunked/init
     * Body: { fileName, fileSize, mimeType, chunkSize?, workspaceId? }
     */
    app.post(`${prefix}/init`, async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = InitChunkedUploadSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input schema for chunked upload initialization',
            details: parsed.error.issues,
          },
        });
      }

      const workspaceId =
        parsed.data.workspaceId ||
        (request.headers['x-workspace-id'] as string) ||
        (request as any).user?.workspaceId ||
        (request as any).user?.id ||
        'default-workspace';

      try {
        const session = initiateChunkedUpload(workspaceId, {
          fileName: parsed.data.fileName,
          fileSize: parsed.data.fileSize,
          mimeType: parsed.data.mimeType,
          chunkSize: parsed.data.chunkSize,
        });

        return reply.code(201).send({
          success: true,
          data: session,
        });
      } catch (err) {
        return handleServiceError(err, reply);
      }
    });

    /**
     * POST /api/drive/chunked/part
     * Body: { uploadId, chunkIndex, chunkData }
     */
    app.post(`${prefix}/part`, async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = UploadChunkPartSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid chunk part upload payload',
            details: parsed.error.issues,
          },
        });
      }

      try {
        const result = uploadChunk(
          parsed.data.uploadId,
          parsed.data.chunkIndex,
          parsed.data.chunkData,
        );

        return reply.send({
          success: true,
          data: result,
        });
      } catch (err) {
        return handleServiceError(err, reply);
      }
    });

    /**
     * GET /api/drive/chunked/:uploadId/status
     * Returns session status & missing chunks.
     */
    app.get(
      `${prefix}/:uploadId/status`,
      async (request: FastifyRequest<{ Params: { uploadId: string } }>, reply: FastifyReply) => {
        const parsed = UploadIdParamSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Missing or invalid uploadId',
            },
          });
        }

        try {
          const status = getUploadSessionStatus(parsed.data.uploadId);
          return reply.send({
            success: true,
            data: status,
          });
        } catch (err) {
          return handleServiceError(err, reply);
        }
      },
    );

    /**
     * POST /api/drive/chunked/:uploadId/complete
     * Finalizes assembly and marks session completed.
     */
    app.post(
      `${prefix}/:uploadId/complete`,
      async (request: FastifyRequest<{ Params: { uploadId: string } }>, reply: FastifyReply) => {
        const parsed = UploadIdParamSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Missing or invalid uploadId',
            },
          });
        }

        try {
          const result = completeChunkedUpload(parsed.data.uploadId);
          return reply.send({
            success: true,
            data: result,
          });
        } catch (err) {
          return handleServiceError(err, reply);
        }
      },
    );

    /**
     * DELETE /api/drive/chunked/:uploadId
     * Cancels upload and purges session data.
     */
    app.delete(
      `${prefix}/:uploadId`,
      async (request: FastifyRequest<{ Params: { uploadId: string } }>, reply: FastifyReply) => {
        const parsed = UploadIdParamSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Missing or invalid uploadId',
            },
          });
        }

        const cancelled = cancelChunkedUpload(parsed.data.uploadId);
        if (!cancelled) {
          return reply.code(404).send({
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Upload session not found',
            },
          });
        }

        return reply.send({
          success: true,
          message: 'Upload session cancelled and removed',
        });
      },
    );
  }
};

export default chunkedUploadRoutes;
