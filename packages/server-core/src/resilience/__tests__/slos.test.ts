import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SloTracker, type BurnRateAlert } from '../slos';

const DEFS = [
  {
    id: 'mail.inbox-read',
    journey: 'Inbox read',
    availabilityTarget: 0.999,
    latencyTargetMs: 800,
    latencyPercentile: 0.99,
    windowHours: 720,
  },
];

function ok(latencyMs = 50): { ok: boolean; latencyMs: number } {
  return { ok: true, latencyMs };
}

describe('SloTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports no_data before any observations', () => {
    const tracker = new SloTracker(DEFS);
    const eval_ = tracker.evaluate('mail.inbox-read');
    expect(eval_.status).toBe('no_data');
    expect(eval_.observations).toBe(0);
    expect(eval_.availability.errorRate).toBeNull();
  });

  it('computes availability burn rate from real observations', () => {
    const tracker = new SloTracker(DEFS);
    // 1000 requests, 1% failures against a 99.9% target (0.1% budget):
    // burnRate = 0.01 / 0.001 = 10 -> slow-burn warning (>= 6, < 14.4).
    for (let i = 0; i < 990; i++) tracker.record('mail.inbox-read', ok());
    for (let i = 0; i < 10; i++) tracker.record('mail.inbox-read', { ok: false, latencyMs: 50 });

    const eval_ = tracker.evaluate('mail.inbox-read');
    expect(eval_.observations).toBe(1000);
    expect(eval_.availability.errorRate).toBeCloseTo(0.01, 5);
    expect(eval_.availability.burnRate).toBeCloseTo(10, 5);
    // 10 failures vs 1 allowed (1000 * 0.001) -> 1000% of budget consumed.
    expect(eval_.availability.budgetConsumedPct).toBeCloseTo(1000, 5);
    expect(eval_.status).toBe('warning');
  });

  it('marks critical on fast burn', () => {
    const tracker = new SloTracker(DEFS);
    for (let i = 0; i < 950; i++) tracker.record('mail.inbox-read', ok());
    for (let i = 0; i < 50; i++) tracker.record('mail.inbox-read', { ok: false, latencyMs: 50 });
    // 5% errors / 0.1% budget = 50x burn -> critical.
    const eval_ = tracker.evaluate('mail.inbox-read');
    expect(eval_.availability.burnRate).toBeCloseTo(50, 5);
    expect(eval_.status).toBe('critical');
  });

  it('computes latency burn rate against the percentile budget', () => {
    const tracker = new SloTracker(DEFS);
    for (let i = 0; i < 90; i++) tracker.record('mail.inbox-read', ok(50));
    // 10% of requests slower than the 800ms target vs a 1% p99 budget -> 10x.
    for (let i = 0; i < 10; i++) tracker.record('mail.inbox-read', ok(2000));
    const eval_ = tracker.evaluate('mail.inbox-read');
    expect(eval_.latency.burnRate).toBeCloseTo(10, 5);
    expect(eval_.latency.valueMs).toBeGreaterThan(800);
    expect(eval_.status).toBe('warning');
  });

  it('stays healthy when both budgets are within target', () => {
    const tracker = new SloTracker(DEFS);
    for (let i = 0; i < 1000; i++) tracker.record('mail.inbox-read', ok(50));
    const eval_ = tracker.evaluate('mail.inbox-read');
    expect(eval_.status).toBe('healthy');
    expect(eval_.availability.burnRate).toBe(0);
    expect(eval_.availability.budgetConsumedPct).toBe(0);
  });

  it('fires a burn-rate alert once per severity until re-armed', () => {
    const alerts: BurnRateAlert[] = [];
    const tracker = new SloTracker(DEFS, { onAlert: [(a) => alerts.push(a)] });

    for (let i = 0; i < 990; i++) tracker.record('mail.inbox-read', ok());
    for (let i = 0; i < 10; i++) tracker.record('mail.inbox-read', { ok: false, latencyMs: 50 });

    const slowAlerts = alerts.filter((a) => a.severity === 'slow');
    expect(slowAlerts.length).toBe(1);
    expect(slowAlerts[0]!.sloId).toBe('mail.inbox-read');
    // The alert captures the burn rate at fire time (the moment the slow
    // threshold is crossed), which is >= 6 but below the final 10x.
    expect(slowAlerts[0]!.burnRate).toBeGreaterThanOrEqual(6);
    expect(slowAlerts[0]!.burnRate).toBeLessThanOrEqual(10);
    expect(slowAlerts[0]!.windowHours).toBe(720);

    // More failures while still burning: no duplicate alert.
    for (let i = 0; i < 5; i++) tracker.record('mail.inbox-read', { ok: false, latencyMs: 50 });
    expect(alerts.filter((a) => a.severity === 'slow').length).toBe(1);
  });

  it('re-arms alerts after the SLO recovers', () => {
    const alerts: BurnRateAlert[] = [];
    const shortWindow = [{ ...DEFS[0]!, windowHours: 1 / 3600 }]; // 1-second window
    const tracker = new SloTracker(shortWindow, {
      fastBurnThreshold: 2,
      slowBurnThreshold: 1,
      onAlert: [(a) => alerts.push(a)],
    });

    tracker.record('mail.inbox-read', { ok: false, latencyMs: 50 });
    expect(alerts.length).toBeGreaterThan(0);

    // Advance past the window, then record healthy traffic: alert clears.
    vi.advanceTimersByTime(2000);
    tracker.record('mail.inbox-read', ok());
    expect(tracker.evaluate('mail.inbox-read').status).toBe('healthy');

    // A new burn fires a fresh alert.
    const before = alerts.length;
    tracker.record('mail.inbox-read', { ok: false, latencyMs: 50 });
    expect(alerts.length).toBeGreaterThan(before);
  });

  it('only counts observations inside the measurement window', () => {
    const tracker = new SloTracker([{ ...DEFS[0]!, windowHours: 1 }]);
    tracker.record('mail.inbox-read', { ok: false, latencyMs: 50 });
    vi.advanceTimersByTime(2 * 3_600_000); // 2h later
    tracker.record('mail.inbox-read', ok());
    const eval_ = tracker.evaluate('mail.inbox-read');
    expect(eval_.observations).toBe(1);
    expect(eval_.status).toBe('healthy');
  });

  it('throws on unknown SLO ids and invalid targets', () => {
    const tracker = new SloTracker(DEFS);
    expect(() => tracker.record('nope', ok())).toThrow("unknown SLO 'nope'");
    expect(() => tracker.evaluate('nope')).toThrow("unknown SLO 'nope'");
    expect(
      () => new SloTracker([{ ...DEFS[0]!, id: 'bad', availabilityTarget: 1.5 }]),
    ).toThrow('availabilityTarget must be in (0, 1)');
  });
});
