// ============================================================================
// Property test — RealtimeBackplane cross-instance exactly-once fan-out
// Spec: quantchat-launch-readiness, Task 6.3
// Design: Correctness Property 5 ("Cross-instance exactly-once fan-out"),
//         Component 2 (RealtimeBackplane), Algorithm 4 (cross-instance fan-out).
//
//   Property 5 — for any cluster size M and any distribution of member sockets
//   across those instances (all subscribed to one conversation), publishing a
//   room event from one instance delivers it to EACH member socket EXACTLY ONCE:
//     * the origin instance delivers locally at publish time;
//     * peer instances deliver via the backplane;
//     * the `originInstanceId` de-dup stops the origin double-delivering its own
//       echo back over the shared bus (Requirement 4.4).
//
// Library: fast-check (per the design's Testing Strategy), minimum 100 runs.
// Harness: an in-memory shared bus that routes a published event to all
// subscribed instances (origin included), exactly like Redis pub/sub.
// ============================================================================

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { InMemoryBus, InstanceNode, FakeSocket } from './fake-realtime-bus';

const CONVERSATION_ID = 'conv-fanout';

// Feature: quantchat-launch-readiness, Property 5: Cross-instance exactly-once fan-out
// **Validates: Requirements 4.6**
describe('Feature: quantchat-launch-readiness, Property 5: Cross-instance exactly-once fan-out', () => {
  it('each member socket receives a published room event exactly once, regardless of cluster size or socket distribution', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Cluster of M instances sharing one pub/sub channel.
        fc.integer({ min: 1, max: 6 }),
        // For each member socket, the index of the instance that hosts it.
        // (At least one socket; up to 24 spread across the cluster.)
        fc.array(fc.nat({ max: 5 }), { minLength: 1, maxLength: 24 }),
        // Which instance originates the publish.
        fc.nat({ max: 5 }),
        // A nonce so each run's payload is distinct.
        fc.integer({ min: 0, max: 1_000_000 }),
        async (instanceCount, hostIndices, originRaw, nonce) => {
          const bus = new InMemoryBus();
          const instances = Array.from(
            { length: instanceCount },
            (_, i) => new InstanceNode(bus, `inst-${i}`),
          );

          // Distribute member sockets across the cluster; every socket joins the
          // one conversation room on its host instance (which subscribes the
          // instance to the shared channel — Requirement 4.1).
          const sockets: FakeSocket[] = [];
          for (let s = 0; s < hostIndices.length; s++) {
            const host = instances[hostIndices[s] % instanceCount];
            const socket = new FakeSocket(`sock-${s}`);
            sockets.push(socket);
            await host.joinRoom(CONVERSATION_ID, socket);
          }

          // One instance publishes a single room event to the whole cluster.
          const origin = instances[originRaw % instanceCount];
          const payload = { type: 'new_message', data: { id: nonce } };
          await origin.publishRoomEvent(CONVERSATION_ID, 'new_message', payload);

          // EXACTLY ONCE: every member socket received the payload precisely once.
          for (const socket of sockets) {
            expect(socket.receiptCount(payload)).toBe(1);
            expect(socket.inbox).toHaveLength(1);
          }
          // Cluster-wide receipt total equals the number of member sockets.
          const totalReceipts = sockets.reduce((sum, s) => sum + s.inbox.length, 0);
          expect(totalReceipts).toBe(sockets.length);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('a sequence of events from arbitrary instances delivers each event exactly once to every member socket', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.array(fc.nat({ max: 4 }), { minLength: 1, maxLength: 16 }),
        // A list of (originInstanceIndex, nonce) pairs — one per published event.
        fc.array(
          fc.record({ origin: fc.nat({ max: 4 }), nonce: fc.integer({ min: 0, max: 1_000_000 }) }),
          { minLength: 1, maxLength: 12 },
        ),
        async (instanceCount, hostIndices, events) => {
          const bus = new InMemoryBus();
          const instances = Array.from(
            { length: instanceCount },
            (_, i) => new InstanceNode(bus, `inst-${i}`),
          );

          const sockets: FakeSocket[] = [];
          for (let s = 0; s < hostIndices.length; s++) {
            const host = instances[hostIndices[s] % instanceCount];
            const socket = new FakeSocket(`sock-${s}`);
            sockets.push(socket);
            await host.joinRoom(CONVERSATION_ID, socket);
          }

          // Distinct payloads (dedupe nonces so receiptCount per payload is unambiguous).
          const payloads = events.map((e, i) => ({
            type: 'new_message',
            data: { seq: i, nonce: e.nonce },
          }));
          for (let i = 0; i < events.length; i++) {
            const origin = instances[events[i].origin % instanceCount];
            await origin.publishRoomEvent(CONVERSATION_ID, 'new_message', payloads[i]);
          }

          // Each socket received every event exactly once, and nothing extra.
          for (const socket of sockets) {
            for (const payload of payloads) {
              expect(socket.receiptCount(payload)).toBe(1);
            }
            expect(socket.inbox).toHaveLength(payloads.length);
          }
        },
      ),
      { numRuns: 120 },
    );
  });
});
