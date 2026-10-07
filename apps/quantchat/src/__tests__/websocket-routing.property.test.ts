// ============================================================================
// QuantChat - Real-Time WebSocket Routing Property Tests (Task 16.7)
//
// Property-based tests for the multiplexing event router that backs the single
// persistent WebSocket connection (RealtimeProvider -> ChannelRouter):
//   - Property 41: WebSocket delivers all event types
//   - Property 42: Multiplexed channels over single connection
//
// The pure dispatch core lives in providers/eventRouter.ts (ChannelRouter),
// which RealtimeProvider uses for routeEvent/subscribe. Generators are seeded
// and deterministic (mulberry32) and run over >= 100 generated cases each.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { ChannelRouter, type RoutableEvent } from '../providers/eventRouter';

// ---------------------------------------------------------------------------
// Seeded deterministic PRNG (mulberry32) so failures are reproducible.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

const CASES = 200; // > 100 generated cases per property

/** The 7 multiplexed real-time channels / event types. */
const CHANNELS = [
  'messages',
  'typing',
  'presence',
  'location',
  'calls',
  'notifications',
  'streaks',
] as const;

interface TestEvent extends RoutableEvent {
  channel: string;
  type: string;
  payload: { id: number; nonce: number };
}

function makeEvent(channel: string, id: number, nonce: number): TestEvent {
  return { channel, type: `${channel}:evt`, payload: { id, nonce } };
}

