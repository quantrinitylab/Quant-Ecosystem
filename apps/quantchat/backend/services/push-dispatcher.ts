// ============================================================================
// QuantChat — PushDispatcher (W3, design Component 3, Requirement 9)
// ============================================================================
//
// Real implementation of the `PushDispatcher` contract declared in
// `delivery-worker.ts`. The DeliveryWorker hands every OFFLINE recipient to
// `dispatch(userId, notification)`; this module fans that notification out to
// each of the user's registered `PushSubscription` rows over the existing
// graceful `web-push` transport (design Component 3, Sequence 1 "Bob offline").
//
// Behaviour (Requirement 9):
//   - One delivery attempt per subscription (Req 9.1).
//   - Subscriptions that the push service reports as gone (`404`/`410`) are
//     pruned so they receive no further dispatches (Req 9.2, error-handling
//     "Push subscription gone" row).
//   - Transient failures (anything that is NOT a 404/410 gone response) are
//     retried with exponential backoff starting at 1s, up to a maximum of 3
//     retry attempts: 1s, 2s, 4s (Req 9.3).
//   - For E2EE conversations the body is generic and carries NO plaintext — the
//     `PushNotification` it receives only ever carries routing ids and a generic
//     body, and the serialised payload is built from those safe fields alone
//     (Req 9.4 / 16.1).
//   - A per-subscription result reports `succeeded | pruned | exhausted`
//     (Req 9.5).
//
// Everything the dispatcher needs is INJECTED (the `web-push` transport, the
// subscription store, and a `sleep`/backoff function) so it is fully testable
// without a real Postgres / web-push / browser stack — mirroring the repo's
// established dependency-injection + `fake-*` testing approach.
// ============================================================================

import type {
  PushDispatcher,
  PushNotification,
  PushResult,
  PushSubscriptionResult,
} from './delivery-worker';
import { NoopPushDispatcher } from './delivery-worker';

/** First retry waits 1 second; the delay doubles per retry (Requirement 9.3). */
export const PUSH_BACKOFF_BASE_MS = 1_000;

/** At most 3 retry attempts after the initial delivery attempt (Requirement 9.3). */
export const PUSH_MAX_RETRIES = 3;

/**
 * Exponential backoff window before the Nth retry of a transient push failure
 * (Requirement 9.3). The delay starts at {@link PUSH_BACKOFF_BASE_MS} (1s) and
 * doubles with each retry: retry 1 → 1s, retry 2 → 2s, retry 3 → 4s.
 *
 * @param retryNumber the 1-based retry attempt about to be made (≥ 1).
 */
export function computePushBackoffMs(
  retryNumber: number,
  baseMs: number = PUSH_BACKOFF_BASE_MS,
): number {
  const n = Math.max(1, Math.floor(retryNumber));
  return baseMs * 2 ** (n - 1);
}

/** Public key material for a single browser push subscription. */
export interface WebPushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

/** The subscription shape the `web-push` transport expects. */
export interface WebPushSubscription {
  endpoint: string;
  keys: WebPushSubscriptionKeys;
  expirationTime?: number | null;
}

/**
 * Minimal contract over the graceful `web-push` transport (see
 * `lib/notification-dispatch.ts`). A rejected promise signals a delivery
 * failure; a `statusCode` of `404`/`410` on the rejection value marks the
 * subscription as gone (Requirement 9.2). Injected for testability.
 */
export interface WebPushClient {
  sendNotification(subscription: WebPushSubscription, payload: string): Promise<void>;
}

/**
 * A persisted `PushSubscription` row (public material only — the backend is a
 * zero-knowledge relay). Mirrors the Prisma `PushSubscription` model
 * (`endpoint`, `p256dh`, `auth`).
 */
export interface StoredPushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expiresAt?: Date | null;
}

/**
 * Read/prune access to a user's push subscriptions. Injected so the dispatcher
 * is decoupled from Prisma and trivially testable; {@link PrismaPushSubscriptionStore}
 * is the production implementation.
 */
export interface PushSubscriptionStore {
  /** All currently-registered subscriptions for a user (Requirement 9.1). */
  listForUser(userId: string): Promise<StoredPushSubscription[]>;
  /** Permanently remove a gone subscription so it is never dispatched again (Requirement 9.2). */
  prune(subscriptionId: string): Promise<void>;
}

/** Injected dependencies for {@link WebPushDispatcher}. */
export interface WebPushDispatcherDeps {
  /** The graceful `web-push` transport (injected for testability). */
  transport: WebPushClient;
  /** Read/prune access to the user's `PushSubscription` rows. */
  subscriptions: PushSubscriptionStore;
  /**
   * Injectable delay used between retries so backoff is exercised
   * deterministically in tests without real timers. Defaults to a real timer.
   */
  sleep?: (ms: number) => Promise<void>;
  /** Error sink so a single failing subscription never aborts the whole dispatch. */
  onError?: (error: unknown, context: { userId: string; endpoint: string }) => void;
}

