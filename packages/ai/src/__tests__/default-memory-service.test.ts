import { describe, it, expect, vi } from 'vitest';
import {
  DefaultMemoryService,
  DefaultMergeStrategy,
  DefaultDeduplicator,
  DefaultBudgetAllocator,
  type DefaultMemoryServiceDeps,
} from '../core/default-memory-service';
import { asKind, asLevel } from '../core/memory-port';
import type {
  MemoryStore,
  MemoryRetriever,
  ConversationLog,
  MemoryExtractor,
  MemoryCompressor,
  MemoryMaintenance,
  MemoryRecord,
  RetrievedMemory,
  ConversationTurn,
} from '../core/memory-port';

// ─── Test doubles ─────────────────────────────────────────────────────────────

function makeRecord(over: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: over.id ?? 'rec_1',
    content: over.content ?? 'content',
    kind: over.kind ?? asKind('fact'),
    level: over.level ?? asLevel('user'),
    owner: over.owner ?? 'user_1',
    createdAt: over.createdAt ?? 1000,
    version: over.version ?? 1,
    pinned: over.pinned ?? false,
    expiresAt: over.expiresAt ?? null,
    metadata: over.metadata ?? {},
  };
}

function makeHit(id: string, content: string, relevance: number): RetrievedMemory {
  return { id, content, source: 'test', relevance };
}

class FakeStore implements MemoryStore {
  public stored: MemoryRecord[] = [];
  private seq = 0;
  async store(record: Omit<MemoryRecord, 'id' | 'createdAt' | 'version'>): Promise<MemoryRecord> {
    const full = makeRecord({
      ...record,
      id: `rec_${++this.seq}`,
      createdAt: Date.now(),
      version: 1,
    });
    this.stored.push(full);
    return full;
  }
  delete = vi.fn(async (_id: string) => true);
  get = vi.fn(async (_id: string) => null);
}

class FakeLog implements ConversationLog {
  public turns: ConversationTurn[] = [];
  async append(turn: ConversationTurn): Promise<void> {
    this.turns.push(turn);
  }
  async recent() {
    return [];
  }
  async clear() {}
}

function baseDeps(over: Partial<DefaultMemoryServiceDeps> = {}): DefaultMemoryServiceDeps {
  const store = new FakeStore();
  const conversationLog = new FakeLog();
  const extractor: MemoryExtractor = { extract: vi.fn(async () => []) };
  const compressor: MemoryCompressor = { compress: vi.fn(async () => null) };
  return {
    store,
    retrievers: [],
    conversationLog,
    extractor,
    compressor,
    ...over,
  };
}

const turn: ConversationTurn = { actor: 'user_1', session: 's1', role: 'user', content: 'hello' };

// ─── observe pipeline ─────────────────────────────────────────────────────────

describe('DefaultMemoryService.observe', () => {
  it('always appends the raw turn to the conversation log', async () => {
    const deps = baseDeps();
    const svc = new DefaultMemoryService(deps);
    await svc.observe(turn);
    expect((deps.conversationLog as FakeLog).turns).toEqual([turn]);
  });

  it('stores each extracted record and indexes it when an indexer is provided', async () => {
    const extracted: Array<Omit<MemoryRecord, 'id' | 'createdAt' | 'version'>> = [
      {
        content: 'likes coffee',
        kind: asKind('preference'),
        level: asLevel('user'),
        owner: 'user_1',
        pinned: false,
        expiresAt: null,
        metadata: {},
      },
    ];
    const indexer = vi.fn(async (_r: MemoryRecord) => {});
    const deps = baseDeps({
      extractor: { extract: vi.fn(async () => extracted) },
      indexer,
    });
    const svc = new DefaultMemoryService(deps);
    await svc.observe(turn);

    expect((deps.store as FakeStore).stored).toHaveLength(1);
    expect(indexer).toHaveBeenCalledOnce();
  });

  it('does not touch the store when nothing is extracted', async () => {
    const deps = baseDeps({ extractor: { extract: vi.fn(async () => []) } });
    const svc = new DefaultMemoryService(deps);
    await svc.observe(turn);
    expect((deps.store as FakeStore).stored).toHaveLength(0);
  });
});

