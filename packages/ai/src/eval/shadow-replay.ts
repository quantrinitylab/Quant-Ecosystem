// ============================================================================
// Shadow Replay (M11c / Agent D, ADR-011)
//
// Extends the deterministic replay idea to ShadowReports. Because each report
// stores both legacy and new recalled contents, we can (1) VERIFY the recorded
// divergence is reproducible from the stored outputs (pure recompute), and
// (2) AGGREGATE reports into the cutover-gate metrics — all offline, no DB.
// ============================================================================

import type { ShadowReport, DivergenceSeverity } from '../core/memory-facade';
import { compareRecalls } from '../core/memory-facade';

export interface ShadowAggregate {
  total: number;
  /** Mean semantic recall agreement (Jaccard) across reports. */
  avgAgreement: number;
  severityCounts: Record<DivergenceSeverity, number>;
  backendErrors: number;
  /** requestIds of HIGH/CRITICAL divergences (the ones that block migration). */
  blockingCases: string[];
  /** Mean (new − legacy) latency in ms. */
  avgLatencyDeltaMs: number;
}

/** Recompute the divergence from stored outputs; true if it matches the record. */
export function verifyReproducible(report: ShadowReport): boolean {
  const c = compareRecalls(report.legacy.recalled, report.next.recalled);
  if (c.agreementRate !== report.divergence.agreementRate) return false;
  return (
    sameSet(c.onlyLegacy, report.divergence.onlyLegacy) &&
    sameSet(c.onlyNew, report.divergence.onlyNew)
  );
}

export function aggregateShadowReports(reports: ShadowReport[]): ShadowAggregate {
  const severityCounts: Record<DivergenceSeverity, number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };
  let agreementSum = 0;
  let latencyDeltaSum = 0;
  let backendErrors = 0;
  const blockingCases: string[] = [];

  for (const r of reports) {
    severityCounts[r.divergence.severity]++;
    agreementSum += r.divergence.agreementRate;
    latencyDeltaSum += r.next.latencyMs - r.legacy.latencyMs;
    if (r.next.error) backendErrors++;
    if (r.divergence.severity === 'HIGH' || r.divergence.severity === 'CRITICAL') {
      blockingCases.push(r.requestId);
    }
  }

  const n = reports.length || 1;
  return {
    total: reports.length,
    avgAgreement: agreementSum / n,
    severityCounts,
    backendErrors,
    blockingCases,
    avgLatencyDeltaMs: latencyDeltaSum / n,
  };
}

/** Evaluate the ADR-011 cutover gates against an aggregate. */
export interface CutoverGateResult {
  passed: boolean;
  reasons: string[];
}

export function evaluateCutoverGates(
  agg: ShadowAggregate,
  legacyAvgLatencyMs: number,
  opts: { minAgreement?: number; maxLatencyDeltaPct?: number } = {},
): CutoverGateResult {
  const minAgreement = opts.minAgreement ?? 0.99;
  const maxLatencyDeltaPct = opts.maxLatencyDeltaPct ?? 0.1;
  const reasons: string[] = [];

  if (agg.avgAgreement < minAgreement) {
    reasons.push(
      `semantic agreement ${(agg.avgAgreement * 100).toFixed(1)}% < ${(minAgreement * 100).toFixed(0)}%`,
    );
  }
  const critical = agg.severityCounts.CRITICAL;
  if (critical > 0) reasons.push(`${critical} critical divergences (must be 0)`);
  if (agg.backendErrors > 0)
    reasons.push(`${agg.backendErrors} infrastructure failures (must be 0)`);
  if (legacyAvgLatencyMs > 0) {
    const deltaPct = agg.avgLatencyDeltaMs / legacyAvgLatencyMs;
    if (deltaPct > maxLatencyDeltaPct) {
      reasons.push(
        `latency delta ${(deltaPct * 100).toFixed(1)}% > ${(maxLatencyDeltaPct * 100).toFixed(0)}%`,
      );
    }
  }
  return { passed: reasons.length === 0, reasons };
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}
