import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { BrandKitService } from '../services/brand-kit.service';

// ============================================================================
// QuantEdit brand-kit routes (mounted at /brand-kits).
//
//   GET    /brand-kits                       -> the caller's kits
//   POST   /brand-kits                       { name }
//   GET    /brand-kits/:id
//   PUT    /brand-kits/:id                   { name?, isDefault?, colors?, fonts?, logos? }
//   DELETE /brand-kits/:id
//   POST   /brand-kits/:id/apply             { elements }
//   POST   /brand-kits/:id/check-consistency { elements }
//
// All authenticated + strictly owner-scoped.
// ============================================================================

const colorsSchema = z
  .object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    background: z.string(),
    text: z.string(),
  })
  .partial();

const fontsSchema = z
  .object({ heading: z.string(), body: z.string(), accent: z.string() })
  .partial();

const logosSchema = z.array(z.object({ id: z.string(), url: z.string(), variant: z.string() }));

const createSchema = z.object({
  name: z.string().min(1).max(200),
  colors: colorsSchema.optional(),
  fonts: fontsSchema.optional(),
  logos: logosSchema.optional(),
});

const updateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    isDefault: z.boolean().optional(),
    colors: colorsSchema.optional(),
    fonts: fontsSchema.optional(),
    logos: logosSchema.optional(),
  })
  .strict();

const elementsSchema = z.object({
  elements: z.array(
    z.object({
      id: z.string(),
      type: z.string().optional(),
      style: z
        .object({ color: z.string().optional(), fontFamily: z.string().optional() })
        .optional(),
    }),
  ),
});

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function brandKitsRoutes(fastify: FastifyInstance) {
  const service = new BrandKitService((fastify as unknown as { prisma: never }).prisma);

  fastify.get('/', async (request, reply) => {
    const userId = requireUserId(request);
    return reply.send({ success: true, data: await service.listKits(userId) });
  });

  fastify.post('/', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const kit = await service.createKit(userId, parsed.data);
    return reply.status(201).send({ success: true, data: kit });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    return reply.send({ success: true, data: await service.getKit(userId, request.params.id) });
  });

  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const kit = await service.updateKit(userId, request.params.id, parsed.data);
    return reply.send({ success: true, data: kit });
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const result = await service.deleteKit(userId, request.params.id);
    return reply.send({ success: true, data: result });
  });

  fastify.post<{ Params: { id: string } }>('/:id/apply', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = elementsSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const kit = await service.getKit(userId, request.params.id);
    const result = service.applyToElements(kit, parsed.data.elements);
    return reply.send({ success: true, data: result });
  });

  fastify.post<{ Params: { id: string } }>('/:id/check-consistency', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = elementsSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const kit = await service.getKit(userId, request.params.id);
    const issues = service.checkConsistency(kit, parsed.data.elements);
    return reply.send({ success: true, data: issues });
  });
}
