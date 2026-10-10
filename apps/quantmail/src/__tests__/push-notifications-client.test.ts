// @vitest-environment node
// ============================================================================
// PushNotificationClient — the browser half of QM-UIUX-053.
//
// The states are the contract: a browser without PushManager is
// 'unsupported', a blocked permission is 'denied', a server without VAPID
// keys is 'not-configured' — and in that last state `enable()` must refuse
// to create a subscription at all, because a subscription the server cannot
// deliver to is a switch that lies. Only the real flow — permission, server
// key, `pushManager.subscribe`, server registration — may land on
// 'subscribed'.
//
// HARNESS: the client's dependencies are injected by construction, so these
// tests drive the REAL client over fakes of the browser/server surface.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import {
  PushNotificationClient,
  urlBase64ToUint8Array,
  type PushClientDeps,
  type PushManagerLike,
  type PushSubscriptionLike,
} from '../lib/push-notifications-client';

// A real-shaped VAPID public key (generated once with web-push's
// generateVAPIDKeys for this fixture — 87 base64url chars, 65 bytes). The
// notifications package's older fixture key is a truncated dummy that no
// real decoder accepts, which is exactly what this client must survive
// only by never being handed one from a properly configured server.
const PUBLIC_KEY =
  'BMKhyR8BlmaG5gdyUfRWYwpptNSHpx5Lrx0BegLuhUQTLm1Go9OTLNkVzKpjqRerGFJijClVTDC18DR_M0b33Mc';
const ENDPOINT = 'https://push.example.com/subscription/abc123';

function fakeSubscription(
  endpoint = ENDPOINT,
  onUnsubscribe?: () => void,
): PushSubscriptionLike {
  return {
    endpoint,
    toJSON: () => ({
      endpoint,
      expirationTime: null,
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    }),
    unsubscribe: vi.fn(async () => {
      onUnsubscribe?.();
      return true;
    }),
  };
}

interface FakeWorld {
  deps: PushClientDeps;
  subscribe: ReturnType<typeof vi.fn>;
  postSubscribe: ReturnType<typeof vi.fn>;
  postUnsubscribe: ReturnType<typeof vi.fn>;
  requestPermission: ReturnType<typeof vi.fn>;
  setExisting(sub: PushSubscriptionLike | null): void;
}

function fakeWorld(
  options: {
    supported?: boolean;
    permission?: NotificationPermission;
    permissionAfterRequest?: NotificationPermission;
    configured?: boolean;
    existing?: PushSubscriptionLike | null;
  } = {},
): FakeWorld {
  let existing = options.existing ?? null;
  // Browser fidelity: once a subscription is unsubscribed, getSubscription()
  // stops returning it. Any subscription the world hands out is rewired so
  // its unsubscribe() clears the world's slot, like the real PushManager.
  if (existing) {
    const original = existing.unsubscribe;
    existing.unsubscribe = vi.fn(async () => {
      const result = await original();
      existing = null;
      return result;
    });
  }
  const created = fakeSubscription(ENDPOINT, () => {
    existing = null;
  });
  const subscribe = vi.fn(async () => {
    existing = created;
    return created;
  });
  const postSubscribe = vi.fn(async () => {});
  const postUnsubscribe = vi.fn(async () => {});
  const requestPermission = vi.fn(
    async () => options.permissionAfterRequest ?? 'granted',
  );
  const deps: PushClientDeps = {
    isSupported: () => options.supported ?? true,
    getPermission: () => options.permission ?? 'granted',
    requestPermission: requestPermission as PushClientDeps['requestPermission'],
    getPushManager: async (): Promise<PushManagerLike> => ({
      getSubscription: async () => existing,
      subscribe: subscribe as PushManagerLike['subscribe'],
    }),
    fetchServerConfig: async () =>
      options.configured === false
        ? { configured: false, publicKey: null }
        : { configured: true, publicKey: PUBLIC_KEY },
    postSubscribe: postSubscribe as PushClientDeps['postSubscribe'],
    postUnsubscribe: postUnsubscribe as PushClientDeps['postUnsubscribe'],
  };
  return {
    deps,
    subscribe,
    postSubscribe,
    postUnsubscribe,
    requestPermission,
    setExisting: (sub) => {
      existing = sub;
    },
  };
}

