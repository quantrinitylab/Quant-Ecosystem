// ============================================================================
// Integration test — two-instance cross-backplane message delivery
// Spec: quantchat-launch-readiness, Task 25.2
// Requirement 18.3 — "THE QuantChat_Backend test suite SHALL include an
//   integration test that verifies a message sent on one instance reaches a
//   socket connected to a different instance via the Realtime_Backplane."
// Design: Component 2 (RealtimeBackplane), Algorithm 4 ("cross-instance
//   fan-out"), Sequence 2 ("Cross-instance message delivery"), Correctness
//   Property 5 ("Cross-instance exactly-once fan-out").
//
// Two backend instance harnesses (InstanceNode) share ONE backplane bus
// (InMemoryBus) — the same wiring as `routes/websocket.ts` (LOCAL room registry
// per instance + a RealtimeBackplane subscribed to the shared channel). The
// design calls for `testcontainers` (2 backend instances + a real Redis); a
// live Redis is not available in this sandbox, so the test defaults to the
// shared-bus harness, which routes a published event to every subscribed
// instance exactly like Redis pub/sub (origin included, so the
// `originInstanceId` de-dup is load-bearing). Set
// QUANTCHAT_INTEGRATION_BACKEND=testcontainers to target real instances + Redis
// at the documented wiring point. See integration-harness.ts.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemoryBus, InstanceNode, FakeSocket } from './fake-realtime-bus';
import { USE_TESTCONTAINERS, requireTestcontainers } from './integration-harness';

const CONVERSATION_ID = 'conv-cross-instance';

interface ClusterHarness {
  /** Instance A (publishes the message). */
  instanceA: InstanceNode;
  /** Instance B (hosts the recipient socket). */
  instanceB: InstanceNode;
  teardown: () => Promise<void>;
}

/**
 * Build a two-instance cluster sharing one backplane for the selected backend.
 *  - in-memory (default): two InstanceNodes over a shared InMemoryBus — the
 *    REAL RealtimeBackplane interface + the verbatim websocket.ts fan-out logic.
 *  - testcontainers: documented wiring point for two real backend instances
 *    connected to a real Redis container.
 */
async function createClusterHarness(): Promise<ClusterHarness> {
  if (USE_TESTCONTAINERS) {
    // ---- Real-container wiring point (Req 18.3 against real Redis) ----------
    // Start a testcontainers Redis, construct two ioredis clients and two
    // `RedisRealtimeBackplane` instances (distinct Instance_Ids), stand up two
    // app instances wired to them, and return the pair. The two instances then
    // fan out across a genuine Redis pub/sub channel.
    requireTestcontainers('two backend instances + a Redis container sharing one backplane');
  }

  const bus = new InMemoryBus();
  const instanceA = new InstanceNode(bus, 'instance-A');
  const instanceB = new InstanceNode(bus, 'instance-B');
  return {
    instanceA,
    instanceB,
    teardown: async () => {
      await instanceA.backplane.shutdown();
      await instanceB.backplane.shutdown();
    },
  };
}

describe('Integration: two-instance cross-backplane delivery (Task 25.2, Requirement 18.3)', () => {
  let cluster: ClusterHarness;

  beforeEach(async () => {
    cluster = await createClusterHarness();
  });

  afterEach(async () => {
    await cluster.teardown();
  });

  it('delivers a message published on Instance A to a socket connected to Instance B', async () => {
    // Bob's socket connects to Instance B and joins the conversation room there
    // (which subscribes Instance B to the shared channel — Requirement 4.1).
    const bobSocket = new FakeSocket('bob@B');
    await cluster.instanceB.joinRoom(CONVERSATION_ID, bobSocket);

    // Alice sends a message on Instance A (she has no local socket in the room
    // on A, so this exercises a pure cross-instance hop).
    const messagePayload = {
      type: 'new_message',
      data: { messageId: 'msg-1', conversationId: CONVERSATION_ID, text: '<ciphertext>' },
    };
    await cluster.instanceA.publishRoomEvent(CONVERSATION_ID, 'new_message', messagePayload);

    // CORE GUARANTEE (Req 18.3): the message crossed the backplane and reached
    // the socket connected to the OTHER instance — exactly once.
    expect(bobSocket.receiptCount(messagePayload)).toBe(1);
    expect(bobSocket.inbox).toHaveLength(1);
    expect(JSON.parse(bobSocket.inbox[0])).toEqual(messagePayload);
  });

  it('delivers to recipients on BOTH instances exactly once (origin-local + cross-instance)', async () => {
    // One socket on the publishing instance (A) and one on the peer instance (B).
    const aliceSocket = new FakeSocket('alice@A');
    const bobSocket = new FakeSocket('bob@B');
    await cluster.instanceA.joinRoom(CONVERSATION_ID, aliceSocket);
    await cluster.instanceB.joinRoom(CONVERSATION_ID, bobSocket);

    const payload = { type: 'new_message', data: { messageId: 'msg-2' } };
    await cluster.instanceA.publishRoomEvent(CONVERSATION_ID, 'new_message', payload);

    // Local socket on A receives it once (delivered locally at publish time);
    // the origin's own backplane echo is suppressed via originInstanceId (Req 4.4).
    expect(aliceSocket.receiptCount(payload)).toBe(1);
    expect(aliceSocket.inbox).toHaveLength(1);
    // Remote socket on B receives it once via the backplane (Req 4.5/4.6).
    expect(bobSocket.receiptCount(payload)).toBe(1);
    expect(bobSocket.inbox).toHaveLength(1);
  });

  it('is symmetric: a message published on Instance B reaches a socket on Instance A', async () => {
    const aliceSocket = new FakeSocket('alice@A');
    await cluster.instanceA.joinRoom(CONVERSATION_ID, aliceSocket);

    const payload = { type: 'new_message', data: { messageId: 'msg-3', from: 'B' } };
    await cluster.instanceB.publishRoomEvent(CONVERSATION_ID, 'new_message', payload);

    expect(aliceSocket.receiptCount(payload)).toBe(1);
    expect(aliceSocket.inbox).toHaveLength(1);
  });

  it('does not deliver to a socket on Instance B that has left the conversation room', async () => {
    const bobSocket = new FakeSocket('bob@B');
    await cluster.instanceB.joinRoom(CONVERSATION_ID, bobSocket);
    // Bob disconnects — last socket leaving unsubscribes Instance B (Req 4.2).
    await cluster.instanceB.leaveAllRooms(bobSocket);

    const payload = { type: 'new_message', data: { messageId: 'msg-4' } };
    await cluster.instanceA.publishRoomEvent(CONVERSATION_ID, 'new_message', payload);

    // No subscription on B -> the event is not delivered to the departed socket.
    expect(bobSocket.inbox).toHaveLength(0);
  });
});
