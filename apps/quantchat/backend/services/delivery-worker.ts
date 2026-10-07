// ============================================================================
// QuantChat — DeliveryWorker (W3, design Component 3, Algorithm 3)
// ============================================================================
//
// At-least-once delivery drain loop. The DeliveryWorker periodically claims a
// batch of unprocessed `MessageOutbox` events (written transactionally with the
// `Message` by the OutboxService) and routes each recipient:
//
//   - online on ANY instance  -> publish a `new_message` room event to the
//                                 RealtimeBackplane for realtime fan-out
//                                 (Requirement 8.2). The delivered receipt is
//                                 recorded later when the owning instance's
//                                 socket acks (design Sequence 2 / Task 14).
//   - offline everywhere       -> hand the recipient to the PushDispatcher
//                                 (Requirement 8.3).
//
// Loop invariant (design Algorithm 3): every claimed event that the worker
// *attempts* this tick is marked processed or failed before the tick returns.
// On success the event is `markProcessed` (Requirement 8.4); on error it is
// `markFailed` (attempts++) and left eligible for a later retry after an
// exponential backoff window starting at 5s and doubling up to a 5min cap
// (Requirement 8.5). Events whose attempt count exceeds the configured maximum
// of 10 are dead-lettered and excluded from claims — already enforced inside
// `OutboxService.claimBatch` (Requirement 8.7).
//
// Because `MessageOutbox` carries no per-attempt timestamp, the backoff window
// is honoured in-process: when an event fails, the worker remembers the earliest
// wall-clock time it may be retried and skips it on intervening ticks until the
// window elapses. The clock is injectable so tests can drive backoff
// deterministically without real timers.
//
// PushDispatcher is implemented in Task 13; here it is an injected dependency
// (interface only) with a no-op default so the worker is self-contained and
// testable. Task 13 supplies the real `web-push`-backed dispatcher.
// ============================================================================

import type { OutboxEvent, OutboxService } from './outbox.service';
import type { RealtimeBackplane, RoomEvent } from './realtime-backplane';

/** Maximum number of outbox events claimed per drain tick (Requirement 8.1). */
export const DELIVERY_BATCH_LIMIT = 100;

/** Default interval between drain ticks when the worker runs on a timer. */
export const DELIVERY_POLL_INTERVAL_MS = 1_000;

/** Backoff window base: first retry waits 5 seconds (Requirement 8.5). */
export const DELIVERY_BACKOFF_BASE_MS = 5_000;

/** Backoff window cap: retries never wait more than 5 minutes (Requirement 8.5). */
export const DELIVERY_BACKOFF_CAP_MS = 300_000;

/**
 * Exponential backoff window for a failed outbox event (Requirement 8.5). The
 * delay doubles with each recorded attempt, starting at {@link
 * DELIVERY_BACKOFF_BASE_MS} (5s) and capped at {@link DELIVERY_BACKOFF_CAP_MS}
 * (5min): 5s, 10s, 20s, 40s, 80s, 160s, 300s, 300s, …
 *
 * @param attempts the event's attempt count AFTER the failure was recorded
 *   (i.e. the value persisted by `markFailed`). Treated as at least 1.
 * @returns the number of milliseconds to wait before the event is retried.
 */
export function computeBackoffMs(
  attempts: number,
  baseMs: number = DELIVERY_BACKOFF_BASE_MS,
  capMs: number = DELIVERY_BACKOFF_CAP_MS,
): number {
  const n = Math.max(1, Math.floor(attempts));
  const exponent = n - 1;
  // Guard the shift against absurd attempt counts before clamping to the cap.
  const delay = exponent >= 30 ? capMs : baseMs * 2 ** exponent;
  return Math.min(delay, capMs);
}

/**
 * Notification payload handed to the {@link PushDispatcher}. For E2EE
 * conversations the body is generic ("New message") and never contains
 * plaintext (Requirement 9.4 / 16.1); the worker only ever produces generic
 * bodies because it has no access to message content.
 */
export interface PushNotification {
  title: string;
  body: string;
  conversationId: string;
  badge?: number;
}

