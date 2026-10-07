// ============================================================================
// Extraction-quality evaluation (PR-M11c)
//
// The objective scorecard for comparing extractors (rule / LLM / local) on the
// SAME labeled dataset: candidate precision/recall, hallucination rate,
// calibration (ECE + Brier), tokens, cost, latency. Observational only — no
// core write-path change. Acceptance-tier precision arrives with M11b.
// ============================================================================

import type { MemoryCandidate } from '../core/default-memory-extractor';
import type { ExtractionMetrics, InstrumentedExtractionModel } from '../core/extraction-schema';
import { DefaultMemoryExtractor } from '../core/default-memory-extractor';
import { extractionCases, type ExtractionCase } from './extraction-datasets';

/** An extractor wrapped for measurement. */
export interface EvaluableExtractor {
  name: string;
  run(
    role: string,
    content: string,
  ): Promise<{ candidates: MemoryCandidate[]; metrics: ExtractionMetrics }>;
}

export interface ExtractionQualityMetrics {
  extractor: string;
  totalCandidates: number;
  candidatePrecision: number; // correct user candidates / all user candidates
  candidateRecall: number; // expected memories found / all expected
  hallucinations: number; // user candidates matching no expected
  hallucinationRate: number;
  avgConfidence: number;
  ece: number; // expected calibration error (10 bins)
  brier: number; // mean((confidence - correct)^2)
  totalTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
}

const USER = 'user_1';

interface Sample {
  confidence: number;
  correct: number; // 1 | 0
}

export async function runExtractionEval(
  extractor: EvaluableExtractor,
  cases: ExtractionCase[] = extractionCases,
): Promise<ExtractionQualityMetrics> {
  let totalCandidates = 0;
  let correctCandidates = 0;
  let matchedExpected = 0;
  let totalExpected = 0;
  let hallucinations = 0;
  let totalTokens = 0;
  let totalCostUsd = 0;
  const latencies: number[] = [];
  const samples: Sample[] = [];

  for (const c of cases) {
    const role = c.role ?? 'user';
    const { candidates, metrics } = await extractor.run(role, c.content);
    latencies.push(metrics.latencyMs);
    totalTokens += metrics.tokens;
    totalCostUsd += metrics.costUsd;

    // Only USER-owned candidates count as the user's memory.
    const userCandidates = candidates.filter((m) => m.owner === USER);
    totalCandidates += userCandidates.length;
    totalExpected += c.expected.length;

    for (const exp of c.expected) {
      if (
        userCandidates.some((m) =>
          m.content.toLowerCase().includes(exp.contentIncludes.toLowerCase()),
        )
      ) {
        matchedExpected++;
      }
    }

    for (const cand of userCandidates) {
      const correct = c.expected.some((exp) =>
        cand.content.toLowerCase().includes(exp.contentIncludes.toLowerCase()),
      );
      if (correct) correctCandidates++;
      else hallucinations++;
      const confidence =
        typeof cand.metadata?.['confidence'] === 'number'
          ? (cand.metadata['confidence'] as number)
          : 1;
      samples.push({ confidence, correct: correct ? 1 : 0 });
    }
  }

  return {
    extractor: extractor.name,
    totalCandidates,
    candidatePrecision: totalCandidates ? correctCandidates / totalCandidates : 1,
    candidateRecall: totalExpected ? matchedExpected / totalExpected : 1,
    hallucinations,
    hallucinationRate: totalCandidates ? hallucinations / totalCandidates : 0,
    avgConfidence: samples.length ? mean(samples.map((s) => s.confidence)) : 0,
    ece: expectedCalibrationError(samples),
    brier: samples.length ? mean(samples.map((s) => (s.confidence - s.correct) ** 2)) : 0,
    totalTokens,
    totalCostUsd,
    avgLatencyMs: latencies.length ? mean(latencies) : 0,
  };
}

// ─── Calibration ───────────────────────────────────────────────────────────

function expectedCalibrationError(samples: Sample[], bins = 10): number {
  if (samples.length === 0) return 0;
  const buckets: Sample[][] = Array.from({ length: bins }, () => []);
  for (const s of samples) {
    const idx = Math.min(bins - 1, Math.floor(s.confidence * bins));
    buckets[idx]!.push(s);
  }
  let ece = 0;
  for (const bucket of buckets) {
    if (bucket.length === 0) continue;
    const avgConf = mean(bucket.map((s) => s.confidence));
    const accuracy = mean(bucket.map((s) => s.correct));
    ece += (bucket.length / samples.length) * Math.abs(avgConf - accuracy);
  }
  return ece;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// ─── Extractor adapters ──────────────────────────────────────────────────────

/** Wrap the rule pipeline (DefaultMemoryExtractor) for measurement. */
export function ruleExtractorAdapter(): EvaluableExtractor {
  const extractor = new DefaultMemoryExtractor();
  return {
    name: 'rule',
    async run(role, content) {
      const start = Date.now();
      const candidates = await extractor.extract(USER, 'eval', role, content);
      return {
        candidates,
        metrics: { model: 'rule', latencyMs: Date.now() - start, tokens: 0, costUsd: 0 },
      };
    },
  };
}

/** Wrap an instrumented LLM extractor for measurement. */
export function llmExtractorAdapter(
  model: InstrumentedExtractionModel,
  name = 'llm',
): EvaluableExtractor {
  return {
    name,
    async run(role, content) {
      const detailed = await model.extractDetailed(USER, 'eval', role, content);
      const candidates = await model.extract(USER, 'eval', role, content);
      return { candidates, metrics: detailed.metrics };
    },
  };
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

export function formatExtractionDashboard(rows: ExtractionQualityMetrics[]): string {
  const lines: string[] = ['', '=== Extraction Quality ==='];
  lines.push(
    'extractor'.padEnd(10) +
      'cand.prec'.padStart(11) +
      'recall'.padStart(9) +
      'halluc'.padStart(8) +
      'ECE'.padStart(8) +
      'brier'.padStart(8) +
      'tokens'.padStart(8) +
      'cost$'.padStart(9) +
      'lat(ms)'.padStart(9),
  );
  for (const m of rows) {
    lines.push(
      m.extractor.padEnd(10) +
        pct(m.candidatePrecision).padStart(11) +
        pct(m.candidateRecall).padStart(9) +
        String(m.hallucinations).padStart(8) +
        m.ece.toFixed(3).padStart(8) +
        m.brier.toFixed(3).padStart(8) +
        String(m.totalTokens).padStart(8) +
        m.totalCostUsd.toFixed(4).padStart(9) +
        m.avgLatencyMs.toFixed(1).padStart(9),
    );
  }
  lines.push('');
  return lines.join('\n');
}
