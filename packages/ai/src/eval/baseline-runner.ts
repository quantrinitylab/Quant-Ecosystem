// ============================================================================
// M11d — Live Baseline Runner
//
// Captures the FIRST honest baseline of the wired memory subsystem, running the
// SAME datasets and metric code as the offline eval but against injected, real
// backends (OpenAI embeddings + Qdrant + LLM extraction + Postgres). It is
// dependency-injected so it is:
//   - verifiable OFFLINE with deterministic fakes (no network, no docker), and
//   - runnable LIVE by swapping in the real adapters via env (see composeLive).
//
// DISCIPLINE (M11d rules, enforced by construction):
//   - No tuning. The runner never changes prompts, weights, or datasets.
//   - Dataset + prompt + model are recorded in the report's `meta` so a run is
//     scientifically reproducible.
//   - The runner MEASURES; it never optimizes. Metric code is reused verbatim
//     from the existing eval (runExtractionEval, shadow-replay aggregation).
//
// Metric set (as specified for M11d):
//   latency · retrieval recall · token usage · cost · hallucination rate ·
//   shadow divergence · memory hit rate.
// ============================================================================

import type { MemoryService, RetrievedMemory } from '../core/memory-port';
import { createMemoryService, type MemoryDbClient } from '../core/memory-composition';
import { MemoryFacade, type ShadowReport } from '../core/memory-facade';
import { LegacyMemoryAdapter } from '../core/legacy-memory-adapter';
import { ContextManager } from '../core/context-manager';
import {
  runExtractionEval,
  llmExtractorAdapter,
  type ExtractionQualityMetrics,
  type EvaluableExtractor,
} from './extraction-eval';
import {
  aggregateShadowReports,
  evaluateCutoverGates,
  type ShadowAggregate,
  type CutoverGateResult,
} from './shadow-replay';
import { coreScenarios, frontierScenarios } from './datasets';
import type { EvalMetrics, EvalScenario } from './types';
import type { InstrumentedExtractionModel } from '../core/extraction-schema';

const TOP_K = 5;
const DATASET_VERSION = 'm11d-v1'; // frozen: coreScenarios + frontierScenarios @ this tag

// ─── Report shape (frozen, archived as JSON) ─────────────────────────────────

export interface BaselineMeta {
  at: string;
  commitSha: string;
  mode: 'live' | 'fake';
  embeddingModel: string;
  extractionModel: string;
  vectorBackend: string;
  datasetVersion: string;
  node: string;
  notes?: string;
}

export interface RetrievalBaseline {
  perScenario: EvalMetrics[];
  overall: EvalMetrics;
  /** Fraction of queries that returned >= 1 memory (memory hit rate). */
  memoryHitRate: number;
}

export interface BaselineReport {
  meta: BaselineMeta;
  retrieval: RetrievalBaseline;
  extraction: ExtractionQualityMetrics;
  shadow: { aggregate: ShadowAggregate; gates: CutoverGateResult };
}

// ─── Dependencies the runner needs (all injectable) ──────────────────────────

export interface BaselineDeps {
  /**
   * Build a FRESH, empty MemoryService for one evaluation case. Each case gets
   * its own service/owner so cases never contaminate each other. In live mode
   * this wires PrismaMemoryStore + vector retriever; in tests, an in-memory one.
   */
  makeService: (caseId: string) => Promise<MemoryService> | MemoryService;
  /** The instrumented extractor under test (LLM in live mode). */
  extractor: InstrumentedExtractionModel;
  /** Metadata for reproducibility (recorded verbatim into the report). */
  meta: Omit<BaselineMeta, 'at' | 'datasetVersion' | 'node'>;
  /** Scenarios to run (default: core + frontier — the frozen M11d dataset). */
  scenarios?: EvalScenario[];
}

// ─── Retrieval + hit-rate over the REAL service ──────────────────────────────

const includedIn = (results: RetrievedMemory[], needle: string): boolean =>
  results.some((r) => r.content.toLowerCase().includes(needle.toLowerCase()));

