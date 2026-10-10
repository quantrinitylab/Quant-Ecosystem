// ============================================================================
// Notifications - Web Push Service (VAPID)
// Browser push notifications using the Web Push protocol
// ============================================================================

import webpush from 'web-push';
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

/** Transport boundary: delivers one serialized payload to one subscription. */
export type WebPushSendHandler = (
  subscription: WebPushSubscription,
  payload: string,
  options: WebPushSendOptions,
) => Promise<WebPushResult>;

/**
 * Builds the REAL Web Push transport on top of the `web-push` library:
 * VAPID-signed, payload-encrypted delivery to the subscription's endpoint.
 * Failures are returned (never thrown, never faked) with the push service's
 * HTTP status code preserved so callers can prune 404/410 (gone) endpoints.
 */
export function createWebPushSendHandler(config: VapidConfig): WebPushSendHandler {
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return async (subscription, payload, options) => {
    try {
      const response = await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: subscription.keys },
        payload,
        {
          ...(options.ttl !== undefined ? { TTL: options.ttl } : {}),
          ...(options.urgency !== undefined ? { urgency: options.urgency } : {}),
          ...(options.topic !== undefined ? { topic: options.topic } : {}),
        },
      );
      return { success: true, endpoint: subscription.endpoint, statusCode: response.statusCode };
    } catch (err) {
      const statusCode = (err as { statusCode?: unknown })?.statusCode;
      return {
        success: false,
        endpoint: subscription.endpoint,
        ...(typeof statusCode === 'number' ? { statusCode } : {}),
        error: err instanceof Error ? err.message : 'Web push delivery failed',
      };
    }
  };
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
  private sendHandler: WebPushSendHandler | null = null;

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
          // A transport-level 404/410 means the subscription is gone at the
          // push service; mark it inactive so callers can prune it.
          if (!result.success && (result.statusCode === 404 || result.statusCode === 410)) {
            sub.isActive = false;
          }
        } else {
          // No transport wired: report the failure honestly. This used to
          // fabricate a 201 success, which made every unwired caller believe
          // a notification had been delivered when nothing had been sent.
          results.push({
            success: false,
            endpoint: sub.endpoint,
            error: 'Web push transport not configured',
          });
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
   * Set the transport (see {@link createWebPushSendHandler} for the real
   * `web-push` transport; tests may inject a capturing handler here).
   */
  public setSendHandler(handler: WebPushSendHandler): void {
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
