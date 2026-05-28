import { describe, it, expect } from 'vitest';
import { InMemorySessionStore } from '../persistence/memory-store.js';
import { SessionResume } from '../persistence/session-resume.js';
import type { TranscriptSegment } from '../types.js';

function makeSegments(n: number): TranscriptSegment[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    speaker: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
    text: `segment ${i}`,
    startTime: i,
    endTime: i + 1,
    confidence: 1,
    isFinal: true,
  }));
}

describe('SessionResume', () => {
  it('loads context with maxSegments limit', async () => {
    const store = new InMemorySessionStore();
    await store.create({
      state: 'ended',
      createdAt: 1,
      transcript: makeSegments(100),
      artifacts: [],
      userId: 'u1',
    });
    const resume = new SessionResume(store, { maxSegments: 10 });
    const ctx = await resume.loadContext('ls-1');
    expect(ctx.transcript.length).toBe(10);
    expect(ctx.transcript[0]!.text).toBe('segment 90');
  });

  it('builds conversation history', async () => {
    const store = new InMemorySessionStore();
    await store.create({
      state: 'ended',
      createdAt: 1,
      transcript: makeSegments(4),
      artifacts: [],
      userId: 'u1',
    });
    const resume = new SessionResume(store);
    const history = await resume.buildConversationHistory('ls-1');
    expect(history.length).toBe(4);
    expect(history[0]!.role).toBe('user');
    expect(history[1]!.role).toBe('assistant');
  });

  it('throws for non-existent session', async () => {
    const store = new InMemorySessionStore();
    const resume = new SessionResume(store);
    await expect(resume.loadContext('bad')).rejects.toThrow('Session not found');
  });

  it('handles empty transcript', async () => {
    const store = new InMemorySessionStore();
    await store.create({
      state: 'idle',
      createdAt: 1,
      transcript: [],
      artifacts: [],
      userId: 'u1',
    });
    const resume = new SessionResume(store);
    const ctx = await resume.loadContext('ls-1');
    expect(ctx.transcript.length).toBe(0);
  });
});
