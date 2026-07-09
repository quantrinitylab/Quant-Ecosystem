// ============================================================================
// Cross-app style in QuantDocs — third app on the shared memory loop
//
// Mail learns → Chat uses → DOCS WRITES. Proves: (1) default behavior
// unchanged, (2) remembered style personalizes writeFromOutline when the
// caller gave no tone/style, (3) explicit caller intent ALWAYS beats memory,
// (4) style-source failures never break writing.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  createMemoryService,
  UserStyleMemory,
  type MemoryDbClient,
  type UserStyleProfile,
} from '@quant/ai';
import { AIWriteService } from '../services/ai-write.service';

const profile: UserStyleProfile = {
  userId: 'u1',
  tone: 'crisp',
  averageSentenceLength: 11,
  vocabularyLevel: 'advanced',
  greetingStyle: 'Hi,',
  closingStyle: 'Thanks',
  formality: 0.7,
  traits: ['data-driven', 'direct'],
  confidence: 0.9,
};

const okResult = {
  title: 'T',
  content: 'C',
  sections: ['S1'],
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

const engineCapturing = (seen: { prompt: string }) =>
  ({
    infer: async (req: { prompt: string }) => {
      seen.prompt = req.prompt;
      return { content: JSON.stringify(okResult) };
    },
  }) as never;

describe('cross-app style in quantdocs writeFromOutline', () => {
  it('remembered style personalizes the doc when caller gave no tone/style', async () => {
    const memory = createMemoryService({ prisma: fakeDbClient() });
    await new UserStyleMemory(memory).set('u1', profile); // "QuantMail" side

    const seen = { prompt: '' };
    const svc = new AIWriteService(engineCapturing(seen), new UserStyleMemory(memory));
    await svc.writeFromOutline(['point one'], {}, 'u1');

    expect(seen.prompt).toContain('crisp');
    expect(seen.prompt).toContain('data-driven');
  });

  it('explicit caller tone/style ALWAYS beats memory', async () => {
    const memory = createMemoryService({ prisma: fakeDbClient() });
    await new UserStyleMemory(memory).set('u1', profile);

    const seen = { prompt: '' };
    const svc = new AIWriteService(engineCapturing(seen), new UserStyleMemory(memory));
    await svc.writeFromOutline(['point'], { tone: 'whimsical' }, 'u1');

    expect(seen.prompt).toContain('whimsical');
    expect(seen.prompt).not.toContain('crisp'); // memory did not override intent
  });

  it('default behavior unchanged without a style source', async () => {
    const seen = { prompt: '' };
    const svc = new AIWriteService(engineCapturing(seen));
    const result = await svc.writeFromOutline(['point'], {}, 'u1');
    expect(result.title).toBe('T');
    expect(seen.prompt).not.toContain('writing style');
  });

  it('a failing style source never breaks writing (best-effort)', async () => {
    const seen = { prompt: '' };
    const svc = new AIWriteService(engineCapturing(seen), {
      get: async () => {
        throw new Error('memory down');
      },
    });
    const result = await svc.writeFromOutline(['point'], {}, 'u1');
    expect(result.content).toBe('C');
  });
});
