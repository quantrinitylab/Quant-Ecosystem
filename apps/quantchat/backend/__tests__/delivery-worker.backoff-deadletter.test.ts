// ============================================================================
// Unit tests — DeliveryWorker backoff window + dead-letter exclusion
// Spec: quantchat-launch-readiness, Task 12.3
// Design: Component 3 (DeliveryWorker), Algorithm 3 (drain loop). Requirements
//         8.5 (exponential backoff 5s..5min) and 8.7 (dead-letter at attempts > 10).
//
//   * computeBackoffMs produces the doubling sequence 5s,10s,20s,40s,... capped
//     at 5min (Requirement 8.5).
//   * markFailed increments the attempt count and the event is retried ONLY
//     after its backoff window has elapsed — driven via the injectable clock
//     (Requirements 8.5, 8.6).
//   * events whose attempts exceed the configured maximum of 10 are excluded
//     from claimBatch (dead-letter) so the worker no longer processes them
//     (Requirement 8.7).
//
// Drives the REAL DeliveryWorker against in-memory fakes with an injectable
// clock so backoff windows are exercised deterministically without real timers.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  DeliveryWorker,
  computeBackoffMs,
  DELIVERY_BACKOFF_BASE_MS,
  DELIVERY_BACKOFF_CAP_MS,
} from '../services/delivery-worker';
import { MAX_DELIVERY_ATTEMPTS } from '../services/outbox.service';
import {
  Clock,
  FailureBudget,
  FakeBackplane,
  FakeOutboxService,
  FakePresence,
  FakePushDispatcher,
} from './fake-delivery-deps';

describe('computeBackoffMs — exponential backoff sequence (Requirement 8.5)', () => {
  it('doubles from 5s and caps at 5min', () => {
    // attempts: 1 → 5s, 2 → 10s, 3 → 20s, 4 → 40s, 5 → 80s, 6 → 160s,
    // 7 → 320s clamped to 300s (cap), 8+ → 300s.
    expect(computeBackoffMs(1)).toBe(5_000);
    expect(computeBackoffMs(2)).toBe(10_000);
    expect(computeBackoffMs(3)).toBe(20_000);
    expect(computeBackoffMs(4)).toBe(40_000);
    expect(computeBackoffMs(5)).toBe(80_000);
    expect(computeBackoffMs(6)).toBe(160_000);
    // 5s * 2^6 = 320s would exceed the 5-min cap, so it is clamped.
    expect(computeBackoffMs(7)).toBe(DELIVERY_BACKOFF_CAP_MS);
    expect(computeBackoffMs(8)).toBe(DELIVERY_BACKOFF_CAP_MS);
    expect(computeBackoffMs(50)).toBe(DELIVERY_BACKOFF_CAP_MS);
  });

  it('treats attempts <= 0 as the first attempt (5s base)', () => {
    expect(computeBackoffMs(0)).toBe(DELIVERY_BACKOFF_BASE_MS);
    expect(computeBackoffMs(-3)).toBe(DELIVERY_BACKOFF_BASE_MS);
  });

  it('never returns a delay above the cap for any attempt count', () => {
    for (let n = 1; n <= 40; n += 1) {
      expect(computeBackoffMs(n)).toBeLessThanOrEqual(DELIVERY_BACKOFF_CAP_MS);
    }
  });
});

describe('DeliveryWorker — markFailed increments attempts and respects the backoff window (Requirements 8.5, 8.6)', () => {
  it('increments attempts on failure and only retries after the backoff window elapses', async () => {
    const conversationId = 'conv-backoff';
    const messageId = 'msg-backoff';
    const recipientId = 'online-user';

    const clock = new Clock(0);
    // Exactly one transient failure, then the backplane recovers.
    const failures = new FailureBudget(1);
    const outbox = new FakeOutboxService();
    const backplane = new FakeBackplane(failures);
    const presence = new FakePresence([recipientId]); // online → realtime publish path
    const push = new FakePushDispatcher();

    const row = outbox.seed({ conversationId, messageId, recipientIds: [recipientId] });

    const worker = new DeliveryWorker(
      { outbox, backplane, presence, pushDispatcher: push },
      { now: clock.now },
    );

    // --- Tick 1 @ t=0: delivery fails transiently → markFailed, attempts=1 ---
    await worker.tick();
    expect(row.attempts).toBe(1);
    expect(row.processedAt).toBeNull();
    expect(backplane.published).toHaveLength(0);
    expect(row.lastError).toBeTruthy();

    // Backoff window for attempts=1 is 5s. A tick BEFORE the window elapses must
    // NOT retry the event (it stays claimed-but-skipped).
    clock.ms = computeBackoffMs(1) - 1; // t = 4999ms (< 5s)
    const processedEarly = await worker.tick();
    expect(processedEarly).toBe(0);
    expect(row.attempts).toBe(1); // unchanged — not retried
    expect(row.processedAt).toBeNull();
    expect(backplane.published).toHaveLength(0);

    // --- Tick 3 @ t=5000ms: window elapsed → retry succeeds → processed ---
    clock.ms = computeBackoffMs(1); // t = 5000ms (>= 5s)
    const processedNow = await worker.tick();
    expect(processedNow).toBe(1);
    expect(row.processedAt).not.toBeNull();
    expect(backplane.publishesFor(conversationId)).toHaveLength(1);
    // Online recipient was delivered via realtime, never pushed.
    expect(push.dispatched).toHaveLength(0);
  });

  it('lengthens the backoff window as attempts accumulate (5s then 10s)', async () => {
    const conversationId = 'conv-grow';
    const recipientId = 'online-user';

    const clock = new Clock(0);
    // Two transient failures before recovery.
    const failures = new FailureBudget(2);
    const outbox = new FakeOutboxService();
    const backplane = new FakeBackplane(failures);
    const presence = new FakePresence([recipientId]);
    const push = new FakePushDispatcher();

    const row = outbox.seed({ conversationId, messageId: 'm', recipientIds: [recipientId] });
    const worker = new DeliveryWorker(
      { outbox, backplane, presence, pushDispatcher: push },
      { now: clock.now },
    );

    // First failure at t=0 → attempts=1, window 5s.
    await worker.tick();
    expect(row.attempts).toBe(1);

    // Second attempt at t=5s fails again → attempts=2, window now 10s (from 5s).
    clock.ms = 5_000;
    await worker.tick();
    expect(row.attempts).toBe(2);
    expect(row.processedAt).toBeNull();

    // A tick at t=5s+9.999s (< 10s after the 2nd failure) must NOT retry.
    clock.ms = 5_000 + computeBackoffMs(2) - 1; // 14_999
    expect(await worker.tick()).toBe(0);
    expect(row.attempts).toBe(2);

    // At t=5s+10s the window elapses → success.
    clock.ms = 5_000 + computeBackoffMs(2); // 15_000
    expect(await worker.tick()).toBe(1);
    expect(row.processedAt).not.toBeNull();
  });
});

