import { describe, it, expect } from 'vitest';
import { runBaseline, formatBaselineMarkdown, type BaselineDeps } from '../eval/baseline-runner';
import { createMemoryService } from '../core/memory-composition';
import { LlmExtractionModel } from '../adapters/llm-extraction-model';
import type { MemoryRecordRow, MemoryRecordCreateData } from '../core/prisma-memory-store';
import type { MemoryDbClient } from '../core/memory-composition';
import { facts, preferences, isolation, hallucination } from '../eval/datasets';

// ─── In-memory Prisma client (same shape the memory-eval runner uses) ─────────

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
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      this.rows.find((r) => matchWhere(r, where)) ?? null,
    findMany: async ({
      where,
      orderBy,
      take,
    }: {
      where: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'>;
      take?: number;
    }) => {
      let matches = this.rows.filter((r) => matchWhere(r, where));
      if (orderBy?.['createdAt'] === 'desc') {
        matches = matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return typeof take === 'number' ? matches.slice(0, take) : matches;
    },
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
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
    }) => {
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

// ─── Deterministic fake OpenAI fetch (no network) ─────────────────────────────
// Handles /chat/completions (extraction). Returns one "store" fact per user
// message whose value is the message text, so keyword recall can find it.

const fakeOpenAIFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.toString();
  const body = init?.body ? JSON.parse(String(init.body)) : {};

  if (url.includes('/chat/completions')) {
    const userMsg: string =
      body.messages?.find((m: { role: string }) => m.role === 'user')?.content ?? '';
    const facts = userMsg.trim()
      ? [
          {
            slot: 'note',
            value: userMsg,
            operation: 'store',
            polarity: 'positive',
            temporal: 'current',
            confidence: 0.9,
            subject: 'user',
          },
        ]
      : [];
    return jsonResponse({
      choices: [{ message: { content: JSON.stringify({ facts }) } }],
      usage: { total_tokens: 42 },
    });
  }
  return jsonResponse({ error: 'unexpected endpoint' }, 400);
};

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── The test ─────────────────────────────────────────────────────────────────

function makeDeps(): BaselineDeps {
  const extractor = new LlmExtractionModel({
    apiKey: 'test-key',
    model: 'gpt-4o-mini',
    fetch: fakeOpenAIFetch,
  });
  return {
    makeService: () =>
      createMemoryService({
        prisma: new InMemoryDbClient(),
        extractor,
        // No vector layer needed to verify runner logic; keyword retriever answers.
        conflictResolver: false,
      }),
    extractor,
    meta: {
      commitSha: 'testsha',
      mode: 'fake',
      embeddingModel: 'none',
      extractionModel: 'gpt-4o-mini',
      vectorBackend: 'none',
    },
    scenarios: [facts, preferences, isolation, hallucination],
  };
}

describe('M11d baseline runner (deterministic, offline)', () => {
  it('produces a structurally-complete, JSON-serializable baseline report', async () => {
    const report = await runBaseline(makeDeps());

    // Meta is recorded verbatim for reproducibility.
    expect(report.meta.mode).toBe('fake');
    expect(report.meta.datasetVersion).toBe('m11d-v1');
    expect(report.meta.extractionModel).toBe('gpt-4o-mini');
    expect(report.meta.at).toMatch(/\d{4}-\d{2}-\d{2}T/);

    // Retrieval: one row per scenario + a weighted overall.
    expect(report.retrieval.perScenario).toHaveLength(4);
    expect(report.retrieval.overall.scenario).toBe('OVERALL');
    expect(report.retrieval.overall.totalQueries).toBeGreaterThan(0);
    expect(report.retrieval.memoryHitRate).toBeGreaterThanOrEqual(0);
    expect(report.retrieval.memoryHitRate).toBeLessThanOrEqual(1);

    // Extraction: fake usage reports tokens, so cost/token metrics are populated.
    expect(report.extraction.totalTokens).toBeGreaterThan(0);
    expect(report.extraction.hallucinationRate).toBeGreaterThanOrEqual(0);
    expect(report.extraction.hallucinationRate).toBeLessThanOrEqual(1);

    // Shadow: one report per query; aggregate + gates present.
    expect(report.shadow.aggregate.total).toBeGreaterThan(0);
    expect(typeof report.shadow.gates.passed).toBe('boolean');

    // The whole report must be archivable as JSON.
    expect(() => JSON.stringify(report)).not.toThrow();
  });

  it('recalls a simple fact through the real orchestration (facts scenario)', async () => {
    const deps = makeDeps();
    deps.scenarios = [facts];
    const report = await runBaseline(deps);
    const factsRow = report.retrieval.perScenario.find((m) => m.scenario === 'facts');
    // The fake stores each user message verbatim, so "I live in Patna" is recalled.
    expect(factsRow?.recallAccuracy).toBeGreaterThan(0);
  });

  it('formats a deterministic markdown archive', async () => {
    const report = await runBaseline(makeDeps());
    const md = formatBaselineMarkdown(report);
    expect(md).toContain('# Memory Baseline — m11d-v1 (fake)');
    expect(md).toContain('## Retrieval');
    expect(md).toContain('## Extraction');
    expect(md).toContain('## Shadow divergence');
    expect(md).toContain('Memory hit rate:');
  });
});
