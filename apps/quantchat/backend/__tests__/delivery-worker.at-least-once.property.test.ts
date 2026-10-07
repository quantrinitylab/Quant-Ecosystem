// ============================================================================
// Property test — DeliveryWorker at-least-once delivery
// Spec: quantchat-launch-readiness, Task 12.2
// Design: Correctness Property 4 ("At-least-once delivery"), Component 3
//         (OutboxService + DeliveryWorker + PushDispatcher), Algorithm 3
//         ("delivery worker drain loop"). Requirement 8.6.
//
//   Property 4 — for any outbox event under repeated tick/failure interleavings
//   (some recipients online, some offline; transient publish/dispatch failures
//   injected), the event is EVENTUALLY:
//     * delivered via the backplane to every ONLINE recipient, AND
//     * pushed to every OFFLINE recipient,
//   OR moved to a dead-letter state (attempts > MAX) once its attempt count
//   exceeds the configured maximum. Failed attempts are retried (markFailed,
//   backoff-respected) until the event is processed or dead-lettered.
//
//   Loop invariant (Algorithm 3) — within EVERY tick, every claimed event that
//   is past its backoff window is resolved (markProcessed on success, markFailed
//   on error) before the tick returns; nothing is left in limbo.
//
// Library: fast-check (per the design's Testing Strategy), minimum 100 runs.
// Drives the REAL DeliveryWorker against in-memory fakes with an injectable
// clock so backoff is exercised deterministically without real timers.
// ============================================================================

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  DeliveryWorker,
  computeBackoffMs,
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

// A scenario: one outbox event whose recipients are a mix of online/offline,
// plus a budget of transient delivery failures injected before delivery
// succeeds. A budget greater than MAX_DELIVERY_ATTEMPTS forces a dead-letter.
const scenarioArb = fc
  .record({
    // Online flags per recipient; at least one recipient always exists.
    recipients: fc.array(fc.boolean(), { minLength: 1, maxLength: 6 }),
    // Transient delivery failures to inject (0..13 spans both "eventually
    // delivered" and "dead-lettered" regimes around the max of 10).
    failureBudget: fc.integer({ min: 0, max: 13 }),
  })
  .map(({ recipients, failureBudget }) => ({
    recipientFlags: recipients,
    failureBudget,
  }));

/**
 * Drain the worker to a stable state, asserting the per-tick loop invariant on
 * every tick. Returns when no claimable, non-dead-lettered, eligible work
 * remains. The clock is advanced past the backoff cap between ticks so any
 * event awaiting a backoff window becomes eligible on the next tick — proving
 * failed events are retried (Requirement 8.6) without waiting on real timers.
 */
async function drainToCompletion(
  worker: DeliveryWorker,
  outbox: FakeOutboxService,
  clock: Clock,
): Promise<void> {
  // Mirror of the worker's private retry schedule so the test can compute which
  // claimed events are eligible (past their backoff window) on each tick.
  const nextEligibleAt = new Map<string, number>();

  for (let safety = 0; safety < 1_000; safety += 1) {
    // Events the worker will claim this tick (matches FakeOutboxService.claimBatch).
    const claimable = outbox.rows.filter(
      (r) => r.processedAt === null && r.attempts <= MAX_DELIVERY_ATTEMPTS,
    );
    // Of those, the ones past their backoff window are the ones the worker must
    // resolve this tick (the others are skipped via `continue`).
    const eligible = claimable.filter((r) => {
      const notBefore = nextEligibleAt.get(r.id);
      return notBefore === undefined || clock.now() >= notBefore;
    });

    if (eligible.length === 0) {
      // No eligible work remains: either everything is processed/dead-lettered,
      // or only backoff-windowed events remain — advancing the clock makes them
      // eligible. If even after advancing nothing is claimable, we're done.
      if (claimable.length === 0) return;
      // Snap to the earliest pending retry so the next loop makes progress.
      clock.advance(DELIVERY_BACKOFF_CAP_MS + 1);
      continue;
    }

    const beforeProcessed = outbox.markProcessedCalls;
    const beforeFailed = outbox.markFailedCalls;
    // Snapshot attempt counts so we can update our mirror schedule after the tick.
    const attemptsBefore = new Map(eligible.map((r) => [r.id, r.attempts] as const));

    await worker.tick();

    // ---- Loop invariant: every eligible claimed event was resolved ----
    const resolvedThisTick =
      outbox.markProcessedCalls - beforeProcessed + (outbox.markFailedCalls - beforeFailed);
    expect(resolvedThisTick).toBe(eligible.length);

    // Update the mirror retry schedule for any event that just failed, exactly
    // as the worker does: nextEligibleAt = now + computeBackoffMs(newAttempts).
    for (const r of eligible) {
      const wasProcessed = r.processedAt !== null;
      const failedNow = !wasProcessed && r.attempts > (attemptsBefore.get(r.id) ?? 0);
      if (failedNow) {
        nextEligibleAt.set(r.id, clock.now() + computeBackoffMs(r.attempts));
      } else if (wasProcessed) {
        nextEligibleAt.delete(r.id);
      }
    }

    // Advance time so backoff-windowed events become eligible next iteration.
    clock.advance(DELIVERY_BACKOFF_CAP_MS + 1);
  }

  throw new Error('drainToCompletion did not stabilise within the safety bound');
}

