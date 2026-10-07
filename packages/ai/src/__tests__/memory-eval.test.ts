import { describe, it, expect } from 'vitest';
import { runMemoryEval, formatDashboard } from '../eval/memory-eval';
import { allScenarios, coreScenarios, frontierScenarios } from '../eval/datasets';

describe('memory evaluation', () => {
  it('prints the full quality dashboard (core + frontier)', async () => {
    const result = await runMemoryEval(allScenarios);

    // Emit the dashboard so `vitest` output doubles as the eval report.
    // eslint-disable-next-line no-console
    console.log(formatDashboard(result, allScenarios));

    const by = Object.fromEntries(result.perScenario.map((m) => [m.scenario, m]));

    // ── Baseline capabilities that MUST hold ──────────────────────────────
    expect(by['facts']?.recallAccuracy).toBe(1);
    expect(by['preferences']?.recallAccuracy).toBe(1);
    // Noise must never be stored, and isolation must never leak.
    expect(by['noise']?.wrongMemories).toBe(0);
    expect(by['isolation']?.recallAccuracy).toBe(1); // expects nothing, gets nothing
    expect(by['isolation']?.wrongMemories).toBe(0);
  });

  it('supersession + retraction resolve corrections/temporal/employment/negation/departure', async () => {
    const result = await runMemoryEval();
    const by = Object.fromEntries(result.perScenario.map((m) => [m.scenario, m]));

    // Supersession (PR-M07): superseded values no longer leak.
    expect(by['corrections']?.precision).toBe(1);
    expect(by['temporal']?.precision).toBe(1);
    expect(by['employment']?.precision).toBe(1);
    // Retraction (PR-M09): negation/departure retire the slot with no replacement.
    expect(by['negation']?.precision).toBe(1);
    expect(by['negation']?.recallAccuracy).toBe(1);
    expect(by['departure']?.precision).toBe(1);
    expect(by['departure']?.recallAccuracy).toBe(1);
    // Transient visit must not change residence.
    expect(by['transient']?.precision).toBe(1);
    expect(by['transient']?.recallAccuracy).toBe(1);
  });

  it('regression gate: CORE quality must clear production thresholds', async () => {
    // The gate runs on core scenarios only. Frontier scenarios are the backlog
    // and are deliberately excluded so they can be added without breaking CI.
    const { overall } = await runMemoryEval(coreScenarios);
    expect(overall.recallAccuracy).toBeGreaterThanOrEqual(0.98);
    expect(overall.precision).toBeGreaterThanOrEqual(0.97);
    expect(overall.duplicateRate).toBeLessThanOrEqual(0.01);
    expect(overall.avgLatencyMs).toBeLessThan(200);
  });

  it('frontier: messy real-world inputs are genuinely unsolved (honest gap)', async () => {
    // Pins reality: the eval detects that messy inputs (negation, Hinglish,
    // typos, "used to...now", multi-clause current) are NOT handled yet. As each
    // is solved it graduates to coreScenarios and this expectation tightens.
    const { overall } = await runMemoryEval(frontierScenarios);
    expect(overall.missedMemories + overall.wrongMemories).toBeGreaterThan(0);
  });
});
