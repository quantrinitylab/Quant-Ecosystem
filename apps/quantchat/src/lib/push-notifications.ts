// ============================================================================
// QuantChat - Web Push Client Helpers (Task 10.1, Task 10.6)
//
//   registerServiceWorker()           -> register /sw.js (Req 9.1)
//   subscribeToPush(vapidPublicKey)   -> PushManager subscription + persist (Req 9.1)
//   getExistingSubscription()         -> current PushSubscription, if any
//   isSubscriptionExpired(sub)        -> expiry check (Req 9.8)
//   ensureFreshSubscription(key)      -> re-subscribe on app visit if expired (Task 10.6)
//
// All functions degrade gracefully in non-supporting environments (SSR, older
// browsers) by feature-detecting `navigator.serviceWorker` and `window.PushManager`.
// ============================================================================

const SUBSCRIBE_ENDPOINT = '/api/notifications/subscribe';

/** Result of a subscribe / refresh attempt. */
export interface PushSubscribeResult {
  ok: boolean;
  subscription?: PushSubscriptionJSON;
  reason?: string;
}

/** Whether the current environment supports service workers + Web Push. */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Converts a base64url-encoded VAPID public key into the Uint8Array that
 * PushManager.subscribe() expects for `applicationServerKey`.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  // Back the view with an explicit ArrayBuffer so the result is a
  // Uint8Array<ArrayBuffer> (a valid BufferSource for PushManager.subscribe),
  // not the wider Uint8Array<ArrayBufferLike> the no-arg constructor infers.
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Registers the service worker at `/sw.js`. Returns the registration, or null
 * when service workers are unavailable. Safe to call repeatedly — the browser
 * returns the existing registration if one is active.
 */
export async function registerServiceWorker(
  scriptUrl = '/sw.js',
): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.register(scriptUrl);
    await navigator.serviceWorker.ready;
    return registration;
  } catch {
    return null;
  }
}

/** Returns the active PushSubscription for this browser, or null. */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Subscribes the browser to Web Push with VAPID authentication and persists the
 * subscription to the backend. Requests notification permission if not yet
 * granted. Returns a result describing success/failure (never throws).
 */
export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscribeResult> {
  if (!isPushSupported()) {
    return { ok: false, reason: 'unsupported' };
  }
  if (!vapidPublicKey) {
    return { ok: false, reason: 'missing-vapid-key' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, reason: `permission-${permission}` };
    }

    const registration = (await navigator.serviceWorker.ready) ?? (await registerServiceWorker());
    if (!registration) {
      return { ok: false, reason: 'no-registration' };
    }

    // Reuse an existing valid subscription rather than creating a duplicate.
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      }));

    const json = subscription.toJSON();
    await persistSubscription(json);
    return { ok: true, subscription: json };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'subscribe-failed',
    };
  }
}

/**
 * A subscription is considered expired when its `expirationTime` is set and is
 * in the past (with a small skew so we re-subscribe slightly ahead of expiry).
 */
export function isSubscriptionExpired(
  subscription: PushSubscription | PushSubscriptionJSON | null,
  now: number = Date.now(),
): boolean {
  if (!subscription) return true;
  const expirationTime = 'expirationTime' in subscription ? subscription.expirationTime : null;
  if (expirationTime == null) return false; // no known expiry => treat as valid
  // Re-subscribe a minute early to avoid a window with no valid subscription.
  return expirationTime <= now + 60_000;
}

/**
 * Task 10.6 / Req 9.8: called on app visit. Detects an expired or missing
 * subscription and re-subscribes. Returns the (possibly refreshed) result.
 */
export async function ensureFreshSubscription(
  vapidPublicKey: string,
  now: number = Date.now(),
): Promise<PushSubscribeResult> {
  if (!isPushSupported()) {
    return { ok: false, reason: 'unsupported' };
  }

  const existing = await getExistingSubscription();

  if (existing && !isSubscriptionExpired(existing, now)) {
    // Still valid — make sure the backend has it, then we're done.
    const json = existing.toJSON();
    await persistSubscription(json);
    return { ok: true, subscription: json };
  }

  // Expired or missing: drop the stale one and create a new subscription.
  if (existing) {
    try {
      await existing.unsubscribe();
    } catch {
      /* ignore — we re-subscribe regardless */
    }
  }

  return subscribeToPush(vapidPublicKey);
}

/** POSTs the subscription JSON to the backend. Never throws. */
async function persistSubscription(subscription: PushSubscriptionJSON): Promise<boolean> {
  try {
    const response = await fetch(SUBSCRIBE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
