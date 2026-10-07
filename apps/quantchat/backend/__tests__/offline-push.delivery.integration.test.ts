// ============================================================================
// Integration test — offline-recipient push path + delivery-on-ack
// Spec: quantchat-launch-readiness, Task 25.3
// Requirement 18.4 — "THE QuantChat_Backend test suite SHALL include an
//   integration test that verifies an offline recipient triggers the push path
//   and that Message_Delivery is not marked delivered until an acknowledgement
//   is received."
// Design: Component 3 (OutboxService + DeliveryWorker + PushDispatcher),
//   Algorithm 3 ("delivery worker drain loop"), Sequence 2 ("Bob offline ->
//   enqueue push"; "delivered receipt recorded when the owning instance's
//   socket acks"), Data Model 5 (MessageDelivery).
//
// Wires the REAL DeliveryWorker (online -> backplane publish, offline ->
// PushDispatcher.dispatch) together with the REAL DeliveryReceiptService
// (records `MessageDelivery.deliveredAt` only on a socket ack). The design
// calls for `testcontainers` (offline recipient + real Postgres/Redis/web-push);
// a live stack is not available in this sandbox, so the test defaults to the
// in-memory harness (the repo's established `fake-delivery-deps` doubles +
// an in-memory MessageDelivery delegate enforcing the @@unique key). Set
// QUANTCHAT_INTEGRATION_BACKEND=testcontainers to target a real stack at the
// documented wiring point. See integration-harness.ts.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DeliveryWorker } from '../services/delivery-worker';
import {
  DeliveryReceiptService,
  type DeliveryReceipt,
  type MessageDeliveryDelegate,
} from '../services/delivery-receipt.service';
import {
  Clock,
  FakeBackplane,
  FakeOutboxService,
  FakePresence,
  FakePushDispatcher,
} from './fake-delivery-deps';
import { USE_TESTCONTAINERS, requireTestcontainers } from './integration-harness';

const CONVERSATION_ID = 'conv-offline-push';
const MESSAGE_ID = 'msg-offline';
const OFFLINE_RECIPIENT = 'bob-offline';
const ONLINE_RECIPIENT = 'carol-online';

interface Row extends DeliveryReceipt {
  id: string;
}

/**
 * In-memory MessageDelivery delegate enforcing the `@@unique([messageId, userId])`
 * constraint (design Data Model 5) so the "at most one row per pair" and
 * "not delivered until ack" guarantees are genuinely exercised. Mirrors the
 * fake used by delivery-receipt.service.test.ts.
 */
function createFakeDelivery(): { delegate: MessageDeliveryDelegate; rows: Map<string, Row> } {
  const rows = new Map<string, Row>();
  let seq = 0;
  const keyOf = (messageId: string, userId: string): string => `${messageId}::${userId}`;

  const delegate: MessageDeliveryDelegate = {
    async findUnique({ where }) {
      const row = rows.get(keyOf(where.messageId_userId.messageId, where.messageId_userId.userId));
      return row ? { ...row } : null;
    },
    async upsert({ where, create, update }) {
      const k = keyOf(where.messageId_userId.messageId, where.messageId_userId.userId);
      const existing = rows.get(k);
      if (existing) {
        if ('deliveredAt' in update) existing.deliveredAt = update.deliveredAt ?? null;
        if ('readAt' in update) existing.readAt = update.readAt ?? null;
        rows.set(k, existing);
        return { ...existing };
      }
      const row: Row = {
        id: `del_${(seq += 1)}`,
        messageId: create.messageId,
        userId: create.userId,
        deliveredAt: create.deliveredAt ?? null,
        readAt: create.readAt ?? null,
      };
      rows.set(k, row);
      return { ...row };
    },
  };

  return { delegate, rows };
}

interface DeliveryHarness {
  worker: DeliveryWorker;
  outbox: FakeOutboxService;
  push: FakePushDispatcher;
  backplane: FakeBackplane;
  presence: FakePresence;
  receipts: DeliveryReceiptService;
  deliveryRows: Map<string, Row>;
  /** Simulate a recipient socket acknowledging receipt of a message. */
  ack: (messageId: string, userId: string) => Promise<DeliveryReceipt>;
  teardown: () => Promise<void>;
}

/**
 * Build the delivery harness for the selected backend.
 *  - in-memory (default): the REAL DeliveryWorker + DeliveryReceiptService over
 *    in-memory doubles (outbox, backplane, presence, push, MessageDelivery).
 *  - testcontainers: documented wiring point for a real Postgres + Redis +
 *    web-push stack.
 */
async function createDeliveryHarness(onlineIds: string[]): Promise<DeliveryHarness> {
  if (USE_TESTCONTAINERS) {
    // ---- Real-container wiring point (Req 18.4 against a real stack) --------
    // Start testcontainers Postgres (+ Redis), run migrations, construct a real
    // PrismaOutboxService / RedisRealtimeBackplane / PresenceManager /
    // WebPushDispatcher and DeliveryReceiptService, seed an outbox row for an
    // offline recipient, and return the harness. The offline recipient (no live
    // socket on any instance) then drives the genuine push path.
    requireTestcontainers('a Postgres + Redis stack for the outbox/presence/push delivery path');
  }

  const clock = new Clock(0);
  const outbox = new FakeOutboxService();
  const backplane = new FakeBackplane();
  const presence = new FakePresence(onlineIds);
  const push = new FakePushDispatcher();
  const worker = new DeliveryWorker(
    { outbox, backplane, presence, pushDispatcher: push },
    { now: clock.now },
  );

  const { delegate, rows } = createFakeDelivery();
  const receipts = new DeliveryReceiptService({ messageDelivery: delegate } as never);

  return {
    worker,
    outbox,
    push,
    backplane,
    presence,
    receipts,
    deliveryRows: rows,
    ack: (messageId, userId) => receipts.recordDelivered(messageId, userId),
    teardown: async () => {
      /* in-memory harness holds no external resources */
    },
  };
}

