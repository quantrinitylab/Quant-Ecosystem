// ============================================================================
// AIReplyService — the home-app style loop (mail learns, mail replies use it)
//
// The system prompt always PROMISED "matching the user writing style" — this
// proves it now actually happens: remembered style replaces the generic
// professional default; explicit tone still wins; failures are best-effort.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  createMemoryService,
  UserStyleMemory,
  type MemoryDbClient,
  type UserStyleProfile,
} from '@quant/ai';
import { AIReplyService } from '../services/ai-reply.service';

const profile: UserStyleProfile = {
  userId: 'u1',
  tone: 'warm-direct',
  averageSentenceLength: 12,
  vocabularyLevel: 'moderate',
  greetingStyle: 'Hey,',
  closingStyle: 'Cheers',
  formality: 0.3,
  traits: ['brief', 'friendly'],
  confidence: 0.9,
};

const email = { from: 'priya@example.com', subject: 'Launch', body: 'Ready for Friday?' };
const okReply = { subject: 'Re: Launch', body: 'Yes!', confidence: 0.9 };

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

const engineCapturing = (seen: { prompt: string }) =>
  ({
    infer: async (req: { prompt: string }) => {
      seen.prompt = req.prompt;
      return { content: JSON.stringify(okReply) };
    },
  }) as never;

describe('home-app style loop: quantmail replies in the learned style', () => {
  it('remembered style replaces the generic professional default', async () => {
    const memory = createMemoryService({ prisma: fakeDbClient() });
    await new UserStyleMemory(memory).set('u1', profile);

    const seen = { prompt: '' };
    const svc = new AIReplyService(engineCapturing(seen), new UserStyleMemory(memory));
    await svc.draftReply(email, 'u1');

    expect(seen.prompt).toContain('warm-direct');
    expect(seen.prompt).not.toContain('Use a professional tone.');
  });

  it('explicit tone ALWAYS beats memory', async () => {
    const memory = createMemoryService({ prisma: fakeDbClient() });
    await new UserStyleMemory(memory).set('u1', profile);

    const seen = { prompt: '' };
    const svc = new AIReplyService(engineCapturing(seen), new UserStyleMemory(memory));
    await svc.draftReply(email, 'u1', { tone: 'casual' });

    expect(seen.prompt).toContain('Use a casual tone.');
    expect(seen.prompt).not.toContain('warm-direct');
  });

  it('default behavior unchanged without a style source', async () => {
    const seen = { prompt: '' };
    await new AIReplyService(engineCapturing(seen)).draftReply(email, 'u1');
    expect(seen.prompt).toContain('Use a professional tone.');
  });

  it('a failing style source falls back to the professional default', async () => {
    const seen = { prompt: '' };
    const svc = new AIReplyService(engineCapturing(seen), {
      get: async () => {
        throw new Error('memory down');
      },
    });
    const result = await svc.draftReply(email, 'u1');
    expect(result.body).toBe('Yes!');
    expect(seen.prompt).toContain('Use a professional tone.');
  });
});
