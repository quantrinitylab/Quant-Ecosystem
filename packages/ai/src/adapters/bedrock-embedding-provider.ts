// ============================================================================
// AI Adapters — BedrockEmbeddingProvider (M11d, provider-agnostic)
//
// Real EmbeddingProvider (ADR-005/007 port) backed by Amazon Bedrock Titan
// embeddings via the AWS SDK InvokeModel API. Same port as OpenAIEmbeddingProvider
// (ADR-003 model-agnostic) — the memory stack does not know which provider it is.
//
// The Bedrock client is injectable (a `{ send }` surface) so this is fully
// unit-testable with a fake — no AWS calls at test time. In production it builds
// a real BedrockRuntimeClient from env-validated config.
// ============================================================================

import { z } from 'zod';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import type { EmbeddingProvider } from '../core/vector-memory-retriever';

/** Titan embedding models and their default output dimensions. */
export const BEDROCK_EMBEDDING_DIMENSIONS: Record<string, number> = {
  'amazon.titan-embed-text-v2:0': 1024,
  'amazon.titan-embed-text-v1': 1536,
};

const DEFAULT_MODEL = 'amazon.titan-embed-text-v2:0';

/** Minimal injectable client surface (a real BedrockRuntimeClient satisfies it). */
export interface BedrockSendClient {
  send(command: unknown): Promise<{ body?: Uint8Array } & Record<string, unknown>>;
}

export interface BedrockEmbeddingConfig {
  region: string;
  model?: string;
  /** Override output dimension (Titan v2 supports 256 / 512 / 1024). */
  dimension?: number;
  /** L2-normalize the embedding (Titan v2 option). Default true. */
  normalize?: boolean;
  /** Inject a client (tests / custom credential chains). */
  client?: BedrockSendClient;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

export class BedrockEmbeddingProvider implements EmbeddingProvider {
  readonly provider = 'bedrock';
  readonly model: string;
  readonly dimension: number;
  private readonly normalize: boolean;
  private readonly client: BedrockSendClient;

  constructor(config: BedrockEmbeddingConfig) {
    if (!config.region) throw new Error('BedrockEmbeddingProvider: region is required');
    this.model = config.model ?? DEFAULT_MODEL;
    this.dimension = config.dimension ?? BEDROCK_EMBEDDING_DIMENSIONS[this.model] ?? 1024;
    this.normalize = config.normalize ?? true;
    this.client =
      config.client ??
      new BedrockRuntimeClient({
        region: config.region,
        ...(config.accessKeyId && config.secretAccessKey
          ? {
              credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
                ...(config.sessionToken ? { sessionToken: config.sessionToken } : {}),
              },
            }
          : {}),
      });
  }

  async embed(text: string): Promise<number[]> {
    // Titan v2 accepts `dimensions` + `normalize`; v1 ignores them harmlessly.
    const body = this.model.includes('v2')
      ? { inputText: text, dimensions: this.dimension, normalize: this.normalize }
      : { inputText: text };

    const res = await this.client.send(
      new InvokeModelCommand({
        modelId: this.model,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      }),
    );

    if (!res.body) throw new Error('Bedrock embeddings: empty response body');
    const parsed = JSON.parse(new TextDecoder().decode(res.body)) as { embedding?: number[] };
    const embedding = parsed.embedding;
    if (!embedding || embedding.length === 0) {
      throw new Error('Bedrock embeddings: no embedding in response');
    }
    return embedding;
  }
}

// ─── Env config (zod-validated) ─────────────────────────────────────────────

const EnvSchema = z.object({
  BEDROCK_REGION: z.string().min(1).optional(),
  AWS_REGION: z.string().min(1).optional(),
  BEDROCK_EMBEDDING_MODEL: z.string().default(DEFAULT_MODEL),
  BEDROCK_ACCESS_KEY_ID: z.string().optional(),
  BEDROCK_SECRET_ACCESS_KEY: z.string().optional(),
  BEDROCK_SESSION_TOKEN: z.string().optional(),
});

/** Build a config from env (region falls back to AWS_REGION; throws if neither). */
export function loadBedrockEmbeddingConfig(
  env: NodeJS.ProcessEnv = process.env,
): BedrockEmbeddingConfig {
  const parsed = EnvSchema.parse(env);
  const region = parsed.BEDROCK_REGION ?? parsed.AWS_REGION;
  if (!region) {
    throw new Error('BedrockEmbeddingProvider: BEDROCK_REGION or AWS_REGION is required');
  }
  return {
    region,
    model: parsed.BEDROCK_EMBEDDING_MODEL,
    ...(parsed.BEDROCK_ACCESS_KEY_ID ? { accessKeyId: parsed.BEDROCK_ACCESS_KEY_ID } : {}),
    ...(parsed.BEDROCK_SECRET_ACCESS_KEY
      ? { secretAccessKey: parsed.BEDROCK_SECRET_ACCESS_KEY }
      : {}),
    ...(parsed.BEDROCK_SESSION_TOKEN ? { sessionToken: parsed.BEDROCK_SESSION_TOKEN } : {}),
  };
}
