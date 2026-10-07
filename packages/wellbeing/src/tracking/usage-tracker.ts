import type { UsageSession, WellbeingReport } from '../types.js';
export class UsageTracker {
  private sessions = new Map<string, UsageSession>();
  startSession(appId: string): UsageSession {
    // prettier-ignore
    const s: UsageSession = { id: crypto.randomUUID(), appId, startedAt: Date.now(), endedAt: null, isBinge: false };
    this.sessions.set(s.id, s);
    return s;
  }
  endSession(id: string) {
    const s = this.sessions.get(id);
    if (!s) return null;
    s.endedAt = Date.now();
    s.isBinge = s.endedAt - s.startedAt > 1_800_000;
    return s;
  }
  // prettier-ignore
  getSession(id: string) { return this.sessions.get(id) ?? null; }
  getDailySummary(date: string): WellbeingReport {
    // prettier-ignore
    const bd: Record<string, number> = {};
    let total = 0,
      binges = 0;
    for (const s of this.sessions.values()) {
      if (new Date(s.startedAt).toISOString().slice(0, 10) !== date) continue;
      const m = ((s.endedAt ?? Date.now()) - s.startedAt) / 60000;
      bd[s.appId] = (bd[s.appId] ?? 0) + m;
      total += m;
      if (s.isBinge) binges++;
    }
    // prettier-ignore
    return { period: 'daily', totalMinutes: total, bingeCount: binges, doomScrollAlerts: 0, appBreakdown: bd };
  }
  // prettier-ignore
  getBingeSessions() { return [...this.sessions.values()].filter((s) => s.isBinge); }
}
