import { UsageTracker } from '../tracking/usage-tracker.js';
import { DoomScrollDetector } from '../detection/doom-scroll-detector.js';
import { BedtimeMode } from '../bedtime/bedtime-mode.js';
import { AIIntegrity } from '../integrity/ai-integrity.js';
import { ScreenTimeLimiter } from '../limits/screen-time-limiter.js';
import { BreakReminderService } from '../breaks/break-reminder.js';
import { CompulsionDetector } from '../compulsion/compulsion-detector.js';
import { RetreatMode } from '../retreat/retreat-mode.js';
import { RegretTracker } from '../regret/regret-tracker.js';
import { CrisisResources } from '../crisis/crisis-resources.js';

describe('UsageTracker', () => {
  it('start/end session, binge, summary', () => {
    const t = new UsageTracker();
    const s = t.startSession('app1');
    expect(t.getSession(s.id)?.appId).toBe('app1');
    expect(t.endSession(s.id)?.endedAt).toBeGreaterThan(0);
    expect(t.getBingeSessions()).toHaveLength(0);
    expect(t.getDailySummary(new Date().toISOString().slice(0, 10)).period).toBe('daily');
  });

  it('detects binge when session exceeds 30 min', () => {
    const t = new UsageTracker();
    const s = t.startSession('app2');
    (s as { startedAt: number }).startedAt = Date.now() - 1_900_000;
    expect(t.endSession(s.id)?.isBinge).toBe(true);
    expect(t.getBingeSessions()).toHaveLength(1);
  });
});

describe('DoomScrollDetector', () => {
  it('tracks, triggers at threshold, reset', () => {
    const d = new DoomScrollDetector(3);
    d.trackScroll('feed');
    d.trackScroll('feed');
    expect(d.check('feed')).toBeNull();
    d.trackScroll('feed');
    expect(d.check('feed')).not.toBeNull();
    expect(d.suggestBreak('feed')?.scrollCount).toBe(3);
    d.reset('feed');
    expect(d.check('feed')).toBeNull();
  });

  it('computes velocity from scroll timestamps', () => {
    const d = new DoomScrollDetector(5);
    const base = Date.now();
    for (let i = 0; i < 5; i++) {
      d.trackScroll('app', base + i * 100);
    }
    const vel = d.getVelocity('app');
    expect(vel).toBeGreaterThan(0);
  });

  it('provides progressive warnings at different levels', () => {
    const d = new DoomScrollDetector(10);
    for (let i = 0; i < 5; i++) d.trackScroll('x');
    expect(d.getWarningLevel('x')).toBe(1);
    for (let i = 0; i < 3; i++) d.trackScroll('x');
    expect(d.getWarningLevel('x')).toBe(2);
    for (let i = 0; i < 2; i++) d.trackScroll('x');
    expect(d.getWarningLevel('x')).toBe(3);
  });

  it('progressiveWarning emits messages only on level change', () => {
    const d = new DoomScrollDetector(10);
    for (let i = 0; i < 5; i++) d.trackScroll('a');
    expect(d.progressiveWarning('a')).toContain('scrolling');
    expect(d.progressiveWarning('a')).toBeNull();
    for (let i = 0; i < 3; i++) d.trackScroll('a');
    expect(d.progressiveWarning('a')).toContain('break soon');
  });
});

describe('BedtimeMode', () => {
  it('active check, dim, block notifications', () => {
    const b = new BedtimeMode();
    expect(b.isActive(23)).toBe(false);
    b.configure({
      enabled: true,
      startHour: 22,
      endHour: 6,
      dimLevel: 80,
      blockNonEssential: true,
    });
    expect(b.isActive(23)).toBe(true);
    expect(b.isActive(12)).toBe(false);
    expect(b.getDimLevel(23)).toBe(80);
    expect(b.shouldBlockNotification('normal', 23)).toBe(true);
    expect(b.shouldBlockNotification('essential', 23)).toBe(false);
  });
});

describe('AIIntegrity', () => {
  it('assess, manipulation check, disclaimer', () => {
    const ai = new AIIntegrity();
    expect(ai.assessOutput('hi', 0.5).warningFlag).toBe(true);
    expect(ai.checkManipulation('Act now!').safe).toBe(false);
    expect(ai.checkManipulation('Hello').safe).toBe(true);
    expect(ai.addDisclaimer('info', 0.3)).toBe('[Quant might be wrong] info');
  });
});