describe('PushNotificationClient.getStatus', () => {
  it('is unsupported where the browser has no push machinery', async () => {
    const world = fakeWorld({ supported: false });
    const client = new PushNotificationClient(world.deps);
    expect(await client.getStatus()).toBe('unsupported');
  });

  it('is denied when the browser is blocking notifications', async () => {
    const world = fakeWorld({ permission: 'denied' });
    const client = new PushNotificationClient(world.deps);
    expect(await client.getStatus()).toBe('denied');
  });

  it('is not-configured when the server has no VAPID keys', async () => {
    const world = fakeWorld({ configured: false });
    const client = new PushNotificationClient(world.deps);
    expect(await client.getStatus()).toBe('not-configured');
  });

  it('is subscribed only when a browser subscription actually exists', async () => {
    const world = fakeWorld({ existing: fakeSubscription() });
    const client = new PushNotificationClient(world.deps);
    expect(await client.getStatus()).toBe('subscribed');
  });

  it('is unsubscribed when everything works but nothing is subscribed', async () => {
    const world = fakeWorld();
    const client = new PushNotificationClient(world.deps);
    expect(await client.getStatus()).toBe('unsubscribed');
  });
});

describe('PushNotificationClient.enable', () => {
  it('subscribes with the server key and registers the subscription on the server', async () => {
    const world = fakeWorld({ permission: 'default', permissionAfterRequest: 'granted' });
    const client = new PushNotificationClient(world.deps);

    expect(await client.enable()).toBe('subscribed');

    expect(world.requestPermission).toHaveBeenCalledTimes(1);
    expect(world.subscribe).toHaveBeenCalledTimes(1);
    const subscribeOptions = world.subscribe.mock.calls[0]![0] as {
      userVisibleOnly: boolean;
      applicationServerKey: Uint8Array;
    };
    expect(subscribeOptions.userVisibleOnly).toBe(true);
    expect(subscribeOptions.applicationServerKey).toEqual(urlBase64ToUint8Array(PUBLIC_KEY));

    expect(world.postSubscribe).toHaveBeenCalledTimes(1);
    expect(world.postSubscribe.mock.calls[0]![0]).toEqual({
      endpoint: ENDPOINT,
      expirationTime: null,
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    });
  });

  it('refuses to subscribe when the server is not configured — no fake on-state', async () => {
    const world = fakeWorld({ configured: false });
    const client = new PushNotificationClient(world.deps);

    expect(await client.enable()).toBe('not-configured');
    expect(world.subscribe).not.toHaveBeenCalled();
    expect(world.postSubscribe).not.toHaveBeenCalled();
  });

  it('stays denied when the permission prompt is refused', async () => {
    const world = fakeWorld({ permission: 'default', permissionAfterRequest: 'denied' });
    const client = new PushNotificationClient(world.deps);

    expect(await client.enable()).toBe('denied');
    expect(world.subscribe).not.toHaveBeenCalled();
    expect(world.postSubscribe).not.toHaveBeenCalled();
  });

  it('re-registers an existing subscription instead of creating a duplicate', async () => {
    const world = fakeWorld({ existing: fakeSubscription() });
    const client = new PushNotificationClient(world.deps);

    expect(await client.enable()).toBe('subscribed');
    expect(world.subscribe).not.toHaveBeenCalled();
    expect(world.postSubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('PushNotificationClient.disable', () => {
  it('removes the server row and the browser subscription', async () => {
    const existing = fakeSubscription();
    const world = fakeWorld({ existing });
    const client = new PushNotificationClient(world.deps);

    expect(await client.disable()).toBe('unsubscribed');
    expect(world.postUnsubscribe).toHaveBeenCalledWith(ENDPOINT);
    expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('still drops the browser subscription when the server call fails', async () => {
    const existing = fakeSubscription();
    const world = fakeWorld({ existing });
    world.postUnsubscribe.mockRejectedValue(new Error('server unreachable'));
    const client = new PushNotificationClient(world.deps);

    await expect(client.disable()).rejects.toThrow('server unreachable');
    expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when there is no subscription', async () => {
    const world = fakeWorld();
    const client = new PushNotificationClient(world.deps);
    expect(await client.disable()).toBe('unsubscribed');
    expect(world.postUnsubscribe).not.toHaveBeenCalled();
  });
});

describe('urlBase64ToUint8Array', () => {
  it('decodes a real VAPID public key to a 65-byte uncompressed point', () => {
    const bytes = urlBase64ToUint8Array(PUBLIC_KEY);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(0x04);
  });

  it('handles base64url characters and missing padding', () => {
    // 0xfb 0xff 0xfe is '-__-' in base64url, with no padding needed at len 4.
    expect([...urlBase64ToUint8Array('-__-')]).toEqual([0xfb, 0xff, 0xfe]);
    // 'AQ' needs two padding characters restored to decode as one byte.
    expect([...urlBase64ToUint8Array('AQ')]).toEqual([0x01]);
  });
});
