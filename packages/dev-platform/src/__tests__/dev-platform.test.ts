import { APIKeyManager } from '../auth/api-key-manager.js';
import { AgentMarketplace } from '../marketplace/agent-marketplace.js';
import { WebhookManager } from '../webhooks/webhook-manager.js';
import { createHmac } from 'node:crypto';
describe('APIKeyManager', () => {
  it('create, revoke, track usage, rate limit', () => {
    const m = new APIKeyManager();
    const k = m.create('test', 'free');
    expect(m.trackUsage(k.id)).toBe(true);
    expect(m.revoke(k.id)).toBe(true);
    expect(m.trackUsage(k.id)).toBe(false);
    const k2 = m.create('x', 'free');
    for (let i = 0; i < 10; i++) m.trackUsage(k2.id);
    expect(m.isRateLimited(k2.id)).toBe(true);
  });
});
describe('AgentMarketplace', () => {
  it('publish, approve, list, revenue', () => {
    const mp = new AgentMarketplace();
    // prettier-ignore
    const ml = mp.publish({ id: 'a1', name: 'Bot', rating: 4.5, downloads: 0, revenueSharePct: 80 });
    expect(ml.status).toBe('pending');
    expect(mp.getReviewQueue()).toHaveLength(1);
    mp.approve('a1');
    expect(mp.list()).toHaveLength(1);
    expect(mp.calculateRevenue('a1', 1000)).toEqual({ developer: 800, platform: 200 });
  });
});
describe('WebhookManager', () => {
  it('register, deliver, validate, retry', () => {
    const wm = new WebhookManager();
    // prettier-ignore
    wm.register({ id: 'w1', url: 'http://x', events: ['push'], secret: 's', retryCount: 2, lastDelivery: null });
    expect(wm.deliver('w1', 'push', {})).toBe(true);
    const sig = createHmac('sha256', 's').update('body').digest('hex');
    expect(wm.validateSignature('body', sig, 's')).toBe(true);
    expect(wm.retry('w1')).toBe(true);
  });
});
