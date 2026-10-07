import type { DoomScrollSignal } from '../types.js';

export class DoomScrollDetector {
  private counts = new Map<string, { count: number; startedAt: number; timestamps: number[] }>();
  private warningLevel = new Map<string, number>();

  constructor(private threshold = 50) {}

  trackScroll(appId: string, timestamp = Date.now()): void {
    const e = this.counts.get(appId) ?? { count: 0, startedAt: timestamp, timestamps: [] };
    e.count++;
    e.timestamps.push(timestamp);
    this.counts.set(appId, e);
  }

  check(appId: string): DoomScrollSignal | null {
    const e = this.counts.get(appId);
    if (!e || e.count < this.threshold) return null;
    const now = Date.now();
    return {
      id: crypto.randomUUID(),
      appId,
      scrollCount: e.count,
      durationMs: now - e.startedAt,
      triggeredAt: now,
      velocity: this.getVelocity(appId),
    };
  }

  getVelocity(appId: string): number {
    const e = this.counts.get(appId);
    if (!e || e.timestamps.length < 2) return 0;
    const recent = e.timestamps.slice(-10);
    if (recent.length < 2) return 0;
    const firstTs = recent[0]!;
    const lastTs = recent[recent.length - 1]!;
    const timespan = lastTs - firstTs;
    if (timespan === 0) return 0;
    return (recent.length / timespan) * 1000;
  }

  getWarningLevel(appId: string): number {
    const e = this.counts.get(appId);
    if (!e) return 0;
    const ratio = e.count / this.threshold;
    if (ratio < 0.5) return 0;
    if (ratio < 0.8) return 1;
    if (ratio < 1.0) return 2;
    return 3;
  }

  progressiveWarning(appId: string): string | null {
    const level = this.getWarningLevel(appId);
    const current = this.warningLevel.get(appId) ?? 0;
    if (level <= current && level < 3) return null;
    this.warningLevel.set(appId, level);
    const messages: Record<number, string> = {
      1: 'You have been scrolling for a while',
      2: 'Consider taking a break soon',
      3: 'You should take a break now',
    };
    return messages[level] ?? null;
  }

  reset(appId: string): void {
    this.counts.delete(appId);
    this.warningLevel.delete(appId);
  }

  suggestBreak(appId: string) {
    const e = this.counts.get(appId);
    if (!e || e.count < this.threshold) return null;
    return {
      suggestion: `Take a break from ${appId}. You scrolled ${e.count} times.`,
      scrollCount: e.count,
    };
  }
}
