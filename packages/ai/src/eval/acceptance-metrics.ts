// ============================================================================
// Acceptance metrics (PR-M11b-2)
//
// The operational scorecard for the acceptance layer, computed from recorded
// PolicyDecisions (see policy-replay.ReplayRecord). Complements the extraction
// dashboard: extraction measures WHAT the model produced; acceptance measures
// WHAT the policy did with it.
// ============================================================================

import type { PolicyAction } from '../core/memory-acceptance-policy';
import type { ReplayRecord, ActionHistogram } from './policy-replay';
import { histogramOf } from './policy-replay';

export interface AcceptanceMetrics {
  total: number;
  histogram: ActionHistogram;
  pendingRate: number;
  rejectedRate: number;
  supersedeRate: number;
  duplicateRate: number;
  dropRate: number;
  activeRate: number;
  avgEffectiveWeight: number;
}

export function acceptanceMetrics(records: ReplayRecord[]): AcceptanceMetrics {
  const actions: PolicyAction[] = records.map((r) => r.decision.action);
  const histogram = histogramOf(actions);
  const total = records.length || 1;
  const weights = records.map((r) => r.decision.effectiveWeight);

  return {
    total: records.length,
    histogram,
    activeRate: histogram.store_active / total,
    pendingRate: histogram.store_pending / total,
    rejectedRate: histogram.reject / total,
    supersedeRate: histogram.supersede / total,
    duplicateRate: histogram.duplicate_skip / total,
    dropRate: histogram.drop / total,
    avgEffectiveWeight: weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : 0,
  };
}

// ─── Calibration breakdown by provenance ─────────────────────────────────────

export interface CalibrationSample {
  provenance: string;
  confidence: number;
  correct: boolean;
}

export interface ProvenanceCalibration {
  provenance: string;
  count: number;
  avgConfidence: number;
  accuracy: number;
  ece: number;
  brier: number;
}

export function calibrationByProvenance(samples: CalibrationSample[]): ProvenanceCalibration[] {
  const byFamily = new Map<string, CalibrationSample[]>();
  for (const s of samples) {
    const family = s.provenance.split('.')[0] ?? s.provenance;
    const list = byFamily.get(family) ?? [];
    list.push(s);
    byFamily.set(family, list);
  }

  const out: ProvenanceCalibration[] = [];
  for (const [provenance, group] of byFamily) {
    out.push({
      provenance,
      count: group.length,
      avgConfidence: mean(group.map((s) => s.confidence)),
      accuracy: mean(group.map((s) => (s.correct ? 1 : 0))),
      ece: ece(group),
      brier: mean(group.map((s) => (s.confidence - (s.correct ? 1 : 0)) ** 2)),
    });
  }
  return out.sort((a, b) => a.provenance.localeCompare(b.provenance));
}

function ece(samples: CalibrationSample[], bins = 10): number {
  if (samples.length === 0) return 0;
  const buckets: CalibrationSample[][] = Array.from({ length: bins }, () => []);
  for (const s of samples) buckets[Math.min(bins - 1, Math.floor(s.confidence * bins))]!.push(s);
  let e = 0;
  for (const b of buckets) {
    if (b.length === 0) continue;
    const conf = mean(b.map((s) => s.confidence));
    const acc = mean(b.map((s) => (s.correct ? 1 : 0)));
    e += (b.length / samples.length) * Math.abs(conf - acc);
  }
  return e;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

export function formatAcceptanceDashboard(m: AcceptanceMetrics): string {
  const h = m.histogram;
  return [
    '',
    '=== Acceptance ===',
    `total: ${m.total}   avg effective weight: ${m.avgEffectiveWeight.toFixed(3)}`,
    `active ${pct(m.activeRate)}  pending ${pct(m.pendingRate)}  supersede ${pct(m.supersedeRate)}  ` +
      `dup ${pct(m.duplicateRate)}  reject ${pct(m.rejectedRate)}  drop ${pct(m.dropRate)}`,
    '',
    'policy actions:',
    `  store_active   ${h.store_active}`,
    `  store_pending  ${h.store_pending}`,
    `  supersede      ${h.supersede}`,
    `  duplicate_skip ${h.duplicate_skip}`,
    `  reject         ${h.reject}`,
    `  drop           ${h.drop}`,
    '',
  ].join('\n');
}

export function formatCalibrationByProvenance(rows: ProvenanceCalibration[]): string {
  const lines: string[] = ['', '=== Calibration by provenance ==='];
  lines.push(
    'provenance'.padEnd(12) +
      'n'.padStart(6) +
      'avgConf'.padStart(9) +
      'acc'.padStart(9) +
      'ECE'.padStart(8) +
      'brier'.padStart(8),
  );
  for (const r of rows) {
    lines.push(
      r.provenance.padEnd(12) +
        String(r.count).padStart(6) +
        pct(r.avgConfidence).padStart(9) +
        pct(r.accuracy).padStart(9) +
        r.ece.toFixed(3).padStart(8) +
        r.brier.toFixed(3).padStart(8),
    );
  }
  lines.push('');
  return lines.join('\n');
}
