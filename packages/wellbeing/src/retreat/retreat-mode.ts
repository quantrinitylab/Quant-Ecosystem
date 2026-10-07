import type { RetreatModeConfig } from '../types.js';
import { CrisisResources } from '../crisis/crisis-resources.js';

export class RetreatMode {
  private config: RetreatModeConfig = {
    enabled: false,
    durationMs: 3_600_000,
    whitelist: ['emergency', 'phone'],
    gradualReentry: true,
    streak: 0,
  };
  private startedAt: number | null = null;
  private unlockedApps = new Set<string>();
  private crisisResources: CrisisResources;

  constructor(crisisResources?: CrisisResources) {
    this.crisisResources = crisisResources ?? new CrisisResources();
  }

  configure(config: Partial<RetreatModeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  start(): boolean {
    if (this.config.enabled) return false;
    this.config.enabled = true;
    this.startedAt = Date.now();
    this.unlockedApps.clear();
    return true;
  }

  end(): boolean {
    if (!this.config.enabled) return false;
    this.config.enabled = false;
    this.config.streak++;
    this.startedAt = null;
    this.unlockedApps.clear();
    return true;
  }

  isBlocked(appId: string): boolean {
    if (!this.config.enabled) return false;
    if (this.config.whitelist.includes(appId)) return false;
    if (this.crisisResources.isEmergencyApp(appId)) return false;
    if (this.unlockedApps.has(appId)) return false;
    return true;
  }

  unlockApp(appId: string): boolean {
    if (!this.config.enabled) return false;
    if (!this.config.gradualReentry) return false;
    this.unlockedApps.add(appId);
    return true;
  }

  isExpired(now = Date.now()): boolean {
    if (!this.startedAt) return false;
    return now - this.startedAt >= this.config.durationMs;
  }

  getStreak(): number {
    return this.config.streak;
  }

  getConfig(): RetreatModeConfig {
    return { ...this.config };
  }

  getRemainingMs(now = Date.now()): number {
    if (!this.startedAt || !this.config.enabled) return 0;
    return Math.max(0, this.config.durationMs - (now - this.startedAt));
  }
}
