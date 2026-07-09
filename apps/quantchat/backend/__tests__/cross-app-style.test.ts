// ============================================================================
// Cross-app style memory — THE moat test
//
// One agent, shared memory, across apps: a style profile written through the
// SHARED UserStyleMemory channel (exactly what QuantMail's style learner does)
// is picked up by QuantChat's smart replies and provably shapes the prompt.
// No app-to-app import — the memory subsystem IS the channel (Law 4).
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  createMemoryService,
  UserStyleMemory,
  type MemoryDbClient,
  type UserStyleProfile,
} from '@quant/ai';
import { AISmartRepliesService } from '../services/ai-smart-replies.service';

const profile: UserStyleProfile = {
  userId: 'u1',
  tone: 'playful',
  averageSentenceLength: 9,
  vocabularyLevel: 'simple',
  greetingStyle: 'yo',
  closingStyle: 'cheers',
  formality: 0.2,
  traits: ['emoji-friendly', 'brief'],
  confidence: 0.85,
};

function fakeDbClient(): MemoryDbClient {
  interface Row {
    [k: string]: unknown;
    ownerId: string | null;
    archivedAt: Date | null;
    deletedAt: Date | null;
  }
  const rows: Row[] = [];
  let seq = 0;
  return {
    memoryRecord: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const row = {
          id: `r${++seq}`,
          logicalId: `m${seq}`,
          version: 1,
          archivedAt: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        } as Row;
        rows.push(row);
        return row;
      },
      findMany: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        rows.filter((r) => {
          const w = where ?? {};
          if ('ownerId' in w && r.ownerId !== w['ownerId']) return false;
          if ('archivedAt' in w && w['archivedAt'] === null && r.archivedAt !== null) return false;
          if ('deletedAt' in w && w['deletedAt'] === null && r.deletedAt !== null) return false;
          return true;
        }),
      updateMany: async () => ({ count: 0 }),
    },
  } as unknown as MemoryDbClient;
}

const input = {
  conversationId: 'c1',
  recentMessages: [{ sender: 'Priya', content: 'lunch tomorrow?' }],
  count: 2,
};

describe('cross-app style memory (QuantMail learns → QuantChat uses)', () => {
  it('style written via the shared channel shapes the smart-reply prompt', async () => {
    // ONE memory subsystem shared by both apps (in prod: same database).
    const memory = createMemoryService({ prisma: fakeDbClient() });

    // "QuantMail" side: the style learner persists through this exact channel.
    await new UserStyleMemory(memory).set('u1', profile);

    // "QuantChat" side: smart replies read it — no quantmail import anywhere.
    let seenSystemPrompt = '';
    const engine = {
      infer: async (req: { systemPrompt: string }) => {
        seenSystemPrompt = req.systemPrompt;
        return { content: 'sure!\nsounds good' };
      },
    } as never;

    const svc = new AISmartRepliesService(engine, new UserStyleMemory(memory));
    const result = await svc.generateReplies(input, 'u1');

    expect(result.suggestions).toEqual(['sure!', 'sounds good']);
    expect(seenSystemPrompt).toContain('playful');
    expect(seenSystemPrompt).toContain('emoji-friendly');
  });

  it('without a style source the prompt is unchanged (default behavior intact)', async () => {
    let seenSystemPrompt = '';
    const engine = {
      infer: async (req: { systemPrompt: string }) => {
        seenSystemPrompt = req.systemPrompt;
        return { content: 'ok' };
      },
    } as never;
    await new AISmartRepliesService(engine).generateReplies(input, 'u1');
    expect(seenSystemPrompt).toBe(
      'You are a helpful chat assistant that writes short, natural reply suggestions.',
    );
  });

  it('a failing style source never breaks smart replies (best-effort)', async () => {
    const engine = { infer: async () => ({ content: 'ok' }) } as never;
    const svc = new AISmartRepliesService(engine, {
      get: async () => {
        throw new Error('memory down');
      },
    });
    const result = await svc.generateReplies(input, 'u1');
    expect(result.suggestions).toEqual(['ok']);
  });

  it('another user\u2019s style never leaks into this user\u2019s replies', async () => {
    const memory = createMemoryService({ prisma: fakeDbClient() });
    await new UserStyleMemory(memory).set('u1', profile);

    let seenSystemPrompt = '';
    const engine = {
      infer: async (req: { systemPrompt: string }) => {
        seenSystemPrompt = req.systemPrompt;
        return { content: 'ok' };
      },
    } as never;
    await new AISmartRepliesService(engine, new UserStyleMemory(memory)).generateReplies(
      input,
      'u2',
    );
    expect(seenSystemPrompt).not.toContain('playful');
  });
});