// ─── remember ─────────────────────────────────────────────────────────────────

describe('DefaultMemoryService.remember', () => {
  it('folds modality/ref/session into metadata and stores a record', async () => {
    const deps = baseDeps();
    const svc = new DefaultMemoryService(deps);
    await svc.remember({
      actor: 'user_1',
      content: 'a photo of a cat',
      kind: asKind('episodic'),
      level: asLevel('user'),
      modality: 'image',
      ref: 's3://bucket/cat.png',
      session: 's1',
    });
    const stored = (deps.store as FakeStore).stored;
    expect(stored).toHaveLength(1);
    expect(stored[0]?.metadata).toMatchObject({
      modality: 'image',
      ref: 's3://bucket/cat.png',
      session: 's1',
    });
    expect(stored[0]?.owner).toBe('user_1');
  });
});

// ─── recall pipeline ────────────────────────────────────────────────────────

describe('DefaultMemoryService.recall', () => {
  it('returns [] when no retrievers are configured', async () => {
    const svc = new DefaultMemoryService(baseDeps());
    expect(await svc.recall({ actor: 'user_1', query: 'q' })).toEqual([]);
  });

  it('merges results from multiple retrievers, ranked by relevance', async () => {
    const r1: MemoryRetriever = {
      retrieve: async () => [makeHit('a', 'A', 0.4), makeHit('b', 'B', 0.9)],
    };
    const r2: MemoryRetriever = { retrieve: async () => [makeHit('c', 'C', 0.7)] };
    const svc = new DefaultMemoryService(baseDeps({ retrievers: [r1, r2] }));
    const out = await svc.recall({ actor: 'user_1', query: 'q' });
    expect(out.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });

  it('keeps the highest-relevance copy on id collision across retrievers', async () => {
    const r1: MemoryRetriever = { retrieve: async () => [makeHit('dup', 'X', 0.3)] };
    const r2: MemoryRetriever = { retrieve: async () => [makeHit('dup', 'X', 0.95)] };
    const svc = new DefaultMemoryService(baseDeps({ retrievers: [r1, r2] }));
    const out = await svc.recall({ actor: 'user_1', query: 'q' });
    expect(out).toHaveLength(1);
    expect(out[0]?.relevance).toBe(0.95);
  });

  it('dedupes near-identical content regardless of id', async () => {
    const r1: MemoryRetriever = {
      retrieve: async () => [
        makeHit('a', 'Hello World', 0.9),
        makeHit('b', '  hello   world ', 0.8),
      ],
    };
    const svc = new DefaultMemoryService(baseDeps({ retrievers: [r1] }));
    const out = await svc.recall({ actor: 'user_1', query: 'q' });
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('a');
  });

  it('degrades gracefully when one retriever throws', async () => {
    const ok: MemoryRetriever = { retrieve: async () => [makeHit('a', 'A', 0.5)] };
    const bad: MemoryRetriever = {
      retrieve: async () => {
        throw new Error('backend down');
      },
    };
    const svc = new DefaultMemoryService(baseDeps({ retrievers: [ok, bad] }));
    const out = await svc.recall({ actor: 'user_1', query: 'q' });
    expect(out.map((m) => m.id)).toEqual(['a']);
  });

  it('respects ctx.limit', async () => {
    const r: MemoryRetriever = {
      retrieve: async () => [
        makeHit('a', 'A', 0.9),
        makeHit('b', 'B', 0.8),
        makeHit('c', 'C', 0.7),
      ],
    };
    const svc = new DefaultMemoryService(baseDeps({ retrievers: [r] }));
    const out = await svc.recall({ actor: 'user_1', query: 'q', limit: 2 });
    expect(out.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('respects ctx.budget by skipping over-budget records', async () => {
    // ~4 chars/token: 40 chars ≈ 10 tokens each.
    const big = 'x'.repeat(40);
    const small = 'y'.repeat(4);
    const r: MemoryRetriever = {
      retrieve: async () => [makeHit('big', big, 0.9), makeHit('small', small, 0.8)],
    };
    const svc = new DefaultMemoryService(baseDeps({ retrievers: [r] }));
    const out = await svc.recall({ actor: 'user_1', query: 'q', budget: 5 });
    expect(out.map((m) => m.id)).toEqual(['small']);
  });
});

// ─── forget ─────────────────────────────────────────────────────────────────

describe('DefaultMemoryService.forget', () => {
  it('hard-deletes from the store and writes an audit event', async () => {
    const audit = vi.fn(async () => {});
    const deps = baseDeps({ audit });
    const svc = new DefaultMemoryService(deps);
    const ok = await svc.forget('rec_9', { mode: 'hard', reason: 'gdpr', requestedBy: 'user_1' });
    expect(ok).toBe(true);
    expect((deps.store as FakeStore).delete).toHaveBeenCalledWith('rec_9');
    expect(audit).toHaveBeenCalledOnce();
  });

  it('archive mode demotes via maintenance instead of deleting', async () => {
    const maintenance: MemoryMaintenance = {
      decay: vi.fn(async () => 0),
      pin: vi.fn(async () => true),
      unpin: vi.fn(async () => true),
      promote: vi.fn(async () => true),
      demote: vi.fn(async () => true),
    };
    const deps = baseDeps({ maintenance });
    const svc = new DefaultMemoryService(deps);
    const ok = await svc.forget('rec_9', { mode: 'archive', reason: 'user asked' });
    expect(ok).toBe(true);
    expect(maintenance.demote).toHaveBeenCalledWith('rec_9');
    expect((deps.store as FakeStore).delete).not.toHaveBeenCalled();
  });

  it('archive returns false when no maintenance port is wired', async () => {
    const svc = new DefaultMemoryService(baseDeps());
    const ok = await svc.forget('rec_9', { mode: 'archive', reason: 'x' });
    expect(ok).toBe(false);
  });
});

// ─── compress ─────────────────────────────────────────────────────────────────

describe('DefaultMemoryService.compress', () => {
  it('delegates to the injected compressor', async () => {
    const compressor: MemoryCompressor = { compress: vi.fn(async () => 'summary text') };
    const svc = new DefaultMemoryService(baseDeps({ compressor }));
    const out = await svc.compress('user_1', 's1');
    expect(out).toBe('summary text');
    expect(compressor.compress).toHaveBeenCalledWith('user_1', 's1');
  });
});

// ─── strategy units ───────────────────────────────────────────────────────────

describe('recall strategies', () => {
  it('DefaultMergeStrategy sorts by relevance and de-collides ids', () => {
    const merged = new DefaultMergeStrategy().merge([
      [makeHit('a', 'A', 0.2)],
      [makeHit('a', 'A', 0.8), makeHit('b', 'B', 0.5)],
    ]);
    expect(merged.map((m) => [m.id, m.relevance])).toEqual([
      ['a', 0.8],
      ['b', 0.5],
    ]);
  });

  it('DefaultBudgetAllocator returns everything when budget is undefined', () => {
    const hits = [makeHit('a', 'A', 0.9), makeHit('b', 'B', 0.8)];
    expect(new DefaultBudgetAllocator().fit(hits, undefined)).toHaveLength(2);
  });

  it('DefaultDeduplicator collapses whitespace-different content', () => {
    const out = new DefaultDeduplicator().dedupe([
      makeHit('a', 'Hi There', 0.9),
      makeHit('b', 'hi   there', 0.1),
    ]);
    expect(out).toHaveLength(1);
  });
});