async function evaluateRetrieval(
  deps: BaselineDeps,
  scenario: EvalScenario,
  hit: { queries: number; withResult: number },
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
    const service = await deps.makeService(`${scenario.name}:${testCase.id}`);
    // Per-case unique actor so cases never contaminate each other even against a
    // SHARED live Postgres/Qdrant (not just fresh in-memory clients).
    const actor = `u:${scenario.name}:${testCase.id}`;

    for (const turn of testCase.seed) {
      await service.observe({ actor, session: 'baseline', role: turn.role, content: turn.content });
    }

    for (const q of testCase.queries) {
      // Isolation scenario is probed as a DIFFERENT actor (must recall nothing).
      const queryActor =
        scenario.name === 'isolation' ? `other:${scenario.name}:${testCase.id}` : actor;

      const start = Date.now();
      const results = (await service.recall({ actor: queryActor, query: q.query })).slice(0, TOP_K);
      latencies.push(Date.now() - start);

      totalQueries++;
      resultCount += results.length;
      hit.queries++;
      if (results.length > 0) hit.withResult++;

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

// ─── Shadow divergence: legacy ContextManager vs new MemoryService ────────────

async function measureShadowDivergence(
  deps: BaselineDeps,
  scenarios: EvalScenario[],
): Promise<{ reports: ShadowReport[]; legacyAvgLatencyMs: number }> {
  const reports: ShadowReport[] = [];
  const legacyLatencies: number[] = [];

  for (const scenario of scenarios) {
    for (const testCase of scenario.cases) {
      const cm = new ContextManager();
      const legacy = new LegacyMemoryAdapter(cm);
      const next = await deps.makeService(`shadow:${scenario.name}:${testCase.id}`);
      const facade = new MemoryFacade({
        mode: 'shadow',
        legacy,
        next,
        onShadow: (r) => {
          reports.push(r);
          legacyLatencies.push(r.legacy.latencyMs);
        },
        requestId: () => `${scenario.name}:${testCase.id}:${reports.length}`,
      });

      const actor = `s:${scenario.name}:${testCase.id}`;
      for (const turn of testCase.seed) {
        await facade.observe({
          actor,
          session: 'baseline',
          role: turn.role,
          content: turn.content,
        });
      }
      for (const q of testCase.queries) {
        await facade.recall({ actor, query: q.query });
      }
    }
  }

  const legacyAvgLatencyMs = legacyLatencies.length
    ? legacyLatencies.reduce((a, b) => a + b, 0) / legacyLatencies.length
    : 0;
  return { reports, legacyAvgLatencyMs };
}

// ─── The runner ───────────────────────────────────────────────────────────────

export async function runBaseline(deps: BaselineDeps): Promise<BaselineReport> {
  const scenarios = deps.scenarios ?? [...coreScenarios, ...frontierScenarios];

  // 1. Retrieval quality + memory hit rate against the real service.
  const hit = { queries: 0, withResult: 0 };
  const perScenario: EvalMetrics[] = [];
  for (const s of scenarios) perScenario.push(await evaluateRetrieval(deps, s, hit));
  const overall = aggregateOverall(perScenario);
  const memoryHitRate = hit.queries ? hit.withResult / hit.queries : 0;

  // 2. Extraction quality (tokens / cost / hallucination / ECE) via the shared harness.
  const extractor: EvaluableExtractor = llmExtractorAdapter(
    deps.extractor,
    deps.meta.extractionModel,
  );
  const extraction = await runExtractionEval(extractor);

  // 3. Shadow divergence: legacy vs new over the same conversations.
  const { reports, legacyAvgLatencyMs } = await measureShadowDivergence(deps, scenarios);
  const aggregate = aggregateShadowReports(reports);
  const gates = evaluateCutoverGates(aggregate, legacyAvgLatencyMs);

  return {
    meta: {
      at: new Date().toISOString(),
      datasetVersion: DATASET_VERSION,
      node: typeof process !== 'undefined' ? process.version : 'unknown',
      ...deps.meta,
    },
    retrieval: { perScenario, overall, memoryHitRate },
    extraction,
    shadow: { aggregate, gates },
  };
}

// ─── Live composition (real OpenAI + Qdrant + LLM extractor) ──────────────────

/**
 * Build live BaselineDeps from environment + an injected Prisma client. The
 * `ai` package does not depend on `@quant/database`, so the caller (a script or
 * CI job that can import PrismaClient) passes the client in. This throws fast if
 * OPENAI_API_KEY / QDRANT_URL are missing — there is NO silent fake fallback, so
 * a baseline is never accidentally captured against stubs.
 *
 * Every case shares the injected Prisma/Qdrant; the runner isolates cases by a
 * unique per-case actor, so no reset between cases is required.
 */
export async function composeLiveBaselineDeps(args: {
  prisma: MemoryDbClient & Record<string, unknown>;
  embeddingClient: unknown;
  commitSha: string;
  env?: NodeJS.ProcessEnv;
  notes?: string;
}): Promise<BaselineDeps> {
  const env = args.env ?? (typeof process !== 'undefined' ? process.env : {});
  const { OpenAIEmbeddingProvider, loadOpenAIEmbeddingConfig } =
    await import('../adapters/openai-embedding-provider');
  const { QdrantVectorBackend, loadQdrantConfig } =
    await import('../adapters/qdrant-vector-backend');
  const { LlmExtractionModel } = await import('../adapters/llm-extraction-model');

  const embedCfg = loadOpenAIEmbeddingConfig(env);
  const embedder = new OpenAIEmbeddingProvider(embedCfg);
  const qdrantCfg = loadQdrantConfig(env);
  const vectorBackend = new QdrantVectorBackend(qdrantCfg);
  const extractionModel = env['MEMORY_EXTRACTION_MODEL'] ?? 'gpt-4o-mini';
  const extractor = new LlmExtractionModel({ apiKey: embedCfg.apiKey, model: extractionModel });

  const makeService = (): MemoryService =>
    createMemoryService({
      prisma: args.prisma,
      extractor,
      vector: {
        embedder,
        vectorBackend,
        embeddingClient: args.embeddingClient as never,
      },
    });

  return {
    makeService,
    extractor,
    meta: {
      commitSha: args.commitSha,
      mode: 'live',
      embeddingModel: embedder.model,
      extractionModel,
      vectorBackend: vectorBackend.name,
      ...(args.notes ? { notes: args.notes } : {}),
    },
  };
}

function aggregateOverall(perScenario: EvalMetrics[]): EvalMetrics {
  const totalQueries = perScenario.reduce((a, m) => a + m.totalQueries, 0);
  const weighted = (sel: (m: EvalMetrics) => number): number =>
    totalQueries ? perScenario.reduce((a, m) => a + sel(m) * m.totalQueries, 0) / totalQueries : 1;
  return {
    scenario: 'OVERALL',
    totalQueries,
    recallAccuracy: weighted((m) => m.recallAccuracy),
    precision: weighted((m) => m.precision),
    duplicateRate: weighted((m) => m.duplicateRate),
    avgLatencyMs: weighted((m) => m.avgLatencyMs),
    wrongMemories: perScenario.reduce((a, m) => a + m.wrongMemories, 0),
    missedMemories: perScenario.reduce((a, m) => a + m.missedMemories, 0),
  };
}

// ─── Markdown formatting (for the archived baseline doc) ──────────────────────

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

export function formatBaselineMarkdown(r: BaselineReport): string {
  const L: string[] = [];
  L.push(`# Memory Baseline — ${r.meta.datasetVersion} (${r.meta.mode})`);
  L.push('');
  L.push(`- Captured: ${r.meta.at}`);
  L.push(`- Commit: ${r.meta.commitSha}`);
  L.push(`- Embedding model: ${r.meta.embeddingModel}`);
  L.push(`- Extraction model: ${r.meta.extractionModel}`);
  L.push(`- Vector backend: ${r.meta.vectorBackend}`);
  L.push(`- Node: ${r.meta.node}`);
  if (r.meta.notes) L.push(`- Notes: ${r.meta.notes}`);
  L.push('');
  L.push('## Retrieval');
  L.push('');
  L.push('| scenario | recall | precision | dup | lat(ms) | wrong | missed |');
  L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const m of r.retrieval.perScenario) {
    L.push(
      `| ${m.scenario} | ${pct(m.recallAccuracy)} | ${pct(m.precision)} | ${pct(m.duplicateRate)} | ${m.avgLatencyMs.toFixed(1)} | ${m.wrongMemories} | ${m.missedMemories} |`,
    );
  }
  const o = r.retrieval.overall;
  L.push(
    `| **OVERALL** | ${pct(o.recallAccuracy)} | ${pct(o.precision)} | ${pct(o.duplicateRate)} | ${o.avgLatencyMs.toFixed(1)} | ${o.wrongMemories} | ${o.missedMemories} |`,
  );
  L.push('');
  L.push(`- Memory hit rate: ${pct(r.retrieval.memoryHitRate)}`);
  L.push('');
  L.push('## Extraction');
  L.push('');
  const e = r.extraction;
  L.push(`- Candidate precision: ${pct(e.candidatePrecision)}`);
  L.push(`- Candidate recall: ${pct(e.candidateRecall)}`);
  L.push(`- Hallucination rate: ${pct(e.hallucinationRate)} (${e.hallucinations} hallucinations)`);
  L.push(`- ECE: ${e.ece.toFixed(3)} · Brier: ${e.brier.toFixed(3)}`);
  L.push(`- Tokens: ${e.totalTokens} · Cost: $${e.totalCostUsd.toFixed(4)}`);
  L.push(`- Avg extraction latency: ${e.avgLatencyMs.toFixed(1)} ms`);
  L.push('');
  L.push('## Shadow divergence (legacy vs new)');
  L.push('');
  const s = r.shadow.aggregate;
  L.push(`- Reports: ${s.total} · Avg agreement: ${pct(s.avgAgreement)}`);
  L.push(
    `- Severity — LOW ${s.severityCounts.LOW} · MEDIUM ${s.severityCounts.MEDIUM} · HIGH ${s.severityCounts.HIGH} · CRITICAL ${s.severityCounts.CRITICAL}`,
  );
  L.push(
    `- Backend errors: ${s.backendErrors} · Avg latency Δ: ${s.avgLatencyDeltaMs.toFixed(1)} ms`,
  );
  L.push(`- Cutover gates: ${r.shadow.gates.passed ? 'PASS' : 'FAIL'}`);
  if (r.shadow.gates.reasons.length > 0) {
    for (const reason of r.shadow.gates.reasons) L.push(`  - ${reason}`);
  }
  L.push('');
  return L.join('\n');
}
