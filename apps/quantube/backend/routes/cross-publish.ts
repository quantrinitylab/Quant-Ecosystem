import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  PublishIntentService,
  PublishFanoutService,
  ContentLibraryService,
  SurfaceAdapter,
  AnalyticsAggregatorService,
  SurfaceSchema,
  ContentTypeSchema,
} from '@quant/cross-publish';
import type { CrossPublishJob, QueueAdapter } from '@quant/cross-publish';
import { createAppError } from '@quant/server-core';

// ============================================================================
// cross-publish seam — decorator service + routes (quantube, Stage 5, Task 13.1)
// ============================================================================
//
// Req 3.1, 3.2. Wires `@quant/cross-publish` into quantube AS-SHIPPED (no
// rewrite — Req 9.1). Composed once at boot into a decorated singleton
// (`fastify.crossPublish`, never per-request) bundling the real engine exports:
// `PublishIntentService`, `PublishFanoutService`, `ContentLibraryService`,
// `SurfaceAdapter` and `AnalyticsAggregatorService`. The fanout service requires
// an injected `QueueAdapter` (engine DI seam) — supplied here as a thin
// in-memory queue (seam infra, NOT engine logic). Persistence is the engines'
// own in-memory state (no new schema — Req 9.5).
//
// dependsOn ordering: cross-publish dependsOn `@quant/media`, honoured by
// decorating `media` BEFORE `crossPublish` in `buildApp()`.
//
// Routes sit behind the global `onRequest` auth hook (401 unauthenticated);
// mutating routes additionally declare a `cross-publish:write` scope (Req 7.4).
// The `/cross-publish` prefix does NOT collide with any PUBLIC_PATHS entry.
// Inputs are Zod-validated; responses use the `{ success, data }` envelope.

/** Thin in-memory `QueueAdapter` for `PublishFanoutService` (seam infra). */
export class InMemoryPublishQueue implements QueueAdapter {
  private counter = 0;
  readonly jobs: Array<{ id: string; name: string; payload: CrossPublishJob }> = [];
  async add(jobName: string, payload: CrossPublishJob): Promise<string> {
    const id = `cpjob_${Date.now()}_${++this.counter}`;
    this.jobs.push({ id, name: jobName, payload });
    return id;
  }
}

/**
 * The composite cross-publish engine service decorated onto the instance. Pure
 * composition of the engine's as-shipped exports.
 */
export interface CrossPublishService {
  intents: PublishIntentService;
  fanout: PublishFanoutService;
  library: ContentLibraryService;
  surfaces: SurfaceAdapter;
  analytics: AnalyticsAggregatorService;
  queue: InMemoryPublishQueue;
}

// Layer 2 type augmentation.
declare module 'fastify' {
  interface FastifyInstance {
    crossPublish: CrossPublishService;
  }
}

/**
 * Construct the cross-publish service bundle once at boot. The fanout service is
 * genuinely fed the `PublishIntentService` + the queue adapter (the real DI
 * edges). Called from quantube `buildApp()` via `app.decorate('crossPublish', ...)`.
 */
export function createCrossPublishService(): CrossPublishService {
  const intents = new PublishIntentService();
  const queue = new InMemoryPublishQueue();
  return {
    intents,
    fanout: new PublishFanoutService(intents, queue),
    library: new ContentLibraryService(),
    surfaces: new SurfaceAdapter(),
    analytics: new AnalyticsAggregatorService(),
    queue,
  };
}

// Body for POST /cross-publish/intents — userId comes from the JWT, never the body.
const createIntentSchema = z.object({
  contentId: z.string().min(1),
  contentType: ContentTypeSchema,
  title: z.string().min(1),
  description: z.string(),
  surfaces: z.array(SurfaceSchema).min(1),
  mediaUrl: z.string().url(),
  thumbnailUrl: z.string().url(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

const intentParamsSchema = z.object({ id: z.string().min(1) });

const storeContentSchema = z.object({
  contentType: ContentTypeSchema,
  title: z.string().min(1),
  description: z.string(),
  mediaUrl: z.string().min(1),
  thumbnailUrl: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export default async function crossPublishRoutes(fastify: FastifyInstance) {
  // --- publish intents (PublishIntentService) -------------------------------

  // POST /cross-publish/intents — create a publish intent for the caller.
  // Mutating → scoped.
  fastify.post(
    '/intents',
    { preHandler: fastify.requireAuth({ scopes: ['cross-publish:write'] }) },
    async (request, reply) => {
      const parsed = createIntentSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      const intent = fastify.crossPublish.intents.create({
        ...parsed.data,
        userId: request.auth.userId,
      });
      return reply.status(201).send({ success: true, data: { intent } });
    },
  );

  // GET /cross-publish/intents — list the caller's publish intents. Read.
  fastify.get('/intents', async (request, reply) => {
    const intents = fastify.crossPublish.intents.list(request.auth.userId);
    return reply.send({ success: true, data: { intents } });
  });

  // POST /cross-publish/intents/:id/fanout — fan a publish intent out across
  // its target surfaces (enqueues a job per surface). Mutating → scoped.
  fastify.post(
    '/intents/:id/fanout',
    { preHandler: fastify.requireAuth({ scopes: ['cross-publish:write'] }) },
    async (request, reply) => {
      const parsed = intentParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw parsed.error;
      }
      const intent = fastify.crossPublish.intents.getById(parsed.data.id);
      if (!intent || intent.userId !== request.auth.userId) {
        throw createAppError('Publish intent not found', 404, 'NOT_FOUND');
      }
      const jobIds = await fastify.crossPublish.fanout.fanOut(intent);
      return reply.send({ success: true, data: { jobIds, status: intent.status } });
    },
  );

  // GET /cross-publish/intents/:id/status — fanout status for an intent. Read.
  fastify.get('/intents/:id/status', async (request, reply) => {
    const parsed = intentParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      throw parsed.error;
    }
    const status = fastify.crossPublish.fanout.getStatus(parsed.data.id);
    if (!status) {
      throw createAppError('Publish intent not found', 404, 'NOT_FOUND');
    }
    return reply.send({ success: true, data: status });
  });

  // --- content library (ContentLibraryService) ------------------------------

  // GET /cross-publish/library — list the caller's stored content. Read.
  fastify.get('/library', async (request, reply) => {
    const items = fastify.crossPublish.library.list(request.auth.userId);
    return reply.send({ success: true, data: { items } });
  });

  // POST /cross-publish/library — store a reusable content item. Mutating → scoped.
  fastify.post(
    '/library',
    { preHandler: fastify.requireAuth({ scopes: ['cross-publish:write'] }) },
    async (request, reply) => {
      const parsed = storeContentSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      const item = fastify.crossPublish.library.storeContent(request.auth.userId, {
        contentType: parsed.data.contentType,
        title: parsed.data.title,
        description: parsed.data.description,
        mediaUrl: parsed.data.mediaUrl,
        thumbnailUrl: parsed.data.thumbnailUrl,
        metadata: parsed.data.metadata,
      });
      return reply.status(201).send({ success: true, data: { item } });
    },
  );
}
