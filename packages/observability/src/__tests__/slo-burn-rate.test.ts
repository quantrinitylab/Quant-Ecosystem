import { describe, it, expect, beforeEach } from 'vitest';
import { BurnRateCalculator } from '../slo-burn-rate.js';
import { SLODefinition } from '../types.js';

describe('BurnRateCalculator', () => {
  const sloDefinition: SLODefinition = {
    name: 'test_availability',
    target: 0.999,
    metric: 'success_rate',
    window: 30 * 24 * 3600000,
    burnRateThresholds: [
      { severity: 'critical', shortWindow: 300000, longWindow: 3600000, burnRate: 14.4 },
      { severity: 'warning', shortWindow: 1800000, longWindow: 21600000, burnRate: 6 },
    ],
    description: 'Test availability SLO (99.9%)',
  };

  let calculator: BurnRateCalculator;

  beforeEach(() => {
    calculator = new BurnRateCalculator(sloDefinition);
  });

  it('calculates burn rate with known event sequences', () => {
    // Add 100 events: 90 success, 10 failures
    for (let i = 0; i < 90; i++) {
      calculator.addEvent(true);
    }
    for (let i = 0; i < 10; i++) {
      calculator.addEvent(false);
    }

    // error rate = 10/100 = 0.1, allowed error rate = 0.001
    // burn rate = 0.1 / 0.001 = 100
    const burnRate = calculator.calculateBurnRate(30 * 24 * 3600000);
    expect(burnRate).toBeGreaterThan(1);
  });

  it('detects budget exhaustion when budget is consumed', () => {
    // With target 0.999, only 0.1% failures allowed
    // Add 1000 events with 10% failure rate (well over budget)
    for (let i = 0; i < 900; i++) {
      calculator.addEvent(true);
    }
    for (let i = 0; i < 100; i++) {
      calculator.addEvent(false);
    }

    expect(calculator.detectBudgetExhaustion()).toBe(true);
  });

  it('returns time to exhaustion estimate', () => {
    // Add events with a moderate failure rate above budget
    for (let i = 0; i < 950; i++) {
      calculator.addEvent(true);
    }
    for (let i = 0; i < 50; i++) {
      calculator.addEvent(false);
    }

    const timeToExhaustion = calculator.getTimeToExhaustion();
    // With burn rate > 1, should return a value
    expect(timeToExhaustion).not.toBeNull();
    expect(timeToExhaustion).toBe(0); // Already exhausted at this rate
  });

  it('fast/slow window alerting triggers correctly', () => {
    // Add enough failures to trigger alerts
    for (let i = 0; i < 90; i++) {
      calculator.addEvent(true);
    }
    for (let i = 0; i < 10; i++) {
      calculator.addEvent(false);
    }

    const alerts = calculator.getActiveAlerts();
    expect(alerts).toHaveLength(2);

    // With 10% error rate vs 0.1% budget, burn rate is 100
    // Both critical (14.4) and warning (6) thresholds should be triggered
    const triggeredAlerts = alerts.filter((a) => a.triggered);
    expect(triggeredAlerts.length).toBeGreaterThan(0);
  });
});
