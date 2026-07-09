// ============================================================================
// Cross-app contact memory — second shared channel, second consumer
//
// QuantMail analyzes the relationship → QuantChat replies become
// relationship-aware. No app-to-app import; the memory subsystem is the
// transport. Also proves the two channels compose (style + contact together).
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  createMemoryService,
  UserContactMemory,
  UserStyleMemory,
  type MemoryDbClient,
  type UserContactContext,
  type UserStyleProfile,
} from '@quant/ai';
import { AISmartRepliesService } from '../services/ai-smart-replies.service';

const contact: UserContactContext = {
  contactEmail: 'priya@example.com',
  totalInteractions: 22,
  firstContact: '2026-01-05',
  lastContact: '2026-07-08',
  relationship: 'close collaborator on the launch project',
  topTopics: ['launch', 'budget'],
  sentiment: 'warm',
  confidence: 0.9,
};

const style: UserStyleProfile = {
  userId: 'u1',
  tone: 'playful',
  averageSentenceLength: 9,
  vocabularyLevel: 'simple',
  greetingStyle: 'yo',
  closingStyle: 'cheers',
  formality: 0.2,
  traits: ['brief'],
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

const engineCapturing = (seen: { systemPrompt: string }) =>
  ({
    infer: async (req: { systemPrompt: string }) => {
      seen.systemPrompt = req.systemPrompt;
      return { content: 'on it!' };
    },
  }) as never;

const input = {
  conversationId: 'c1',
  recentMessages: [{ sender: 'Priya', content: 'budget call tomorrow?' }],
  count: 1,
  participantEmail: 'priya@example.com',
};

describe('cross-app contact memory (QuantMail analyzes → QuantChat replies aware)', () => {
  it('relationship context shapes the reply prompt', async () => {
    const memory = createMemoryService({ prisma: fakeDbClient() });
    await new UserContactMemory(memory).set('u1', contact); // "QuantMail" side

    const seen = { systemPrompt: '' };
    const svc = new AISmartRepliesService(
      engineCapturing(seen),
      undefined,
      new UserContactMemory(memory),
    );
    await svc.generateReplies(input, 'u1');

    expect(seen.systemPrompt).toContain('close collaborator');
    expect(seen.systemPrompt).toContain('launch');
  });

  it('both channels compose: style AND relationship in one prompt', async () => {
    const memory = createMemoryService({ prisma: fakeDbClient() });
    await new UserStyleMemory(memory).set('u1', style);
    await new UserContactMemory(memory).set('u1', contact);

    const seen = { systemPrompt: '' };
    const svc = new AISmartRepliesService(
      engineCapturing(seen),
      new UserStyleMemory(memory),
      new UserContactMemory(memory),
    );
    await svc.generateReplies(input, 'u1');

    expect(seen.systemPrompt).toContain('playful'); // style channel
    expect(seen.systemPrompt).toContain('close collaborator'); // contact channel
  });

  it('no participantEmail → no contact lookup (prompt unchanged)', async () => {
    const memory = createMemoryService({ prisma: fakeDbClient() });
    await new UserContactMemory(memory).set('u1', contact);

    const seen = { systemPrompt: '' };
    const svc = new AISmartRepliesService(
      engineCapturing(seen),
      undefined,
      new UserContactMemory(memory),
    );
    await svc.generateReplies(
      { conversationId: 'c1', recentMessages: [{ sender: 'P', content: 'hi' }], count: 1 },
      'u1',
    );
    expect(seen.systemPrompt).not.toContain('close collaborator');
  });

  it('a failing contact source never breaks replies (best-effort)', async () => {
    const seen = { systemPrompt: '' };
    const svc = new AISmartRepliesService(engineCapturing(seen), undefined, {
      get: async () => {
        throw new Error('memory down');
      },
    });
    const result = await svc.generateReplies(input, 'u1');
    expect(result.suggestions).toEqual(['on it!']);
  });
});
