import { describe, it, expect } from 'vitest';
import { WebhookManager } from '../webhook-manager.js';

describe('WebhookManager', () => {
  it('registers a webhook endpoint', () => {
    const manager = new WebhookManager();
    const endpoint = manager.register({
      url: 'https://app.example.com/webhooks',
      events: ['user.created', 'user.updated'],
      ownerId: 'owner-1',
    });

    expect(endpoint.id).toBeDefined();
    expect(endpoint.secret).toBeDefined();
    expect(endpoint.active).toBe(true);
    expect(endpoint.events).toEqual(['user.created', 'user.updated']);
  });

  it('unregisters a webhook endpoint', () => {
    const manager = new WebhookManager();
    const endpoint = manager.register({
      url: 'https://app.example.com/hooks',
      events: ['order.placed'],
      ownerId: 'owner-1',
    });

    const result = manager.unregister(endpoint.id);
    expect(result).toBe(true);
    expect(manager.getEndpoints()).toHaveLength(0);
  });

  it('delivers webhook events to matching endpoints', () => {
    const manager = new WebhookManager();
    manager.register({
      url: 'https://app1.example.com/hooks',
      events: ['user.created'],
      ownerId: 'owner-1',
    });
    manager.register({
      url: 'https://app2.example.com/hooks',
      events: ['order.placed'],
      ownerId: 'owner-2',
    });

    const deliveries = manager.deliver({
      event: 'user.created',
      payload: { userId: '123', email: 'test@test.com' },
    });

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.status).toBe('pending');
    expect(deliveries[0]!.signature).toContain('sha256=');
  });

  it('signs and verifies webhook payloads', () => {
    const manager = new WebhookManager();
    const endpoint = manager.register({
      url: 'https://app.example.com/hooks',
      events: ['test.event'],
      ownerId: 'owner-1',
    });

    const payload = { key: 'value' };
    const signature = manager.sign(payload, endpoint.secret);

    expect(manager.verify(payload, signature, endpoint.secret)).toBe(true);
    expect(manager.verify(payload, 'sha256=invalid', endpoint.secret)).toBe(false);
  });

  it('marks delivery as successful', () => {
    const manager = new WebhookManager();
    manager.register({
      url: 'https://app.example.com/hooks',
      events: ['test.event'],
      ownerId: 'owner-1',
    });

    const deliveries = manager.deliver({ event: 'test.event', payload: {} });
    manager.markDeliverySuccess(deliveries[0]!.id);

    const updated = manager.getDeliveries();
    expect(updated[0]!.status).toBe('success');
    expect(updated[0]!.completedAt).toBeDefined();
  });

  it('retries with exponential backoff on failure', () => {
    const manager = new WebhookManager();
    manager.register({
      url: 'https://app.example.com/hooks',
      events: ['test.event'],
      ownerId: 'owner-1',
    });

    const deliveries = manager.deliver({ event: 'test.event', payload: {} });
    const delivery = deliveries[0]!;

    manager.markDeliveryFailed(delivery.id);
    const updated = manager.getDeliveries().find((d) => d.id === delivery.id)!;

    expect(updated.attempts).toBe(2);
    expect(updated.nextRetryAt).toBeDefined();
    expect(updated.status).toBe('pending');
  });

  it('marks delivery as failed after max attempts', () => {
    const manager = new WebhookManager();
    manager.register({
      url: 'https://app.example.com/hooks',
      events: ['test.event'],
      ownerId: 'owner-1',
    });

    const deliveries = manager.deliver({ event: 'test.event', payload: {} });
    const delivery = deliveries[0]!;

    // Fail 5 times (max attempts)
    for (let i = 0; i < 5; i++) {
      manager.markDeliveryFailed(delivery.id);
    }

    const updated = manager.getDeliveries().find((d) => d.id === delivery.id)!;
    expect(updated.status).toBe('failed');
  });

  it('deactivates an endpoint', () => {
    const manager = new WebhookManager();
    const endpoint = manager.register({
      url: 'https://app.example.com/hooks',
      events: ['test.event'],
      ownerId: 'owner-1',
    });

    manager.setActive(endpoint.id, false);

    const deliveries = manager.deliver({ event: 'test.event', payload: {} });
    expect(deliveries).toHaveLength(0);
  });

  it('lists endpoints by owner', () => {
    const manager = new WebhookManager();
    manager.register({ url: 'https://a.com/hook', events: ['e1'], ownerId: 'owner-1' });
    manager.register({ url: 'https://b.com/hook', events: ['e2'], ownerId: 'owner-2' });

    const owner1Hooks = manager.getEndpoints('owner-1');
    expect(owner1Hooks).toHaveLength(1);
  });
});
