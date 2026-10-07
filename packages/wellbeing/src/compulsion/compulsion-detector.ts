import type { CompulsionPattern } from '../types.js';

interface CompulsionConfig {
  appSwitchThreshold: number;
  rapidCheckIntervalMs: number;
  rapidCheckThreshold: number;
  lateNightStartHour: number;
  lateNightThreshold: number;
}

const DEFAULT_CONFIG: CompulsionConfig = {
  appSwitchThreshold: 5,
  rapidCheckIntervalMs: 120_000,
  rapidCheckThreshold: 3,
  lateNightStartHour: 23,
  lateNightThreshold: 3,
};

export class CompulsionDetector {
  private config: CompulsionConfig;
  private appOpens = new Map<string, number[]>();
  private history: CompulsionPattern[] = [];

  constructor(config: Partial<CompulsionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  recordOpen(appId: string, timestamp = Date.now()): CompulsionPattern | null {
    const opens = this.appOpens.get(appId) ?? [];
    opens.push(timestamp);
    this.appOpens.set(appId, opens);
    return this.analyze(appId, timestamp);
  }

  private analyze(appId: string, now: number): CompulsionPattern | null {
    const opens = this.appOpens.get(appId);
    if (!opens) return null;

    // Check app-switching loops
    const recentOpens = opens.filter((t) => now - t < 600_000);
    if (recentOpens.length >= this.config.appSwitchThreshold) {
      return this.createPattern('app-switching', appId, recentOpens.length, now);
    }

    // Check rapid repeated checks
    const rapidOpens = opens.filter((t) => now - t < this.config.rapidCheckIntervalMs);
    if (rapidOpens.length >= this.config.rapidCheckThreshold) {
      return this.createPattern('rapid-check', appId, rapidOpens.length, now);
    }

    // Check late-night spikes
    const hour = new Date(now).getHours();
    if (hour >= this.config.lateNightStartHour || hour < 5) {
      const lateOpens = opens.filter((t) => {
        const h = new Date(t).getHours();
        return h >= this.config.lateNightStartHour || h < 5;
      });
      if (lateOpens.length >= this.config.lateNightThreshold) {
        return this.createPattern('late-night', appId, lateOpens.length, now);
      }
    }

    return null;
  }

  private createPattern(
    type: CompulsionPattern['type'],
    appId: string,
    count: number,
    now: number,
  ): CompulsionPattern {
    const thresholdMap: Record<CompulsionPattern['type'], number> = {
      'app-switching': this.config.appSwitchThreshold,
      'rapid-check': this.config.rapidCheckThreshold,
      'late-night': this.config.lateNightThreshold,
    };
    const pattern: CompulsionPattern = {
      id: crypto.randomUUID(),
      type,
      appId,
      count,
      detectedAt: now,
      threshold: thresholdMap[type],
    };
    this.history.push(pattern);
    return pattern;
  }

  getHistory(): CompulsionPattern[] {
    return [...this.history];
  }

  getHistoryByApp(appId: string): CompulsionPattern[] {
    return this.history.filter((p) => p.appId === appId);
  }

  reset(appId: string): void {
    this.appOpens.delete(appId);
  }
}
