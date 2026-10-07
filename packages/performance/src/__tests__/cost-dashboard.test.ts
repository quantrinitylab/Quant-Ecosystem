import { describe, it, expect, beforeEach } from 'vitest';
import { CostDashboard } from '../cost-dashboard.js';

describe('CostDashboard', () => {
  let dashboard: CostDashboard;

  beforeEach(() => {
    dashboard = new CostDashboard();
  });

  it('records cost entries', () => {
    dashboard.recordCost({
      userId: 'user-1',
      category: 'ai',
      amount: 0.05,
      timestamp: Date.now(),
    });

    expect(dashboard.getEntryCount()).toBe(1);
  });

  it('computes total cost for a user in a time range', () => {
    const now = Date.now();
    dashboard.recordCost({ userId: 'user-1', category: 'ai', amount: 1.0, timestamp: now - 1000 });
    dashboard.recordCost({
      userId: 'user-1',
      category: 'storage',
      amount: 0.5,
      timestamp: now - 500,
    });
    dashboard.recordCost({
      userId: 'user-1',
      category: 'compute',
      amount: 2.0,
      timestamp: now - 100,
    });

    const result = dashboard.computeCost('user-1', { startMs: now - 2000, endMs: now });
    expect(result.totalCost).toBe(3.5);
    expect(result.userId).toBe('user-1');
  });

  it('excludes entries outside time range', () => {
    const now = Date.now();
    dashboard.recordCost({ userId: 'user-1', category: 'ai', amount: 1.0, timestamp: now - 10000 });
    dashboard.recordCost({ userId: 'user-1', category: 'ai', amount: 2.0, timestamp: now - 100 });

    const result = dashboard.computeCost('user-1', { startMs: now - 5000, endMs: now });
    expect(result.totalCost).toBe(2.0);
  });

  it('provides cost breakdown by category', () => {
    const now = Date.now();
    dashboard.recordCost({ userId: 'user-1', category: 'ai', amount: 1.0, timestamp: now });
    dashboard.recordCost({ userId: 'user-1', category: 'storage', amount: 0.5, timestamp: now });
    dashboard.recordCost({ userId: 'user-1', category: 'bandwidth', amount: 0.3, timestamp: now });
    dashboard.recordCost({ userId: 'user-1', category: 'compute', amount: 2.0, timestamp: now });

    const breakdown = dashboard.getBreakdown('user-1');
    expect(breakdown.ai).toBe(1.0); // free tier: multiplier 1.0
    expect(breakdown.storage).toBe(0.5);
    expect(breakdown.bandwidth).toBe(0.3);
    expect(breakdown.compute).toBe(2.0);
    expect(breakdown.total).toBe(3.8);
  });

  it('applies tier-based AI cost multiplier', () => {
    dashboard.setUserTier('user-1', 'pro');

    const now = Date.now();
    dashboard.recordCost({ userId: 'user-1', category: 'ai', amount: 1.0, timestamp: now });

    const breakdown = dashboard.getBreakdown('user-1');
    expect(breakdown.ai).toBe(0.8); // pro tier: 0.8x multiplier
  });

  it('calculates budget usage', () => {
    dashboard.setUserTier('user-1', 'free'); // $10 budget

    const now = Date.now();
    dashboard.recordCost({ userId: 'user-1', category: 'compute', amount: 5.0, timestamp: now });

    const breakdown = dashboard.getBreakdown('user-1');
    expect(breakdown.budgetUsed).toBeCloseTo(0.5, 2);
    expect(breakdown.budgetRemaining).toBeCloseTo(5.0, 2);
  });

  it('defaults to free tier', () => {
    const tier = dashboard.getUserTier('unknown-user');
    expect(tier).toBe('free');
  });

  it('returns top users by cost', () => {
    const now = Date.now();
    dashboard.recordCost({ userId: 'user-a', category: 'ai', amount: 10.0, timestamp: now });
    dashboard.recordCost({ userId: 'user-b', category: 'ai', amount: 5.0, timestamp: now });
    dashboard.recordCost({ userId: 'user-c', category: 'ai', amount: 20.0, timestamp: now });

    const topUsers = dashboard.getTopUsers(2);
    expect(topUsers).toHaveLength(2);
    expect(topUsers[0].userId).toBe('user-c');
    expect(topUsers[0].totalCost).toBe(20.0);
    expect(topUsers[1].userId).toBe('user-a');
  });

  it('allows configuring custom tiers', () => {
    dashboard.configureTier({
      tier: 'enterprise',
      monthlyBudget: 50000,
      aiMultiplier: 0.3,
      storageIncludedGb: 100000,
      bandwidthIncludedGb: 100000,
      computeHoursIncluded: 50000,
    });

    dashboard.setUserTier('user-1', 'enterprise');
    const now = Date.now();
    dashboard.recordCost({ userId: 'user-1', category: 'ai', amount: 10.0, timestamp: now });

    const breakdown = dashboard.getBreakdown('user-1');
    expect(breakdown.ai).toBe(3.0); // 0.3x multiplier
  });

  it('computes daily average and monthly projection', () => {
    const now = Date.now();
    const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;

    dashboard.recordCost({ userId: 'user-1', category: 'ai', amount: 3.0, timestamp: now - 1000 });

    const result = dashboard.computeCost('user-1', { startMs: threeDaysAgo, endMs: now });
    expect(result.dailyAverage).toBeCloseTo(1.0, 1);
    expect(result.projectedMonthly).toBeCloseTo(30.0, 0);
  });
});