/** Per-subscription outcome of a push dispatch (shape finalised in Task 13). */
export interface PushSubscriptionResult {
  endpoint: string;
  status: 'succeeded' | 'pruned' | 'exhausted';
}

/** Result of dispatching to all of a user's push subscriptions. */
export interface PushResult {
  userId: string;
  results: PushSubscriptionResult[];
}

/**
 * Push transport contract (design Component 3). Implemented in Task 13 over the
 * existing `web-push` transport with retry/backoff and dead-subscription
 * pruning; the worker depends only on this interface.
 */
export interface PushDispatcher {
  /** Send to all of a user's push subscriptions with retry + pruning. */
  dispatch(userId: string, notification: PushNotification): Promise<PushResult>;
}

/**
 * No-op {@link PushDispatcher} used as the default until Task 13 supplies the
 * real one. Reports an empty result (the user simply had no subscriptions
 * reached) so the worker can still mark events processed in environments where
 * push is not yet wired.
 */
export class NoopPushDispatcher implements PushDispatcher {
  async dispatch(userId: string): Promise<PushResult> {
    return { userId, results: [] };
  }
}

/**
 * Minimal presence dependency the worker needs: "is this user online on any
 * instance right now?" (Requirement 8.2/8.3). `PresenceManager` satisfies this
 * interface via its `isOnlineAnywhere` method, but accepting the narrow
 * interface keeps the worker testable with a trivial stub.
 */
export interface OnlinePresenceChecker {
  isOnlineAnywhere(userId: string): Promise<boolean>;
}

/** Injected dependencies for the {@link DeliveryWorker}. */
export interface DeliveryWorkerDeps {
  outbox: OutboxService;
  backplane: RealtimeBackplane;
  presence: OnlinePresenceChecker;
  /** Defaults to a {@link NoopPushDispatcher}; Task 13 supplies the real one. */
  pushDispatcher?: PushDispatcher;
}

/** Tunable knobs for the {@link DeliveryWorker} (all defaulted for production). */
export interface DeliveryWorkerOptions {
  /** Interval between drain ticks when running on a timer. */
  intervalMs?: number;
  /** Max events claimed per tick (Requirement 8.1). */
  batchLimit?: number;
  /** Backoff base/cap (Requirement 8.5) — overridable for tests. */
  backoffBaseMs?: number;
  backoffCapMs?: number;
  /** Injectable clock (ms since epoch) so backoff is testable without timers. */
  now?: () => number;
  /** Error sink so a single failing tick never stops the worker loop. */
  onError?: (error: unknown, event?: OutboxEvent) => void;
}

/**
 * Build the generic, plaintext-free notification used for realtime-miss
 * recipients (Requirement 9.4 / 16.1). The worker never sees message content,
 * so the body is intentionally generic.
 */
export function genericNotification(conversationId: string): PushNotification {
  return {
    title: 'QuantChat',
    body: 'New message',
    conversationId,
  };
}

/**
 * Drains the transactional outbox and delivers each message to its recipients
 * via realtime fan-out (online) or push (offline), with at-least-once semantics
 * (design Algorithm 3, Requirements 8.1–8.7).
 */
export class DeliveryWorker {
  private readonly outbox: OutboxService;
  private readonly backplane: RealtimeBackplane;
  private readonly presence: OnlinePresenceChecker;
  private readonly pushDispatcher: PushDispatcher;

  private readonly intervalMs: number;
  private readonly batchLimit: number;
  private readonly backoffBaseMs: number;
  private readonly backoffCapMs: number;
  private readonly now: () => number;
  private readonly onError?: (error: unknown, event?: OutboxEvent) => void;

  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  /**
   * Earliest wall-clock time (ms) at which a failed event may be retried,
   * keyed by event id. Honours the exponential backoff window (Requirement 8.5)
   * without a per-attempt timestamp on the row. Entries are cleared once an
   * event is processed.
   */
  private readonly retryAfter = new Map<string, number>();

