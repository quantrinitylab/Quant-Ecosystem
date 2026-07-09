// ============================================================================
// Safety evaluation harness (V3.0 — offline only)
//
// Runs the EXISTING SafetyPipeline against the versioned safety corpus and
// reports, per scenario: pass rate, flag agreement, redaction correctness.
// Measures reality — including the capabilities the pipeline does not have
// yet (prompt-injection screening). A gap exposed here is a success: it is
// the baseline any V3.3 safety work must demonstrably move.
// ============================================================================

import { SafetyPipeline } from '../core/safety';
import type { SafetyScenario } from './safety-datasets';

export interface SafetyCaseResult {
  id: string;
  passed: boolean;
  /** Which expectation failed, for the failure taxonomy. */
  failures: string[];
}

export interface SafetyScenarioMetrics {
  scenario: string;
  totalCases: number;
  passRate: number;
  knownHard: boolean;
  caseResults: SafetyCaseResult[];
}

export interface SafetyEvalReport {
  scenarios: SafetyScenarioMetrics[];
  overallPassRate: number;
  /** Detection rate on the prompt-injection scenario (the honest-gap number). */
  injectionDetectionRate: number;
  /** False-positive rate on benign lookalikes + controls (flagged when shouldn't). */
  falsePositiveRate: number;
}

export function runSafetyEval(scenarios: SafetyScenario[]): SafetyEvalReport {
  const pipeline = new SafetyPipeline();
  const perScenario: SafetyScenarioMetrics[] = [];
  let passed = 0;
  let total = 0;
  let benignTotal = 0;
  let benignFlagged = 0;
  let injectionTotal = 0;
  let injectionFlagged = 0;

  for (const scenario of scenarios) {
    const caseResults: SafetyCaseResult[] = [];

    for (const c of scenario.cases) {
      const result = pipeline.processInput(c.input);
      const failures: string[] = [];

      const flagged = !result.isSafe;
      if (flagged !== c.expect.flagged) {
        failures.push(`flagged=${flagged} expected=${c.expect.flagged}`);
      }
      for (const s of c.expect.textIncludes ?? []) {
        if (!result.text.includes(s)) failures.push(`missing "${s}"`);
      }
      for (const s of c.expect.textExcludes ?? []) {
        if (result.text.includes(s)) failures.push(`leaked "${s}"`);
      }

      if (!c.expect.flagged) {
        benignTotal += 1;
        if (flagged) benignFlagged += 1;
      }
      if (scenario.name === 'prompt-injection') {
        injectionTotal += 1;
        if (flagged) injectionFlagged += 1;
      }

      caseResults.push({ id: c.id, passed: failures.length === 0, failures });
    }

    const scenarioPassed = caseResults.filter((r) => r.passed).length;
    perScenario.push({
      scenario: scenario.name,
      totalCases: scenario.cases.length,
      passRate: scenario.cases.length ? scenarioPassed / scenario.cases.length : 1,
      knownHard: scenario.knownHard ?? false,
      caseResults,
    });
    passed += scenarioPassed;
    total += scenario.cases.length;
  }

  return {
    scenarios: perScenario,
    overallPassRate: total ? passed / total : 1,
    injectionDetectionRate: injectionTotal ? injectionFlagged / injectionTotal : 0,
    falsePositiveRate: benignTotal ? benignFlagged / benignTotal : 0,
  };
}

/** Render the dashboard (same spirit as memory-eval / routing-eval tables). */
export function formatSafetyReport(report: SafetyEvalReport): string {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const lines: string[] = [];
  lines.push('=== Safety Evaluation (existing SafetyPipeline, offline) ===');
  lines.push('scenario            pass     notes');
  for (const s of report.scenarios) {
    lines.push(
      `${s.scenario.padEnd(18)}${pct(s.passRate).padStart(7)}  ${s.knownHard ? 'known-hard' : ''}`,
    );
    for (const c of s.caseResults.filter((r) => !r.passed)) {
      lines.push(`  ✗ ${c.id}: ${c.failures.join('; ')}`);
    }
  }
  lines.push('-'.repeat(60));
  lines.push(`OVERALL          ${pct(report.overallPassRate).padStart(7)}`);
  lines.push(
    `injection detection rate: ${pct(report.injectionDetectionRate)} (honest gap — no screen exists yet)`,
  );
  lines.push(`false-positive rate (benign): ${pct(report.falsePositiveRate)}`);
  return lines.join('\n');
}
