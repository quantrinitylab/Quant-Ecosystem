// ============================================================================
// Test support — in-memory fakes for the DeliveryWorker drain loop
// Spec: quantchat-launch-readiness, Tasks 12.2 / 12.3
//
// Design: Component 3 (OutboxService + DeliveryWorker + PushDispatcher),
//         Algorithm 3 (delivery worker drain loop), Correctness Property 4
//         (at-least-once delivery). Requirements 8.1–8.7.
//
// A real Postgres / Redis / web-push stack is not available in the sandbox, so
// — mirroring the repo's established `fake-*.ts` approach (fake-message-prisma,
// fake-realtime-bus) — these helpers drive the REAL `DeliveryWorker` against
// faithful in-memory doubles of its injected dependencies:
//
//   * FakeOutboxService  — replicates PrismaOutboxService semantics exactly:
//       claimBatch returns unprocessed, non-dead-lettered events oldest-first up
//       to a limit (WHERE processedAt IS NULL AND attempts <= MAX_DELIVERY_ATTEMPTS);
//       markProcessed stamps processedAt; markFailed increments attempts.
//   * FakeBackplane      — records realtime publishes (online delivery path) and
//       can be driven to throw transient publish failures via a shared budget.
//   * FakePresence       — answers isOnlineAnywhere from a fixed online set.
//   * FakePushDispatcher — records push dispatches (offline delivery path) and
//       shares the same transient-failure budget as the backplane.
//   * FailureBudget      — a shared, deterministic transient-failure injector so
//       publish/dispatch fail for the first N delivery operations then succeed.
//
// The worker's clock is injectable, so backoff windows are exercised
// deterministically without real timers.
//
// NOTE: this module is intentionally NOT a `*.test.ts`/`*.spec.ts` file so the
// vitest include glob does not collect it as a suite — it is a shared helper.
// ============================================================================

import {
  MAX_DELIVERY_ATTEMPTS,
  type OutboxEvent,
  type OutboxService,
  type PrismaTx,
} from '../services/outbox.service';
import type { RealtimeBackplane, RoomEvent } from '../services/realtime-backplane';
import type {
  OnlinePresenceChecker,
  PushDispatcher,
  PushNotification,
  PushResult,
} from '../services/delivery-worker';

/**
 * Deterministic transient-failure injector shared between the backplane and the
 * push dispatcher. Each call to {@link consume} throws while a budget remains,
 * decrementing it; once the budget is exhausted, calls succeed. This models
 * "the first N delivery operations fail transiently, then recover" so the worker
 * keeps retrying with backoff (Requirements 8.5, 8.6).
 */
export class FailureBudget {
  constructor(public remaining: number) {}

  consume(): void {
    if (this.remaining > 0) {
      this.remaining -= 1;
      throw new Error('transient delivery failure');
    }
  }
}

/** A never-failing budget (the default for tests that don't inject failures). */
export const NO_FAILURES = new FailureBudget(0);

/** Mutable in-memory outbox row used by {@link FakeOutboxService}. */
interface MutableOutboxRow {
  id: string;
  conversationId: string;
  messageId: string;
  recipientIds: string[];
  createdAt: Date;
  processedAt: Date | null;
  attempts: number;
  lastError: string | null;
}

let seedCounter = 0;

/**
 * In-memory {@link OutboxService} replicating PrismaOutboxService's observable
 * behaviour, including the dead-letter exclusion (`attempts <= MAX_DELIVERY_ATTEMPTS`)
 * enforced by `claimBatch` (Requirement 8.7). Records call counts so tests can
 * assert the per-tick loop invariant (Algorithm 3).
 */
export class FakeOutboxService implements OutboxService {
  readonly rows: MutableOutboxRow[] = [];
  markProcessedCalls = 0;
  markFailedCalls = 0;

  /** Seed an unprocessed event directly (bypasses enqueue's tx requirement). */
  seed(
    event: Partial<Omit<OutboxEvent, 'processedAt'>> & {
      conversationId: string;
      messageId: string;
      recipientIds: string[];
    },
  ): MutableOutboxRow {
    const row: MutableOutboxRow = {
      id: event.id ?? `obx-${seedCounter++}`,
      conversationId: event.conversationId,
      messageId: event.messageId,
      recipientIds: event.recipientIds,
      createdAt: event.createdAt ?? new Date(seedCounter),
      processedAt: null,
      attempts: event.attempts ?? 0,
      lastError: null,
    };
    this.rows.push(row);
    return row;
  }

