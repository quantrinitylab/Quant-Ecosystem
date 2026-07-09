// ============================================================================
// AIStyleLearnerService — style persistence via the memory subsystem
//
// Flagship (QuantMail) integration of the memory layer: the user's writing
// style is a user memory. Proves:
//   1. Default store = original ephemeral behavior (zero behavior change).
//   2. MemoryBackedStyleStore round-trips a profile through ANY MemoryBackend.
//   3. End-to-end with the REAL memory subsystem (createMemoryService):
//      profile persists across service instances — restart survival semantics.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { createMemoryService, type MemoryBackend, type MemoryDbClient } from '@quant/ai';
import {
  AIStyleLearnerService,
  InMemoryStyleStore,
  MemoryBackedStyleStore,
  type StyleProfile,
} from '../services/ai-style-learner.service';

const profile: StyleProfile = {
  userId: 'u1',
  tone: 'warm',
  averageSentenceLength: 14,
  vocabularyLevel: 'moderate',
  greetingStyle: 'Hi {name},',
  closingStyle: 'Best, S',
  formality: 0.4,
  traits: ['concise', 'friendly'],
  confidence: 0.9,
};

/** Minimal fake AIEngine returning a fixed style-analysis JSON. */
const fakeEngine = {
  infer: async () => ({ content: JSON.stringify(profile) }),
} as never;

/** Minimal in-memory MemoryDbClient (same shape the ai package evals use). */
function fakeDbClient(): MemoryDbClient {
  interface Row {
    [k: string]: unknown;
    ownerId: string | null;
    archivedAt: Date | null;
    deletedAt: Date | null;
    content: string;
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

describe('default store (backwards compatibility)', () => {
  it('behaves exactly like the original ephemeral map', async () => {
    const svc = new AIStyleLearnerService(fakeEngine);
    await svc.analyzeSentItems([{ subject: 's', body: 'b', to: 'a@b.c' }], 'u1');
    expect((await svc.getStyleProfile('u1')).tone).toBe('warm');
    await expect(svc.getStyleProfile('other')).rejects.toThrow(/No style profile/);
  });
});

describe('MemoryBackedStyleStore', () => {
  it('round-trips a profile through any MemoryBackend', async () => {
    const turns: string[] = [];
    const backend: MemoryBackend = {
      observe: async (t) => {
        turns.push(t.content);
      },
      recall: async () => [{ id: '1', content: turns[0] ?? '', source: 'fake', relevance: 1 }],
    };
    const store = new MemoryBackedStyleStore(backend);
    await store.set('u1', profile);
    expect(turns[0]).toContain('quantmail-style-profile');

    const loaded = await store.get('u1');
    expect(loaded?.closingStyle).toBe('Best, S');
  });

  it('ignores malformed rows and other users\u2019 profiles', async () => {
    const backend: MemoryBackend = {
      observe: async () => {},
      recall: async () => [
        { id: '1', content: 'quantmail-style-profile {not json', source: 'f', relevance: 1 },
        {
          id: '2',
          content: `quantmail-style-profile ${JSON.stringify({ ...profile, userId: 'someone_else' })}`,
          source: 'f',
          relevance: 1,
        },
      ],
    };
    const store = new MemoryBackedStyleStore(backend);
    expect(await store.get('u1')).toBeNull();
  });
});

describe('end-to-end with the REAL memory subsystem', () => {
  it('style survives service re-instantiation (restart semantics)', async () => {
    const memory = createMemoryService({ prisma: fakeDbClient() });
    const store = new MemoryBackedStyleStore(memory);

    // Instance 1 learns the style.
    const svc1 = new AIStyleLearnerService(fakeEngine, store);
    await svc1.analyzeSentItems([{ subject: 's', body: 'b', to: 'a@b.c' }], 'u1');

    // Instance 2 (fresh — simulated restart) still knows it.
    const svc2 = new AIStyleLearnerService(fakeEngine, new MemoryBackedStyleStore(memory));
    const restored = await svc2.getStyleProfile('u1');
    expect(restored.greetingStyle).toBe('Hi {name},');

    // And the styled-draft path uses the restored profile (not defaults).
    const draftEngine = {
      infer: async (req: { prompt: string }) => {
        expect(req.prompt).toContain('warm');
        return {
          content: JSON.stringify({ body: 'ok', matchScore: 0.9, adjustments: [] }),
        };
      },
    } as never;
    const svc3 = new AIStyleLearnerService(draftEngine, new MemoryBackedStyleStore(memory));
    const draft = await svc3.generateStyledDraft('ping the team', 'u1');
    expect(draft.matchScore).toBe(0.9);
  });
});

describe('InMemoryStyleStore', () => {
  it('gets and sets per user', async () => {
    const s = new InMemoryStyleStore();
    expect(await s.get('u1')).toBeNull();
    await s.set('u1', profile);
    expect((await s.get('u1'))?.tone).toBe('warm');
  });
});