describe('WebSocket routing property tests', () => {
  // -------------------------------------------------------------------------
  // Property 41: WebSocket delivers all event types
  // -------------------------------------------------------------------------
  // Feature: quantchat-mega-upgrade, Property 41: publishing on any of the 7 channels delivers to all connected+subscribed handlers exactly once.
  it('Property 41: each channel delivers a routed event to all N subscribed handlers exactly once', () => {
    const rng = mulberry32(0x41_0000);
    for (let n = 0; n < CASES; n++) {
      const channel = CHANNELS[randInt(rng, 0, CHANNELS.length - 1)];
      const router = new ChannelRouter<TestEvent>();

      // Register N handlers on the chosen channel (one connection, many subscribers).
      const numHandlers = randInt(rng, 1, 8);
      const received: TestEvent[][] = [];
      for (let h = 0; h < numHandlers; h++) {
        const inbox: TestEvent[] = [];
        received.push(inbox);
        router.subscribe(channel, (e) => {
          inbox.push(e);
        });
      }

      const nonce = randInt(rng, 0, 1_000_000);
      const event = makeEvent(channel, n, nonce);
      const delivered = router.route(event);

      // Every handler received it exactly once with the correct payload.
      expect(delivered).toBe(numHandlers);
      for (const inbox of received) {
        expect(inbox.length).toBe(1);
        expect(inbox[0]).toBe(event);
        expect(inbox[0].channel).toBe(channel);
        expect(inbox[0].payload.nonce).toBe(nonce);
      }
    }
  });

  // Feature: quantchat-mega-upgrade, Property 41: publishing on any of the 7 channels delivers to all connected+subscribed handlers exactly once.
  it('Property 41: every one of the 7 channel types is independently deliverable', () => {
    const rng = mulberry32(0x41_1111);
    for (const channel of CHANNELS) {
      const router = new ChannelRouter<TestEvent>();
      const inbox: TestEvent[] = [];
      router.subscribe(channel, (e) => {
        inbox.push(e);
      });

      const nonce = randInt(rng, 0, 1_000_000);
      const event = makeEvent(channel, 0, nonce);
      router.route(event);

      expect(inbox.length).toBe(1);
      expect(inbox[0].channel).toBe(channel);
      expect(inbox[0].payload.nonce).toBe(nonce);
    }
  });

  // -------------------------------------------------------------------------
  // Property 42: Multiplexed channels over single connection
  // -------------------------------------------------------------------------
  // Feature: quantchat-mega-upgrade, Property 42: a single connection (router) multiplexes a subset of channels; every event reaches exactly its channel's handlers and never leaks across channels.
  it('Property 42: a single router multiplexes a channel subset with no cross-channel leakage', () => {
    const rng = mulberry32(0x42_0000);
    for (let n = 0; n < CASES; n++) {
      // One router models one client's single WebSocket connection.
      const router = new ChannelRouter<TestEvent>();

      // Subscribe to a random NON-EMPTY subset of channels, each with >=1 handler.
      const subscribed = CHANNELS.filter(() => rng() < 0.5);
      if (subscribed.length === 0) {
        subscribed.push(CHANNELS[randInt(rng, 0, CHANNELS.length - 1)]);
      }

      // Per-channel inboxes (sum across that channel's handlers).
      const inboxes = new Map<string, TestEvent[]>();
      const handlerCount = new Map<string, number>();
      for (const channel of subscribed) {
        const inbox: TestEvent[] = [];
        inboxes.set(channel, inbox);
        const numHandlers = randInt(rng, 1, 4);
        handlerCount.set(channel, numHandlers);
        for (let h = 0; h < numHandlers; h++) {
          router.subscribe(channel, (e) => {
            inbox.push(e);
          });
        }
      }

      // Build a random interleaving of events across ALL channels (incl. ones
      // the client did not subscribe to — those must never be delivered).
      const numEvents = randInt(rng, 1, 40);
      const expectedPerChannel = new Map<string, number>();
      for (let i = 0; i < numEvents; i++) {
        const channel = CHANNELS[randInt(rng, 0, CHANNELS.length - 1)];
        const event = makeEvent(channel, i, randInt(rng, 0, 1_000_000));
        const delivered = router.route(event);

        const handlers = handlerCount.get(channel) ?? 0;
        // Delivered to exactly the number of handlers on that channel.
        expect(delivered).toBe(handlers);
        if (handlers > 0) {
          expectedPerChannel.set(channel, (expectedPerChannel.get(channel) ?? 0) + 1);
        }
      }

      // Each subscribed channel's inbox holds exactly (#events on it * #handlers),
      // and every delivered event matches the channel it arrived on (no leakage).
      for (const channel of subscribed) {
        const inbox = inboxes.get(channel)!;
        const handlers = handlerCount.get(channel)!;
        const expectedEvents = expectedPerChannel.get(channel) ?? 0;
        expect(inbox.length).toBe(expectedEvents * handlers);
        for (const e of inbox) {
          expect(e.channel).toBe(channel);
        }
      }

      // No handler ever observed an event for a different channel.
      const subscribedSet = new Set<string>(subscribed);
      for (const channel of CHANNELS) {
        if (subscribedSet.has(channel)) continue;
        expect(inboxes.has(channel)).toBe(false);
      }
    }
  });

  // Feature: quantchat-mega-upgrade, Property 42: a single connection (router) multiplexes a subset of channels; every event reaches exactly its channel's handlers and never leaks across channels.
  it('Property 42: unsubscribing stops delivery without affecting other multiplexed channels', () => {
    const rng = mulberry32(0x42_2222);
    for (let n = 0; n < CASES; n++) {
      const router = new ChannelRouter<TestEvent>();
      const a = CHANNELS[randInt(rng, 0, CHANNELS.length - 1)];
      let b = CHANNELS[randInt(rng, 0, CHANNELS.length - 1)];
      while (b === a) b = CHANNELS[randInt(rng, 0, CHANNELS.length - 1)];

      const inboxA: TestEvent[] = [];
      const inboxB: TestEvent[] = [];
      const offA = router.subscribe(a, (e) => {
        inboxA.push(e);
      });
      router.subscribe(b, (e) => {
        inboxB.push(e);
      });

      router.route(makeEvent(a, 0, 1));
      router.route(makeEvent(b, 1, 2));
      expect(inboxA.length).toBe(1);
      expect(inboxB.length).toBe(1);

      // Unsubscribe channel A's only handler — A goes silent, B keeps flowing.
      offA();
      expect(router.hasChannel(a)).toBe(false);
      router.route(makeEvent(a, 2, 3));
      router.route(makeEvent(b, 3, 4));
      expect(inboxA.length).toBe(1); // unchanged
      expect(inboxB.length).toBe(2);
    }
  });
});
