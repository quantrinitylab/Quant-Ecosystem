import { createHmac, timingSafeEqual } from 'node:crypto';
import { WebhookConfig } from '../types.js';
export class WebhookManager {
  private hooks = new Map<string, WebhookConfig>();
  // prettier-ignore
  register(cfg: WebhookConfig) { this.hooks.set(cfg.id, cfg); }
  // prettier-ignore
  unregister(id: string) { this.hooks.delete(id); }
  validateSignature(payload: string, sig: string, secret: string) {
    const computed = Buffer.from(createHmac('sha256', secret).update(payload).digest('hex'), 'hex');
    const provided = Buffer.from(sig, 'hex');
    return computed.length === provided.length && timingSafeEqual(computed, provided);
  }
  // prettier-ignore
  deliver(id: string, _evt: string, _data: unknown) { const w = this.hooks.get(id); if (!w) return false; w.lastDelivery = Date.now(); return true; }
  // prettier-ignore
  getFailedDeliveries() { return [...this.hooks.values()].filter((w) => w.retryCount > 0); }
  // prettier-ignore
  retry(id: string) { const w = this.hooks.get(id); if (!w || w.retryCount <= 0) return false; w.retryCount--; w.lastDelivery = Date.now(); return true; }
}
