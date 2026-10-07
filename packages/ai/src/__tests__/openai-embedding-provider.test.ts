import { describe, it, expect } from 'vitest';
import {
  OpenAIEmbeddingProvider,
  loadOpenAIEmbeddingConfig,
  OPENAI_EMBEDDING_DIMENSIONS,
} from '../adapters/openai-embedding-provider';

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
  new Response(JSON.stringify({ data: [{ embedding: vec }] }), { status: 200 });

describe('OpenAIEmbeddingProvider', () => {
  it('posts to the embeddings endpoint and returns the vector', async () => {
    const { fetch, calls } = fakeFetch(() => okEmbedding([0.1, 0.2, 0.3]));
    const p = new OpenAIEmbeddingProvider({ apiKey: 'sk-test', fetch });

    const vec = await p.embed('hello');
    expect(vec).toEqual([0.1, 0.2, 0.3]);
    expect(calls[0]?.url).toBe('https://api.openai.com/v1/embeddings');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.headers?.['Authorization']).toBe('Bearer sk-test');
    expect(JSON.parse(calls[0]?.init?.body ?? '{}')).toMatchObject({
      model: 'text-embedding-3-small',
      input: 'hello',
    });
  });

  it('derives dimension from the model', () => {
    const large = new OpenAIEmbeddingProvider({ apiKey: 'k', model: 'text-embedding-3-large' });
    expect(large.dimension).toBe(OPENAI_EMBEDDING_DIMENSIONS['text-embedding-3-large']);
    expect(large.dimension).toBe(3072);
  });

  it('throws a descriptive error on a non-OK response', async () => {
    const { fetch } = fakeFetch(() => new Response('rate limited', { status: 429 }));
    const p = new OpenAIEmbeddingProvider({ apiKey: 'k', fetch });
    await expect(p.embed('x')).rejects.toThrow(/429/);
  });

  it('throws on an empty embedding response', async () => {
    const { fetch } = fakeFetch(() => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const p = new OpenAIEmbeddingProvider({ apiKey: 'k', fetch });
    await expect(p.embed('x')).rejects.toThrow(/empty/);
  });

  it('requires an api key', () => {
    expect(() => new OpenAIEmbeddingProvider({ apiKey: '' })).toThrow(/apiKey/);
  });
});

describe('loadOpenAIEmbeddingConfig', () => {
  it('reads api key and default model from env', () => {
    const cfg = loadOpenAIEmbeddingConfig({ OPENAI_API_KEY: 'sk-env' } as NodeJS.ProcessEnv);
    expect(cfg.apiKey).toBe('sk-env');
    expect(cfg.model).toBe('text-embedding-3-small');
  });
  it('throws when OPENAI_API_KEY is missing', () => {
    expect(() => loadOpenAIEmbeddingConfig({} as NodeJS.ProcessEnv)).toThrow();
  });
});
