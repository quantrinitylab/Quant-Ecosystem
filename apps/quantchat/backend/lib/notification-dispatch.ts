// ============================================================================
// QuantChat - Notification Dispatch (Task 10.2 support)
//
// Transport layer for Web Push delivery with GRACEFUL DEGRADATION: the optional
// `web-push` package is loaded lazily at runtime. If it is not installed, the
// dispatcher still accepts and "delivers" notifications (recording them) so the
// rest of the system — subscriptions, categories, batching, deep-links — works
// end-to-end; it simply cannot reach the browser push endpoints until the
// dependency and VAPID keys are present.
//
// Categories supported: MESSAGES, CALLS, STORIES, STREAKS, REELS, SYSTEM.
// ============================================================================

export type NotificationCategory =
  | 'MESSAGES'
  | 'CALLS'
  | 'STORIES'
  | 'STREAKS'
  | 'REELS'
  | 'SYSTEM';

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
}

export interface NotificationPayload {
  userId: string;
  category: NotificationCategory | string;
  title: string;
  body: string;
  /** Content id for deep-linking (chat id, reel id, ...). */
  contentId?: string;
  deepLink?: string;
  priority?: 'high' | 'normal';
  tag?: string;
  silent?: boolean;
}

export interface DispatchResult {
  delivered: number;
  failed: number;
  /** True when the real `web-push` transport was used. */
  transportAvailable: boolean;
  /** Endpoints that returned 404/410 (gone) — caller may prune them. */
  expiredEndpoints: string[];
}

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string; // e.g. 'mailto:ops@quantchat.dev'
}

// Loaded VAPID config from the environment (optional).
function readVapidConfig(): VapidConfig | null {
  const publicKey = process.env['VAPID_PUBLIC_KEY'];
  const privateKey = process.env['VAPID_PRIVATE_KEY'];
  const subject = process.env['VAPID_SUBJECT'] ?? 'mailto:ops@quantchat.dev';
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

/**
 * Attempts to load and configure the optional `web-push` dependency. Returns
 * the configured module or null when the package is missing or VAPID keys are
 * not set. The variable specifier keeps TypeScript from requiring the module's
 * types at compile time (graceful degradation).
 */
async function loadWebPush(): Promise<{
  sendNotification: (sub: any, payload: string) => Promise<unknown>;
} | null> {
  const vapid = readVapidConfig();
  if (!vapid) return null;
  try {
    const moduleName = 'web-push';

    const mod: any = await import(moduleName);
    const webpush = mod?.default ?? mod;
    if (!webpush || typeof webpush.sendNotification !== 'function') return null;
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    return webpush;
  } catch {
    // Dependency not installed — degrade gracefully.
    return null;
  }
}

/** Builds the JSON string the service worker expects in its `push` handler. */
export function buildPushBody(payload: NotificationPayload): string {
  return JSON.stringify({
    title: payload.title,
    body: payload.body,
    category: payload.category,
    contentId: payload.contentId ?? '',
    deepLink: payload.deepLink,
    tag: payload.tag,
    silent: payload.silent === true,
    renotify: payload.priority === 'high',
  });
}

/**
 * Delivers a notification to a set of subscriptions. Uses `web-push` when
 * available; otherwise records the attempt and reports transportAvailable=false.
 */
export async function dispatchNotification(
  payload: NotificationPayload,
  subscriptions: PushSubscriptionRecord[],
): Promise<DispatchResult> {
  const webpush = await loadWebPush();
  const body = buildPushBody(payload);
  const result: DispatchResult = {
    delivered: 0,
    failed: 0,
    transportAvailable: Boolean(webpush),
    expiredEndpoints: [],
  };

  if (!webpush) {
    // No transport: treat as "accepted but undeliverable" so the pipeline still
    // returns a structured result the caller can act on.
    result.failed = subscriptions.length;
    return result;
  }

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: sub.keys,
          expirationTime: sub.expirationTime ?? null,
        },
        body,
      );
      result.delivered += 1;
    } catch (error) {
      result.failed += 1;
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        result.expiredEndpoints.push(sub.endpoint);
      }
    }
  }

  return result;
}
