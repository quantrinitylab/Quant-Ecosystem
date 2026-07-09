// ============================================================================
// Routing evaluation — dashboard + regression gates (V3.0, offline)
//
// Same contract as memory-eval: the dashboard measures reality; the gates
// freeze the measured floor so it cannot silently regress. Gates were set
// AFTER measuring (baseline discipline) — slightly below observed values.
// Integration gate (V3.1): the estimator may not be wired into the production
// router until overall accuracy ≥ 85% AND under-routing on non-trap scenarios
// is zero. Until then this suite is a measurement instrument, not a permit.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { routingScenarios, ROUTING_CORPUS_VERSION } from '../eval/routing-datasets';
import { runRoutingEval, formatRoutingReport } from '../eval/routing-eval';
import { estimateDifficulty } from '../eval/difficulty-estimator';

describe('routing evaluation (difficulty estimator)', () => {
  const report = runRoutingEval(routingScenarios);

  it('prints the routing quality dashboard', () => {
    console.log(`corpus: ${ROUTING_CORPUS_VERSION}`);
    console.log(formatRoutingReport(report));
    expect(report.scenarios.length).toBeGreaterThan(0);
  });

  it('is deterministic (same corpus → same report)', () => {
    const again = runRoutingEval(routingScenarios);
    expect(again).toEqual(report);
  });

  it('is fast enough to sit in the request path (<5ms per estimate, structural)', () => {
    // Structural check (not timing-based, per MEMORY_PREMERGE_CHECKS lesson):
    // the estimator must be pure regex/arith — no awaits, no I/O.
    const src = estimateDifficulty.toString();
    expect(src).not.toMatch(/await|fetch|require|import\(/);
  });

  it('regression gate: measured floor must not silently regress', () => {
    // Measured on routing-v1: overall 95.5%, adjacent 100%, savings 76.2%.
    // Gates sit slightly below the measured floor; adjust ONLY with a new
    // corpus version + a decision-log entry.
    expect(report.overallAccuracy).toBeGreaterThanOrEqual(0.9);
    expect(report.overallAdjacentAccuracy).toBeGreaterThanOrEqual(0.95);
    // Cost projection: routing on the estimator must save vs all-frontier.
    expect(report.savingsVsAllFrontier).toBeGreaterThanOrEqual(0.4);
    // Under-routing (quality risk) outside the known-hard traps must be zero.
    const nonTrapUnderRoutes = report.scenarios
      .filter((s) => !s.knownHard)
      .reduce((sum, s) => sum + s.underRoutes, 0);
    expect(nonTrapUnderRoutes).toBe(0);
  });

  it('honest gap: traps scenario documents where surface heuristics fail', () => {
    const traps = report.scenarios.find((s) => s.scenario === 'traps');
    expect(traps).toBeDefined();
    expect(traps?.knownHard).toBe(true);
    // No claim of solving the traps — only that we measure them. If this
    // starts passing at 100%, celebrate, then tighten the gate deliberately.
    expect(traps!.accuracy).toBeGreaterThanOrEqual(0);
  });
});
