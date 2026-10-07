import type { ScreenTimeLimit } from '../types.js';

export class ScreenTimeLimiter {
  private limits = new Map<string, ScreenTimeLimit>();
  private overrideCooldowns = new Map<string, number>();

  setLimit(appId: string, dailyLimitMs: number, carryOverMs = 0): ScreenTimeLimit {
    const limit: ScreenTimeLimit = {
      appId,
      dailyLimitMs,
      usedMs: 0,
      warned: false,
      blocked: false,
      carryOverMs,
    };
    this.limits.set(appId, limit);
    return limit;
  }

  trackUsage(appId: string, ms: number): ScreenTimeLimit | null {
    const limit = this.limits.get(appId);
    if (!limit) return null;
    limit.usedMs += ms;
    const effectiveLimit = limit.dailyLimitMs + limit.carryOverMs;
    if (limit.usedMs >= effectiveLimit * 0.8 && !limit.warned) {
      limit.warned = true;
    }
    if (limit.usedMs >= effectiveLimit) {
      limit.blocked = true;
    }
    return limit;
  }

  getStatus(appId: string): ScreenTimeLimit | null {
    return this.limits.get(appId) ?? null;
  }

  override(appId: string, cooldownMs = 300_000): boolean {
    const limit = this.limits.get(appId);
    if (!limit) return false;
    const lastOverride = this.overrideCooldowns.get(appId);
    if (lastOverride && Date.now() - lastOverride < cooldownMs) {
      return false;
    }
    limit.blocked = false;
    limit.usedMs = Math.floor(limit.usedMs * 0.5);
    this.overrideCooldowns.set(appId, Date.now());
    return true;
  }

  resetDaily(): void {
    for (const limit of this.limits.values()) {
      const unused = Math.max(0, limit.dailyLimitMs + limit.carryOverMs - limit.usedMs);
      limit.carryOverMs = unused;
      limit.usedMs = 0;
      limit.warned = false;
      limit.blocked = false;
    }
  }

  getRemainingMs(appId: string): number {
    const limit = this.limits.get(appId);
    if (!limit) return Infinity;
    return Math.max(0, limit.dailyLimitMs + limit.carryOverMs - limit.usedMs);
  }
}
