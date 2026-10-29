import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { AssetService } from '../services/asset.service';
import type { StoragePort } from '../services/storage.adapter';

// ============================================================================
// QuantEdits asset routes (mounted at /assets).
//
//   GET    /assets?projectId=&category=&search=   caller's library (auth)
//   POST   /assets                                register metadata (auth)
//   GET    /assets/project/:projectId             per-project list (PUBLIC —
//                                                 intentional, see app.ts)
//   DELETE /assets/:id                            owner only (auth)
//   POST   /assets/upload-url                     upload step 1 (auth):
//                                                 create PENDING row + signed PUT
//   POST   /assets/:id/complete                   upload step 3 (auth):
//                                                 verify bytes landed → READY
//
// Persistence is the Prisma-backed AssetService over EditAsset (P0-3);
// bytes live in real object storage via the StoragePort adapter. The
// service used to be an in-memory singleton inventing URLs on a fabricated
// domain — both are gone.
// ============================================================================

const uploadAssetSchema = z.object({
  projectId: z.string(),
  filename: z.string().min(1),
  type: z.string().min(1),
  size: z.number().positive(),
});

const generateUrlSchema = z.object({
  projectId: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().positive(),
});

const listQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  search: z.string().max(200).optional(),
});

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function assetsRoutes(fastify: FastifyInstance) {
  // Storage port: an injected port wins (tests decorate fastify with a fake
  // or with null); production builds the real @quant/storage-backed port.
  // The adapter import is dynamic so test apps that inject a port never load
  // the storage SDK module graph.
  const injected = (fastify as unknown as { storagePort?: StoragePort | null }).storagePort;
  const storage: StoragePort | null =
    injected !== undefined ? injected : (await import('../services/storage.adapter')).buildStoragePort();

  const assetService = new AssetService(
    (fastify as unknown as { prisma: never }).prisma,
    storage,
  );

  // Global list (P0-2 route, P0-3 persistence). Authenticated: GET /assets
  // is intentionally NOT in app.ts publicPaths — it lists the caller's
  // library. Per-project listing stays at GET /project/:projectId.
  fastify.get('/', async (request, reply) => {
    const userId = requireUserId(request);
    const parseResult = listQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const assets = await assetService.listAllAssets(userId, parseResult.data);

    return reply.send({ success: true, data: assets });
  });

  fastify.post('/', async (request, reply) => {
    const userId = requireUserId(request);
    const parseResult = uploadAssetSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const asset = await assetService.uploadAsset({ userId, ...parseResult.data });

    return reply.status(201).send({ success: true, data: asset });
  });

  fastify.get('/project/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const assets = await assetService.listAssets(projectId);

    return reply.send({ success: true, data: assets });
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    await assetService.deleteAsset(request.params.id, userId);

    return reply.send({ success: true });
  });

  fastify.post('/upload-url', async (request, reply) => {
    const userId = requireUserId(request);
    const parseResult = generateUrlSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const result = await assetService.generateUploadUrl(userId, parseResult.data);

    return reply.send({ success: true, data: result });
  });

  fastify.post<{ Params: { id: string } }>('/:id/complete', async (request, reply) => {
    const userId = requireUserId(request);
    const asset = await assetService.completeUpload(request.params.id, userId);

    return reply.send({ success: true, data: asset });
  });
}
