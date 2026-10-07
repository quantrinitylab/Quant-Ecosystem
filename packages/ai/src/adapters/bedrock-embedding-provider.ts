// ============================================================================
// AI Adapters — BedrockEmbeddingProvider (M08: real embedding provider #2)
//
// Real EmbeddingProvider (ADR-005/007 port) backed by Amazon Bedrock's
// InvokeModel API using a Bedrock API key (HTTP Bearer auth — no SigV4, no
// AWS SDK coupling). Mirrors OpenAIEmbeddingProvider: injectable `fetch`,
// zod-validated env config, fully unit-testable with a fake fetch.
//
// Default model: amazon.titan-embed-text-v2:0 (256 | 512 | 1024 dims).
// Law 6 in action: the engine never knows which provider embedded the text —
// the port is the contract, this file is just one swappable implementation.
// ============================================================================

import { z } from 'zod';
import type { EmbeddingProvider } from '../core/vector-memory-retriever';

/** Known Bedrock embedding models and their default output dimensions. */
export const BEDROCK_EMBEDDING_DIMENSIONS: Record<string, number> = {
  'amazon.titan-embed-text-v2:0': 1024,
  'amazon.titan-embed-text-v1': 1536,
};

const DEFAULT_MODEL = 'amazon.titan-embed-text-v2:0';
const DEFAULT_REGION = 'us-west-2';

export interface BedrockEmbeddingConfig {
  /** Bedrock API key (bearer token), NOT an AWS access key pair. */
  apiKey: string;
  region?: string;
  model?: string;
  /** Titan v2 supports 256 | 512 | 1024. Defaults to the model's table entry. */
  dimension?: number;
  /** Override the endpoint entirely (testing / VPC endpoints). */
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class BedrockEmbeddingProvider implements EmbeddingProvider {
  readonly provider = 'bedrock';
  readonly model: string;
  readonly dimension: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: BedrockEmbeddingConfig) {
    if (!config.apiKey) throw new Error('BedrockEmbeddingProvider: apiKey is required');
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.dimension = config.dimension ?? BEDROCK_EMBEDDING_DIMENSIONS[this.model] ?? 1024;
    const region = config.region ?? DEFAULT_REGION;
    this.baseUrl = (config.baseUrl ?? `https://bedrock-runtime.${region}.amazonaws.com`).replace(
      /\/$/,
      '',
    );
    this.fetchImpl = config.fetch ?? fetch;
  }

  async embed(text: string): Promise<number[]> {
    const body: Record<string, unknown> = { inputText: text };
    // Titan v2 accepts a dimensions parameter; v1 does not.
    if (this.model.includes('embed-text-v2')) body['dimensions'] = this.dimension;

    const res = await this.fetchImpl(
      `${this.baseUrl}/model/${encodeURIComponent(this.model)}/invoke`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const detail = await safeText(res);
      throw new Error(`Bedrock embeddings failed (${res.status}): ${detail}`);
    }

    const json = (await res.json()) as { embedding?: number[] };
    if (!json.embedding || json.embedding.length === 0) {
      throw new Error('Bedrock embeddings: empty response');
    }
    return json.embedding;
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
  AWS_BEARER_TOKEN_BEDROCK: z.string().min(1, 'AWS_BEARER_TOKEN_BEDROCK is required'),
  BEDROCK_REGION: z.string().default(DEFAULT_REGION),
  BEDROCK_EMBEDDING_MODEL: z.string().default(DEFAULT_MODEL),
  BEDROCK_EMBEDDING_DIMENSION: z.coerce.number().int().positive().optional(),
});

/** Build a config from environment variables (throws if the bearer token is missing). */
export function loadBedrockEmbeddingConfig(
  env: NodeJS.ProcessEnv = process.env,
): BedrockEmbeddingConfig {
  const parsed = EnvSchema.parse(env);
  return {
    apiKey: parsed.AWS_BEARER_TOKEN_BEDROCK,
    region: parsed.BEDROCK_REGION,
    model: parsed.BEDROCK_EMBEDDING_MODEL,
    ...(parsed.BEDROCK_EMBEDDING_DIMENSION !== undefined
      ? { dimension: parsed.BEDROCK_EMBEDDING_DIMENSION }
      : {}),
  };
}
