// ============================================================================
// AI Adapters — QdrantVectorBackend (PR-M10)
//
// Real VectorBackend (ADR-007 port) over the Qdrant REST API via injectable
// `fetch` (no SDK coupling), config validated by zod from env.
//
// Point-id note: Qdrant point ids must be unsigned int or UUID, but our memory
// ids are cuids. We map each cuid to a DETERMINISTIC UUID for the point id and
// carry the real id in the payload (`memoryId`), returning it on search. Owner
// scoping is enforced with a Qdrant filter so recall never crosses owners.
// ============================================================================

// bare 'crypto' (not 'node:crypto'): the node: scheme throws UnhandledSchemeError
// in Next.js/webpack when this module is reached via the @quant/ai barrel. Bare
// 'crypto' resolves on the server and tree-shakes out of client bundles.
import { createHash } from 'crypto';
import { z } from 'zod';
import type { VectorBackend, VectorQueryHit } from '../core/vector-memory-retriever';

export interface QdrantConfig {
  url: string;
  collection: string;
  apiKey?: string;
  fetch?: typeof fetch;
}

/** Map an arbitrary string id to a stable UUID (Qdrant requires uint/UUID ids). */
export function toPointId(id: string): string {
  const h = createHash('sha1').update(id).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export class QdrantVectorBackend implements VectorBackend {
  readonly name = 'qdrant';
  private readonly url: string;
  private readonly collection: string;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(config: QdrantConfig) {
    if (!config.url) throw new Error('QdrantVectorBackend: url is required');
    if (!config.collection) throw new Error('QdrantVectorBackend: collection is required');
    this.url = config.url.replace(/\/$/, '');
    this.collection = config.collection;
    this.apiKey = config.apiKey;
    this.fetchImpl = config.fetch ?? fetch;
  }

  async upsert(record: {
    id: string;
    vector: number[];
    ownerId: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.request(`/collections/${this.collection}/points`, 'PUT', {
      points: [
        {
          id: toPointId(record.id),
          vector: record.vector,
          payload: {
            memoryId: record.id,
            ownerId: record.ownerId,
            ...(record.metadata ?? {}),
          },
        },
      ],
    });
  }

  async query(args: {
    vector: number[];
    ownerId: string;
    limit: number;
  }): Promise<VectorQueryHit[]> {
    const body = {
      vector: args.vector,
      limit: args.limit,
      with_payload: true,
      filter: {
        must: [{ key: 'ownerId', match: { value: args.ownerId } }],
      },
    };
    const json = (await this.request(
      `/collections/${this.collection}/points/search`,
      'POST',
      body,
    )) as { result?: Array<{ score: number; payload?: { memoryId?: string } }> };

    const hits: VectorQueryHit[] = [];
    for (const point of json.result ?? []) {
      const id = point.payload?.memoryId;
      if (typeof id === 'string') hits.push({ id, score: point.score });
    }
    return hits;
  }

  private async request(path: string, method: string, body: unknown): Promise<unknown> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['api-key'] = this.apiKey;

    const res = await this.fetchImpl(`${this.url}${path}`, {
      method,
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = '<no body>';
      try {
        detail = (await res.text()).slice(0, 200);
      } catch {
        /* ignore */
      }
      throw new Error(`Qdrant ${method} ${path} failed (${res.status}): ${detail}`);
    }
    return res.json();
  }
}

// ─── Env config (zod-validated) ─────────────────────────────────────────────

const EnvSchema = z.object({
  QDRANT_URL: z.string().url('QDRANT_URL must be a URL'),
  QDRANT_COLLECTION: z.string().min(1).default('quant_memories'),
  QDRANT_API_KEY: z.string().optional(),
});

/** Build a config from environment variables (throws if QDRANT_URL missing/invalid). */
export function loadQdrantConfig(env: NodeJS.ProcessEnv = process.env): QdrantConfig {
  const parsed = EnvSchema.parse(env);
  return {
    url: parsed.QDRANT_URL,
    collection: parsed.QDRANT_COLLECTION,
    ...(parsed.QDRANT_API_KEY ? { apiKey: parsed.QDRANT_API_KEY } : {}),
  };
}
