import { UsageTracker } from '../tracking/usage-tracker.js';
import { DoomScrollDetector } from '../detection/doom-scroll-detector.js';
import { BedtimeMode } from '../bedtime/bedtime-mode.js';
import { AIIntegrity } from '../integrity/ai-integrity.js';
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
});
describe('BedtimeMode', () => {
  it('active check, dim, block notifications', () => {
    const b = new BedtimeMode();
    expect(b.isActive(23)).toBe(false);
    // prettier-ignore
    b.configure({ enabled: true, startHour: 22, endHour: 6, dimLevel: 80, blockNonEssential: true });
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
