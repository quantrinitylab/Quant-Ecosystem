// ============================================================================
// AI Adapters — CloudflareEmbeddingProvider
//
// Real EmbeddingProvider backed by Cloudflare Workers AI Embeddings API
// (using @cf/baai/bge-large-en-v1.5 or @cf/baai/bge-small-en-v1.5).
// Supports standard Cloudflare Bearer token authentication with 1024 or 384
// dimensional vector representations.
// ============================================================================

import { z } from 'zod';
import type { EmbeddingProvider } from '../core/vector-memory-retriever';

/** Known Cloudflare embedding models and their output dimensions. */
export const CLOUDFLARE_EMBEDDING_DIMENSIONS: Record<string, number> = {
  '@cf/baai/bge-large-en-v1.5': 1024,
  '@cf/baai/bge-base-en-v1.5': 768,
  '@cf/baai/bge-small-en-v1.5': 384,
};

const DEFAULT_MODEL = '@cf/baai/bge-large-en-v1.5';
const DEFAULT_ACCOUNT_ID = '9af698848a5edd00e756c3a2c908ec8d';

export interface CloudflareEmbeddingConfig {
  /** Cloudflare API token (bearer token) */
  apiToken: string;
  /** Cloudflare Account ID (32-character hex) */
  accountId?: string;
  /** Embedding model name */
  model?: string;
  /** Vector dimension override */
  dimension?: number;
  /** Base URL override (for tests / mocks) */
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class CloudflareEmbeddingProvider implements EmbeddingProvider {
  readonly provider = 'cloudflare';
  readonly model: string;
  readonly dimension: number;
  private readonly apiToken: string;
  private readonly accountId: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: CloudflareEmbeddingConfig) {
    if (!config.apiToken) throw new Error('CloudflareEmbeddingProvider: apiToken is required');
    this.apiToken = config.apiToken;
    this.accountId = config.accountId ?? DEFAULT_ACCOUNT_ID;
    this.model = config.model ?? DEFAULT_MODEL;
    this.dimension = config.dimension ?? CLOUDFLARE_EMBEDDING_DIMENSIONS[this.model] ?? 1024;
    this.baseUrl = (
      config.baseUrl ?? `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/v1`
    ).replace(/\/$/, '');
    this.fetchImpl = config.fetch ?? fetch;
  }

  async embed(text: string): Promise<number[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: [text],
      }),
    });

    if (!res.ok) {
      const detail = await safeText(res);
      throw new Error(`Cloudflare embeddings failed (${res.status}): ${detail}`);
    }

    const json = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
      result?: { data?: number[][] };
    };

    const vector = json.data?.[0]?.embedding ?? json.result?.data?.[0];
    if (!vector || vector.length === 0) {
      throw new Error('Cloudflare embeddings: empty response');
    }
    return vector;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '<no body>';
  }
}

// ─── Env config (zod-validated) ─────────────────────────────────────────────

const EnvSchema = z.object({
  CLOUDFLARE_API_TOKEN: z.string().min(1, 'CLOUDFLARE_API_TOKEN is required'),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional().default(DEFAULT_ACCOUNT_ID),
  CLOUDFLARE_EMBEDDING_MODEL: z.string().optional().default(DEFAULT_MODEL),
  CLOUDFLARE_EMBEDDING_DIMENSION: z.coerce.number().int().positive().optional(),
});

/** Build a config from environment variables (throws if the token is missing). */
export function loadCloudflareEmbeddingConfig(
  env: NodeJS.ProcessEnv = process.env,
): CloudflareEmbeddingConfig {
  const parsed = EnvSchema.parse(env);
  return {
    apiToken: parsed.CLOUDFLARE_API_TOKEN,
    accountId: parsed.CLOUDFLARE_ACCOUNT_ID,
    model: parsed.CLOUDFLARE_EMBEDDING_MODEL,
    ...(parsed.CLOUDFLARE_EMBEDDING_DIMENSION !== undefined
      ? { dimension: parsed.CLOUDFLARE_EMBEDDING_DIMENSION }
      : {}),
  };
}
