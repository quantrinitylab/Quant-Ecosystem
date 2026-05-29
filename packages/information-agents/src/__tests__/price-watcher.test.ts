import { PriceWatcherAgent } from '../agents/price-watcher.js';
import type { WatchTarget } from '../types.js';

describe('PriceWatcherAgent', () => {
  it('adds and retrieves watches', () => {
    const agent = new PriceWatcherAgent();
    const target: WatchTarget = {
      id: 'w1',
      name: 'iPhone',
      url: 'https://apple.com/iphone',
      targetPrice: 800,
      condition: 'below',
    };
    agent.addWatch(target);
    expect(agent.getWatches()).toHaveLength(1);
    expect(agent.getWatches()[0]!.name).toBe('iPhone');
  });

  it('removes watches by id', () => {
    const agent = new PriceWatcherAgent();
    agent.addWatch({ id: 'w1', name: 'A', url: '', targetPrice: 50, condition: 'below' });
    agent.addWatch({ id: 'w2', name: 'B', url: '', targetPrice: 100, condition: 'above' });
    agent.removeWatch('w1');
    expect(agent.getWatches()).toHaveLength(1);
    expect(agent.getWatches()[0]!.id).toBe('w2');
  });

  it('triggers alert when price is below target', () => {
    const agent = new PriceWatcherAgent(() => 50);
    agent.addWatch({
      id: 'w1',
      name: 'Widget',
      url: 'https://shop.com/widget',
      targetPrice: 100,
      condition: 'below',
    });
    const alerts = agent.checkPrices();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.triggered).toBe(true);
    expect(alerts[0]!.currentPrice).toBe(50);
    expect(alerts[0]!.targetPrice).toBe(100);
  });

  it('does not trigger alert when price is above target for below condition', () => {
    const agent = new PriceWatcherAgent(() => 150);
    agent.addWatch({
      id: 'w1',
      name: 'Widget',
      url: 'https://shop.com/widget',
      targetPrice: 100,
      condition: 'below',
    });
    const alerts = agent.checkPrices();
    expect(alerts[0]!.triggered).toBe(false);
  });

  it('triggers alert for above condition', () => {
    const agent = new PriceWatcherAgent(() => 200);
    agent.addWatch({
      id: 'w1',
      name: 'Stock',
      url: 'https://market.com/stock',
      targetPrice: 150,
      condition: 'above',
    });
    const alerts = agent.checkPrices();
    expect(alerts[0]!.triggered).toBe(true);
  });
});
