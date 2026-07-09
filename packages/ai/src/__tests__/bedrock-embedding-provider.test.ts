import { describe, it, expect } from 'vitest';
import {
  BedrockEmbeddingProvider,
  loadBedrockEmbeddingConfig,
  BEDROCK_EMBEDDING_DIMENSIONS,
} from '../adapters/bedrock-embedding-provider';

interface Call {
  url: string;
  init?: { method?: string; headers?: Record<string, string>; body?: string };
}

function fakeFetch(responder: () => Response): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fn = (async (url: string, init?: Call['init']) => {
    calls.push({ url, ...(init ? { init } : {}) });
    return responder();
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}

const okEmbedding = (vec: number[]): Response =>
  new Response(JSON.stringify({ embedding: vec }), { status: 200 });

describe('BedrockEmbeddingProvider', () => {
  it('posts to the region-scoped invoke endpoint with bearer auth and returns the vector', async () => {
    const { fetch, calls } = fakeFetch(() => okEmbedding([0.1, 0.2, 0.3]));
    const p = new BedrockEmbeddingProvider({ apiKey: 'bedrock-test-token', fetch });

    const vec = await p.embed('hello');
    expect(vec).toEqual([0.1, 0.2, 0.3]);
    expect(calls[0]?.url).toBe(
      'https://bedrock-runtime.us-west-2.amazonaws.com/model/amazon.titan-embed-text-v2%3A0/invoke',
    );
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.headers?.['Authorization']).toBe('Bearer bedrock-test-token');
    expect(JSON.parse(calls[0]?.init?.body ?? '{}')).toMatchObject({
      inputText: 'hello',
      dimensions: 1024,
    });
  });

  it('derives dimension from the model table and supports overrides', () => {
    const v2 = new BedrockEmbeddingProvider({ apiKey: 'k' });
    expect(v2.dimension).toBe(BEDROCK_EMBEDDING_DIMENSIONS['amazon.titan-embed-text-v2:0']);
    expect(v2.dimension).toBe(1024);

    const small = new BedrockEmbeddingProvider({ apiKey: 'k', dimension: 512 });
    expect(small.dimension).toBe(512);

    const v1 = new BedrockEmbeddingProvider({ apiKey: 'k', model: 'amazon.titan-embed-text-v1' });
    expect(v1.dimension).toBe(1536);
  });

  it('omits the dimensions parameter for titan v1 (unsupported there)', async () => {
    const { fetch, calls } = fakeFetch(() => okEmbedding([1]));
    const p = new BedrockEmbeddingProvider({
      apiKey: 'k',
      model: 'amazon.titan-embed-text-v1',
      fetch,
    });
    await p.embed('x');
    expect(JSON.parse(calls[0]?.init?.body ?? '{}')).not.toHaveProperty('dimensions');
  });

  it('respects region config in the endpoint', async () => {
    const { fetch, calls } = fakeFetch(() => okEmbedding([1]));
    const p = new BedrockEmbeddingProvider({ apiKey: 'k', region: 'eu-central-1', fetch });
    await p.embed('x');
    expect(calls[0]?.url).toContain('https://bedrock-runtime.eu-central-1.amazonaws.com/');
  });

  it('throws a descriptive error on a non-OK response', async () => {
    const { fetch } = fakeFetch(() => new Response('Operation not allowed', { status: 400 }));
    const p = new BedrockEmbeddingProvider({ apiKey: 'k', fetch });
    await expect(p.embed('x')).rejects.toThrow(/400/);
  });

  it('throws on an empty embedding response', async () => {
    const { fetch } = fakeFetch(() => new Response(JSON.stringify({}), { status: 200 }));
    const p = new BedrockEmbeddingProvider({ apiKey: 'k', fetch });
    await expect(p.embed('x')).rejects.toThrow(/empty/);
  });

  it('requires an apiKey', () => {
    expect(() => new BedrockEmbeddingProvider({ apiKey: '' })).toThrow(/apiKey/);
  });

  it('loads config from env with defaults', () => {
    const cfg = loadBedrockEmbeddingConfig({
      AWS_BEARER_TOKEN_BEDROCK: 'tok',
    } as NodeJS.ProcessEnv);
    expect(cfg.apiKey).toBe('tok');
    expect(cfg.region).toBe('us-west-2');
    expect(cfg.model).toBe('amazon.titan-embed-text-v2:0');

    const custom = loadBedrockEmbeddingConfig({
      AWS_BEARER_TOKEN_BEDROCK: 'tok',
      BEDROCK_REGION: 'eu-central-1',
      BEDROCK_EMBEDDING_DIMENSION: '512',
    } as NodeJS.ProcessEnv);
    expect(custom.region).toBe('eu-central-1');
    expect(custom.dimension).toBe(512);
  });

  it('throws when the bearer token is missing from env', () => {
    expect(() => loadBedrockEmbeddingConfig({} as NodeJS.ProcessEnv)).toThrow();
  });
});
