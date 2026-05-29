import type { WatchTarget, PriceAlert } from '../types.js';

export class PriceWatcherAgent {
  private watches: Map<string, WatchTarget> = new Map();
  private priceSimulator: (target: WatchTarget) => number;

  constructor(priceSimulator?: (target: WatchTarget) => number) {
    this.priceSimulator =
      priceSimulator ?? ((target) => (target.targetPrice ?? 100) * (0.8 + Math.random() * 0.4));
  }

  addWatch(target: WatchTarget): void {
    this.watches.set(target.id, target);
  }

  removeWatch(targetId: string): void {
    this.watches.delete(targetId);
  }

  getWatches(): WatchTarget[] {
    return Array.from(this.watches.values());
  }

  checkPrices(): PriceAlert[] {
    const alerts: PriceAlert[] = [];
    for (const target of this.watches.values()) {
      const currentPrice = this.priceSimulator(target);
      const targetPrice = target.targetPrice ?? 0;
      let triggered = false;

      switch (target.condition) {
        case 'below':
          triggered = currentPrice < targetPrice;
          break;
        case 'above':
          triggered = currentPrice > targetPrice;
          break;
        case 'equals':
          triggered = Math.abs(currentPrice - targetPrice) < 0.01;
          break;
      }

      alerts.push({
        targetId: target.id,
        currentPrice,
        targetPrice,
        triggered,
        timestamp: Date.now(),
      });
    }
    return alerts;
  }
}
