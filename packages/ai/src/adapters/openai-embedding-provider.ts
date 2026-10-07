// ============================================================================
// AI Adapters — OpenAIEmbeddingProvider (PR-M10)
//
// Real EmbeddingProvider (ADR-005/007 port) backed by the OpenAI embeddings API.
// Uses an injectable `fetch` (no SDK coupling), config validated by zod from env.
// Fully unit-testable with a fake fetch; no network at test time.
// ============================================================================

import { z } from 'zod';
import type { EmbeddingProvider } from '../core/vector-memory-retriever';

/** Known OpenAI embedding models and their output dimensions. */
export const OPENAI_EMBEDDING_DIMENSIONS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export interface OpenAIEmbeddingConfig {
  apiKey: string;
  model?: string;
  /** Override dimension for a model not in the known table. */
  dimension?: number;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly provider = 'openai';
  readonly model: string;
  readonly dimension: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OpenAIEmbeddingConfig) {
    if (!config.apiKey) throw new Error('OpenAIEmbeddingProvider: apiKey is required');
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.dimension = config.dimension ?? OPENAI_EMBEDDING_DIMENSIONS[this.model] ?? 1536;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = config.fetch ?? fetch;
  }

  async embed(text: string): Promise<number[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.model, input: text }),
    });

    if (!res.ok) {
      const detail = await safeText(res);
      throw new Error(`OpenAI embeddings failed (${res.status}): ${detail}`);
    }

    const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const embedding = json.data?.[0]?.embedding;
    if (!embedding || embedding.length === 0) {
      throw new Error('OpenAI embeddings: empty response');
    }
    return embedding;
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
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  OPENAI_EMBEDDING_MODEL: z.string().default(DEFAULT_MODEL),
  OPENAI_BASE_URL: z.string().url().optional(),
});

/** Build a config from environment variables (throws if OPENAI_API_KEY missing). */
export function loadOpenAIEmbeddingConfig(
  env: NodeJS.ProcessEnv = process.env,
): OpenAIEmbeddingConfig {
  const parsed = EnvSchema.parse(env);
  return {
    apiKey: parsed.OPENAI_API_KEY,
    model: parsed.OPENAI_EMBEDDING_MODEL,
    ...(parsed.OPENAI_BASE_URL ? { baseUrl: parsed.OPENAI_BASE_URL } : {}),
  };
}
