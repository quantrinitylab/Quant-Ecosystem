import type { DoomScrollSignal } from '../types.js';
export class DoomScrollDetector {
  private counts = new Map<string, { count: number; startedAt: number }>();
  constructor(private threshold = 50) {}
  trackScroll(appId: string) {
    const e = this.counts.get(appId) ?? { count: 0, startedAt: Date.now() };
    e.count++;
    this.counts.set(appId, e);
  }
  check(appId: string): DoomScrollSignal | null {
    const e = this.counts.get(appId);
    if (!e || e.count < this.threshold) return null;
    // prettier-ignore
    return { id: crypto.randomUUID(), appId, scrollCount: e.count, durationMs: Date.now() - e.startedAt, triggeredAt: Date.now() };
  }
  // prettier-ignore
  reset(appId: string) { this.counts.delete(appId); }
  suggestBreak(appId: string) {
    const e = this.counts.get(appId);
    if (!e || e.count < this.threshold) return null;
    // prettier-ignore
    return { suggestion: `Take a break from ${appId}. You scrolled ${e.count} times.`, scrollCount: e.count };
  }
}
