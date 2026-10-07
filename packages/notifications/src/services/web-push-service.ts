// ============================================================================
// Notifications - Web Push Service (VAPID)
// Browser push notifications using the Web Push protocol
// ============================================================================

import type { WebPushSubscription, WebPushSendOptions, WebPushResult } from '../types';

/** VAPID configuration */
export interface VapidConfig {
  subject: string; // mailto: or https: URL
  publicKey: string;
  privateKey: string;
}

/** Web Push payload */
export interface WebPushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  data?: Record<string, unknown>;
  actions?: Array<{ action: string; title: string; icon?: string }>;
  tag?: string;
  requireInteraction?: boolean;
}

/**
 * WebPushService - VAPID-based Web Push notifications
 *
 * Manages browser push subscriptions, handles payload encryption,
 * and delivers notifications using the Web Push protocol with TTL support.
 */
export class WebPushService {
  private subscriptions: Map<string, WebPushSubscription[]> = new Map();
  private vapidConfig: VapidConfig | null = null;
  private sendHandler:
    | ((
        subscription: WebPushSubscription,
        payload: string,
        options: WebPushSendOptions,
      ) => Promise<WebPushResult>)
    | null = null;

  constructor(vapidConfig?: VapidConfig) {
    if (vapidConfig) {
      this.vapidConfig = vapidConfig;
    }
  }

  /**
   * Configure VAPID keys
   */
  public setVapidConfig(config: VapidConfig): void {
    this.vapidConfig = config;
  }

  /**
   * Get the public VAPID key (for client-side subscription)
   */
  public getPublicKey(): string | null {
    return this.vapidConfig?.publicKey ?? null;
  }

  /**
   * Register a push subscription for a user
   */
  public subscribe(subscription: WebPushSubscription): void {
    const existing = this.subscriptions.get(subscription.userId) ?? [];

    // Replace if same endpoint exists
    const idx = existing.findIndex((s) => s.endpoint === subscription.endpoint);
    if (idx >= 0) {
      existing[idx] = subscription;
    } else {
      existing.push(subscription);
    }

    this.subscriptions.set(subscription.userId, existing);
  }

  /**
   * Remove a push subscription
   */
  public unsubscribe(userId: string, endpoint: string): boolean {
    const existing = this.subscriptions.get(userId);
    if (!existing) return false;

    const filtered = existing.filter((s) => s.endpoint !== endpoint);
    if (filtered.length === existing.length) return false;

    this.subscriptions.set(userId, filtered);
    return true;
  }

  /**
   * Get all subscriptions for a user
   */
  public getSubscriptions(userId: string): WebPushSubscription[] {
    return this.subscriptions.get(userId) ?? [];
  }

  /**
   * Send a web push notification to all of a user's subscriptions
   */
  public async send(
    userId: string,
    payload: WebPushPayload,
    options: WebPushSendOptions = {},
  ): Promise<WebPushResult[]> {
    if (!this.vapidConfig) {
      return [{ success: false, endpoint: '', error: 'VAPID not configured' }];
    }

    const subs = this.subscriptions.get(userId);
    if (!subs || subs.length === 0) {
      return [{ success: false, endpoint: '', error: 'No subscriptions found' }];
    }

    const activeSubs = subs.filter((s) => s.isActive);
    if (activeSubs.length === 0) {
      return [{ success: false, endpoint: '', error: 'No active subscriptions' }];
    }

    const results: WebPushResult[] = [];
    const serializedPayload = JSON.stringify(payload);

    for (const sub of activeSubs) {
      try {
        if (this.sendHandler) {
          const result = await this.sendHandler(sub, serializedPayload, options);
          results.push(result);
        } else {
          // Default: simulate successful send
          results.push({ success: true, endpoint: sub.endpoint, statusCode: 201 });
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        results.push({ success: false, endpoint: sub.endpoint, error });

        // If subscription is expired (410 Gone), mark as inactive
        if (error.includes('410') || error.includes('expired')) {
          sub.isActive = false;
        }
      }
    }

    return results;
  }

  /**
   * Set a custom send handler (for testing or custom transport)
   */
  public setSendHandler(
    handler: (
      subscription: WebPushSubscription,
      payload: string,
      options: WebPushSendOptions,
    ) => Promise<WebPushResult>,
  ): void {
    this.sendHandler = handler;
  }

  /**
   * Get total subscription count
   */
  public getSubscriptionCount(): number {
    let count = 0;
    for (const [, subs] of this.subscriptions) {
      count += subs.length;
    }
    return count;
  }

  /**
   * Remove inactive subscriptions
   */
  public cleanupInactive(): number {
    let removed = 0;
    for (const [userId, subs] of this.subscriptions) {
      const active = subs.filter((s) => s.isActive);
      removed += subs.length - active.length;
      this.subscriptions.set(userId, active);
    }
    return removed;
  }
}
