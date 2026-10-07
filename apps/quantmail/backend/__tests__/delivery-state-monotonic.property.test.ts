// @vitest-environment node
// ============================================================================
// Task 6.3 — Property test: delivery state transitions are monotonic
// quantmail-superhub · Phase 2 — Gmail-grade Delivery (Pillar 1)
// ============================================================================
//
// Feature: quantmail-superhub, Property 2: delivery state transitions are monotonic
//
// **Property P2 (monotonic delivery state)** — for any sequence of delivery
// events, each recipient's Delivery_State only advances toward a terminal state
// (queued -> sent/deferred -> bounced/delivered) and NEVER regresses. Equivalently,
// the monotonic guard `advanceDeliveryState` never lowers a state's rank, and the
// folded result over any event sequence equals the highest-ranked (most-advanced)
// state seen so far.
//
// **Validates: Requirements 4.5**
//
// HARNESS: tests the REAL pure helpers exported by the task-6.2 delivery worker
// (`advanceDeliveryState`, `summarizeEmailDeliveryState`, `DELIVERY_STATE_RANK`).
// No mocks, no network — these are the exact functions the worker uses to record
// per-recipient `DeliveryAttempt` rows and the email-level `deliveryStatus`.
// Library: fast-check, >= 100 runs per property (the ecosystem's JS
// property-testing tool).

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  advanceDeliveryState,
  summarizeEmailDeliveryState,
  DELIVERY_STATE_RANK,
  type DeliveryState,
  type AttemptStatus,
} from '../services/delivery-worker.service';

// ----------------------------------------------------------------------------
// Generators — the full delivery lifecycle alphabet. A "delivery event" is any
// candidate state the worker might try to record for a recipient (or for the
// email overall); P2 must hold for ANY ordering of these, including illegal /
// out-of-order ones (e.g. trying to regress delivered -> queued).
// ----------------------------------------------------------------------------
const DELIVERY_STATES: DeliveryState[] = [
  'draft',
  'queued',
  'deferred',
  'sent',
  'bounced',
  'delivered',
];
const ATTEMPT_STATES: AttemptStatus[] = ['queued', 'sent', 'deferred', 'bounced'];

const deliveryStateArb: fc.Arbitrary<DeliveryState> = fc.constantFrom(...DELIVERY_STATES);
const attemptStatusArb: fc.Arbitrary<AttemptStatus> = fc.constantFrom(...ATTEMPT_STATES);

/** Reorder `items` by the companion sort `keys` — used to prove order-independence. */
function reorderBy<T>(items: T[], keys: number[]): T[] {
  return items
    .map((value, index) => ({ value, key: keys[index] ?? 0, index }))
    .sort((a, b) => (a.key === b.key ? a.index - b.index : a.key - b.key))
    .map((entry) => entry.value);
}

