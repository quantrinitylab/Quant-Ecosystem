import { describe, it, expect } from 'vitest';
import {
  DefaultMemoryAcceptancePolicy,
  type MemoryPolicy,
  type AcceptanceCandidate,
} from '../core/memory-acceptance-policy';
import { replay, diffPolicies, type ReplayRecord } from '../eval/policy-replay';
import { createMemoryService, type MemoryDbClient } from '../core/memory-composition';
import type { MemoryRecordRow, MemoryRecordCreateData } from '../core/prisma-memory-store';

// ============================================================================
// Pre-merge review checks (review items #1 determinism, #2 policy-version
// migration, #3 performance baseline). #4 (live smoke test) is M11d.
// ============================================================================

const V1: MemoryPolicy = {
  version: 'v1',
  activateThreshold: 0.7,
  pendingThreshold: 0.35,
  epsilon: 0.1,
};
const V2: MemoryPolicy = {
  version: 'v2',
  activateThreshold: 0.5,
  pendingThreshold: 0.35,
  epsilon: 0.1,
};
const p1 = new DefaultMemoryAcceptancePolicy(V1);

function rec(id: string, candidate: AcceptanceCandidate): ReplayRecord {
  return {
    candidateId: id,
    candidate,
    existing: [],
    decision: p1.decide(candidate, []),
    at: Date.now(),
  };
}

const dataset: ReplayRecord[] = [
  rec('a', { confidence: 0.95, trust: 1, provenance: 'llm.gpt' }),
  rec('b', { confidence: 0.6, trust: 1, provenance: 'llm.gpt' }),
  rec('c', { confidence: 0.55, trust: 1, provenance: 'llm.gpt' }),
  rec('d', { confidence: 0.2, trust: 1, provenance: 'llm.gpt' }),
];

// ─── #1 Replay determinism ────────────────────────────────────────────────────

describe('#1 replay determinism', () => {
  it('produces byte-identical output across repeated runs (no timestamps/random/map-order)', () => {
    const runs = Array.from({ length: 5 }, () =>
      JSON.stringify(replay(dataset, new DefaultMemoryAcceptancePolicy(V2))),
    );
    expect(new Set(runs).size).toBe(1); // all identical
  });

  it('decision is independent of the record timestamp', () => {
    const c: AcceptanceCandidate = { confidence: 0.6, trust: 1, provenance: 'llm.gpt' };
    const early: ReplayRecord = {
      candidateId: 'x',
      candidate: c,
      existing: [],
      decision: p1.decide(c, []),
      at: 1,
    };
    const late: ReplayRecord = {
      candidateId: 'x',
      candidate: c,
      existing: [],
      decision: p1.decide(c, []),
      at: 9_999_999,
    };
    expect(replay([early], p1)[0]?.replayed).toBe(replay([late], p1)[0]?.replayed);
  });
});

// ─── #2 Policy-version migration ───────────────────────────────────────────────

describe('#2 policy-version migration (mixed v1/v2)', () => {
  it('recorded v1 decisions replay correctly under a new v2 policy', () => {
    // Records were decided under v1 (stored in decision.policyVersion).
    expect(dataset.every((r) => r.decision.policyVersion === 'v1')).toBe(true);

    const diff = diffPolicies(dataset, p1, new DefaultMemoryAcceptancePolicy(V2));
    expect(diff.fromVersion).toBe('v1');
    expect(diff.toVersion).toBe('v2');
    // Lowering activate 0.70 -> 0.50 promotes b (0.6) and c (0.55): pending -> active.
    expect(diff.transitions['store_pending -> store_active']).toBe(2);
  });

  it('a mixed batch (some v1-decided, some v2-decided) replays deterministically under v2', () => {
    const p2 = new DefaultMemoryAcceptancePolicy(V2);
    const mixed: ReplayRecord[] = [
      dataset[0]!, // v1-decided
      { ...dataset[1]!, decision: p2.decide(dataset[1]!.candidate, []) }, // v2-decided
    ];
    const out = replay(mixed, p2);
    // Under v2, both are store_active (0.95 and 0.6 ≥ 0.5). Second was already v2 → unchanged.
    expect(out.map((o) => o.replayed)).toEqual(['store_active', 'store_active']);
  });
});

// ─── #3 Performance baseline ────────────────────────────────────────────────────

class FastDb implements MemoryDbClient {
  public rows: MemoryRecordRow[] = [];
  private seq = 0;
  memoryRecord = {
    create: async ({ data }: { data: MemoryRecordCreateData }) => {
      const n = ++this.seq;
      const now = new Date();
      const row: MemoryRecordRow = {
        id: `row_${n}`,
        logicalId: `mem_${n}`,
        version: 1,
        ownerType: data.ownerType,
        ownerId: data.ownerId,
        tenantId: data.tenantId,
        kind: data.kind,
        level: data.level,
        content: data.content,
        pinned: data.pinned,
        metadata: data.metadata,
        expiresAt: data.expiresAt,
        archivedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.rows.push(row);
      return row;
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      this.rows.find((r) => m(r, where)) ?? null,
    findMany: async ({ where, take }: { where: Record<string, unknown>; take?: number }) => {
      const r = this.rows.filter((x) => m(x, where));
      return typeof take === 'number' ? r.slice(0, take) : r;
    },
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
      const b = this.rows.length;
      this.rows = this.rows.filter((r) => !m(r, where));
      return { count: b - this.rows.length };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: { archivedAt: Date };
    }) => {
      let c = 0;
      for (const r of this.rows)
        if (m(r, where)) {
          r.archivedAt = data.archivedAt;
          c++;
        }
      return { count: c };
    },
  };
}
function m(row: MemoryRecordRow, where: Record<string, unknown>): boolean {
  if ('logicalId' in where && row.logicalId !== where['logicalId']) return false;
  if ('ownerId' in where && row.ownerId !== where['ownerId']) return false;
  if ('deletedAt' in where && where['deletedAt'] === null && row.deletedAt !== null) return false;
  return true;
}

describe('#3 performance baseline (loose bounds to catch gross regressions)', () => {
  it('records observe/recall/replay latency baselines', async () => {
    const db = new FastDb();
    const service = createMemoryService({ prisma: db });

    const N = 200;
    const tObserveStart = Date.now();
    for (let i = 0; i < N; i++) {
      await service.observe({
        actor: 'user_1',
        session: 's',
        role: 'user',
        content: `I like item${i}`,
      });
    }
    const observeAvg = (Date.now() - tObserveStart) / N;

    const tRecall = Date.now();
    await service.recall({ actor: 'user_1', query: 'what do I like' });
    const recallMs = Date.now() - tRecall;

    const replayInput = Array.from({ length: 1000 }, (_, i) =>
      rec(`r${i}`, { confidence: (i % 100) / 100, trust: 1, provenance: 'llm.gpt' }),
    );
    const tReplay = Date.now();
    replay(replayInput, p1);
    const replayMs = Date.now() - tReplay;

    // eslint-disable-next-line no-console
    console.log(
      `[perf baseline] observe avg ${observeAvg.toFixed(3)}ms/turn | recall ${recallMs}ms | replay(1000) ${replayMs}ms`,
    );

    // Loose upper bounds — catch catastrophic regressions without flakiness.
    expect(observeAvg).toBeLessThan(50);
    expect(recallMs).toBeLessThan(500);
    expect(replayMs).toBeLessThan(500);
  });
});
