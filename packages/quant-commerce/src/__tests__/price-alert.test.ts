import { PriceAlertManager, PriceChecker } from '../shopping/price-alert.js';

function makeMockChecker(prices: Record<string, number>): PriceChecker {
  return {
    async getCurrentPrice(itemId: string): Promise<number> {
      return prices[itemId] ?? 0;
    },
  };
}

describe('PriceAlertManager', () => {
  let manager: PriceAlertManager;

  beforeEach(() => {
    manager = new PriceAlertManager();
  });

  it('should add an alert', () => {
    const alert = manager.addAlert('item-1', 2000, 2999);
    expect(alert.itemId).toBe('item-1');
    expect(alert.targetPrice).toBe(2000);
    expect(alert.active).toBe(true);
    expect(alert.notified).toBe(false);
  });

  it('should trigger notification when price drops below target', async () => {
    const alert = manager.addAlert('item-1', 2000, 2999);
    const checker = makeMockChecker({ 'item-1': 1800 });
    const notifications = await manager.checkAlerts(checker);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.alertId).toBe(alert.id);
    expect(notifications[0]!.currentPrice).toBe(1800);
  });

  it('should not trigger notification when price is above target', async () => {
    manager.addAlert('item-1', 2000, 2999);
    const checker = makeMockChecker({ 'item-1': 2500 });
    const notifications = await manager.checkAlerts(checker);
    expect(notifications).toHaveLength(0);
  });

  it('should not notify same alert twice', async () => {
    manager.addAlert('item-1', 2000, 2999);
    const checker = makeMockChecker({ 'item-1': 1800 });
    await manager.checkAlerts(checker);
    const secondCheck = await manager.checkAlerts(checker);
    expect(secondCheck).toHaveLength(0);
  });

  it('should remove an alert', () => {
    const alert = manager.addAlert('item-1', 2000, 2999);
    expect(manager.getActiveAlerts()).toHaveLength(1);
    const removed = manager.removeAlert(alert.id);
    expect(removed).toBe(true);
    expect(manager.getActiveAlerts()).toHaveLength(0);
  });

  it('should return false when removing non-existent alert', () => {
    expect(manager.removeAlert('not-found')).toBe(false);
  });

  it('should confirm auto-buy when conditions are met', async () => {
    const alert = manager.addAlert('item-1', 2000, 2999, true);
    const checker = makeMockChecker({ 'item-1': 1500 });
    await manager.checkAlerts(checker);
    const result = manager.confirmAutoBuy(alert.id);
    expect(result.confirmed).toBe(true);
  });

  it('should reject auto-buy if not enabled', async () => {
    const alert = manager.addAlert('item-1', 2000, 2999, false);
    const checker = makeMockChecker({ 'item-1': 1500 });
    await manager.checkAlerts(checker);
    const result = manager.confirmAutoBuy(alert.id);
    expect(result.confirmed).toBe(false);
  });

  it('should reject auto-buy if price target not reached', () => {
    const alert = manager.addAlert('item-1', 2000, 2999, true);
    const result = manager.confirmAutoBuy(alert.id);
    expect(result.confirmed).toBe(false);
    expect(result.message).toContain('not yet reached');
  });

  it('should reject auto-buy on second call (idempotency)', async () => {
    const alert = manager.addAlert('item-1', 2000, 2999, true);
    const checker = makeMockChecker({ 'item-1': 1500 });
    await manager.checkAlerts(checker);
    const first = manager.confirmAutoBuy(alert.id);
    expect(first.confirmed).toBe(true);
    const second = manager.confirmAutoBuy(alert.id);
    expect(second.confirmed).toBe(false);
    expect(second.message).toContain('already confirmed');
  });

  it('should reject auto-buy when currentPrice exceeds maxAutoBuyAmount', async () => {
    const alert = manager.addAlert('item-1', 2000, 2999, true, 1000);
    const checker = makeMockChecker({ 'item-1': 1800 });
    await manager.checkAlerts(checker);
    const result = manager.confirmAutoBuy(alert.id);
    expect(result.confirmed).toBe(false);
    expect(result.message).toContain('spending cap');
  });

  it('should allow auto-buy when currentPrice is within maxAutoBuyAmount', async () => {
    const alert = manager.addAlert('item-1', 2000, 2999, true, 2000);
    const checker = makeMockChecker({ 'item-1': 1800 });
    await manager.checkAlerts(checker);
    const result = manager.confirmAutoBuy(alert.id);
    expect(result.confirmed).toBe(true);
  });
});