  async enqueue(
    _tx: PrismaTx,
    event: Omit<OutboxEvent, 'id' | 'processedAt' | 'attempts'>,
  ): Promise<void> {
    this.seed(event);
  }

  /**
   * Mirror of `PrismaOutboxService.claimBatch`: unprocessed, non-dead-lettered
   * rows, oldest first, up to `limit`. Dead-lettered events (attempts exceeding
   * MAX_DELIVERY_ATTEMPTS) are excluded so the worker never processes them
   * again (Requirement 8.7).
   */
  async claimBatch(limit: number): Promise<OutboxEvent[]> {
    return this.rows
      .filter((r) => r.processedAt === null && r.attempts <= MAX_DELIVERY_ATTEMPTS)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        conversationId: r.conversationId,
        messageId: r.messageId,
        recipientIds: [...r.recipientIds],
        createdAt: r.createdAt,
        processedAt: r.processedAt,
        attempts: r.attempts,
      }));
  }

  async markProcessed(eventId: string): Promise<void> {
    const row = this.rows.find((r) => r.id === eventId);
    if (row) row.processedAt = new Date();
    this.markProcessedCalls += 1;
  }

  async markFailed(eventId: string, error: string): Promise<void> {
    const row = this.rows.find((r) => r.id === eventId);
    if (row) {
      row.attempts += 1;
      row.lastError = error;
    }
    this.markFailedCalls += 1;
  }
}

/** A single recorded realtime publish. */
export interface RecordedPublish {
  conversationId: string;
  event: RoomEvent;
}

/**
 * In-memory {@link RealtimeBackplane} that records publishes (the online
 * delivery path, Requirement 8.2) and can be driven to fail transiently via a
 * shared {@link FailureBudget}.
 */
export class FakeBackplane implements RealtimeBackplane {
  readonly instanceId = 'inst-test';
  readonly published: RecordedPublish[] = [];
  private readonly memorySequence = new Map<string, number>();

  constructor(private readonly failures: FailureBudget = NO_FAILURES) {}

  async subscribe(): Promise<void> {}
  async unsubscribe(): Promise<void> {}
  onMessage(): void {}
  async shutdown(): Promise<void> {}
  isHealthy(): boolean {
    return true;
  }

  /** K25 — in-memory per-channel sequence (§18). */
  async nextSequence(channel: string): Promise<number> {
    const next = (this.memorySequence.get(channel) ?? 0) + 1;
    this.memorySequence.set(channel, next);
    return next;
  }

  async publish(conversationId: string, event: RoomEvent): Promise<void> {
    this.failures.consume();
    this.published.push({ conversationId, event });
  }

  /** All publishes recorded for a given conversation. */
  publishesFor(conversationId: string): RecordedPublish[] {
    return this.published.filter((p) => p.conversationId === conversationId);
  }
}

/**
 * In-memory {@link OnlinePresenceChecker}. A recipient is online iff its id is
 * in the supplied set (Requirements 8.2 / 8.3).
 */
export class FakePresence implements OnlinePresenceChecker {
  private readonly online: Set<string>;

  constructor(onlineIds: Iterable<string> = []) {
    this.online = new Set(onlineIds);
  }

  setOnline(userId: string, online: boolean): void {
    if (online) this.online.add(userId);
    else this.online.delete(userId);
  }

  async isOnlineAnywhere(userId: string): Promise<boolean> {
    return this.online.has(userId);
  }
}

/** A single recorded push dispatch. */
export interface RecordedPush {
  userId: string;
  notification: PushNotification;
}

/**
 * In-memory {@link PushDispatcher} that records dispatches (the offline delivery
 * path, Requirement 8.3) and shares the transient-failure budget with the
 * backplane so a single budget governs "the first N delivery operations fail".
 */
export class FakePushDispatcher implements PushDispatcher {
  readonly dispatched: RecordedPush[] = [];

  constructor(private readonly failures: FailureBudget = NO_FAILURES) {}

  async dispatch(userId: string, notification: PushNotification): Promise<PushResult> {
    this.failures.consume();
    this.dispatched.push({ userId, notification });
    return { userId, results: [] };
  }

  /** All dispatches recorded for a given user. */
  dispatchesFor(userId: string): RecordedPush[] {
    return this.dispatched.filter((d) => d.userId === userId);
  }
}

/** A trivial controllable clock returning a mutable millisecond value. */
export class Clock {
  constructor(public ms = 0) {}
  now = (): number => this.ms;
  advance(deltaMs: number): void {
    this.ms += deltaMs;
  }
}