// Feature: quantchat-launch-readiness, Property 4: At-least-once delivery
// **Validates: Requirements 8.6**
describe('Feature: quantchat-launch-readiness, Property 4: At-least-once delivery', () => {
  it('eventually delivers every recipient (online via backplane, offline via push) or dead-letters, retrying failed attempts with backoff', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ recipientFlags, failureBudget }) => {
        const conversationId = 'conv-ALO';
        const messageId = 'msg-ALO';
        const recipientIds = recipientFlags.map((_, i) => `r${i}`);
        const onlineIds = recipientIds.filter((_, i) => recipientFlags[i]);
        const offlineIds = recipientIds.filter((_, i) => !recipientFlags[i]);

        const clock = new Clock(0);
        const failures = new FailureBudget(failureBudget);
        const outbox = new FakeOutboxService();
        const backplane = new FakeBackplane(failures);
        const presence = new FakePresence(onlineIds);
        const push = new FakePushDispatcher(failures);

        outbox.seed({ conversationId, messageId, recipientIds });

        const worker = new DeliveryWorker(
          { outbox, backplane, presence, pushDispatcher: push },
          { now: clock.now },
        );

        await drainToCompletion(worker, outbox, clock);

        const row = outbox.rows[0]!;
        const deadLettered = row.processedAt === null;

        if (deadLettered) {
          // Dead-letter regime: too many transient failures. The event crossed
          // the max-attempts threshold and is excluded from further claims
          // (Requirement 8.7); it is NOT marked processed.
          expect(row.attempts).toBeGreaterThan(MAX_DELIVERY_ATTEMPTS);
          expect(failureBudget).toBeGreaterThan(MAX_DELIVERY_ATTEMPTS);
        } else {
          // At-least-once delivery achieved (Requirement 8.6):
          //   * every ONLINE recipient got a realtime publish on the conversation
          //     channel (one publish per online recipient on the successful tick),
          //   * every OFFLINE recipient got a push dispatch.
          expect(backplane.publishesFor(conversationId).length).toBe(onlineIds.length);
          for (const id of offlineIds) {
            expect(push.dispatchesFor(id).length).toBeGreaterThanOrEqual(1);
          }
          // Online recipients are NOT pushed; offline recipients are NOT published-to.
          expect(push.dispatched.map((d) => d.userId).sort()).toEqual([...offlineIds].sort());
          // The number of recorded failures matches the injected budget that was
          // actually consumed before success (retries happened, Requirement 8.6).
          expect(row.attempts).toBe(failureBudget);
          expect(row.attempts).toBeLessThanOrEqual(MAX_DELIVERY_ATTEMPTS);
        }
      }),
      { numRuns: 150 },
    );
  });
});
