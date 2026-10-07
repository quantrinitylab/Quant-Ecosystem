import { z } from 'zod';
import { createHmac, randomBytes } from 'node:crypto';

export const WebhookEndpointSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  events: z.array(z.string()),
  secret: z.string(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  ownerId: z.string(),
});

export type WebhookEndpoint = z.infer<typeof WebhookEndpointSchema>;

export const WebhookDeliverySchema = z.object({
  id: z.string(),
  endpointId: z.string(),
  event: z.string(),
  payload: z.unknown(),
  signature: z.string(),
  status: z.enum(['pending', 'success', 'failed']),
  attempts: z.number(),
  maxAttempts: z.number(),
  nextRetryAt: z.number().optional(),
  createdAt: z.number(),
  completedAt: z.number().optional(),
});

export type WebhookDelivery = z.infer<typeof WebhookDeliverySchema>;

export interface RegisterOptions {
  url: string;
  events: string[];
  ownerId: string;
}

export interface DeliverOptions {
  event: string;
  payload: unknown;
}

export class WebhookManager {
  private endpoints: Map<string, WebhookEndpoint> = new Map();
  private deliveries: WebhookDelivery[] = [];
  private maxAttempts = 5;
  private baseDelayMs = 1000;

  register(options: RegisterOptions): WebhookEndpoint {
    const id = randomBytes(8).toString('hex');
    const secret = randomBytes(32).toString('hex');

    const endpoint: WebhookEndpoint = {
      id,
      url: options.url,
      events: options.events,
      secret,
      active: true,
      createdAt: new Date().toISOString(),
      ownerId: options.ownerId,
    };

    this.endpoints.set(id, endpoint);
    return endpoint;
  }

  unregister(endpointId: string): boolean {
    return this.endpoints.delete(endpointId);
  }

  setActive(endpointId: string, active: boolean): boolean {
    const endpoint = this.endpoints.get(endpointId);
    if (!endpoint) return false;
    endpoint.active = active;
    return true;
  }

  deliver(options: DeliverOptions): WebhookDelivery[] {
    const matchingEndpoints = [...this.endpoints.values()].filter(
      (ep) => ep.active && ep.events.includes(options.event),
    );

    const results: WebhookDelivery[] = [];

    for (const endpoint of matchingEndpoints) {
      const signature = this.sign(options.payload, endpoint.secret);
      const delivery: WebhookDelivery = {
        id: randomBytes(8).toString('hex'),
        endpointId: endpoint.id,
        event: options.event,
        payload: options.payload,
        signature,
        status: 'pending',
        attempts: 1,
        maxAttempts: this.maxAttempts,
        createdAt: Date.now(),
      };

      this.deliveries.push(delivery);
      results.push(delivery);
    }

    return results;
  }

  markDeliverySuccess(deliveryId: string): void {
    const delivery = this.deliveries.find((d) => d.id === deliveryId);
    if (delivery) {
      delivery.status = 'success';
      delivery.completedAt = Date.now();
    }
  }

  markDeliveryFailed(deliveryId: string): void {
    const delivery = this.deliveries.find((d) => d.id === deliveryId);
    if (!delivery) return;

    if (delivery.attempts >= delivery.maxAttempts) {
      delivery.status = 'failed';
      delivery.completedAt = Date.now();
    } else {
      delivery.attempts++;
      delivery.nextRetryAt = Date.now() + this.calculateBackoff(delivery.attempts);
    }
  }

  sign(payload: unknown, secret: string): string {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  }

  verify(payload: unknown, signature: string, secret: string): boolean {
    const expected = this.sign(payload, secret);
    return expected === signature;
  }

  getEndpoints(ownerId?: string): WebhookEndpoint[] {
    const all = [...this.endpoints.values()];
    return ownerId ? all.filter((ep) => ep.ownerId === ownerId) : all;
  }

  getDeliveries(endpointId?: string): WebhookDelivery[] {
    return endpointId
      ? this.deliveries.filter((d) => d.endpointId === endpointId)
      : [...this.deliveries];
  }

  getPendingRetries(): WebhookDelivery[] {
    const now = Date.now();
    return this.deliveries.filter(
      (d) => d.status === 'pending' && d.nextRetryAt && d.nextRetryAt <= now,
    );
  }

  private calculateBackoff(attempt: number): number {
    // Exponential backoff: base * 2^(attempt-1)
    return this.baseDelayMs * Math.pow(2, attempt - 1);
  }
}
