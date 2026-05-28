import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WebhookConfig, WebhookDelivery } from '../types.js';

export class WebhookManager {
  private hooks = new Map<string, WebhookConfig>();
  private deliveries: WebhookDelivery[] = [];
  private deadLetters: WebhookDelivery[] = [];
  private maxRetries = 5;

  register(cfg: WebhookConfig): void {
    this.hooks.set(cfg.id, cfg);
  }

  unregister(id: string): void {
    this.hooks.delete(id);
  }

  validateSignature(payload: string, sig: string, secret: string): boolean {
    const computed = Buffer.from(createHmac('sha256', secret).update(payload).digest('hex'), 'hex');
    const provided = Buffer.from(sig, 'hex');
    return computed.length === provided.length && timingSafeEqual(computed, provided);
  }

  deliver(id: string, evt: string, _data: unknown, statusCode = 200): boolean {
    const w = this.hooks.get(id);
    if (!w) return false;
    w.lastDelivery = Date.now();
    const delivery: WebhookDelivery = {
      id: crypto.randomUUID(),
      webhookId: id,
      event: evt,
      statusCode,
      deliveredAt: Date.now(),
      retryAttempt: 0,
    };
    this.deliveries.push(delivery);
    if (statusCode >= 400) {
      w.retryCount++;
    }
    return statusCode < 400;
  }

  retry(id: string, attempt: number, statusCode = 200): boolean {
    const w = this.hooks.get(id);
    if (!w || w.retryCount <= 0) return false;
    const delivery: WebhookDelivery = {
      id: crypto.randomUUID(),
      webhookId: id,
      event: 'retry',
      statusCode,
      deliveredAt: Date.now(),
      retryAttempt: attempt,
    };
    this.deliveries.push(delivery);
    if (statusCode < 400) {
      w.retryCount--;
      w.lastDelivery = Date.now();
      return true;
    }
    if (attempt >= this.maxRetries) {
      this.deadLetters.push(delivery);
      w.retryCount--;
    }
    return false;
  }

  getBackoffMs(attempt: number): number {
    return Math.min(1000 * Math.pow(2, attempt), 60000);
  }

  getDeliveryLog(webhookId: string): WebhookDelivery[] {
    return this.deliveries.filter((d) => d.webhookId === webhookId);
  }

  getHealthScore(webhookId: string): number {
    const log = this.getDeliveryLog(webhookId);
    if (log.length === 0) return 100;
    const successes = log.filter((d) => d.statusCode < 400).length;
    return Math.round((successes / log.length) * 100);
  }

  getDeadLetters(webhookId?: string): WebhookDelivery[] {
    if (webhookId) return this.deadLetters.filter((d) => d.webhookId === webhookId);
    return [...this.deadLetters];
  }

  getFailedDeliveries(): WebhookConfig[] {
    return [...this.hooks.values()].filter((w) => w.retryCount > 0);
  }
}
