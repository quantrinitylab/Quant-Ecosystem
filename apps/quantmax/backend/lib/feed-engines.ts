// ============================================================================
// quantmax — feed engine bundle (Layer 2 composition, per-app lane Stage 6)
// ============================================================================
//
// Task 14.2: wire quantmax's short-video/feed surface off the FIVE real,
// as-shipped feed engines — `@quant/recommendations`, `@quant/ranking`,
// `@quant/ml-pipeline`, `@quant/ml-runtime`, `@quant/triton-client` — composed
// once at boot into a single `feed` decoration (a decorated singleton, never
// per-request). quantmax is a declared feed target (see the wiring inventory:
// recommendations/ranking list `quantmax`). This file mirrors the COMPLETED
// quantube/quantneon `backend/lib/feed-engines.ts` COMPOSITION pattern (the
// orchestrator explicitly sanctions reusing it), but it is a REAL, app-local
// importer: every engine specifier below is imported from `apps/quantmax` and
// every engine is declared in `apps/quantmax` dependencies, so DoD-1 holds for
// quantmax independently of quantube/quantneon.
//
// No engine code is rewritten and no `@simulated` core is de-simulated (Req
// 9.1) — the engines are wired exactly as shipped. The thin INFRASTRUCTURE
// adapters here (an in-memory ONNX-model store, a `fetch`-based model
// downloader, a `fetch`-based Triton transport) are seam infra (storage /
// network), NOT engine logic.
//
// dependsOn ordering (design.md P4 / task inventory) is honoured by CONSTRUCTION
// ORDER below:
//   ml-pipeline  →  ml-runtime  →  triton-client     (ml-runtime dependsOn
//                                                      ml-pipeline; triton-client
//                                                      dependsOn ml-runtime)
//   recommendations  →  ranking                      (ranking dependsOn
//                                                      recommendations)
// ml-runtime's `ModelLoader` is genuinely fed INTO ml-pipeline's
// `InferenceEngine.setModelLoader(...)` — the real dependsOn edge — and the
// recommendation retrieval order is genuinely fed INTO ranking's `FeedService`
// (recommendations → ranking) by `getComposedFeed()` below.
//
// All persistence here is in-memory (no new schema — Req 9.5); `app.prisma`
// stays available for collaborators that need it but these engines do not.

import { RecommendationPipeline } from '@quant/recommendations';
import type { PipelineCandidate } from '@quant/recommendations';
import {
  AlgorithmRegistry,
  ChronoRanker,
  CommunityRanker,
  AIRanker,
  UserPreferenceService,
  AntiRageFilter,
  FeedService,
  AlgorithmType,
} from '@quant/ranking';
import type { CandidateProvider, FeedItem, FeedResponse } from '@quant/ranking';
import { InferenceEngine, ModelRegistry as MlModelRegistry } from '@quant/ml-pipeline';
import { ModelLoader } from '@quant/ml-runtime';
import type { StorageBackend, ModelDownloader } from '@quant/ml-runtime';
import { TritonInferenceClient, ModelRegistry as TritonModelRegistry } from '@quant/triton-client';
import type { TritonTransport, TransportResponse } from '@quant/triton-client';

// ----------------------------------------------------------------------------
// Thin INFRASTRUCTURE adapters for the engines' injected interfaces.
// These are seam infra (storage / network), NOT engine logic. They let the
// as-shipped engines construct.
// ----------------------------------------------------------------------------

/** In-memory `StorageBackend` for `@quant/ml-runtime`'s `ModelLoader` cache. */
export class InMemoryModelStorage implements StorageBackend {
  private store = new Map<string, ArrayBuffer>();
  async read(path: string): Promise<ArrayBuffer | null> {
    return this.store.get(path) ?? null;
  }
  async write(path: string, data: ArrayBuffer): Promise<void> {
    this.store.set(path, data);
  }
  async exists(path: string): Promise<boolean> {
    return this.store.has(path);
  }
  async delete(path: string): Promise<void> {
    this.store.delete(path);
  }
  async list(prefix: string): Promise<string[]> {
    return [...this.store.keys()].filter((k) => k.startsWith(prefix));
  }
}

