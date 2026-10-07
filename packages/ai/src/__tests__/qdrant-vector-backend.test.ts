import { describe, it, expect } from 'vitest';
import {
  QdrantVectorBackend,
  toPointId,
  loadQdrantConfig,
} from '../adapters/qdrant-vector-backend';

interface Call {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

function fakeFetch(responder: (call: Call) => Response): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fn = (async (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ) => {
    const call: Call = {
      url,
      ...(init?.method ? { method: init.method } : {}),
      ...(init?.headers ? { headers: init.headers } : {}),
      ...(init?.body ? { body: JSON.parse(init.body) } : {}),
    };
    calls.push(call);
    return responder(call);
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}

describe('toPointId', () => {
  it('maps a cuid to a stable UUID-shaped id', () => {
    const a = toPointId('mem_1');
    const b = toPointId('mem_1');
    expect(a).toBe(b); // deterministic
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(toPointId('mem_2')).not.toBe(a);
  });
});

describe('QdrantVectorBackend.upsert', () => {
  it('PUTs a point with a UUID id and carries the real id in payload', async () => {
    const { fetch, calls } = fakeFetch(
      () => new Response(JSON.stringify({ result: {} }), { status: 200 }),
    );
    const q = new QdrantVectorBackend({
      url: 'http://localhost:6333',
      collection: 'mem',
      apiKey: 'k',
      fetch,
    });

    await q.upsert({
      id: 'mem_1',
      vector: [1, 2, 3],
      ownerId: 'user_1',
      metadata: { kind: 'fact' },
    });

    const call = calls[0]!;
    expect(call.url).toBe('http://localhost:6333/collections/mem/points');
    expect(call.method).toBe('PUT');
    expect(call.headers?.['api-key']).toBe('k');
    const point = (call.body as { points: Array<Record<string, unknown>> }).points[0]!;
    expect(point['id']).toBe(toPointId('mem_1'));
    expect(point['vector']).toEqual([1, 2, 3]);
    expect(point['payload']).toMatchObject({ memoryId: 'mem_1', ownerId: 'user_1', kind: 'fact' });
  });
});

describe('QdrantVectorBackend.query', () => {
  it('filters by owner and returns hits mapped from payload.memoryId', async () => {
    const { fetch, calls } = fakeFetch(
      () =>
        new Response(
          JSON.stringify({
            result: [
              { score: 0.91, payload: { memoryId: 'mem_5' } },
              { score: 0.72, payload: { memoryId: 'mem_9' } },
            ],
          }),
          { status: 200 },
        ),
    );
    const q = new QdrantVectorBackend({ url: 'http://localhost:6333', collection: 'mem', fetch });

    const hits = await q.query({ vector: [0, 1, 0], ownerId: 'user_1', limit: 5 });
    expect(hits).toEqual([
      { id: 'mem_5', score: 0.91 },
      { id: 'mem_9', score: 0.72 },
    ]);
    const body = calls[0]?.body as {
      filter: { must: Array<{ key: string; match: { value: string } }> };
    };
    expect(body.filter.must[0]).toEqual({ key: 'ownerId', match: { value: 'user_1' } });
  });

  it('throws on a non-OK response', async () => {
    const { fetch } = fakeFetch(() => new Response('boom', { status: 500 }));
    const q = new QdrantVectorBackend({ url: 'http://localhost:6333', collection: 'mem', fetch });
    await expect(q.query({ vector: [1], ownerId: 'u', limit: 1 })).rejects.toThrow(/500/);
  });
});

describe('loadQdrantConfig', () => {
  it('reads url and default collection from env', () => {
    const cfg = loadQdrantConfig({ QDRANT_URL: 'http://localhost:6333' } as NodeJS.ProcessEnv);
    expect(cfg.url).toBe('http://localhost:6333');
    expect(cfg.collection).toBe('quant_memories');
  });
  it('throws when QDRANT_URL is missing', () => {
    expect(() => loadQdrantConfig({} as NodeJS.ProcessEnv)).toThrow();
  });
});
