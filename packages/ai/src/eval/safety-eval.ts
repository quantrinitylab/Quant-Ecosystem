// ============================================================================
// Safety evaluation harness (offline only)
// ============================================================================

import { SafetyPipeline } from '../core/safety';
import type { InjectionKind, SafetyScenario } from './safety-datasets';

export interface SafetyCaseResult {
  id: string;
  passed: boolean;
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
  injectionDetectionRate: number;
  directInjectionDetectionRate: number;
  indirectInjectionDetectionRate: number;
  falsePositiveRate: number;
}

interface DetectionCount {
  total: number;
  flagged: number;
}

export function runSafetyEval(scenarios: SafetyScenario[]): SafetyEvalReport {
  const pipeline = new SafetyPipeline();
  const perScenario: SafetyScenarioMetrics[] = [];
  const injection: Record<InjectionKind, DetectionCount> = {
    direct: { total: 0, flagged: 0 },
    indirect: { total: 0, flagged: 0 },
  };
  let passed = 0;
  let total = 0;
  let benignTotal = 0;
  let benignFlagged = 0;

  for (const scenario of scenarios) {
    const caseResults: SafetyCaseResult[] = [];

    for (const safetyCase of scenario.cases) {
      const result = pipeline.processInput(safetyCase.input);
      const failures: string[] = [];
      const isFlagged = !result.isSafe;

      if (isFlagged !== safetyCase.expect.flagged) {
        failures.push(`flagged=${isFlagged} expected=${safetyCase.expect.flagged}`);
      }
      for (const expected of safetyCase.expect.textIncludes ?? []) {
        if (!result.text.includes(expected)) failures.push(`missing "${expected}"`);
      }
      for (const excluded of safetyCase.expect.textExcludes ?? []) {
        if (result.text.includes(excluded)) failures.push(`leaked "${excluded}"`);
      }

      if (!safetyCase.expect.flagged) {
        benignTotal += 1;
        if (isFlagged) benignFlagged += 1;
      }
      if (scenario.name === 'prompt-injection') {
        if (!safetyCase.injectionKind) {
          failures.push('prompt-injection case missing injectionKind');
        } else {
          injection[safetyCase.injectionKind].total += 1;
          if (isFlagged) injection[safetyCase.injectionKind].flagged += 1;
        }
      }

      caseResults.push({ id: safetyCase.id, passed: failures.length === 0, failures });
    }

    const scenarioPassed = caseResults.filter((result) => result.passed).length;
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

  const directRate = injection.direct.total
    ? injection.direct.flagged / injection.direct.total
    : 0;
  const indirectRate = injection.indirect.total
    ? injection.indirect.flagged / injection.indirect.total
    : 0;
  const injectionTotal = injection.direct.total + injection.indirect.total;
  const injectionFlagged = injection.direct.flagged + injection.indirect.flagged;

  return {
    scenarios: perScenario,
    overallPassRate: total ? passed / total : 1,
    injectionDetectionRate: injectionTotal ? injectionFlagged / injectionTotal : 0,
    directInjectionDetectionRate: directRate,
    indirectInjectionDetectionRate: indirectRate,
    falsePositiveRate: benignTotal ? benignFlagged / benignTotal : 0,
  };
}

export function formatSafetyReport(report: SafetyEvalReport): string {
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  const lines: string[] = [];
  lines.push('=== Safety Evaluation (SafetyPipeline, offline) ===');
  lines.push('scenario            pass     notes');
  for (const scenario of report.scenarios) {
    lines.push(
      `${scenario.scenario.padEnd(18)}${pct(scenario.passRate).padStart(7)}  ${scenario.knownHard ? 'known-hard' : ''}`,
    );
    for (const result of scenario.caseResults.filter((caseResult) => !caseResult.passed)) {
      lines.push(`  ✗ ${result.id}: ${result.failures.join('; ')}`);
    }
  }
  lines.push('-'.repeat(60));
  lines.push(`OVERALL          ${pct(report.overallPassRate).padStart(7)}`);
  lines.push(`injection detection (all):      ${pct(report.injectionDetectionRate)}`);
  lines.push(`injection detection (direct):   ${pct(report.directInjectionDetectionRate)}`);
  lines.push(`injection detection (indirect): ${pct(report.indirectInjectionDetectionRate)}`);
  lines.push(`false-positive rate (benign):   ${pct(report.falsePositiveRate)}`);
  return lines.join('\n');
}