describe('DeliveryWorker — dead-letter exclusion at attempts > 10 (Requirement 8.7)', () => {
  it('does not process an event whose attempts exceed the configured maximum', async () => {
    const conversationId = 'conv-dead';
    const recipientId = 'online-user';

    const clock = new Clock(1_000_000); // far past any backoff window
    const outbox = new FakeOutboxService();
    const backplane = new FakeBackplane(); // healthy — would deliver if claimed
    const presence = new FakePresence([recipientId]);
    const push = new FakePushDispatcher();

    // Seed an already dead-lettered event: attempts beyond the maximum of 10.
    const row = outbox.seed({
      conversationId,
      messageId: 'm-dead',
      recipientIds: [recipientId],
      attempts: MAX_DELIVERY_ATTEMPTS + 1, // 11
    });

    const worker = new DeliveryWorker(
      { outbox, backplane, presence, pushDispatcher: push },
      { now: clock.now },
    );

    const processed = await worker.tick();

    // The worker claimed nothing: the dead-lettered event is excluded.
    expect(processed).toBe(0);
    expect(outbox.markProcessedCalls).toBe(0);
    expect(row.processedAt).toBeNull();
    expect(backplane.published).toHaveLength(0);
    expect(push.dispatched).toHaveLength(0);
  });

  it('claimBatch excludes attempts > 10 but still includes attempts == 10 (boundary)', async () => {
    const outbox = new FakeOutboxService();
    const atMax = outbox.seed({
      conversationId: 'c',
      messageId: 'at-max',
      recipientIds: ['u'],
      attempts: MAX_DELIVERY_ATTEMPTS, // 10 — still claimable
    });
    const overMax = outbox.seed({
      conversationId: 'c',
      messageId: 'over-max',
      recipientIds: ['u'],
      attempts: MAX_DELIVERY_ATTEMPTS + 1, // 11 — dead-lettered
    });

    const claimed = await outbox.claimBatch(100);
    const claimedIds = claimed.map((e) => e.id);

    expect(claimedIds).toContain(atMax.id);
    expect(claimedIds).not.toContain(overMax.id);
  });

  it('an event that keeps failing is retried until it crosses the dead-letter threshold and is then left unprocessed', async () => {
    const conversationId = 'conv-exhaust';
    const recipientId = 'online-user';

    const clock = new Clock(0);
    // Always-failing delivery (huge budget) drives the event to dead-letter.
    const failures = new FailureBudget(1_000);
    const outbox = new FakeOutboxService();
    const backplane = new FakeBackplane(failures);
    const presence = new FakePresence([recipientId]);
    const push = new FakePushDispatcher();

    const row = outbox.seed({ conversationId, messageId: 'm', recipientIds: [recipientId] });
    const worker = new DeliveryWorker(
      { outbox, backplane, presence, pushDispatcher: push },
      { now: clock.now },
    );

    // Drive many ticks, always advancing past the backoff cap so each attempt runs.
    for (let i = 0; i < 20; i += 1) {
      await worker.tick();
      clock.advance(DELIVERY_BACKOFF_CAP_MS + 1);
    }

    // The event failed repeatedly, crossed attempts > 10, and is now dead-lettered:
    // never processed, and excluded from any further claim.
    expect(row.processedAt).toBeNull();
    expect(row.attempts).toBe(MAX_DELIVERY_ATTEMPTS + 1); // exactly 11, then excluded
    expect(await outbox.claimBatch(100)).toHaveLength(0);
  });
});
