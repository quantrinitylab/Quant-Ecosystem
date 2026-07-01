import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { AutoEditOrchestrator } from '../services/auto-edit-orchestrator.service';
import { AutoEditSchedulerService } from '../services/auto-edit-scheduler.service';

const runSchema = z.object({
  sourceRef: z.string().max(2048).optional(),
  templateId: z.string().max(200).optional(),
  caption: z.string().max(2000).optional(),
});

const prefSchema = z.object({
  enabled: z.boolean(),
  sourceRef: z.string().max(2048).optional(),
  templateId: z.string().max(200).optional(),
  caption: z.string().max(2000).optional(),
});

function userId(request: unknown): string {
  const id = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!id) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return id;
}

/**
 * QuantEdits auto-edit routes (mounted at /auto-edit). Wires the (previously
 * uncalled) AutoEditOrchestrator to an on-demand run endpoint + a daily
 * scheduler over opted-in users. Render/publish stay pluggable + fail-closed
 * (NullRenderer/NullPublisher) — real WASM-ffmpeg + live post are needs-staging.
 */
export default async function autoEditRoutes(fastify: FastifyInstance) {
  function prisma(): {
    autoEditPreference: {
      findUnique(a: { where: { userId: string } }): Promise<unknown>;
      findMany(a: { where?: Record<string, unknown> }): Promise<unknown[]>;
      upsert(a: {
        where: { userId: string };
        update: Record<string, unknown>;
        create: Record<string, unknown>;
      }): Promise<unknown>;
    };
  } {
    return (fastify as unknown as { prisma: never }).prisma;
  }

  function orchestrator(): AutoEditOrchestrator {
    return new AutoEditOrchestrator(prisma() as never);
  }

  // POST /auto-edit/run — run the pipeline now for the caller (idempotent/day).
  fastify.post('/run', async (request, reply) => {
    const parsed = runSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const data = await orchestrator().runDaily(userId(request), parsed.data);
    return reply.status(201).send({ success: true, data });
  });

  // GET /auto-edit/preference — the caller's opt-in.
  fastify.get('/preference', async (request, reply) => {
    const pref = await prisma().autoEditPreference.findUnique({
      where: { userId: userId(request) },
    });
    return reply.send({ success: true, data: pref ?? { enabled: false } });
  });

  // PUT /auto-edit/preference — set the caller's opt-in + defaults.
  fastify.put('/preference', async (request, reply) => {
    const parsed = prefSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const uid = userId(request);
    const fields = {
      enabled: parsed.data.enabled,
      sourceRef: parsed.data.sourceRef ?? null,
      templateId: parsed.data.templateId ?? null,
      caption: parsed.data.caption ?? null,
    };
    const pref = await prisma().autoEditPreference.upsert({
      where: { userId: uid },
      update: fields,
      create: { userId: uid, ...fields },
    });
    return reply.send({ success: true, data: pref });
  });

  // POST /auto-edit/scheduler/run — run the daily batch over opted-in users.
  // (Intended for an authenticated cron/ops caller.)
  fastify.post('/scheduler/run', async (request, reply) => {
    userId(request);
    const body = (request.body ?? {}) as { utcDay?: string };
    const scheduler = new AutoEditSchedulerService(prisma() as never, orchestrator());
    const data = await scheduler.runDaily(body.utcDay);
    return reply.send({ success: true, data });
  });
}
