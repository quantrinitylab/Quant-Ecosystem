/**
 * QuantDrive Delta Sync Routes
 *
 * Endpoints for 64KB FastCDC chunk verification, uploads, and manifest commits.
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { DriveSyncService } from '../services/drive-sync.service.js';

const CheckChunksSchema = z.object({
  hashes: z
    .array(z.string().regex(/^[0-9a-f]{64}$/i))
    .min(1)
    .max(50000),
});

const UploadChunkSchema = z.object({
  hash: z.string().regex(/^[0-9a-f]{64}$/i),
  dataBase64: z.string().min(1),
});

const ManifestChunkRefSchema = z.object({
  hash: z.string().regex(/^[0-9a-f]{64}$/i),
  offset: z.number().int().nonnegative(),
  length: z.number().int().positive(),
});

const CommitManifestSchema = z.object({
  fileId: z.string().min(1),
  fileName: z.string().min(1),
  totalSize: z.number().int().nonnegative(),
  chunks: z.array(ManifestChunkRefSchema).min(1),
});

export const driveSyncRoutes: FastifyPluginAsync = async (app) => {
  const syncService = new DriveSyncService();

  /**
   * POST /drive/sync/check-chunks
   * Accepts list of candidate chunk hashes, returns only missing hashes.
   */
  app.post('/drive/sync/check-chunks', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = CheckChunksSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid chunk hashes provided',
          details: parsed.error.issues,
        },
      });
    }

    const res = await syncService.checkChunks(parsed.data.hashes);
    return reply.send({
      success: true,
      data: res,
    });
  });

  /**
   * POST /drive/sync/upload-chunk
   * Uploads a single chunk in base64.
   */
  app.post('/drive/sync/upload-chunk', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = UploadChunkSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'INVALID_CHUNK',
          message: 'Invalid chunk data provided',
          details: parsed.error.issues,
        },
      });
    }

    const buffer = Buffer.from(parsed.data.dataBase64, 'base64');
    const res = await syncService.uploadChunk(new Uint8Array(buffer));

    if (res.hash !== parsed.data.hash) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'HASH_MISMATCH',
          message: `Computed hash ${res.hash} does not match claimed hash ${parsed.data.hash}`,
        },
      });
    }

    return reply.send({
      success: true,
      data: res,
    });
  });

  /**
   * POST /drive/sync/commit-manifest
   * Commits the file manifest and verifies that all referenced chunks exist.
   */
  app.post('/drive/sync/commit-manifest', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = CommitManifestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'INVALID_MANIFEST',
          message: 'Invalid manifest schema',
          details: parsed.error.issues,
        },
      });
    }

    const userId = (request as any).user?.id || 'anonymous_user';
    const manifest = {
      ...parsed.data,
      createdAt: Date.now(),
    };

    const res = await syncService.commitManifest(manifest, userId);

    if (!res.success) {
      return reply.code(409).send({
        success: false,
        error: {
          code: 'CHUNKS_MISSING',
          message: 'Cannot commit manifest: one or more chunks have not been uploaded',
          missingChunks: res.missingChunks,
        },
      });
    }

    return reply.send({
      success: true,
      data: res,
    });
  });

  /**
   * GET /drive/sync/manifest/:fileId
   * Retrieves committed file manifest.
   */
  app.get(
    '/drive/sync/manifest/:fileId',
    async (request: FastifyRequest<{ Params: { fileId: string } }>, reply: FastifyReply) => {
      const { fileId } = request.params;
      const manifest = syncService.getManifest(fileId);

      if (!manifest) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Manifest for file ${fileId} not found`,
          },
        });
      }

      return reply.send({
        success: true,
        data: manifest,
      });
    },
  );
};