describe('ScreenTimeLimiter', () => {
  it('sets limits and tracks usage', () => {
    const limiter = new ScreenTimeLimiter();
    limiter.setLimit('social', 60_000);
    const status = limiter.trackUsage('social', 30_000);
    expect(status?.usedMs).toBe(30_000);
    expect(status?.warned).toBe(false);
    expect(status?.blocked).toBe(false);
  });

  it('warns at 80% and blocks at 100%', () => {
    const limiter = new ScreenTimeLimiter();
    limiter.setLimit('game', 100_000);
    limiter.trackUsage('game', 80_000);
    expect(limiter.getStatus('game')?.warned).toBe(true);
    expect(limiter.getStatus('game')?.blocked).toBe(false);
    limiter.trackUsage('game', 20_000);
    expect(limiter.getStatus('game')?.blocked).toBe(true);
  });

  it('override unblocks with cooldown', () => {
    const limiter = new ScreenTimeLimiter();
    limiter.setLimit('app', 100);
    limiter.trackUsage('app', 100);
    expect(limiter.getStatus('app')?.blocked).toBe(true);
    expect(limiter.override('app', 0)).toBe(true);
    expect(limiter.getStatus('app')?.blocked).toBe(false);
  });

  it('cooldown prevents repeated overrides', () => {
    const limiter = new ScreenTimeLimiter();
    limiter.setLimit('app', 100);
    limiter.trackUsage('app', 100);
    limiter.override('app', 999_999_999);
    expect(limiter.override('app', 999_999_999)).toBe(false);
  });

  it('carry-over extends effective limit', () => {
    const limiter = new ScreenTimeLimiter();
    limiter.setLimit('app', 100_000, 50_000);
    limiter.trackUsage('app', 120_000);
    expect(limiter.getStatus('app')?.blocked).toBe(false);
    limiter.trackUsage('app', 30_000);
    expect(limiter.getStatus('app')?.blocked).toBe(true);
  });

  it('resetDaily resets usage and calculates carry-over', () => {
    const limiter = new ScreenTimeLimiter();
    limiter.setLimit('x', 100_000);
    limiter.trackUsage('x', 60_000);
    limiter.resetDaily();
    const s = limiter.getStatus('x');
    expect(s?.usedMs).toBe(0);
    expect(s?.carryOverMs).toBe(40_000);
  });
});

describe('BreakReminderService', () => {
  it('creates reminders and checks due', () => {
    const svc = new BreakReminderService();
    const r = svc.createReminder(1_500_000);
    expect(r.intervalMs).toBe(1_500_000);
    expect(svc.checkDue(r.id)).toBe(false);
  });

  it('snooze escalates: 5min, 3min, forced', () => {
    const svc = new BreakReminderService();
    const r = svc.createReminder(1000);
    const s1 = svc.snooze(r.id);
    expect(s1?.nextMs).toBe(300_000);
    expect(s1?.forced).toBe(false);
    const s2 = svc.snooze(r.id);
    expect(s2?.nextMs).toBe(180_000);
    expect(s2?.forced).toBe(false);
    const s3 = svc.snooze(r.id);
    expect(s3?.forced).toBe(true);
  });

  it('takeBreak resets snooze count', () => {
    const svc = new BreakReminderService();
    const r = svc.createReminder(1000);
    svc.snooze(r.id);
    svc.snooze(r.id);
    svc.takeBreak(r.id);
    const after = svc.getReminder(r.id);
    expect(after?.snoozeCount).toBe(0);
    expect(after?.forced).toBe(false);
  });

  it('binge mode makes reminders more frequent', () => {
    const svc = new BreakReminderService();
    const r = svc.createReminder(10_000);
    svc.setBingeMode(true);
    // With binge mode, effective interval is halved
    const reminder = svc.getReminder(r.id)!;
    // Simulate time passing just past half the interval
    (reminder as { lastBreakAt: number }).lastBreakAt = Date.now() - 5_001;
    expect(svc.checkDue(r.id)).toBe(true);
  });
});

describe('CompulsionDetector', () => {
  it('detects app-switching loops', () => {
    const det = new CompulsionDetector({ appSwitchThreshold: 3 });
    const now = Date.now();
    det.recordOpen('social', now);
    det.recordOpen('social', now + 1000);
    const result = det.recordOpen('social', now + 2000);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('app-switching');
  });

  it('detects rapid repeated checks', () => {
    const det = new CompulsionDetector({ rapidCheckIntervalMs: 5000, rapidCheckThreshold: 3 });
    const now = Date.now();
    det.recordOpen('mail', now);
    det.recordOpen('mail', now + 1000);
    const result = det.recordOpen('mail', now + 2000);
    expect(result?.type).toBe('rapid-check');
  });

  it('tracks pattern history', () => {
    const det = new CompulsionDetector({ appSwitchThreshold: 2 });
    const now = Date.now();
    det.recordOpen('x', now);
    det.recordOpen('x', now + 100);
    expect(det.getHistory()).toHaveLength(1);
    expect(det.getHistoryByApp('x')).toHaveLength(1);
    expect(det.getHistoryByApp('y')).toHaveLength(0);
  });

  it('reset clears app opens', () => {
    const det = new CompulsionDetector({ appSwitchThreshold: 5 });
    const now = Date.now();
    det.recordOpen('app', now);
    det.recordOpen('app', now + 100);
    det.reset('app');
    det.recordOpen('app', now + 200);
    expect(det.getHistory().filter((p) => p.appId === 'app')).toHaveLength(0);
  });
});

