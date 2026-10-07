import type { RegretEntry } from '../types.js';

export class RegretTracker {
  private entries: RegretEntry[] = [];

  record(appId: string, sessionId: string, rating: number): RegretEntry | null {
    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) return null;
    const entry: RegretEntry = {
      id: crypto.randomUUID(),
      appId,
      sessionId,
      rating,
      timestamp: Date.now(),
    };
    this.entries.push(entry);
    return entry;
  }

  getRegretRate(appId: string): number {
    const appEntries = this.entries.filter((e) => e.appId === appId);
    if (appEntries.length === 0) return 0;
    const sum = appEntries.reduce((acc, e) => acc + e.rating, 0);
    return sum / appEntries.length;
  }

  getHighRegretApps(threshold = 3.5): string[] {
    const appRates = new Map<string, { sum: number; count: number }>();
    for (const entry of this.entries) {
      const existing = appRates.get(entry.appId) ?? { sum: 0, count: 0 };
      existing.sum += entry.rating;
      existing.count++;
      appRates.set(entry.appId, existing);
    }
    const result: string[] = [];
    for (const [appId, data] of appRates) {
      if (data.sum / data.count >= threshold) {
        result.push(appId);
      }
    }
    return result;
  }

  suggestLimits(threshold = 3.5): Array<{ appId: string; avgRegret: number; suggestion: string }> {
    const highRegret = this.getHighRegretApps(threshold);
    return highRegret.map((appId) => {
      const rate = this.getRegretRate(appId);
      return {
        appId,
        avgRegret: rate,
        suggestion: `Consider setting a ${rate >= 4 ? '30' : '60'}-minute daily limit for ${appId}`,
      };
    });
  }

  getEntriesByApp(appId: string): RegretEntry[] {
    return this.entries.filter((e) => e.appId === appId);
  }

  getEntries(): RegretEntry[] {
    return [...this.entries];
  }
}
