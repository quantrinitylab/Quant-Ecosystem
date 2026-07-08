import { describe, it, expect } from 'vitest';
import {
  DefaultMemoryAcceptancePolicy,
  type MemoryPolicy,
  type AcceptanceCandidate,
  type AcceptanceExisting,
} from '../core/memory-acceptance-policy';
import { replay, diffPolicies, histogramOf, type ReplayRecord } from '../eval/policy-replay';
import {
  acceptanceMetrics,
  calibrationByProvenance,
  formatAcceptanceDashboard,
  formatCalibrationByProvenance,
  type CalibrationSample,
} from '../eval/acceptance-metrics';

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

function record(
  id: string,
  candidate: AcceptanceCandidate,
  existing: AcceptanceExisting[] = [],
): ReplayRecord {
  return { candidateId: id, candidate, existing, decision: p1.decide(candidate, existing), at: 0 };
}

// A dataset spanning the decision space.
const dataset: ReplayRecord[] = [
  record('a', { confidence: 0.95, trust: 1, provenance: 'llm.gpt' }), // active
  record('b', { confidence: 0.6, trust: 1, provenance: 'llm.gpt' }), // pending @v1 (0.6<0.7)
  record('c', { confidence: 0.55, trust: 1, provenance: 'llm.gpt' }), // pending @v1
  record('d', { confidence: 0.2, trust: 1, provenance: 'llm.gpt' }), // drop
  record('e', { confidence: 1, trust: 1, provenance: 'rule' }), // active
];

describe('replay', () => {
  it('is deterministic and reproduces the original decision under the same policy', () => {
    const out = replay(dataset, p1);
    expect(out.every((o) => !o.changed)).toBe(true);
  });

  it('never mutates the input records (no DB, pure)', () => {
    const snapshot = JSON.stringify(dataset);
    replay(dataset, new DefaultMemoryAcceptancePolicy(V2));
    expect(JSON.stringify(dataset)).toBe(snapshot);
  });

  it('surfaces divergence when the policy changes', () => {
    const out = replay(dataset, new DefaultMemoryAcceptancePolicy(V2));
    // Lowering activate 0.70 -> 0.50 promotes b (0.6) and c (0.55) pending -> active.
    const changed = out.filter((o) => o.changed);
    expect(changed.map((o) => o.candidateId).sort()).toEqual(['b', 'c']);
    expect(
      changed.every((o) => o.original === 'store_pending' && o.replayed === 'store_active'),
    ).toBe(true);
  });
});

describe('diffPolicies', () => {
  it('reports a per-transition breakdown', () => {
    const diff = diffPolicies(dataset, p1, new DefaultMemoryAcceptancePolicy(V2));
    expect(diff.fromVersion).toBe('v1');
    expect(diff.toVersion).toBe('v2');
    expect(diff.changed).toBe(2);
    expect(diff.transitions['store_pending -> store_active']).toBe(2);
  });
});

describe('acceptanceMetrics', () => {
  it('computes rates and the action histogram', () => {
    const m = acceptanceMetrics(dataset);
    expect(m.total).toBe(5);
    expect(m.histogram.store_active).toBe(2); // a, e
    expect(m.histogram.store_pending).toBe(2); // b, c
    expect(m.histogram.drop).toBe(1); // d
    expect(m.activeRate).toBeCloseTo(2 / 5);
    // Dashboard renders without throwing.
    expect(formatAcceptanceDashboard(m)).toContain('store_active');
  });
});

describe('calibrationByProvenance', () => {
  it('breaks calibration down by provenance family', () => {
    const samples: CalibrationSample[] = [
      { provenance: 'llm.gpt', confidence: 0.95, correct: false }, // overconfident
      { provenance: 'llm.gpt', confidence: 0.9, correct: true },
      { provenance: 'rule', confidence: 1, correct: true },
      { provenance: 'rule', confidence: 1, correct: true },
    ];
    const rows = calibrationByProvenance(samples);
    const llm = rows.find((r) => r.provenance === 'llm');
    const rule = rows.find((r) => r.provenance === 'rule');
    expect(rule?.accuracy).toBe(1);
    expect(rule?.ece).toBe(0); // perfectly calibrated
    expect(llm?.ece).toBeGreaterThan(0); // overconfident
    expect(formatCalibrationByProvenance(rows)).toContain('provenance');
  });
});

// ─── Property-based invariant checks over replay (ADR-009) ────────────────────

describe('replay invariants (ADR-009)', () => {
  it('a weaker unverified candidate never supersedes a Verified memory', () => {
    const cand: AcceptanceCandidate = { confidence: 0.99, trust: 0.8, provenance: 'llm.gpt' };
    const existing: AcceptanceExisting[] = [
      { id: 'v', state: 'verified', effectiveWeight: 1, verdict: 'supersedes' },
    ];
    const [out] = replay([record('x', cand, existing)], p1);
    expect(out?.replayed).not.toBe('supersede');
    expect(out?.replayed).toBe('store_pending');
  });

  it('an idempotent fingerprint always yields duplicate_skip', () => {
    const cand: AcceptanceCandidate = {
      confidence: 1,
      trust: 1,
      provenance: 'rule',
      fingerprint: 'fp',
    };
    const existing: AcceptanceExisting[] = [
      { id: 'e', state: 'active', effectiveWeight: 1, verdict: 'supersedes', fingerprint: 'fp' },
    ];
    const [out] = replay([record('x', cand, existing)], p1);
    expect(out?.replayed).toBe('duplicate_skip');
  });

  it('below-threshold candidates never produce a stored action', () => {
    const stored = new Set(['store_active', 'store_pending', 'supersede']);
    for (let c = 0; c < 0.35; c += 0.05) {
      const [out] = replay([record('x', { confidence: c, trust: 1, provenance: 'llm.gpt' })], p1);
      expect(stored.has(out!.replayed)).toBe(false);
    }
  });

  it('histogram counts sum to the number of records', () => {
    const h = histogramOf(dataset.map((r) => r.decision.action));
    const sum = Object.values(h).reduce((a, b) => a + b, 0);
    expect(sum).toBe(dataset.length);
  });
});