  constructor(deps: DeliveryWorkerDeps, options: DeliveryWorkerOptions = {}) {
    this.outbox = deps.outbox;
    this.backplane = deps.backplane;
    this.presence = deps.presence;
    this.pushDispatcher = deps.pushDispatcher ?? new NoopPushDispatcher();

    this.intervalMs = options.intervalMs ?? DELIVERY_POLL_INTERVAL_MS;
    this.batchLimit = options.batchLimit ?? DELIVERY_BATCH_LIMIT;
    this.backoffBaseMs = options.backoffBaseMs ?? DELIVERY_BACKOFF_BASE_MS;
    this.backoffCapMs = options.backoffCapMs ?? DELIVERY_BACKOFF_CAP_MS;
    this.now = options.now ?? (() => Date.now());
    this.onError = options.onError;
  }

  /** Start the polling loop. Safe to call once; subsequent calls are no-ops. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
    // Don't keep the process alive solely for this timer.
    if (typeof this.timer === 'object' && 'unref' in this.timer) {
      (this.timer as { unref: () => void }).unref();
    }
  }

  /** Stop the polling loop. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Run a single drain tick (design Algorithm 3). Claims up to `batchLimit`
   * unprocessed events, routes each recipient, and resolves every *eligible*
   * claimed event (processed on success, failed on error) before returning —
   * the loop invariant. Events still inside their backoff window are skipped
   * and left for a later tick (Requirement 8.5). Overlapping ticks are
   * prevented so a slow tick never runs concurrently with the next timer fire.
   *
   * @returns the number of events successfully marked processed this tick.
   */
  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let processed = 0;
    try {
      const events = await this.outbox.claimBatch(this.batchLimit);
      const nowMs = this.now();

      for (const event of events) {
        // Respect the exponential backoff window for previously-failed events.
        const notBefore = this.retryAfter.get(event.id);
        if (notBefore !== undefined && nowMs < notBefore) {
          continue;
        }

        try {
          await this.deliverEvent(event);
          await this.outbox.markProcessed(event.id);
          this.retryAfter.delete(event.id);
          processed += 1;
        } catch (error) {
          await this.handleFailure(event, error);
        }
      }
    } catch (error) {
      // A failure to claim a batch must not stop the worker; the next tick retries.
      this.onError?.(error);
    } finally {
      this.running = false;
    }
    return processed;
  }

  /**
   * Route every recipient of a claimed event (design Algorithm 3): online
   * recipients trigger a realtime publish (Requirement 8.2); offline recipients
   * are handed to the push dispatcher (Requirement 8.3). Any error here bubbles
   * up so the event is marked failed and retried with backoff.
   */
  private async deliverEvent(event: OutboxEvent): Promise<void> {
    for (const recipientId of event.recipientIds) {
      const online = await this.presence.isOnlineAnywhere(recipientId);
      if (online) {
        await this.backplane.publish(event.conversationId, this.messageRoomEvent(event));
      } else {
        await this.pushDispatcher.dispatch(recipientId, genericNotification(event.conversationId));
      }
    }
  }

  /**
   * Record a failed attempt and schedule the next retry after the exponential
   * backoff window (Requirements 8.5, 8.6). The event remains unprocessed and
   * therefore claimable; `OutboxService.markFailed` increments the attempt
   * count and `OutboxService.claimBatch` dead-letters it once attempts exceed
   * the configured maximum (Requirement 8.7).
   */
  private async handleFailure(event: OutboxEvent, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await this.outbox.markFailed(event.id, message);
    } catch (markError) {
      // If we cannot even record the failure, surface it but keep the loop alive.
      this.onError?.(markError, event);
    }
    // attempts AFTER this failure = current attempts + 1.
    const backoff = computeBackoffMs(event.attempts + 1, this.backoffBaseMs, this.backoffCapMs);
    this.retryAfter.set(event.id, this.now() + backoff);
    this.onError?.(error, event);
  }

  /**
   * Build the `new_message` room event published for an online recipient. The
   * payload mirrors the websocket layer's convention (`{ type, data }`) and
   * carries only routing ids — no message content (zero-knowledge relay). The
   * `originInstanceId` is stamped by `backplane.publish`.
   */
  private messageRoomEvent(event: OutboxEvent): RoomEvent {
    return {
      type: 'new_message',
      originInstanceId: '',
      payload: {
        type: 'new_message',
        data: { messageId: event.messageId, conversationId: event.conversationId },
      },
    };
  }
}
