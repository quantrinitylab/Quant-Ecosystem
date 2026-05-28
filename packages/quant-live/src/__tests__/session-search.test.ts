import { describe, it, expect } from 'vitest';
import { InMemorySessionStore } from '../persistence/memory-store.js';
import { SessionSearch } from '../persistence/session-search.js';

describe('SessionSearch', () => {
  it('returns ranked results with snippets', async () => {
    const store = new InMemorySessionStore();
    await store.create({
      state: 'ended',
      createdAt: 100,
      transcript: [
        {
          id: 't1',
          speaker: 'user',
          text: 'meeting about budget',
          startTime: 0,
          endTime: 1,
          confidence: 1,
          isFinal: true,
        },
        {
          id: 't2',
          speaker: 'assistant',
          text: 'budget summary ready',
          startTime: 1,
          endTime: 2,
          confidence: 1,
          isFinal: true,
        },
      ],
      artifacts: [],
      userId: 'u1',
    });
    await store.create({
      state: 'ended',
      createdAt: 200,
      transcript: [
        {
          id: 't3',
          speaker: 'user',
          text: 'unrelated topic',
          startTime: 0,
          endTime: 1,
          confidence: 1,
          isFinal: true,
        },
      ],
      artifacts: [],
      userId: 'u1',
    });
    const search = new SessionSearch(store);
    const results = await search.search('u1', { query: 'budget' });
    expect(results.length).toBe(1);
    expect(results[0]!.score).toBe(2);
    expect(results[0]!.matchingSnippets.length).toBe(2);
  });

  it('filters by date range', async () => {
    const store = new InMemorySessionStore();
    await store.create({
      state: 'ended',
      createdAt: 100,
      transcript: [
        {
          id: 't1',
          speaker: 'user',
          text: 'old',
          startTime: 0,
          endTime: 1,
          confidence: 1,
          isFinal: true,
        },
      ],
      artifacts: [],
      userId: 'u1',
    });
    await store.create({
      state: 'ended',
      createdAt: 500,
      transcript: [
        {
          id: 't2',
          speaker: 'user',
          text: 'new',
          startTime: 0,
          endTime: 1,
          confidence: 1,
          isFinal: true,
        },
      ],
      artifacts: [],
      userId: 'u1',
    });
    const search = new SessionSearch(store);
    const results = await search.search('u1', { dateFrom: 200 });
    expect(results.length).toBe(1);
  });

  it('filters by artifact type', async () => {
    const store = new InMemorySessionStore();
    await store.create({
      state: 'ended',
      createdAt: 100,
      transcript: [],
      artifacts: [
        {
          type: 'email',
          title: 'x',
          description: 'x',
          resourceId: 'x',
          appName: 'x',
          createdAt: 1,
          sessionId: 'ls-1',
        },
      ],
      userId: 'u1',
    });
    await store.create({
      state: 'ended',
      createdAt: 200,
      transcript: [],
      artifacts: [],
      userId: 'u1',
    });
    const search = new SessionSearch(store);
    const results = await search.search('u1', { artifactType: 'email' });
    expect(results.length).toBe(1);
  });

  it('returns empty for no matches', async () => {
    const store = new InMemorySessionStore();
    await store.create({
      state: 'ended',
      createdAt: 100,
      transcript: [
        {
          id: 't1',
          speaker: 'user',
          text: 'hello',
          startTime: 0,
          endTime: 1,
          confidence: 1,
          isFinal: true,
        },
      ],
      artifacts: [],
      userId: 'u1',
    });
    const search = new SessionSearch(store);
    const results = await search.search('u1', { query: 'xyz' });
    expect(results.length).toBe(0);
  });
});