describe('Feature: quantmail-superhub, Property 2: delivery state transitions are monotonic', () => {
  // P2 core: a single transition never regresses, and only advances when the
  // candidate is strictly higher-ranked (otherwise the current state is kept).
  it('advanceDeliveryState never lowers rank in a single step (Req 4.5)', () => {
    fc.assert(
      fc.property(deliveryStateArb, deliveryStateArb, (current, candidate) => {
        const next = advanceDeliveryState(current, candidate);

        // Never regresses: resulting rank is >= the current rank.
        expect(DELIVERY_STATE_RANK[next]).toBeGreaterThanOrEqual(DELIVERY_STATE_RANK[current]);

        // The result is always one of the two inputs (no fabricated state).
        expect([current, candidate]).toContain(next);

        // Advances iff the candidate has a strictly higher rank; otherwise holds.
        if (DELIVERY_STATE_RANK[candidate] > DELIVERY_STATE_RANK[current]) {
          expect(next).toBe(candidate);
        } else {
          expect(next).toBe(current);
        }
      }),
      { numRuns: 300 },
    );
  });

  // P2 over a whole sequence of events: folding any event stream through the
  // guard is monotonically non-decreasing in rank, and the final state's rank
  // equals the max rank seen so far (monotonic toward a terminal state).
  it('folding any event sequence never regresses and settles at the max-rank state (Req 4.5)', () => {
    fc.assert(
      fc.property(
        deliveryStateArb,
        fc.array(deliveryStateArb, { maxLength: 40 }),
        (initial, events) => {
          let current = initial;
          let maxRankSeen = DELIVERY_STATE_RANK[initial];

          for (const event of events) {
            const next = advanceDeliveryState(current, event);

            // Step never regresses below where we already were.
            expect(DELIVERY_STATE_RANK[next]).toBeGreaterThanOrEqual(DELIVERY_STATE_RANK[current]);

            maxRankSeen = Math.max(maxRankSeen, DELIVERY_STATE_RANK[event]);
            current = next;
          }

          // The resulting state equals (in rank) the most-advanced state ever
          // seen — it tracked the high-water mark and never fell back.
          expect(DELIVERY_STATE_RANK[current]).toBe(maxRankSeen);
        },
      ),
      { numRuns: 200 },
    );
  });

  // P2 invariance to ordering: the high-water-mark outcome depends only on the
  // SET of events, not the order they arrive in (out-of-order SMTP callbacks
  // must not change the final rank).
  it('final delivery rank is independent of event arrival order (Req 4.5)', () => {
    fc.assert(
      fc.property(
        fc.array(deliveryStateArb, { minLength: 1, maxLength: 30 }),
        fc.array(fc.integer(), { maxLength: 30 }),
        (events, keys) => {
          const fold = (seq: DeliveryState[]): DeliveryState =>
            seq.reduce((acc, ev) => advanceDeliveryState(acc, ev), 'queued' as DeliveryState);

          const ordered = fold(events);
          const reordered = fold(reorderBy(events, keys));

          expect(DELIVERY_STATE_RANK[reordered]).toBe(DELIVERY_STATE_RANK[ordered]);
        },
      ),
      { numRuns: 200 },
    );
  });

  // summarizeEmailDeliveryState: the email-level rollup over a random per-recipient
  // state set always yields a valid "weakest-link" summary and is order-independent.
  it('summarizeEmailDeliveryState honors weakest-link semantics for any recipient set (Req 4.5)', () => {
    fc.assert(
      fc.property(fc.array(attemptStatusArb, { maxLength: 25 }), (states) => {
        const summary = summarizeEmailDeliveryState(states);

        // Always a valid email-level state.
        expect(['queued', 'deferred', 'bounced', 'sent']).toContain(summary);

        // Documented precedence: any in-flight recipient holds the whole email
        // back (queued > deferred), an all-bounced send is bounced, else sent.
        if (states.length === 0) {
          expect(summary).toBe('queued');
        } else if (states.some((s) => s === 'queued')) {
          expect(summary).toBe('queued');
        } else if (states.some((s) => s === 'deferred')) {
          expect(summary).toBe('deferred');
        } else if (states.every((s) => s === 'bounced')) {
          expect(summary).toBe('bounced');
        } else {
          expect(summary).toBe('sent');
        }
      }),
      { numRuns: 200 },
    );
  });

  it('summarizeEmailDeliveryState is independent of recipient ordering (Req 4.5)', () => {
    fc.assert(
      fc.property(
        fc.array(attemptStatusArb, { maxLength: 25 }),
        fc.array(fc.integer(), { maxLength: 25 }),
        (states, keys) => {
          expect(summarizeEmailDeliveryState(reorderBy(states, keys))).toBe(
            summarizeEmailDeliveryState(states),
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  // End-to-end model of the worker's email-level state machine: across repeated
  // delivery passes (each pass summarizing the current per-recipient set, then
  // advancing the persisted status), the email's deliveryStatus never regresses.
  // This mirrors `DeliveryWorker.finalizeEmailState` exactly.
  it('email-level deliveryStatus never regresses across repeated delivery passes (Req 4.5)', () => {
    fc.assert(
      fc.property(
        deliveryStateArb,
        fc.array(fc.array(attemptStatusArb, { maxLength: 8 }), { maxLength: 20 }),
        (initial, passes) => {
          let current = initial;

          for (const recipientStates of passes) {
            const summary = summarizeEmailDeliveryState(recipientStates);
            const next = advanceDeliveryState(current, summary);

            expect(DELIVERY_STATE_RANK[next]).toBeGreaterThanOrEqual(DELIVERY_STATE_RANK[current]);
            current = next;
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
