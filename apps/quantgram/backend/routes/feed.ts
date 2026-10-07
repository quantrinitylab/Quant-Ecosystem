import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AlgorithmType } from '@quant/ranking';
import type { FeedItem } from '@quant/ranking';
import type { FeedEngineBundle } from '../lib/feed-engines';

// ============================================================================
// feed seam routes — quantneon (per-app lane, Stage 4)
// ============================================================================
//
// Task 12.2 (Req 3.1, 3.5, 9.1). Surfaces quantneon's feed over authenticated
// HTTP under `/feed`, powered by the FIVE real, as-shipped feed engines composed
// in `lib/feed-engines.ts` and decorated as `fastify.feed` in `buildApp()`:
//   - @quant/recommendations  → retrieval/ranking pipeline (GET /feed/recommendations, composed /feed)
//   - @quant/ranking          → algorithm registry + anti-rage + FeedService (GET /feed, PUT /feed/algorithm)
//   - @quant/ml-pipeline      → model registry + inference engine (POST /feed/models, GET /feed/models, POST /feed/score)
//   - @quant/ml-runtime       → ONNX ModelLoader cache (GET /feed/runtime/*)
//   - @quant/triton-client    → Triton model registry (POST/GET /feed/triton/models)
//
// Several engines wrap `@simulated` / external inference cores; per Req 9.1 they
// are wired AS-IS and are NOT de-simulated. The global `onRequest` auth hook
// from `createApp()` protects every route (401 unauthenticated); mutating routes
// additionally declare a `feed:write` scope. Inputs are Zod-validated and every
// response uses the canonical `{ success, data }` envelope.

// Layer 2 type augmentation: expose the decorated feed bundle on the instance.
declare module 'fastify' {
  interface FastifyInstance {
    feed: FeedEngineBundle;
  }
}

const feedItemSchema = z.object({
  id: z.string().min(1),
  content: z.string().default(''),
  authorId: z.string().min(1),
  timestamp: z
    .number()
    .int()
    .nonnegative()
    .default(() => Date.now()),
  metadata: z.record(z.unknown()).default({}),
  upvotes: z.number().int().nonnegative().default(0),
  shares: z.number().int().nonnegative().default(0),
  replies: z.number().int().nonnegative().default(0),
  replyQuality: z.number().min(0).max(1).default(0),
  authorReputation: z.number().min(0).max(1).default(0),
});

const candidatesBodySchema = z.object({
  feedId: z.string().min(1),
  items: z.array(feedItemSchema).min(1),
  replace: z.boolean().optional().default(false),
});

const feedQuerySchema = z.object({
  feedId: z.string().min(1),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const recommendationsQuerySchema = z.object({
  feedId: z.string().min(1),
  k: z.coerce.number().int().min(1).max(200).optional(),
});

const switchAlgorithmSchema = z.object({
  feedId: z.string().min(1),
  algorithm: z.nativeEnum(AlgorithmType),
  customPluginId: z.string().optional(),
});

const registerModelSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  framework: z
    .enum(['linear', 'logistic', 'tree', 'ensemble', 'neural', 'custom'])
    .default('custom'),
  metrics: z.record(z.number()).default({}),
});

const scoreSchema = z.object({
  inputId: z.string().min(1),
  features: z.array(z.number()).min(1),
});

const tritonModelSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  platform: z.string().min(1).default('onnxruntime_onnx'),
  inputs: z.array(z.unknown()).default([]),
  outputs: z.array(z.unknown()).default([]),
});

