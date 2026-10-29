import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { CraftRenderService } from '../services/craft-render.service';
import { adaptCraftPrisma } from '../services/job-delegate-adapters';
import {
  CRAFT_RENDER_FORMATS,
  CRAFT_RENDER_QUALITIES,
  CRAFT_RENDER_RESOLUTIONS,
} from '../services/craft-render.service';
import type { StoragePort } from '../services/storage.adapter';
import {
  resolveEffectCraftBin,
  NodeEffectCraftRunner,
  renderTimeoutFromEnv,
  type EffectCraftRunner,
} from '../services/effectcraft.adapter';

// ============================================================================
// QuantCooks craft routes (mounted at /craft, C-2).
//
//   POST   /craft/effects/render        queue a companion render -> 201 QUEUED
//   GET    /craft/effects/renders/:id   job status (auth, owner)
//   GET    /craft/effects/renders       caller's jobs (auth; ?projectId=)
//
// Persistence is the Prisma-backed CraftRenderService over
// EditCraftRenderJob (CP-1 job kind CRAFT_RENDER); the CraftRenderProcessor
// (server.ts only, binary-gated) drives jobs to a terminal state and lands
// outputs as real P0-3 assets.
//
// Fail-closed configuration (CP-1 §8): when the companion binary is not
// configured (EFFECTCRAFT_BIN unset or not executable), creation refuses
// with 503 CRAFT_NOT_CONFIGURED naming the companion and NO job row is
// created. Reads of persisted jobs keep working (metadata reads).
//
// Injection seams mirror routes/exports.ts: a decorated `storagePort` wins
// over the lazily built real port; a decorated `effectCraftBin` (string |
// null) or `effectCraftRunner` wins over env resolution, so tests point the
// surface at a fake binary without touching process.env.
// ============================================================================

const createRenderSchema = z.object({
  projectId: z.string().min(1),
  ecproj: z.record(z.string(), z.unknown()),
  comp: z.string().min(1).optional(),
  format: z.enum(CRAFT_RENDER_FORMATS).optional(),
  resolution: z.enum(CRAFT_RENDER_RESOLUTIONS).optional(),
  quality: z.enum(CRAFT_RENDER_QUALITIES).optional(),
  startSec: z.number().nonnegative().optional(),
  endSec: z.number().positive().optional(),
});

// .ecproj documents embed whole layer trees (the spike's demo file is
// 732 KB); 10 MiB bounds a single create call without inviting abuse. The
// projects-state endpoint's 2 MiB precedent is too small for real projects.
const ECPROJ_BODY_LIMIT_BYTES = 10 * 1024 * 1024;

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function craftRoutes(fastify: FastifyInstance) {
  const decorated = fastify as unknown as {
    prisma: never;
    storagePort?: StoragePort | null;
    effectCraftBin?: string | null;
    effectCraftRunner?: EffectCraftRunner | null;
  };

  const storage: StoragePort | null =
    decorated.storagePort !== undefined
      ? decorated.storagePort
      : (await import('../services/storage.adapter')).buildStoragePort();

  const runner: EffectCraftRunner | null =
    decorated.effectCraftRunner !== undefined
      ? decorated.effectCraftRunner
      : decorated.effectCraftBin !== undefined
        ? decorated.effectCraftBin
          ? new NodeEffectCraftRunner(decorated.effectCraftBin, renderTimeoutFromEnv())
          : null
        : (() => {
            const bin = resolveEffectCraftBin();
            return bin ? new NodeEffectCraftRunner(bin, renderTimeoutFromEnv()) : null;
          })();

  // CP-1 fold-in: persistence on EditJob via the CRAFT_RENDER adapter
  // when the prisma carries an editJob delegate; test fakes pass through.
  const craftService = new CraftRenderService(adaptCraftPrisma(decorated.prisma), storage, runner);

  fastify.post('/effects/render', { bodyLimit: ECPROJ_BODY_LIMIT_BYTES }, async (request, reply) => {
    const userId = requireUserId(request);
    const parseResult = createRenderSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }
    const input = parseResult.data;
    if (input.startSec != null && input.endSec != null && input.endSec <= input.startSec) {
      throw createAppError('endSec must be greater than startSec', 400, 'VALIDATION_ERROR');
    }

    const job = await craftService.createRender({ ...input, userId });
    return reply.status(201).send({ success: true, data: job });
  });

  fastify.get<{ Params: { id: string } }>('/effects/renders/:id', async (request) => {
    const userId = requireUserId(request);
    const job = await craftService.getRender(request.params.id, userId);
    return { success: true, data: job };
  });

  fastify.get<{ Querystring: { projectId?: string } }>('/effects/renders', async (request) => {
    const userId = requireUserId(request);
    const jobs = await craftService.listRenders(userId, request.query.projectId || undefined);
    return { success: true, data: jobs };
  });
}
