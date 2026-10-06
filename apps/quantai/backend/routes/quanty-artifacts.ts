// ============================================================================
// QuantAI — Fastify Routes: Quanty Artifacts library (Muse S6 parity)
// GET    /quanty/artifacts?tab=artifacts|media&sort=modified|opened|name&search=&page=&pageSize=
// POST   /quanty/artifacts  — save from chat/canvas
// GET    /quanty/artifacts/system — built-in system files (read-only list)
// GET    /quanty/artifacts/:id
// PATCH  /quanty/artifacts/:id/opened — record last-opened
// DELETE /quanty/artifacts/:id
// ============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  QuantyArtifactsService,
  type ArtifactKind,
} from '../services/quanty-artifacts.service';

const listQuerySchema = z.object({
  tab: z.enum(['artifacts', 'media']).optional(),
  sort: z.enum(['modified', 'opened', 'name']).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const createArtifactSchema = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(['artifact', 'media']).optional(),
  type: z.string().max(50).optional(),
  language: z.string().max(50).optional(),
  code: z.string().max(1_000_000).optional(),
  markdown: z.string().max(1_000_000).optional(),
  previewHtml: z.string().max(2_000_000).optional(),
  contentRef: z.string().max(500).optional(),
  systemFile: z.boolean().optional(),
});

const idParamsSchema = z.object({
  id: z.string().min(1),
});

function toTab(tab?: 'artifacts' | 'media'): ArtifactKind | undefined {
  // Query uses the plural tab label; storage uses singular kind.
  if (tab === 'media') return 'media';
  if (tab === 'artifacts') return 'artifact';
  return undefined;
}

export default async function quantyArtifactsRoutes(fastify: FastifyInstance) {
  function getService(): QuantyArtifactsService {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    return new QuantyArtifactsService(prisma as never);
  }

  function getUserId(request: unknown): string {
    const userId = (request as { auth?: { userId?: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    return userId;
  }

  // GET /quanty/artifacts/system — must be registered BEFORE /:id
  fastify.get('/system', async (request, reply) => {
    const userId = getUserId(request);
    const service = getService();
    const result = await service.listArtifacts(userId, {
      sort: 'name',
      pageSize: 100,
      systemOnly: true,
    });
    return reply.send({ success: true, data: result });
  });

  // GET /quanty/artifacts — list
  fastify.get('/', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw parsed.error;
    }
    const userId = getUserId(request);
    const service = getService();
    const { tab, sort, search, page, pageSize } = parsed.data;
    const result = await service.listArtifacts(userId, {
      tab: toTab(tab),
      sort,
      search,
      page,
      pageSize,
    });
    return reply.send({ success: true, data: result });
  });

  // POST /quanty/artifacts — create
  fastify.post('/', async (request, reply) => {
    const parsed = createArtifactSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const userId = getUserId(request);
    const service = getService();
    const artifact = await service.createArtifact(userId, parsed.data);
    return reply.status(201).send({ success: true, data: artifact });
  });

  // GET /quanty/artifacts/:id — detail
  fastify.get('/:id', async (request, reply) => {
    const parsed = idParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      throw parsed.error;
    }
    const userId = getUserId(request);
    const service = getService();
    const artifact = await service.getArtifact(userId, parsed.data.id);
    if (!artifact) {
      throw createAppError('Artifact not found', 404, 'NOT_FOUND');
    }
    return reply.send({ success: true, data: artifact });
  });

  // PATCH /quanty/artifacts/:id/opened — record last opened
  fastify.patch('/:id/opened', async (request, reply) => {
    const parsed = idParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      throw parsed.error;
    }
    const userId = getUserId(request);
    const service = getService();
    const artifact = await service.touchOpened(userId, parsed.data.id);
    if (!artifact) {
      throw createAppError('Artifact not found', 404, 'NOT_FOUND');
    }
    return reply.send({ success: true, data: artifact });
  });

  // DELETE /quanty/artifacts/:id
  fastify.delete('/:id', async (request, reply) => {
    const parsed = idParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      throw parsed.error;
    }
    const userId = getUserId(request);
    const service = getService();
    const ok = await service.deleteArtifact(userId, parsed.data.id);
    if (!ok) {
      throw createAppError('Artifact not found', 404, 'NOT_FOUND');
    }
    return reply.send({ success: true });
  });
}
