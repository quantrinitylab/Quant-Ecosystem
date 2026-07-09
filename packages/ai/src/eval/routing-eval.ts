// ============================================================================
// Routing evaluation harness (V3.0 — offline only)
//
// Measures the difficulty estimator against the versioned routing corpus and
// projects the COST consequence of routing on its output. Mirrors the memory
// eval's philosophy: a dashboard first, gates second, integration last (V3.1
// may only wire the estimator into the router after these gates pass).
//
// Cost model: per-1k-token blended prices per tier, consistent with
// docs/SYSTEM_MATHEMATICS.md §4. Numbers are projection weights, not billing.
// ============================================================================

import { DIFFICULTIES, type Difficulty, type RoutingScenario } from './routing-datasets';
import { estimateDifficulty } from './difficulty-estimator';

/** Blended $ per inference by tier (projection weights, SYSTEM_MATHEMATICS §4). */
export const TIER_COST: Record<Difficulty, number> = {
  trivial: 0.0002,
  standard: 0.001,
  hard: 0.005,
  frontier: 0.015,
};

export interface RoutingScenarioMetrics {
  scenario: string;
  totalCases: number;
  /** Fraction predicted exactly right. */
  accuracy: number;
  /** Fraction within one difficulty bin of the label (mild misroutes). */
  adjacentAccuracy: number;
  /** Cases routed BELOW the label (quality risk — the dangerous direction). */
  underRoutes: number;
  /** Cases routed ABOVE the label (cost waste — the safe direction). */
  overRoutes: number;
  knownHard: boolean;
}

export interface RoutingEvalReport {
  scenarios: RoutingScenarioMetrics[];
  /** 4×4 confusion matrix: confusion[labeled][predicted] = count. */
  confusion: Record<Difficulty, Record<Difficulty, number>>;
  overallAccuracy: number;
  overallAdjacentAccuracy: number;
  totalUnderRoutes: number;
  /** Projected cost of estimator-based routing, per corpus pass. */
  estimatorCost: number;
  /** Projected cost of the oracle (perfect labels) — the floor. */
  oracleCost: number;
  /** Projected cost of routing everything to the frontier tier — the ceiling. */
  allFrontierCost: number;
  /** 1 − estimatorCost/allFrontierCost: the % saved vs no routing at all. */
  savingsVsAllFrontier: number;
}

function emptyConfusion(): Record<Difficulty, Record<Difficulty, number>> {
  const row = () =>
    Object.fromEntries(DIFFICULTIES.map((d) => [d, 0])) as Record<Difficulty, number>;
  return Object.fromEntries(DIFFICULTIES.map((d) => [d, row()])) as Record<
    Difficulty,
    Record<Difficulty, number>
  >;
}

export function runRoutingEval(scenarios: RoutingScenario[]): RoutingEvalReport {
  const confusion = emptyConfusion();
  const perScenario: RoutingScenarioMetrics[] = [];
  let correct = 0;
  let adjacent = 0;
  let total = 0;
  let underTotal = 0;
  let estimatorCost = 0;
  let oracleCost = 0;
  let allFrontierCost = 0;

  for (const scenario of scenarios) {
    let sCorrect = 0;
    let sAdjacent = 0;
    let sUnder = 0;
    let sOver = 0;

    for (const c of scenario.cases) {
      const predicted = estimateDifficulty(c.prompt).difficulty;
      confusion[c.difficulty][predicted] += 1;
      const labelRank = DIFFICULTIES.indexOf(c.difficulty);
      const predRank = DIFFICULTIES.indexOf(predicted);

      if (predRank === labelRank) sCorrect += 1;
      if (Math.abs(predRank - labelRank) <= 1) sAdjacent += 1;
      if (predRank < labelRank) sUnder += 1;
      if (predRank > labelRank) sOver += 1;

      estimatorCost += TIER_COST[predicted];
      oracleCost += TIER_COST[c.difficulty];
      allFrontierCost += TIER_COST.frontier;
    }

    perScenario.push({
      scenario: scenario.name,
      totalCases: scenario.cases.length,
      accuracy: scenario.cases.length ? sCorrect / scenario.cases.length : 1,
      adjacentAccuracy: scenario.cases.length ? sAdjacent / scenario.cases.length : 1,
      underRoutes: sUnder,
      overRoutes: sOver,
      knownHard: scenario.knownHard ?? false,
    });

    correct += sCorrect;
    adjacent += sAdjacent;
    underTotal += sUnder;
    total += scenario.cases.length;
  }

  return {
    scenarios: perScenario,
    confusion,
    overallAccuracy: total ? correct / total : 1,
    overallAdjacentAccuracy: total ? adjacent / total : 1,
    totalUnderRoutes: underTotal,
    estimatorCost,
    oracleCost,
    allFrontierCost,
    savingsVsAllFrontier: allFrontierCost ? 1 - estimatorCost / allFrontierCost : 0,
  };
}

/** Render the dashboard (same spirit as the memory-eval table). */
export function formatRoutingReport(report: RoutingEvalReport): string {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const lines: string[] = [];
  lines.push('=== Routing Evaluation (difficulty estimator, offline) ===');
  lines.push('scenario        acc     adj-acc  under  over  notes');
  for (const s of report.scenarios) {
    lines.push(
      `${s.scenario.padEnd(14)}${pct(s.accuracy).padStart(7)}${pct(s.adjacentAccuracy).padStart(9)}` +
        `${String(s.underRoutes).padStart(7)}${String(s.overRoutes).padStart(6)}  ${s.knownHard ? 'known-hard' : ''}`,
    );
  }
  lines.push('-'.repeat(60));
  lines.push(
    `OVERALL       ${pct(report.overallAccuracy).padStart(7)}${pct(report.overallAdjacentAccuracy).padStart(9)}` +
      `${String(report.totalUnderRoutes).padStart(7)}`,
  );
  lines.push('');
  lines.push('confusion (rows=label, cols=predicted):');
  lines.push(`            ${DIFFICULTIES.map((d) => d.padStart(9)).join('')}`);
  for (const label of DIFFICULTIES) {
    lines.push(
      `${label.padEnd(12)}${DIFFICULTIES.map((p) => String(report.confusion[label][p]).padStart(9)).join('')}`,
    );
  }
  lines.push('');
  lines.push(
    `cost/corpus-pass: estimator $${report.estimatorCost.toFixed(4)} · oracle $${report.oracleCost.toFixed(4)}` +
      ` · all-frontier $${report.allFrontierCost.toFixed(4)} · savings vs all-frontier ${pct(report.savingsVsAllFrontier)}`,
  );
  return lines.join('\n');
}