/** Tunables for {@link WebPushDispatcher} (defaulted for production). */
export interface WebPushDispatcherOptions {
  /** Max retry attempts after the initial send (Requirement 9.3). Defaults to 3. */
  maxRetries?: number;
  /** Backoff base in ms (Requirement 9.3). Defaults to 1000ms. */
  backoffBaseMs?: number;
}

/** Default real-timer sleep used when none is injected. */
function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns the HTTP-ish status code carried on a thrown push error, if any. The
 * `web-push` library rejects with a `WebPushError` whose `statusCode` is the
 * push endpoint's response code (e.g. `410 Gone` for an unsubscribed device).
 */
function statusCodeOf(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const code = (error as { statusCode?: unknown }).statusCode;
    if (typeof code === 'number') return code;
  }
  return undefined;
}

/**
 * A `404`/`410` response means the subscription is permanently gone and must be
 * pruned rather than retried (Requirement 9.2). Every other failure is treated
 * as transient and is eligible for retry with backoff (Requirement 9.3).
 */
function isGone(error: unknown): boolean {
  const code = statusCodeOf(error);
  return code === 404 || code === 410;
}

/**
 * Builds the JSON push payload from the SAFE notification fields only. The
 * `PushNotification` carries no message plaintext (for E2EE conversations the
 * worker supplies a generic body via `genericNotification`), so the serialised
 * payload can never leak ciphertext or plaintext (Requirement 9.4 / 16.1).
 */
export function buildPushPayload(notification: PushNotification): string {
  return JSON.stringify({
    title: notification.title,
    body: notification.body,
    conversationId: notification.conversationId,
    badge: notification.badge,
  });
}

/**
 * Real {@link PushDispatcher} over the graceful `web-push` transport
 * (design Component 3). Sends one attempt per subscription with bounded
 * exponential-backoff retries on transient failures, prunes gone subscriptions,
 * and reports a per-subscription outcome (Requirement 9.1–9.5, 16.1).
 */
export class WebPushDispatcher implements PushDispatcher {
  private readonly transport: WebPushClient;
  private readonly store: PushSubscriptionStore;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onError?: (
    error: unknown,
    context: { userId: string; endpoint: string },
  ) => void;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;

  constructor(deps: WebPushDispatcherDeps, options: WebPushDispatcherOptions = {}) {
    this.transport = deps.transport;
    this.store = deps.subscriptions;
    this.sleep = deps.sleep ?? realSleep;
    this.onError = deps.onError;
    this.maxRetries = options.maxRetries ?? PUSH_MAX_RETRIES;
    this.backoffBaseMs = options.backoffBaseMs ?? PUSH_BACKOFF_BASE_MS;
  }

  /**
   * Dispatch a notification to every one of the user's push subscriptions
   * (Requirement 9.1). A user with no subscriptions yields an empty result.
   * Each subscription is delivered independently so one gone/exhausted device
   * never blocks the others.
   */
  async dispatch(userId: string, notification: PushNotification): Promise<PushResult> {
    const subscriptions = await this.store.listForUser(userId);
    const payload = buildPushPayload(notification);

    const results: PushSubscriptionResult[] = [];
    for (const subscription of subscriptions) {
      results.push(await this.dispatchOne(userId, subscription, payload));
    }

    return { userId, results };
  }

  /**
   * Deliver a single subscription with bounded retries (Requirement 9.1, 9.3):
   *   - success                       → `succeeded`
   *   - `404`/`410` gone              → prune + `pruned` (Requirement 9.2)
   *   - transient, retries remaining  → backoff (1s, 2s, 4s) and retry
   *   - transient, retries exhausted  → `exhausted` (Requirement 9.5)
   */
  private async dispatchOne(
    userId: string,
    subscription: StoredPushSubscription,
    payload: string,
  ): Promise<PushSubscriptionResult> {
    const target: WebPushSubscription = {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      expirationTime: subscription.expiresAt ? subscription.expiresAt.getTime() : null,
    };

    // attempt 0 is the initial send; attempts 1..maxRetries are the retries.
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        await this.transport.sendNotification(target, payload);
        return { endpoint: subscription.endpoint, status: 'succeeded' };
      } catch (error) {
        this.onError?.(error, { userId, endpoint: subscription.endpoint });

        if (isGone(error)) {
          // Permanently gone — prune and stop retrying (Requirement 9.2).
          await this.store.prune(subscription.id);
          return { endpoint: subscription.endpoint, status: 'pruned' };
        }

        // Transient failure: retry with exponential backoff if attempts remain.
        if (attempt < this.maxRetries) {
          await this.sleep(computePushBackoffMs(attempt + 1, this.backoffBaseMs));
          continue;
        }

        // Retries exhausted (Requirement 9.5).
        return { endpoint: subscription.endpoint, status: 'exhausted' };
      }
    }

    // Unreachable: the loop always returns. Kept exhaustive for the type checker.
    return { endpoint: subscription.endpoint, status: 'exhausted' };
  }
}

