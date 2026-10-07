// ============================================================================
// Memory Evaluation — runner (PR-M06)
//
// Exercises the REAL memory object graph (createMemoryService → extractor →
// store → keyword retriever) against the datasets and computes quality metrics.
// Backend-agnostic: uses an in-memory client so it runs anywhere, but the code
// path under test is the production orchestration + extraction + retrieval.
//
// Run:  pnpm --filter @quant/ai memory:eval
// ============================================================================

import { createMemoryService, type MemoryDbClient } from '../core/memory-composition';
import type { MemoryRecordRow, MemoryRecordCreateData } from '../core/prisma-memory-store';
import type { RetrievedMemory } from '../core/memory-port';
import type { EvalMetrics, EvalScenario } from './types';
import { allScenarios } from './datasets';

// ─── In-memory client (same shape the fake integration test uses) ────────────

class InMemoryDbClient implements MemoryDbClient {
  public rows: MemoryRecordRow[] = [];
  private seq = 0;

  memoryRecord = {
    create: async ({ data }: { data: MemoryRecordCreateData }): Promise<MemoryRecordRow> => {
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
    findFirst: async ({
      where,
    }: {
      where: Record<string, unknown>;
    }): Promise<MemoryRecordRow | null> => this.rows.find((r) => matchWhere(r, where)) ?? null,
    findMany: async ({
      where,
      orderBy,
      take,
    }: {
      where: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'>;
      take?: number;
    }): Promise<MemoryRecordRow[]> => {
      let matches = this.rows.filter((r) => matchWhere(r, where));
      if (orderBy?.['createdAt'] === 'desc') {
        matches = matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return typeof take === 'number' ? matches.slice(0, take) : matches;
    },
    deleteMany: async ({
      where,
    }: {
      where: Record<string, unknown>;
    }): Promise<{ count: number }> => {
      const before = this.rows.length;
      this.rows = this.rows.filter((r) => !matchWhere(r, where));
      return { count: before - this.rows.length };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: { archivedAt: Date };
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const r of this.rows) {
        if (matchWhere(r, where)) {
          r.archivedAt = data.archivedAt;
          count++;
        }
      }
      return { count };
    },
  };
}

function matchWhere(row: MemoryRecordRow, where: Record<string, unknown>): boolean {
  if ('logicalId' in where && row.logicalId !== where['logicalId']) return false;
  if ('ownerId' in where && row.ownerId !== where['ownerId']) return false;
  if ('deletedAt' in where && where['deletedAt'] === null && row.deletedAt !== null) return false;
  if ('archivedAt' in where && where['archivedAt'] === null && row.archivedAt !== null)
    return false;
  return true;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

const TOP_K = 5;
const includedIn = (results: RetrievedMemory[], needle: string): boolean =>
  results.some((r) => r.content.toLowerCase().includes(needle.toLowerCase()));

/**
 * Builds the service under evaluation for one case. The default exercises the
 * keyword-only path (backend-agnostic, runs anywhere). Live/semantic runs pass
 * a factory that adds the vector layer (real embedder + vector backend) —
 * see memory-eval-live.test.ts. The scoring logic is IDENTICAL either way,
 * so dashboards stay comparable across configurations.
 */
export type EvalServiceFactory = (
  db: MemoryDbClient,
  context: { scenario: string; caseId: string },
) => Promise<ReturnType<typeof createMemoryService>> | ReturnType<typeof createMemoryService>;

const defaultServiceFactory: EvalServiceFactory = (db) => createMemoryService({ prisma: db });

async function evaluateScenario(
  scenario: EvalScenario,
  serviceFactory: EvalServiceFactory = defaultServiceFactory,
): Promise<EvalMetrics> {
  let totalQueries = 0;
  let recallHits = 0;
  let precisionHits = 0;
  let wrongMemories = 0;
  let missedMemories = 0;
  let duplicateCount = 0;
  let resultCount = 0;
  const latencies: number[] = [];

  for (const testCase of scenario.cases) {
    const db = new InMemoryDbClient();
    const service = await serviceFactory(db, { scenario: scenario.name, caseId: testCase.id });
    const actor = 'user_1';

    for (const turn of testCase.seed) {
      await service.observe({ actor, session: 'eval', role: turn.role, content: turn.content });
    }

    for (const q of testCase.queries) {
      // The isolation scenario is probed as a different actor.
      const queryActor = scenario.name === 'isolation' ? 'other_user' : actor;

      const start = Date.now();
      const results = (await service.recall({ actor: queryActor, query: q.query })).slice(0, TOP_K);
      latencies.push(Date.now() - start);

      totalQueries++;
      resultCount += results.length;

      // Duplicate detection within a single recall.
      const seen = new Set<string>();
      for (const r of results) {
        const key = r.content.trim().toLowerCase();
        if (seen.has(key)) duplicateCount++;
        seen.add(key);
      }

      const missed = q.expectIncludes.filter((inc) => !includedIn(results, inc));
      const wrong = (q.expectExcludes ?? []).filter((exc) => includedIn(results, exc));

      missedMemories += missed.length;
      wrongMemories += wrong.length;
      if (missed.length === 0) recallHits++;
      if (wrong.length === 0) precisionHits++;
    }
  }

  return {
    scenario: scenario.name,
    totalQueries,
    recallAccuracy: totalQueries ? recallHits / totalQueries : 1,
    precision: totalQueries ? precisionHits / totalQueries : 1,
    duplicateRate: resultCount ? duplicateCount / resultCount : 0,
    avgLatencyMs: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
    wrongMemories,
    missedMemories,
  };
}

export async function runMemoryEval(
  scenarios: EvalScenario[] = allScenarios,
  serviceFactory?: EvalServiceFactory,
): Promise<{ perScenario: EvalMetrics[]; overall: EvalMetrics }> {
  const perScenario: EvalMetrics[] = [];
  for (const s of scenarios) perScenario.push(await evaluateScenario(s, serviceFactory));

  const totalQueries = perScenario.reduce((a, m) => a + m.totalQueries, 0);
  const weighted = (sel: (m: EvalMetrics) => number): number =>
    totalQueries ? perScenario.reduce((a, m) => a + sel(m) * m.totalQueries, 0) / totalQueries : 1;

  const overall: EvalMetrics = {
    scenario: 'OVERALL',
    totalQueries,
    recallAccuracy: weighted((m) => m.recallAccuracy),
    precision: weighted((m) => m.precision),
    duplicateRate: weighted((m) => m.duplicateRate),
    avgLatencyMs: weighted((m) => m.avgLatencyMs),
    wrongMemories: perScenario.reduce((a, m) => a + m.wrongMemories, 0),
    missedMemories: perScenario.reduce((a, m) => a + m.missedMemories, 0),
  };

  return { perScenario, overall };
}

// ─── Dashboard formatting ──────────────────────────────────────────────────────

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

export function formatDashboard(
  result: { perScenario: EvalMetrics[]; overall: EvalMetrics },
  scenarios: EvalScenario[] = allScenarios,
): string {
  const hardNames = new Set(scenarios.filter((s) => s.knownHard).map((s) => s.name));
  const lines: string[] = [];
  lines.push('');
  lines.push('=== Memory Evaluation ===');
  lines.push(
    'scenario'.padEnd(14) +
      'recall'.padStart(8) +
      'prec'.padStart(8) +
      'dup'.padStart(7) +
      'lat(ms)'.padStart(9) +
      'wrong'.padStart(7) +
      'missed'.padStart(8) +
      '  notes',
  );
  for (const m of result.perScenario) {
    lines.push(
      m.scenario.padEnd(14) +
        pct(m.recallAccuracy).padStart(8) +
        pct(m.precision).padStart(8) +
        pct(m.duplicateRate).padStart(7) +
        m.avgLatencyMs.toFixed(1).padStart(9) +
        String(m.wrongMemories).padStart(7) +
        String(m.missedMemories).padStart(8) +
        (hardNames.has(m.scenario) ? '  known-hard' : ''),
    );
  }
  const o = result.overall;
  lines.push('-'.repeat(61));
  lines.push(
    o.scenario.padEnd(14) +
      pct(o.recallAccuracy).padStart(8) +
      pct(o.precision).padStart(8) +
      pct(o.duplicateRate).padStart(7) +
      o.avgLatencyMs.toFixed(1).padStart(9) +
      String(o.wrongMemories).padStart(7) +
      String(o.missedMemories).padStart(8),
  );
  lines.push('');
  return lines.join('\n');
}

// Direct execution: print the dashboard.
if (typeof process !== 'undefined' && process.argv[1] && /memory-eval/.test(process.argv[1])) {
  void runMemoryEval().then((result) => {
    // eslint-disable-next-line no-console
    console.log(formatDashboard(result));
  });
}
