// ============================================================================
// QuantMail — Web Push delivery (QM-UIUX-053).
//
// The delivery path that did not exist: before this file, `PushService` /
// `WebPushService` in `@quant/notifications` were never instantiated outside
// tests, no route ever wrote a `PushSubscription` row for QuantMail, and a
// persisted in-app notification had nowhere to go once the tab closed.
//
//   producer   QM-UIUX-052's `createNewMailNotification` (inbound-webhook)
//   invoke     `deliverPushToUser` below, called after the in-app row persists
//   transport  `WebPushService` + `createWebPushSendHandler` — the real
//              `web-push` library (VAPID-signed, payload-encrypted)
//   device row Prisma `PushSubscription` (schema.prisma) — written by the
//              authenticated routes in `routes/notifications.ts`
//
// Honest degradation is the contract, not an afterthought:
//   - No VAPID keys in the environment → outcome `not-configured`. The
//     registration rows still persist (they become deliverable the moment
//     keys are provisioned) and the in-app notification is unaffected.
//     Nothing is reported as delivered that was not.
//   - No subscriptions for the user → outcome `no-subscriptions`.
//   - A subscription the push service reports 404/410 for is deleted from
//     the database (pruned) instead of being retried forever.
// ============================================================================

import {
  WebPushService,
  createWebPushSendHandler,
  type VapidConfig,
  type WebPushPayload,
  type WebPushSendHandler,
} from '@quant/notifications';

/** The slice of the Prisma `PushSubscription` delegate this service needs. */
export interface PushSubscriptionStore {
  findMany(args: {
    where: { userId: string };
  }): Promise<
    Array<{
      id: string;
      userId: string;
      endpoint: string;
      p256dh: string;
      auth: string;
      expiresAt: Date | null;
      createdAt: Date;
    }>
  >;
  deleteMany(args: {
    where: { userId: string; endpoint: { in: string[] } };
  }): Promise<{ count: number }>;
}

export type PushDeliveryOutcome =
  | { status: 'not-configured'; delivered: 0; failed: 0; pruned: number }
  | { status: 'no-subscriptions'; delivered: 0; failed: 0; pruned: number }
  | { status: 'sent'; delivered: number; failed: number; pruned: number };

export interface PushDeliveryDeps {
  store: PushSubscriptionStore;
  /**
   * Overrides the environment-derived VAPID config. `undefined` (the
   * production default) reads the environment; explicit `null` forces the
   * unconfigured outcome.
   */
  vapid?: VapidConfig | null;
  /**
   * Overrides the real `web-push` transport — the injection seam the
   * substrate itself provides (`WebPushService.setSendHandler`), used by
   * tests to observe exactly what would leave the server. Pair it with a
   * `vapid` value: `WebPushService` checks configuration before transport,
   * so a handler without any config still reports 'VAPID not configured'
   * rather than sending.
   */
  sendHandler?: WebPushSendHandler;
}

/**
 * VAPID configuration comes from the environment only — the same variable
 * names QuantChat's dispatcher uses. Keys are provisioned by the operator;
 * they are never invented, defaulted, or stored in the repo.
 */
export function readVapidConfig(env: NodeJS.ProcessEnv = process.env): VapidConfig | null {
  const publicKey = env['VAPID_PUBLIC_KEY'];
  const privateKey = env['VAPID_PRIVATE_KEY'];
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: env['VAPID_SUBJECT'] ?? 'mailto:ops@quantmail.in',
  };
}

export function isPushConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return readVapidConfig(env) !== null;
}

/** The public half of the VAPID pair — safe to hand to a signed-in browser. */
export function getPushPublicKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return readVapidConfig(env)?.publicKey ?? null;
}

/**
 * Deliver one payload to every live subscription a user has registered.
 * Never throws for configuration or transport problems — those are outcomes.
 * (A database failure still throws; the caller contains it like any other
 * notification-side failure so mail delivery is never blocked by push.)
 */
export async function deliverPushToUser(
  deps: PushDeliveryDeps,
  userId: string,
  payload: WebPushPayload,
): Promise<PushDeliveryOutcome> {
  const rows = await deps.store.findMany({ where: { userId } });

  // Expired rows are dead weight: prune them, never send to them.
  const now = new Date();
  const expired = rows.filter((row) => row.expiresAt !== null && row.expiresAt <= now);
  const live = rows.filter((row) => row.expiresAt === null || row.expiresAt > now);
  let pruned = 0;
  if (expired.length > 0) {
    const result = await deps.store.deleteMany({
      where: { userId, endpoint: { in: expired.map((row) => row.endpoint) } },
    });
    pruned += result.count;
  }

  if (live.length === 0) {
    return { status: 'no-subscriptions', delivered: 0, failed: 0, pruned };
  }

  const vapid = deps.vapid !== undefined ? deps.vapid : readVapidConfig();
  if (!vapid && !deps.sendHandler) {
    return { status: 'not-configured', delivered: 0, failed: 0, pruned };
  }

  const service = new WebPushService(vapid ?? undefined);
  service.setSendHandler(deps.sendHandler ?? createWebPushSendHandler(vapid as VapidConfig));
  for (const row of live) {
    service.subscribe({
      userId,
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
      deviceId: row.id,
      registeredAt: row.createdAt.getTime(),
      isActive: true,
    });
  }

  const results = await service.send(userId, payload);
  const delivered = results.filter((result) => result.success).length;
  const failed = results.length - delivered;

  // Subscriptions the push service says are gone (404/410) are deleted so a
  // dead browser profile is not retried on every new email.
  const gone = results
    .filter(
      (result) => !result.success && (result.statusCode === 404 || result.statusCode === 410),
    )
    .map((result) => result.endpoint)
    .filter((endpoint) => endpoint.length > 0);
  if (gone.length > 0) {
    const result = await deps.store.deleteMany({ where: { userId, endpoint: { in: gone } } });
    pruned += result.count;
  }

  return { status: 'sent', delivered, failed, pruned };
}