describe('Integration: offline recipient push path + delivery-on-ack (Task 25.3, Requirement 18.4)', () => {
  let harness: DeliveryHarness;

  beforeEach(async () => {
    // Bob is offline everywhere; no recipients start online.
    harness = await createDeliveryHarness([]);
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('hands an offline recipient to the push path and does NOT mark MessageDelivery delivered', async () => {
    harness.outbox.seed({
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      recipientIds: [OFFLINE_RECIPIENT],
    });

    const processed = await harness.worker.tick();

    // The outbox event was drained (delivery intent handled this tick).
    expect(processed).toBe(1);

    // CORE GUARANTEE part 1 (Req 18.4): the offline recipient triggered the
    // push path — PushDispatcher.dispatch was invoked for that user with a
    // generic, plaintext-free body.
    const dispatches = harness.push.dispatchesFor(OFFLINE_RECIPIENT);
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0].notification.conversationId).toBe(CONVERSATION_ID);
    expect(dispatches[0].notification.body).toBe('New message'); // no plaintext

    // Offline path must NOT publish to the realtime backplane.
    expect(harness.backplane.publishesFor(CONVERSATION_ID)).toHaveLength(0);

    // CORE GUARANTEE part 2 (Req 18.4): MessageDelivery is NOT marked delivered
    // by the push dispatch — no MessageDelivery row exists at all until an ack.
    expect(harness.deliveryRows.size).toBe(0);
    expect(harness.deliveryRows.has(`${MESSAGE_ID}::${OFFLINE_RECIPIENT}`)).toBe(false);
  });

  it('marks MessageDelivery delivered only once an acknowledgement is received', async () => {
    harness.outbox.seed({
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      recipientIds: [OFFLINE_RECIPIENT],
    });

    await harness.worker.tick();

    // Pre-ack: nothing delivered.
    expect(harness.deliveryRows.size).toBe(0);

    // The recipient comes online and its socket acknowledges receipt.
    const receipt = await harness.ack(MESSAGE_ID, OFFLINE_RECIPIENT);

    // Post-ack: exactly one MessageDelivery row, now stamped delivered (Req 10.1).
    expect(harness.deliveryRows.size).toBe(1);
    expect(receipt.deliveredAt).toBeInstanceOf(Date);
    expect(receipt.readAt).toBeNull();
    const stored = harness.deliveryRows.get(`${MESSAGE_ID}::${OFFLINE_RECIPIENT}`)!;
    expect(stored.deliveredAt).toBeInstanceOf(Date);
  });

  it('online recipient is fanned out via the backplane and is also not marked delivered until ack', async () => {
    // Rebuild the harness with one online recipient.
    await harness.teardown();
    harness = await createDeliveryHarness([ONLINE_RECIPIENT]);

    harness.outbox.seed({
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      recipientIds: [ONLINE_RECIPIENT],
    });

    await harness.worker.tick();

    // Online path publishes to the backplane and does NOT push.
    expect(harness.backplane.publishesFor(CONVERSATION_ID)).toHaveLength(1);
    expect(harness.push.dispatchesFor(ONLINE_RECIPIENT)).toHaveLength(0);

    // Still not marked delivered until the owning instance's socket acks.
    expect(harness.deliveryRows.size).toBe(0);

    const receipt = await harness.ack(MESSAGE_ID, ONLINE_RECIPIENT);
    expect(harness.deliveryRows.size).toBe(1);
    expect(receipt.deliveredAt).toBeInstanceOf(Date);
  });

  it('mixed recipients: offline pushed, online published, neither delivered until their own ack', async () => {
    await harness.teardown();
    harness = await createDeliveryHarness([ONLINE_RECIPIENT]);

    harness.outbox.seed({
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      recipientIds: [OFFLINE_RECIPIENT, ONLINE_RECIPIENT],
    });

    await harness.worker.tick();

    // Offline -> push; online -> backplane publish.
    expect(harness.push.dispatchesFor(OFFLINE_RECIPIENT)).toHaveLength(1);
    expect(harness.backplane.publishesFor(CONVERSATION_ID)).toHaveLength(1);
    expect(harness.deliveryRows.size).toBe(0);

    // Only the recipient who acks is marked delivered.
    await harness.ack(MESSAGE_ID, OFFLINE_RECIPIENT);
    expect(harness.deliveryRows.size).toBe(1);
    expect(harness.deliveryRows.has(`${MESSAGE_ID}::${OFFLINE_RECIPIENT}`)).toBe(true);
    expect(harness.deliveryRows.has(`${MESSAGE_ID}::${ONLINE_RECIPIENT}`)).toBe(false);
  });
});
