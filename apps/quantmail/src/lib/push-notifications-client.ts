// ============================================================================
// QuantMail — Web Push subscription client (QM-UIUX-053).
//
// The browser half of the push delivery path. `useDesktopNotifications`
// covers the tab-open case with the Notification API; this covers the tab
// closed: a service worker (`/sw.js`) plus a `PushManager` subscription that
// is registered on the server (`POST /api/notifications/push/subscribe`),
// where it persists as a Prisma `PushSubscription` row the backend delivers
// to when new mail arrives.
//
// Honest states, matching the rest of the settings surface:
//   - 'unsupported'    this browser has no service worker / PushManager.
//   - 'denied'         the browser is blocking notifications for this site.
//   - 'not-configured' the server has no VAPID keys yet, so subscribing
//                      would register a subscription nothing can deliver
//                      to. The client refuses to pretend otherwise and
//                      never calls `pushManager.subscribe` in this state.
//   - 'subscribed' / 'unsubscribed' — the real, server-confirmed split.
//
// The class takes its browser/server surface as injected dependencies so
// the flows are testable without a DOM; `createBrowserPushDeps` is the
// production wiring.
// ============================================================================

import { browserApiRequest } from '../services/browser-api-request';

export type PushClientStatus =
  | 'unsupported'
  | 'denied'
  | 'not-configured'
  | 'subscribed'
  | 'unsubscribed';

export interface PushServerConfig {
  configured: boolean;
  publicKey: string | null;
}

export interface PushSubscriptionLike {
  endpoint: string;
  toJSON(): {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: { p256dh?: string; auth?: string };
  };
  unsubscribe(): Promise<boolean>;
}

export interface PushManagerLike {
  getSubscription(): Promise<PushSubscriptionLike | null>;
  subscribe(options: {
    userVisibleOnly: boolean;
    applicationServerKey: Uint8Array;
  }): Promise<PushSubscriptionLike>;
}

export interface PushClientDeps {
  isSupported(): boolean;
  getPermission(): NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  /** Registers `/sw.js` and returns its PushManager. */
  getPushManager(): Promise<PushManagerLike | null>;
  fetchServerConfig(): Promise<PushServerConfig>;
  postSubscribe(subscriptionJson: unknown): Promise<void>;
  postUnsubscribe(endpoint: string): Promise<void>;
}

/** VAPID public keys are base64url; `PushManager.subscribe` wants raw bytes. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = globalThis.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export class PushNotificationClient {
  constructor(private readonly deps: PushClientDeps) {}

  async getStatus(): Promise<PushClientStatus> {
    if (!this.deps.isSupported()) return 'unsupported';
    if (this.deps.getPermission() === 'denied') return 'denied';
    const config = await this.deps.fetchServerConfig();
    if (!config.configured || !config.publicKey) return 'not-configured';
    const manager = await this.deps.getPushManager();
    if (!manager) return 'unsupported';
    const existing = await manager.getSubscription();
    return existing ? 'subscribed' : 'unsubscribed';
  }

  async enable(): Promise<PushClientStatus> {
    if (!this.deps.isSupported()) return 'unsupported';

    let permission = this.deps.getPermission();
    if (permission === 'default') {
      permission = await this.deps.requestPermission();
    }
    if (permission !== 'granted') return 'denied';

    // Permission alone is not a subscription: without server keys there is
    // no delivery path, and registering locally would show the user a
    // switch that is on over a pipe that goes nowhere.
    const config = await this.deps.fetchServerConfig();
    if (!config.configured || !config.publicKey) return 'not-configured';

    const manager = await this.deps.getPushManager();
    if (!manager) return 'unsupported';

    const existing = await manager.getSubscription();
    const subscription =
      existing ??
      (await manager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      }));

    await this.deps.postSubscribe(subscription.toJSON());
    return 'subscribed';
  }

  async disable(): Promise<PushClientStatus> {
    const manager = await this.deps.getPushManager();
    const existing = manager ? await manager.getSubscription() : null;
    if (existing) {
      // Remove the server row AND the browser subscription. The browser one
      // goes even if the server call fails (its `finally`), because a stale
      // server row for a dead endpoint is pruned on the next delivery
      // attempt's 404/410 — while a live browser subscription the user
      // believes is off would keep receiving pushes.
      try {
        await this.deps.postUnsubscribe(existing.endpoint);
      } finally {
        await existing.unsubscribe();
      }
    }
    return this.getStatus();
  }
}

export function createBrowserPushDeps(): PushClientDeps {
  return {
    isSupported: () =>
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window,
    getPermission: () => Notification.permission,
    requestPermission: async () => {
      // Legacy Safari returns void and takes a callback; `Promise.resolve`
      // handles both (same pattern as useDesktopNotifications).
      const asked = (await Promise.resolve(Notification.requestPermission())) as
        | NotificationPermission
        | undefined;
      return asked ?? Notification.permission;
    },
    getPushManager: async () => {
      const registration = await navigator.serviceWorker.register('/sw.js');
      return registration.pushManager as unknown as PushManagerLike;
    },
    fetchServerConfig: async () => {
      const response = await browserApiRequest('/api/notifications/push/vapid-public-key');
      if (!response.ok) return { configured: false, publicKey: null };
      const payload = (await response.json().catch(() => null)) as {
        data?: PushServerConfig;
      } | null;
      return {
        configured: payload?.data?.configured === true,
        publicKey: payload?.data?.publicKey ?? null,
      };
    },
    postSubscribe: async (subscriptionJson) => {
      const response = await browserApiRequest('/api/notifications/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscriptionJson),
      });
      if (!response.ok) throw new Error('Could not save the push subscription on the server.');
    },
    postUnsubscribe: async (endpoint) => {
      const response = await browserApiRequest('/api/notifications/push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint }),
      });
      if (!response.ok) throw new Error('Could not remove the push subscription on the server.');
    },
  };
}
