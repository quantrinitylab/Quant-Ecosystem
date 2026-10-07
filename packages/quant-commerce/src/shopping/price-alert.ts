import { PriceAlert } from '../types.js';

export interface PriceChecker {
  getCurrentPrice(itemId: string): Promise<number>;
}

export interface AlertNotification {
  alertId: string;
  itemId: string;
  targetPrice: number;
  currentPrice: number;
}

export class PriceAlertManager {
  private alerts: PriceAlert[] = [];

  addAlert(
    itemId: string,
    targetPrice: number,
    currentPrice: number,
    autoBuy = false,
    maxAutoBuyAmount?: number,
  ): PriceAlert {
    const alert: PriceAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      itemId,
      targetPrice,
      currentPrice,
      active: true,
      createdAt: Date.now(),
      lastChecked: Date.now(),
      notified: false,
      autoBuy,
      maxAutoBuyAmount,
    };
    this.alerts.push(alert);
    return alert;
  }

  async checkAlerts(checker: PriceChecker): Promise<AlertNotification[]> {
    const notifications: AlertNotification[] = [];
    for (const alert of this.alerts) {
      if (!alert.active || alert.notified) continue;
      const price = await checker.getCurrentPrice(alert.itemId);
      alert.currentPrice = price;
      alert.lastChecked = Date.now();
      if (price <= alert.targetPrice) {
        alert.notified = true;
        notifications.push({
          alertId: alert.id,
          itemId: alert.itemId,
          targetPrice: alert.targetPrice,
          currentPrice: price,
        });
      }
    }
    return notifications;
  }

  removeAlert(id: string): boolean {
    const idx = this.alerts.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    this.alerts.splice(idx, 1);
    return true;
  }

  getActiveAlerts(): PriceAlert[] {
    return this.alerts.filter((a) => a.active);
  }

  confirmAutoBuy(alertId: string): { confirmed: boolean; message: string } {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (!alert) return { confirmed: false, message: 'Alert not found' };
    if (!alert.autoBuy) return { confirmed: false, message: 'Auto-buy not enabled for this alert' };
    if (!alert.notified) return { confirmed: false, message: 'Price target not yet reached' };
    if (alert.autoBuyConfirmed) return { confirmed: false, message: 'Auto-buy already confirmed' };
    if (alert.maxAutoBuyAmount !== undefined && alert.currentPrice > alert.maxAutoBuyAmount) {
      return { confirmed: false, message: 'Current price exceeds spending cap' };
    }
    alert.autoBuyConfirmed = true;
    return { confirmed: true, message: 'Auto-buy confirmed for item ' + alert.itemId };
  }
}