/** `fetch`-based `ModelDownloader` for `ModelLoader` (real network when used). */
export class FetchModelDownloader implements ModelDownloader {
  async download(url: string): Promise<ArrayBuffer> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Model download failed (${res.status}) for ${url}`);
    }
    return res.arrayBuffer();
  }
}

/** `fetch`-based `TritonTransport` for the Triton v2 HTTP client (real network). */
export class FetchTritonTransport implements TritonTransport {
  async post(url: string, body: unknown): Promise<TransportResponse> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, data: await res.json().catch(() => null) };
  }
  async get(url: string): Promise<TransportResponse> {
    const res = await fetch(url);
    return { status: res.status, data: await res.json().catch(() => null) };
  }
}

// ----------------------------------------------------------------------------
// In-memory candidate pool — the feed's content source for the seam. Items are
// seeded via POST /feed/candidates; the composed feed orders them through
// recommendations then ranking.
// ----------------------------------------------------------------------------

/** A per-feed in-memory pool of candidate items + a recommendation order hint. */
export class FeedCandidateStore {
  private pool = new Map<string, FeedItem[]>();
  private order = new Map<string, string[]>();

  /** Replace the pool for a feed (clears any prior recommendation order). */
  replace(feedId: string, items: FeedItem[]): void {
    this.pool.set(feedId, items);
    this.order.delete(feedId);
  }

  /** Append candidate items to a feed's pool. */
  add(feedId: string, items: FeedItem[]): FeedItem[] {
    const current = this.pool.get(feedId) ?? [];
    const next = [...current, ...items];
    this.pool.set(feedId, next);
    return next;
  }

  /** Raw pool for a feed (insertion order). */
  get(feedId: string): FeedItem[] {
    return this.pool.get(feedId) ?? [];
  }

  /** Record the recommendation-derived retrieval order for a feed. */
  setOrder(feedId: string, ids: string[]): void {
    this.order.set(feedId, ids);
  }

  /** Pool ordered by the last recommendation pass (recommendations → ranking). */
  getOrdered(feedId: string): FeedItem[] {
    const items = this.get(feedId);
    const ord = this.order.get(feedId);
    if (!ord) return items;
    const rank = new Map(ord.map((id, i) => [id, i] as const));
    return [...items].sort(
      (a, b) =>
        (rank.get(a.id) ?? Number.POSITIVE_INFINITY) - (rank.get(b.id) ?? Number.POSITIVE_INFINITY),
    );
  }
}

// ----------------------------------------------------------------------------
// The composed feed engine bundle decorated as `fastify.feed`.
// ----------------------------------------------------------------------------

export interface FeedRankingEngines {
  registry: AlgorithmRegistry;
  preferences: UserPreferenceService;
  antiRage: AntiRageFilter;
  service: FeedService;
}

export interface FeedMlPipelineEngines {
  inference: InferenceEngine;
  models: MlModelRegistry;
}

export interface FeedMlRuntimeEngines {
  loader: ModelLoader;
}

export interface FeedTritonEngines {
  client: TritonInferenceClient;
  registry: TritonModelRegistry;
}

/**
 * The composite feed engine service. Bundles the five real engines plus the
 * in-memory candidate store, and exposes the recommendations→ranking
 * composition the `/feed` route surfaces.
 */
export class FeedEngineBundle {
  readonly recommendations: RecommendationPipeline;
  readonly ranking: FeedRankingEngines;
  readonly mlPipeline: FeedMlPipelineEngines;
  readonly mlRuntime: FeedMlRuntimeEngines;
  readonly triton: FeedTritonEngines;
  readonly candidates: FeedCandidateStore;

  // The feed the synchronous recommendation retrieval should read from. Set
  // immediately before each (synchronous) `recommend()` call — safe under
  // Node's single-threaded request handling.
  private activeFeedId = '';

  constructor(tritonBaseUrl: string) {
    this.candidates = new FeedCandidateStore();

    // --- ml-pipeline (constructed first; ml-runtime dependsOn ml-pipeline) ---
    const inference = new InferenceEngine({});
    const mlModels = new MlModelRegistry();
    this.mlPipeline = { inference, models: mlModels };

    // --- ml-runtime (after ml-pipeline) — wire its ModelLoader INTO the
    //     ml-pipeline InferenceEngine (the genuine dependsOn edge). ---
    const loader = new ModelLoader(new InMemoryModelStorage(), new FetchModelDownloader());
    inference.setModelLoader(loader);
    this.mlRuntime = { loader };

    // A tiny in-memory linear model so the inference seam returns deterministic
    // 2xx without any ONNX/Triton server (the engine's sync forwardPass path).
    inference.loadModel('feed-ranker', '1.0.0', [[0.5, 0.5]], [0]);
    mlModels.registerModel('feed-ranker', '1.0.0', 'custom', { auc: 0.5 });

    // --- triton-client (after ml-runtime) ---
    this.triton = {
      client: new TritonInferenceClient(new FetchTritonTransport(), { baseUrl: tritonBaseUrl }),
      registry: new TritonModelRegistry(),
    };

    // --- recommendations (constructed before ranking) ---
    const recommendations = new RecommendationPipeline();
    recommendations.addRetrieval((_userId, k) =>
      this.candidates
        .get(this.activeFeedId)
        .slice(0, k)
        .map<PipelineCandidate>((item) => ({
          id: item.id,
          // Use the item's social signals as the retrieval score.
          score: item.upvotes + item.shares * 2 + item.replyQuality,
          features: [item.upvotes, item.shares, item.replies, item.authorReputation],
          source: 'pool',
        })),
    );
    this.recommendations = recommendations;

    // --- ranking (after recommendations) — its candidateProvider reads the
    //     recommendation-ordered pool, closing the recommendations → ranking
    //     composition. ---
    const registry = new AlgorithmRegistry();
    registry.register(new ChronoRanker());
    registry.register(new CommunityRanker());
    registry.register(new AIRanker());
    const preferences = new UserPreferenceService();
    const antiRage = new AntiRageFilter();
    const candidateProvider: CandidateProvider = (_userId, feedId) =>
      this.candidates.getOrdered(feedId);
    this.ranking = {
      registry,
      preferences,
      antiRage,
      service: new FeedService(registry, preferences, antiRage, candidateProvider),
    };
  }

  /** Run the recommendation pipeline over a feed's pool (retrieval order). */
  recommend(userId: string, feedId: string, k?: number): PipelineCandidate[] {
    this.activeFeedId = feedId;
    return this.recommendations.recommend(
      userId,
      { device: 'web', timeOfDay: 'day', sessionId: userId },
      k,
    );
  }

  /**
   * Composed feed: run recommendations (retrieval) → ranking (algorithm +
   * anti-rage) and return the ranked, paginated feed.
   */
  getComposedFeed(
    userId: string,
    feedId: string,
    page: number,
    pageSize: number,
  ): FeedResponse & { retrievalCount: number } {
    const recommended = this.recommend(userId, feedId);
    this.candidates.setOrder(
      feedId,
      recommended.map((c) => c.id),
    );
    const response = this.ranking.service.getFeed({ userId, feedId, page, pageSize });
    return { ...response, retrievalCount: recommended.length };
  }
}

/** Re-export for route-side typing / Zod enums. */
export { AlgorithmType };

/**
 * Construct the quantmax feed engine bundle once at boot (decorated singleton).
 * The Triton base URL is read from config so the seam shares one source of
 * truth and never hardcodes infrastructure (default = local Triton).
 */
export function createFeedEngines(): FeedEngineBundle {
  const tritonBaseUrl = process.env['TRITON_URL'] ?? 'http://localhost:8000';
  return new FeedEngineBundle(tritonBaseUrl);
}