// ----------------------------------------------------------------------------
// Production wiring helpers
// ----------------------------------------------------------------------------

/**
 * Local structural view of the Prisma client's `pushSubscription` delegate,
 * mirroring `routes/notifications.ts`. Declared locally (rather than relying on
 * the backend Prisma stub) so this module type-checks without a generated
 * client and stays decoupled from the full `PrismaClient` surface.
 */
export interface PrismaPushSubscriptionClient {
  pushSubscription: {
    findMany: (args: { where: { userId: string } }) => Promise<Array<Record<string, unknown>>>;
    delete: (args: { where: { id: string } }) => Promise<unknown>;
  };
}

/**
 * Prisma-backed {@link PushSubscriptionStore}. Reads a user's subscriptions and
 * prunes a gone subscription by id. Reads/writes public material only — the
 * backend remains a zero-knowledge relay (Requirement 16.1).
 */
export class PrismaPushSubscriptionStore implements PushSubscriptionStore {
  constructor(private readonly prisma: PrismaPushSubscriptionClient) {}

  async listForUser(userId: string): Promise<StoredPushSubscription[]> {
    const rows = await this.prisma.pushSubscription.findMany({ where: { userId } });
    return rows.map((row) => ({
      id: String(row['id']),
      endpoint: String(row['endpoint']),
      p256dh: String(row['p256dh']),
      auth: String(row['auth']),
      expiresAt: row['expiresAt'] ? new Date(row['expiresAt'] as string) : null,
    }));
  }

  async prune(subscriptionId: string): Promise<void> {
    await this.prisma.pushSubscription.delete({ where: { id: subscriptionId } });
  }
}

// ----------------------------------------------------------------------------
// Lazy web-push transport + production dispatcher factory
// ----------------------------------------------------------------------------

/**
 * VAPID configuration read from the environment. Web Push delivery requires a
 * VAPID keypair + a contact subject; absent any of these, real push is disabled
 * and the {@link createPushDispatcher} factory falls back to the no-op
 * dispatcher (the rest of the delivery pipeline still functions).
 */
interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

function readVapidConfig(): VapidConfig | null {
  const publicKey = process.env['VAPID_PUBLIC_KEY'];
  const privateKey = process.env['VAPID_PRIVATE_KEY'];
  const subject = process.env['VAPID_SUBJECT'] ?? 'mailto:ops@quantchat.dev';
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

/**
 * {@link WebPushClient} that loads and configures the optional `web-push`
 * dependency on first use. The module specifier is computed so TypeScript does
 * not require `web-push` types at compile time (graceful optional dependency).
 * A `WebPushError` from `web-push` carries the push endpoint's `statusCode`
 * (e.g. `410 Gone`), which {@link WebPushDispatcher} uses to prune dead
 * subscriptions; this client therefore lets such rejections propagate untouched.
 */
export class LazyWebPushClient implements WebPushClient {
  private readonly vapid: VapidConfig;
  private webpush: {
    sendNotification: (sub: WebPushSubscription, payload: string) => Promise<unknown>;
    setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  } | null = null;
  private loadAttempted = false;

  constructor(vapid: VapidConfig) {
    this.vapid = vapid;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.webpush || this.loadAttempted) {
      if (!this.webpush) {
        throw new Error('web-push dependency is not available');
      }
      return;
    }
    this.loadAttempted = true;
    const moduleName = 'web-push';
    const mod = (await import(moduleName)) as {
      default?: LazyWebPushClient['webpush'];
      sendNotification?: unknown;
      setVapidDetails?: unknown;
    };
    const webpush = (mod?.default ?? mod) as LazyWebPushClient['webpush'];
    if (!webpush || typeof webpush.sendNotification !== 'function') {
      throw new Error('web-push dependency is not available');
    }
    webpush.setVapidDetails(this.vapid.subject, this.vapid.publicKey, this.vapid.privateKey);
    this.webpush = webpush;
  }

  async sendNotification(subscription: WebPushSubscription, payload: string): Promise<void> {
    await this.ensureLoaded();
    await this.webpush!.sendNotification(subscription, payload);
  }
}

/**
 * Build the production {@link PushDispatcher} for the DeliveryWorker. When VAPID
 * keys are configured a real {@link WebPushDispatcher} is returned (backed by
 * the lazy `web-push` transport and the user's persisted `PushSubscription`
 * rows); otherwise a {@link NoopPushDispatcher} is returned so offline delivery
 * degrades cleanly without blocking the worker.
 */
export function createPushDispatcher(prisma: PrismaPushSubscriptionClient): PushDispatcher {
  const vapid = readVapidConfig();
  if (!vapid) {
    return new NoopPushDispatcher();
  }
  return new WebPushDispatcher({
    transport: new LazyWebPushClient(vapid),
    subscriptions: new PrismaPushSubscriptionStore(prisma),
  });
}
