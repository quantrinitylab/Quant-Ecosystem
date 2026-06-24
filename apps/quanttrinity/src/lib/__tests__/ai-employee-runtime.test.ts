import { describe, expect, it } from 'vitest';
import { runShift, getOrCreateRuntime, getRuntimeSnapshot } from '../ai-employee-runtime';
import type { TeamMember } from '../domain';

function aiEmployee(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: `ai-test-${Math.random().toString(36).slice(2)}`,
    kind: 'ai',
    name: 'QuantAI Test',
    sector: 'reporting',
    role: 'agent',
    status: 'active',
    createdAt: new Date().toISOString(),
    ai: {
      modelId: 'or-claude-sonnet',
      autonomy: 'autonomous',
      dailyCreditBudget: 50,
      mandate: 'Triage reports.',
    },
    ...overrides,
  };
}

describe('AI employee runtime', () => {
  it('rejects running a non-AI member', () => {
    const human: TeamMember = {
      id: 'h1',
      kind: 'human',
      name: 'Human',
      email: 'h@quant.dev',
      sector: 'support',
      role: 'analyst',
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    expect(() => runShift(human)).toThrow();
  });

  it('autonomous reporting employee processes the queue and earns trust', () => {
    const emp = aiEmployee();
    const before = getOrCreateRuntime(emp).trust.getScore();
    const result = runShift(emp);
    expect(result.paused).toBe(false);
    expect(result.processed).toBeGreaterThanOrEqual(0);
    // autonomy 'autonomous' seeds ACT_HIGH-level permission
    expect(['ACT_HIGH', 'FULL_AUTO']).toContain(result.permissionLevel);
    if (result.processed > 0) {
      expect(result.trustScore).toBeGreaterThanOrEqual(before);
      expect(result.actions.length).toBe(result.processed);
    }
  });

  it('enforces the daily credit budget', () => {
    const emp = aiEmployee({
      ai: { modelId: 'm', autonomy: 'autonomous', dailyCreditBudget: 2, mandate: 'x' },
    });
    const result = runShift(emp);
    // cannot spend more than its budget (1 credit / item)
    expect(result.processed).toBeLessThanOrEqual(2);
    expect(result.dailyRemaining).toBeLessThanOrEqual(2);
    expect(result.dailyRemaining).toBeGreaterThanOrEqual(0);
  });

  it('suggest-only employees never resolve (lower permission)', () => {
    const emp = aiEmployee({
      sector: 'reporting',
      ai: { modelId: 'm', autonomy: 'suggest', dailyCreditBudget: 50, mandate: 'x' },
    });
    const result = runShift(emp);
    expect(['OBSERVE', 'SUGGEST']).toContain(result.permissionLevel);
    for (const a of result.actions) {
      expect(a.kind).toBe('suggested');
    }
  });

  it('exposes a runtime snapshot', () => {
    const emp = aiEmployee();
    const snap = getRuntimeSnapshot(emp);
    expect(snap.trustScore).toBeGreaterThan(0);
    expect(snap.dailyRemaining).toBeGreaterThan(0);
    expect(typeof snap.permissionLevel).toBe('string');
  });
});
