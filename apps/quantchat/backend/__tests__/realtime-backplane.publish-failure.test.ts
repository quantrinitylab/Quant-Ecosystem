// ============================================================================
// Unit test — RealtimeBackplane publish-failure local fallback
// Spec: quantchat-launch-readiness, Task 6.4
// Design: Component 2 (RealtimeBackplane), Algorithm 4, Error Handling table.
//
//   Requirement 4.7 — IF publishing a room event to the Realtime_Backplane
//   fails, THEN the QuantChat_Backend SHALL deliver the event to the local
//   sockets in that conversation room AND SHALL record the publish failure for
//   retry.
//
// The harness's `publishRoomEvent` replicates websocket.ts: local delivery runs
// FIRST, then the backplane publish is attempted; a publish rejection is caught
// and recorded (it does not block or undo local delivery).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { InMemoryBus, InstanceNode, FakeSocket } from './fake-realtime-bus';

const CONVERSATION_ID = 'conv-publish-failure';

describe('RealtimeBackplane publish-failure local fallback (Task 6.4, Requirement 4.7)', () => {
  it('delivers the event to local sockets even when backplane.publish rejects', async () => {
    const bus = new InMemoryBus();
    const instance = new InstanceNode(bus, 'inst-local');

    const a = new FakeSocket('a');
    const b = new FakeSocket('b');
    await instance.joinRoom(CONVERSATION_ID, a);
    await instance.joinRoom(CONVERSATION_ID, b);

    // Simulate the backplane being unavailable.
    instance.backplane.failPublishWith = new Error('backplane unavailable');

    const payload = { type: 'new_message', data: { id: 1 } };
    await instance.publishRoomEvent(CONVERSATION_ID, 'new_message', payload);

    // Local sockets STILL received the event exactly once.
    expect(a.receiptCount(payload)).toBe(1);
    expect(b.receiptCount(payload)).toBe(1);
  });

  it('records the publish failure for retry (conversation id + error)', async () => {
    const bus = new InMemoryBus();
    const instance = new InstanceNode(bus, 'inst-local');

    const a = new FakeSocket('a');
    await instance.joinRoom(CONVERSATION_ID, a);

    const boom = new Error('backplane unavailable');
    instance.backplane.failPublishWith = boom;

    const payload = { type: 'new_message', data: { id: 2 } };
    await instance.publishRoomEvent(CONVERSATION_ID, 'new_message', payload);

    // Exactly one failure recorded, carrying the conversation id and the error.
    expect(instance.publishFailures).toHaveLength(1);
    expect(instance.publishFailures[0].conversationId).toBe(CONVERSATION_ID);
    expect(instance.publishFailures[0].error).toBe(boom);
    // And local delivery still happened.
    expect(a.receiptCount(payload)).toBe(1);
  });

  it('does not deliver to peer instances when publish fails (failure is isolated to the bus)', async () => {
    const bus = new InMemoryBus();
    const origin = new InstanceNode(bus, 'inst-origin');
    const peer = new InstanceNode(bus, 'inst-peer');

    const local = new FakeSocket('local');
    const remote = new FakeSocket('remote');
    await origin.joinRoom(CONVERSATION_ID, local);
    await peer.joinRoom(CONVERSATION_ID, remote);

    origin.backplane.failPublishWith = new Error('backplane unavailable');

    const payload = { type: 'new_message', data: { id: 3 } };
    await origin.publishRoomEvent(CONVERSATION_ID, 'new_message', payload);

    // Local socket on the origin still gets it; the peer's socket does not
    // (the publish never reached the bus), and the failure is recorded so the
    // delivery worker can retry later (Requirement 4.7).
    expect(local.receiptCount(payload)).toBe(1);
    expect(remote.inbox).toHaveLength(0);
    expect(origin.publishFailures).toHaveLength(1);
  });

  it('successful publish after recovery delivers to peers with no recorded failure', async () => {
    const bus = new InMemoryBus();
    const origin = new InstanceNode(bus, 'inst-origin');
    const peer = new InstanceNode(bus, 'inst-peer');

    const local = new FakeSocket('local');
    const remote = new FakeSocket('remote');
    await origin.joinRoom(CONVERSATION_ID, local);
    await peer.joinRoom(CONVERSATION_ID, remote);

    // Backplane healthy (no failure injected).
    const payload = { type: 'new_message', data: { id: 4 } };
    await origin.publishRoomEvent(CONVERSATION_ID, 'new_message', payload);

    // Exactly-once across instances, and nothing recorded as failed.
    expect(local.receiptCount(payload)).toBe(1);
    expect(remote.receiptCount(payload)).toBe(1);
    expect(origin.publishFailures).toHaveLength(0);
  });
});
