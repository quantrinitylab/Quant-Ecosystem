import { describe, it, expect } from 'vitest';
import { InMemorySessionStore } from '../persistence/memory-store.js';
import type { SessionStoreEntry } from '../types.js';

function makeEntry(
  overrides?: Partial<Omit<SessionStoreEntry, 'id'>>,
): Omit<SessionStoreEntry, 'id'> {
  return {
    state: 'idle',
    createdAt: Date.now(),
    transcript: [
      {
        id: 't1',
        speaker: 'user',
        text: 'hello world',
        startTime: 0,
        endTime: 1,
        confidence: 0.9,
        isFinal: true,
      },
    ],
    artifacts: [],
    userId: 'user-1',
    ...overrides,
  };
}

describe('InMemorySessionStore', () => {
  it('creates and retrieves entries', async () => {
    const store = new InMemorySessionStore();
    const entry = await store.create(makeEntry());
    expect(entry.id).toBe('ls-1');
    const got = await store.get('ls-1');
    expect(got).toEqual(entry);
  });

  it('lists entries with pagination', async () => {
    const store = new InMemorySessionStore();
    await store.create(makeEntry());
    await store.create(makeEntry());
    await store.create(makeEntry());
    const { entries, total } = await store.list('user-1', { limit: 2, offset: 1 });
    expect(total).toBe(3);
    expect(entries.length).toBe(2);
  });

  it('lists entries filtered by state', async () => {
    const store = new InMemorySessionStore();
    await store.create(makeEntry({ state: 'idle' }));
    await store.create(makeEntry({ state: 'ended' }));
    const { entries } = await store.list('user-1', { state: 'ended' });
    expect(entries.length).toBe(1);
    expect(entries[0]!.state).toBe('ended');
  });

  it('updates an entry', async () => {
    const store = new InMemorySessionStore();
    await store.create(makeEntry());
    const updated = await store.update('ls-1', { state: 'ended', endedAt: 100 });
    expect(updated.state).toBe('ended');
    expect(updated.endedAt).toBe(100);
  });

  it('deletes an entry', async () => {
    const store = new InMemorySessionStore();
    await store.create(makeEntry());
    await store.delete('ls-1');
    expect(await store.get('ls-1')).toBeUndefined();
  });

  it('searches transcript text', async () => {
    const store = new InMemorySessionStore();
    await store.create(
      makeEntry({
        transcript: [
          {
            id: 't1',
            speaker: 'user',
            text: 'find this keyword',
            startTime: 0,
            endTime: 1,
            confidence: 1,
            isFinal: true,
          },
        ],
      }),
    );
    await store.create(
      makeEntry({
        transcript: [
          {
            id: 't2',
            speaker: 'user',
            text: 'nothing here',
            startTime: 0,
            endTime: 1,
            confidence: 1,
            isFinal: true,
          },
        ],
      }),
    );
    const results = await store.search('user-1', 'keyword');
    expect(results.length).toBe(1);
  });
});