describe('RetreatMode', () => {
  it('starts and blocks non-whitelisted apps', () => {
    const rm = new RetreatMode();
    rm.start();
    expect(rm.isBlocked('social')).toBe(true);
    expect(rm.isBlocked('emergency')).toBe(false);
    expect(rm.isBlocked('phone')).toBe(false);
  });

  it('gradual re-entry unlocks apps one by one', () => {
    const rm = new RetreatMode();
    rm.start();
    expect(rm.isBlocked('news')).toBe(true);
    rm.unlockApp('news');
    expect(rm.isBlocked('news')).toBe(false);
  });

  it('tracks streak on end', () => {
    const rm = new RetreatMode();
    rm.start();
    rm.end();
    expect(rm.getStreak()).toBe(1);
    rm.start();
    rm.end();
    expect(rm.getStreak()).toBe(2);
  });

  it('checks expiration', () => {
    const rm = new RetreatMode();
    rm.configure({ durationMs: 1000 } as Partial<{
      enabled: boolean;
      durationMs: number;
      whitelist: string[];
      gradualReentry: boolean;
      streak: number;
    }>);
    rm.start();
    expect(rm.isExpired(Date.now() + 2000)).toBe(true);
    expect(rm.isExpired(Date.now() + 500)).toBe(false);
  });
});

describe('RegretTracker', () => {
  it('records regret entries and computes rate', () => {
    const rt = new RegretTracker();
    rt.record('social', 's1', 4);
    rt.record('social', 's2', 5);
    rt.record('social', 's3', 3);
    expect(rt.getRegretRate('social')).toBe(4);
    expect(rt.getEntriesByApp('social')).toHaveLength(3);
  });

  it('rejects invalid ratings', () => {
    const rt = new RegretTracker();
    expect(rt.record('a', 's1', 0)).toBeNull();
    expect(rt.record('a', 's1', 6)).toBeNull();
    expect(rt.record('a', 's1', 2.5)).toBeNull();
  });

  it('identifies high-regret apps', () => {
    const rt = new RegretTracker();
    rt.record('social', 's1', 5);
    rt.record('social', 's2', 4);
    rt.record('news', 's3', 2);
    rt.record('news', 's4', 1);
    expect(rt.getHighRegretApps(3.5)).toContain('social');
    expect(rt.getHighRegretApps(3.5)).not.toContain('news');
  });

  it('suggests limits for high-regret apps', () => {
    const rt = new RegretTracker();
    rt.record('doom', 's1', 5);
    rt.record('doom', 's2', 4);
    const suggestions = rt.suggestLimits(3.5);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.suggestion).toContain('30');
  });
});

describe('CrisisResources', () => {
  it('returns regional resources', () => {
    const cr = new CrisisResources();
    const us = cr.getResourcesByRegion('US');
    expect(us.length).toBeGreaterThanOrEqual(2);
    expect(us.some((r) => r.region === 'GLOBAL')).toBe(true);
  });

  it('detects crisis keywords', () => {
    const cr = new CrisisResources();
    expect(cr.detectCrisis('I feel great').detected).toBe(false);
    expect(cr.detectCrisis('I want to kill myself').detected).toBe(true);
    expect(cr.detectCrisis('feeling hopeless').keyword).toBe('hopeless');
  });

  it('fires intervention hook on crisis detection', () => {
    const cr = new CrisisResources();
    const detected: string[] = [];
    cr.onIntervention((kw) => detected.push(kw));
    cr.detectCrisis('I want to end it all');
    expect(detected).toHaveLength(1);
    expect(detected[0]).toBe('end it all');
  });

  it('never blocks emergency apps', () => {
    const cr = new CrisisResources();
    expect(cr.neverBlock('emergency')).toBe(true);
    expect(cr.neverBlock('phone')).toBe(true);
    expect(cr.neverBlock('social')).toBe(false);
  });
});