export default async function feedRoutes(fastify: FastifyInstance) {
  // --- candidate ingestion --------------------------------------------------

  // POST /feed/candidates — seed/extend a feed's candidate pool. Mutating → scoped.
  fastify.post(
    '/candidates',
    { preHandler: fastify.requireAuth({ scopes: ['feed:write'] }) },
    async (request, reply) => {
      const parsed = candidatesBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      const items = parsed.data.items as FeedItem[];
      if (parsed.data.replace) {
        fastify.feed.candidates.replace(parsed.data.feedId, items);
      } else {
        fastify.feed.candidates.add(parsed.data.feedId, items);
      }
      return reply.status(201).send({
        success: true,
        data: {
          feedId: parsed.data.feedId,
          poolSize: fastify.feed.candidates.get(parsed.data.feedId).length,
        },
      });
    },
  );

  // --- composed feed: recommendations → ranking -----------------------------

  // GET /feed — the composed feed (recommendations retrieval → ranking algorithm
  // + anti-rage), paginated. Read; global auth hook only.
  fastify.get('/', async (request, reply) => {
    const parsed = feedQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw parsed.error;
    }
    const { feedId, page, pageSize } = parsed.data;
    const result = fastify.feed.getComposedFeed(request.auth.userId, feedId, page, pageSize);
    return reply.send({ success: true, data: result });
  });

  // GET /feed/recommendations — raw recommendation pipeline output for a feed.
  fastify.get('/recommendations', async (request, reply) => {
    const parsed = recommendationsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw parsed.error;
    }
    const candidates = fastify.feed.recommend(
      request.auth.userId,
      parsed.data.feedId,
      parsed.data.k,
    );
    return reply.send({ success: true, data: { candidates } });
  });

  // PUT /feed/algorithm — switch the caller's ranking algorithm for a feed.
  // Mutating → scoped.
  fastify.put(
    '/algorithm',
    { preHandler: fastify.requireAuth({ scopes: ['feed:write'] }) },
    async (request, reply) => {
      const parsed = switchAlgorithmSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      fastify.feed.ranking.preferences.setPreference(
        request.auth.userId,
        parsed.data.feedId,
        parsed.data.algorithm,
        parsed.data.customPluginId,
      );
      return reply.send({ success: true, data: parsed.data });
    },
  );

  // --- ml-pipeline: model registry + inference ------------------------------

  // GET /feed/models — list registered ranking models (ml-pipeline registry).
  fastify.get('/models', async (_request, reply) => {
    return reply.send({
      success: true,
      data: { models: fastify.feed.mlPipeline.models.listModels() },
    });
  });

  // POST /feed/models — register a ranking model. Mutating → scoped.
  fastify.post(
    '/models',
    { preHandler: fastify.requireAuth({ scopes: ['feed:write'] }) },
    async (request, reply) => {
      const parsed = registerModelSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      const metadata = fastify.feed.mlPipeline.models.registerModel(
        parsed.data.name,
        parsed.data.version,
        parsed.data.framework,
        parsed.data.metrics,
      );
      return reply.status(201).send({ success: true, data: { model: metadata } });
    },
  );

  // POST /feed/score — score features through the ml-pipeline inference engine
  // (in-memory forward pass over the boot-loaded model). Mutating → scoped.
  fastify.post(
    '/score',
    { preHandler: fastify.requireAuth({ scopes: ['feed:write'] }) },
    async (request, reply) => {
      const parsed = scoreSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      const result = fastify.feed.mlPipeline.inference.infer({
        inputId: parsed.data.inputId,
        features: parsed.data.features,
        modelName: 'feed-ranker',
        modelVersion: '1.0.0',
        timestamp: Date.now(),
      });
      return reply.send({ success: true, data: { result } });
    },
  );

  // --- ml-runtime: ONNX model loader cache ----------------------------------

  // GET /feed/runtime/cache — ONNX model cache stats (ml-runtime ModelLoader).
  fastify.get('/runtime/cache', async (_request, reply) => {
    return reply.send({
      success: true,
      data: { cache: fastify.feed.mlRuntime.loader.getCacheStats() },
    });
  });

  // GET /feed/runtime/models — cached ONNX model manifests (ml-runtime).
  fastify.get('/runtime/models', async (_request, reply) => {
    return reply.send({
      success: true,
      data: { models: fastify.feed.mlRuntime.loader.listModels() },
    });
  });

  // --- triton-client: model registry ----------------------------------------

  // GET /feed/triton/models — list models registered with the Triton client.
  fastify.get('/triton/models', async (_request, reply) => {
    return reply.send({
      success: true,
      data: { models: fastify.feed.triton.registry.listModels() },
    });
  });

  // POST /feed/triton/models — register a Triton-served model. Mutating → scoped.
  fastify.post(
    '/triton/models',
    { preHandler: fastify.requireAuth({ scopes: ['feed:write'] }) },
    async (request, reply) => {
      const parsed = tritonModelSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      fastify.feed.triton.registry.registerModel({
        name: parsed.data.name,
        version: parsed.data.version,
        platform: parsed.data.platform,
        inputs: parsed.data.inputs as never[],
        outputs: parsed.data.outputs as never[],
      });
      return reply.status(201).send({
        success: true,
        data: {
          model: fastify.feed.triton.registry.getModel(parsed.data.name, parsed.data.version),
        },
      });
    },
  );
}
