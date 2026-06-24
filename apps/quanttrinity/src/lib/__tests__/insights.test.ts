import { describe, expect, it } from 'vitest';
import { classifyActor, computeInsights } from '../insights';
import { recordAudit } from '../store';

describe('owner insights', () => {
  it('classifies actors correctly', () => {
    expect(classifyActor('owner@quant.dev')).toBe('human');
    expect(classifyActor('scheduler')).toBe('system');
    expect(classifyActor('QuantAI · Report Triage')).toBe('ai');
  });

  it('computes a complete insights shape', () => {
    const ins = computeInsights();
    expect(ins.revenue.monthlyTotalUsd).toBeGreaterThan(0);
    expect(ins.revenue.mix.reduce((s, m) => s + m.usd, 0)).toBe(ins.revenue.monthlyTotalUsd);
    expect(ins.workforce.totalStaff).toBe(ins.workforce.humans + ins.workforce.aiStaff);
    expect(ins.actions.aiSharePct).toBeGreaterThanOrEqual(0);
    expect(ins.actions.aiSharePct).toBeLessThanOrEqual(100);
  });

  it('reflects newly recorded actions in the breakdown', () => {
    const before = computeInsights().actions.total;
    recordAudit({ actor: 'QuantAI · Tester', action: 'insights_test.action', target: 't1' });
    const after = computeInsights();
    expect(after.actions.total).toBe(before + 1);
    expect(after.actions.byType.some((t) => t.type === 'insights_test')).toBe(true);
    expect(after.actions.byActorClass.ai).toBeGreaterThan(0);
  });

  it('keeps revenue mix percentages within range', () => {
    const ins = computeInsights();
    for (const m of ins.revenue.mix) {
      expect(m.pct).toBeGreaterThanOrEqual(0);
      expect(m.pct).toBeLessThanOrEqual(100);
    }
  });
});
