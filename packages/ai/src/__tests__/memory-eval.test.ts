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

  it('fact supersession now resolves corrections, temporal, and employment (PR-M07)', async () => {
    const result = await runMemoryEval();
    const by = Object.fromEntries(result.perScenario.map((m) => [m.scenario, m]));

    // Superseded values no longer leak: "Patna" after moving, "Python" after
    // switching favorites, "Google" after changing jobs are all archived.
    expect(by['corrections']?.recallAccuracy).toBe(1);
    expect(by['corrections']?.precision).toBe(1);
    expect(by['temporal']?.recallAccuracy).toBe(1);
    expect(by['temporal']?.precision).toBe(1);
    expect(by['employment']?.recallAccuracy).toBe(1);
    expect(by['employment']?.precision).toBe(1);
  });

  it('regression gate: overall quality must clear production thresholds', async () => {
    const { overall } = await runMemoryEval();
    // These thresholds are the CI gate. A regression that drops recall/precision
    // or inflates duplicates/latency fails the build.
    expect(overall.recallAccuracy).toBeGreaterThanOrEqual(0.98);
    expect(overall.precision).toBeGreaterThanOrEqual(0.97);
    expect(overall.duplicateRate).toBeLessThanOrEqual(0.01);
    expect(overall.avgLatencyMs).toBeLessThan(200);
  });
});
