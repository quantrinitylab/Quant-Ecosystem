import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { LayerService, LAYER_TYPES } from '../services/layer.service';

// ============================================================================
// QuantEdits layer routes (mounted at /projects, beside the project routes).
//
//   GET    /projects/:id/layers
//   POST   /projects/:id/layers                       { name, type, content? }
//   PUT    /projects/:id/layers/:layerId
//   DELETE /projects/:id/layers/:layerId              (owner only)
//   POST   /projects/:id/layers/:layerId/duplicate    (owner only)
//   PUT    /projects/:id/layers/reorder               { layerIds: string[] }
//
// All authenticated. Before P0-2 the Next proxies for these paths forwarded
// to a backend with zero layer routes (every call 404'd); persistence is the
// Prisma-backed LayerService over the EditLayer model P0-1 added.
// ============================================================================

const layerTypeSchema = z.enum(LAYER_TYPES);

const createLayerSchema = z.object({
  name: z.string().min(1).max(200),
  type: layerTypeSchema,
  content: z.unknown().optional(),
  order: z.number().int().min(0).optional(),
  visible: z.boolean().optional(),
  opacity: z.number().min(0).max(1).optional(),
  startTime: z.number().min(0).optional(),
  endTime: z.number().min(0).optional(),
  parentId: z.string().nullable().optional(),
});

const updateLayerSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    type: layerTypeSchema.optional(),
    order: z.number().int().min(0).optional(),
    visible: z.boolean().optional(),
    locked: z.boolean().optional(),
    opacity: z.number().min(0).max(1).optional(),
    blendMode: z.string().min(1).max(50).optional(),
    startTime: z.number().min(0).optional(),
    endTime: z.number().min(0).optional(),
    content: z.unknown().optional(),
    transform: z.unknown().optional(),
    effects: z.unknown().optional(),
    keyframes: z.unknown().optional(),
    parentId: z.string().nullable().optional(),
  })
  .strict();

const reorderSchema = z.object({
  layerIds: z.array(z.string().min(1)).min(1),
});

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function layersRoutes(fastify: FastifyInstance) {
  const service = new LayerService((fastify as unknown as { prisma: never }).prisma);

  fastify.get<{ Params: { id: string } }>('/:id/layers', async (request, reply) => {
    requireUserId(request);
    const layers = await service.listLayers(request.params.id);
    return reply.send({ success: true, data: layers });
  });

  fastify.post<{ Params: { id: string } }>('/:id/layers', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = createLayerSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;

    const layer = await service.createLayer(request.params.id, userId, parsed.data);
    return reply.status(201).send({ success: true, data: layer });
  });

  fastify.put<{ Params: { id: string } }>('/:id/layers/reorder', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = reorderSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;

    const layers = await service.reorderLayers(request.params.id, userId, parsed.data.layerIds);
    return reply.send({ success: true, data: layers });
  });

  fastify.put<{ Params: { id: string; layerId: string } }>(
    '/:id/layers/:layerId',
    async (request, reply) => {
      const userId = requireUserId(request);
      const parsed = updateLayerSchema.safeParse(request.body);
      if (!parsed.success) throw parsed.error;

      const layer = await service.updateLayer(
        request.params.id,
        request.params.layerId,
        userId,
        parsed.data,
      );
      return reply.send({ success: true, data: layer });
    },
  );

  fastify.delete<{ Params: { id: string; layerId: string } }>(
    '/:id/layers/:layerId',
    async (request, reply) => {
      const userId = requireUserId(request);
      const layer = await service.deleteLayer(request.params.id, request.params.layerId, userId);
      return reply.send({ success: true, data: layer });
    },
  );

  fastify.post<{ Params: { id: string; layerId: string } }>(
    '/:id/layers/:layerId/duplicate',
    async (request, reply) => {
      const userId = requireUserId(request);
      const layer = await service.duplicateLayer(
        request.params.id,
        request.params.layerId,
        userId,
      );
      return reply.status(201).send({ success: true, data: layer });
    },
  );
}
