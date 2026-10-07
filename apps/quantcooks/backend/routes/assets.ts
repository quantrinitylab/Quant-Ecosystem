import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { AssetService } from '../services/asset.service';

const uploadAssetSchema = z.object({
  projectId: z.string(),
  filename: z.string().min(1),
  type: z.string().min(1),
  size: z.number().positive(),
});

const generateUrlSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
});

// Singleton asset service (in-memory)
const assetService = new AssetService();

export default async function assetsRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const parseResult = uploadAssetSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const asset = await assetService.uploadAsset(parseResult.data);

    return reply.status(201).send({ success: true, data: asset });
  });

  fastify.get('/project/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const assets = await assetService.listAssets(projectId);

    return reply.send({ success: true, data: assets });
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    await assetService.deleteAsset(request.params.id);

    return reply.send({ success: true });
  });

  fastify.post('/upload-url', async (request, reply) => {
    const parseResult = generateUrlSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await assetService.generateUploadUrl(
      userId,
      parseResult.data.filename,
      parseResult.data.contentType,
    );

    return reply.send({ success: true, data: result });
  });
}
