import { describe, expect, it } from 'vitest';
import {
  createTeamMember,
  getCreditConfig,
  listApps,
  listPayouts,
  listTeam,
  updateApp,
  updateCreditConfig,
  updatePayout,
  updateTeamMember,
} from '../store';

describe('QuantTrinity owner store', () => {
  it('seeds apps, team and a credit config', () => {
    expect(listApps().length).toBeGreaterThan(0);
    expect(listTeam().length).toBeGreaterThan(0);
    expect(getCreditConfig().usdPerCredit).toBe(1);
  });

  it('provisions a human member as invited', () => {
    const before = listTeam().length;
    const m = createTeamMember({
      kind: 'human',
      name: 'Test Human',
      email: 'test@quant.dev',
      sector: 'support',
      role: 'analyst',
    });
    expect(m.kind).toBe('human');
    expect(m.status).toBe('invited');
    expect(m.email).toBe('test@quant.dev');
    expect(m.ai).toBeUndefined();
    expect(listTeam().length).toBe(before + 1);
  });

  it('places an AI agent as an active employee with its config', () => {
    const m = createTeamMember({
      kind: 'ai',
      name: 'QuantAI Tester',
      sector: 'reporting',
      role: 'agent',
      ai: {
        modelId: 'or-claude-sonnet',
        autonomy: 'autonomous',
        dailyCreditBudget: 25,
        mandate: 'Triage test reports.',
      },
    });
    expect(m.kind).toBe('ai');
    expect(m.status).toBe('active');
    expect(m.email).toBeUndefined();
    expect(m.ai?.autonomy).toBe('autonomous');
    expect(m.ai?.dailyCreditBudget).toBe(25);
  });

  it('updates member status (suspend/reactivate)', () => {
    const m = createTeamMember({
      kind: 'human',
      name: 'Suspendable',
      email: 's@quant.dev',
      sector: 'growth',
      role: 'viewer',
    });
    expect(updateTeamMember(m.id, { status: 'suspended' })?.status).toBe('suspended');
    expect(updateTeamMember(m.id, { status: 'active' })?.status).toBe('active');
    expect(updateTeamMember('does-not-exist', { status: 'active' })).toBeNull();
  });

  it('controls an app status and sidekick toggle', () => {
    const app = listApps()[0]!;
    expect(updateApp(app.id, { status: 'maintenance' })?.status).toBe('maintenance');
    const toggled = updateApp(app.id, { sidekickEnabled: false });
    expect(toggled?.sidekickEnabled).toBe(false);
    // restore
    updateApp(app.id, { status: 'live', sidekickEnabled: true });
  });

  it('updates the credit config', () => {
    const updated = updateCreditConfig({ dailyFreeCredits: 9, commissionRate: 0.25 });
    expect(updated.dailyFreeCredits).toBe(9);
    expect(updated.commissionRate).toBe(0.25);
    // restore defaults used by other assertions
    updateCreditConfig({ dailyFreeCredits: 5, commissionRate: 0.2 });
  });

  it('advances a payout through the approval flow', () => {
    const payout = listPayouts().find((p) => p.status === 'pending');
    expect(payout).toBeDefined();
    if (payout) {
      expect(updatePayout(payout.id, 'approved')?.status).toBe('approved');
      expect(updatePayout(payout.id, 'paid')?.status).toBe('paid');
    }
    expect(updatePayout('missing', 'paid')).toBeNull();
  });
});
