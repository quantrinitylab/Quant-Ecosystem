import { describe, it, expect } from 'vitest';
import { runMemoryEval, formatDashboard } from '../eval/memory-eval';
import { allScenarios } from '../eval/datasets';

describe('memory evaluation', () => {
  it('prints the quality dashboard and enforces baseline thresholds', async () => {
    const result = await runMemoryEval();

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
    // Latency sanity.
    expect(result.overall.avgLatencyMs).toBeLessThan(200);
  });

  it('documents the known-hard gaps (supersession) as currently unsolved', async () => {
    const result = await runMemoryEval();
    const by = Object.fromEntries(result.perScenario.map((m) => [m.scenario, m]));

    // These are the CURRENT baselines for the known-hard scenarios. The extractor
    // stores both the old and new fact, so a superseded value still leaks. This
    // test PINS that reality: when supersession is implemented, these expectations
    // flip to precision === 1 and this test is updated to lock the improvement.
    expect(by['corrections']?.precision).toBe(0); // 'Patna' still leaks after moving
    expect(by['temporal']?.precision).toBe(0); // 'Python' still leaks after switching
  });
});
