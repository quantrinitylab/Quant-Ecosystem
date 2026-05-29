import { describe, expect, it } from 'vitest';
import { SpendDashboardService } from '../spend-dashboard.service.js';
import type { SpendRecord } from '../types.js';

describe('SpendDashboardService', () => {
  const now = Date.now();

  function makeRecord(overrides: Partial<SpendRecord> = {}): SpendRecord {
    return {
      id: `spend-${Math.random().toString(36).slice(2, 8)}`,
      userId: 'user-1',
      modelId: 'gpt-4o',
      appId: 'app-chat',
      tokensInput: 500,
      tokensOutput: 200,
      cost: 0.05,
      creditsUsed: 10,
      timestamp: now,
      source: 'byoc',
      ...overrides,
    };
  }

  it('records spend entries', () => {
    const service = new SpendDashboardService();
    const record = makeRecord();

    service.recordSpend(record);
    const dashboard = service.getDashboard('user-1', now - 1000, now + 1000);

    expect(dashboard.totalCost).toBe(0.05);
    expect(dashboard.totalTokens).toBe(700);
    expect(dashboard.totalCreditsUsed).toBe(10);
  });

  it('aggregates by model correctly', () => {
    const service = new SpendDashboardService();
    service.recordSpend(makeRecord({ modelId: 'gpt-4o', cost: 0.05 }));
    service.recordSpend(makeRecord({ modelId: 'gpt-4o', cost: 0.03 }));
    service.recordSpend(makeRecord({ modelId: 'claude-3', cost: 0.1 }));

    const dashboard = service.getDashboard('user-1', now - 1000, now + 1000);

    expect(dashboard.byModel.get('gpt-4o')).toBeCloseTo(0.08, 5);
    expect(dashboard.byModel.get('claude-3')).toBeCloseTo(0.1, 5);
  });

  it('aggregates by app correctly', () => {
    const service = new SpendDashboardService();
    service.recordSpend(makeRecord({ appId: 'app-chat', cost: 0.05 }));
    service.recordSpend(makeRecord({ appId: 'app-code', cost: 0.12 }));

    const dashboard = service.getDashboard('user-1', now - 1000, now + 1000);

    expect(dashboard.byApp.get('app-chat')).toBeCloseTo(0.05, 5);
    expect(dashboard.byApp.get('app-code')).toBeCloseTo(0.12, 5);
  });

  it('aggregates by day correctly', () => {
    const service = new SpendDashboardService();
    const todayKey = new Date(now).toISOString().slice(0, 10);

    service.recordSpend(makeRecord({ cost: 0.05, timestamp: now }));
    service.recordSpend(makeRecord({ cost: 0.03, timestamp: now }));

    const dashboard = service.getDashboard('user-1', now - 1000, now + 1000);

    expect(dashboard.byDay.get(todayKey)).toBeCloseTo(0.08, 5);
  });

  it('gets daily trend', () => {
    const service = new SpendDashboardService();
    service.recordSpend(makeRecord({ cost: 0.05, timestamp: now }));
    service.recordSpend(makeRecord({ cost: 0.1, timestamp: now - 86400000 }));

    const trend = service.getDailyTrend('user-1', 7);

    expect(trend.length).toBeGreaterThanOrEqual(1);
    const totalFromTrend = trend.reduce((sum, t) => sum + t.total, 0);
    expect(totalFromTrend).toBeCloseTo(0.15, 5);
  });

  it('estimates monthly projection based on recent usage', () => {
    const service = new SpendDashboardService();
    service.recordSpend(makeRecord({ cost: 1.0, timestamp: now }));
    service.recordSpend(makeRecord({ cost: 1.0, timestamp: now - 86400000 }));

    const projection = service.estimateMonthlyProjection('user-1');

    expect(projection).toBeGreaterThan(0);
    expect(projection).toBeLessThanOrEqual(60);
  });

  it('returns zero monthly projection for new user', () => {
    const service = new SpendDashboardService();

    expect(service.estimateMonthlyProjection('user-1')).toBe(0);
  });

  it('calculates local savings correctly', () => {
    const service = new SpendDashboardService({
      localSavingsRates: { inputTokenRate: 0.001, outputTokenRate: 0.002 },
    });
    service.recordSpend(
      makeRecord({ source: 'local', tokensInput: 1000, tokensOutput: 500, cost: 0 }),
    );

    const savings = service.getLocalSavings('user-1');

    expect(savings).toBe(1000 * 0.001 + 500 * 0.002);
    expect(savings).toBe(2);
  });

  it('gets top models by cost', () => {
    const service = new SpendDashboardService();
    service.recordSpend(makeRecord({ modelId: 'gpt-4o', cost: 5.0 }));
    service.recordSpend(makeRecord({ modelId: 'claude-3', cost: 3.0 }));
    service.recordSpend(makeRecord({ modelId: 'gemini', cost: 1.0 }));

    const topModels = service.getTopModels('user-1', 2);

    expect(topModels).toHaveLength(2);
    expect(topModels[0]!.modelId).toBe('gpt-4o');
    expect(topModels[0]!.cost).toBe(5.0);
    expect(topModels[1]!.modelId).toBe('claude-3');
  });

  it('filters dashboard by period', () => {
    const service = new SpendDashboardService();
    service.recordSpend(makeRecord({ cost: 0.05, timestamp: now }));
    service.recordSpend(makeRecord({ cost: 0.1, timestamp: now - 86400000 * 10 }));

    const dashboard = service.getDashboard('user-1', now - 1000, now + 1000);

    expect(dashboard.totalCost).toBeCloseTo(0.05, 5);
  });
});
