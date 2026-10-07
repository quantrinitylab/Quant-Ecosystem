// ============================================================================
// Unit test — RealtimeBackplane degraded single-node fallback + reconnect
// Spec: quantchat-launch-readiness, Task 8
// Design: Component 2 (RealtimeBackplane), Error Handling "Redis/NATS unavailable".
//
//   Requirement 6.1 — IF the backplane connection fails at startup, THEN start
//     in single-node mode and report DEGRADED on the health endpoint.
//   Requirement 6.2 — WHEN the connection is restored, reconnect with
//     exponential backoff (1s → cap 30s), re-subscribe to all active
//     conversation channels (and the presence channel), and report HEALTHY.
//   Requirement 6.3 — WHILE unavailable, keep delivering to same-instance
//     sockets (publishes short-circuit to local-only rather than erroring).
//
// A live Redis is unavailable in the sandbox, so — mirroring the repo's
// fake-key-prisma / fake-realtime-bus approach — these tests drive a faithful
// EventEmitter-based fake of the ioredis surface RedisRealtimeBackplane uses
// (`duplicate`, `on`, `subscribe`, `unsubscribe`, `publish`, `disconnect`).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  RedisRealtimeBackplane,
  InProcessBackplane,
  backplaneRetryStrategy,
  type RoomEvent,
} from '../services/realtime-backplane';

/** Minimal ioredis stand-in capturing subscribe/publish calls and emitting lifecycle events. */
class FakeRedis extends EventEmitter {
  readonly subscribeCalls: string[][] = [];
  readonly unsubscribeCalls: string[][] = [];
  readonly publishCalls: Array<{ channel: string; message: string }> = [];
  duplicated: FakeRedis | null = null;

  duplicate(): FakeRedis {
    const sub = new FakeRedis();
    this.duplicated = sub;
    return sub;
  }

  async subscribe(...channels: string[]): Promise<number> {
    this.subscribeCalls.push(channels);
    return channels.length;
  }

  async unsubscribe(...channels: string[]): Promise<number> {
    this.unsubscribeCalls.push(channels);
    return channels.length;
  }

  async publish(channel: string, message: string): Promise<number> {
    this.publishCalls.push({ channel, message });
    return 1;
  }

  disconnect(): void {
    /* no-op */
  }

  /** Convenience: simulate a successful (re)connect. */
  goReady(): void {
    this.emit('ready');
  }

  /** Convenience: simulate a dropped connection. */
  goDown(): void {
    this.emit('close');
  }
}

function makeBackplane(): { backplane: RedisRealtimeBackplane; pub: FakeRedis; sub: FakeRedis } {
  const pub = new FakeRedis();
  const backplane = new RedisRealtimeBackplane(pub as unknown as never, 'inst-test');
  const sub = pub.duplicated as FakeRedis;
  return { backplane, pub, sub };
}

describe('backplaneRetryStrategy (Requirement 6.2 — 1s → cap 30s)', () => {
  it('starts at 1s and doubles each attempt', () => {
    expect(backplaneRetryStrategy(1)).toBe(1000);
    expect(backplaneRetryStrategy(2)).toBe(2000);
    expect(backplaneRetryStrategy(3)).toBe(4000);
    expect(backplaneRetryStrategy(4)).toBe(8000);
    expect(backplaneRetryStrategy(5)).toBe(16000);
  });

  it('caps at 30s and never exceeds it for large/odd attempt counts', () => {
    expect(backplaneRetryStrategy(6)).toBe(30000);
    expect(backplaneRetryStrategy(50)).toBe(30000);
    expect(backplaneRetryStrategy(1000)).toBe(30000);
  });
});

describe('RedisRealtimeBackplane degraded fallback + reconnect (Task 8)', () => {
  it('starts degraded before the first connect (Requirement 6.1)', () => {
    const { backplane } = makeBackplane();
    expect(backplane.isHealthy()).toBe(false);
  });

  it('reports healthy once the subscriber connection is ready (Requirement 6.2)', () => {
    const { backplane, sub } = makeBackplane();
    sub.goReady();
    expect(backplane.isHealthy()).toBe(true);
  });

  it('tracks subscriptions while degraded and applies them all on connect (Requirement 6.2)', async () => {
    const { backplane, sub } = makeBackplane();
    // Subscribe to the presence channel + two conversations BEFORE connecting.
    await backplane.subscribe('__presence__');
    await backplane.subscribe('conv-1');
    await backplane.subscribe('conv-2');
    // Nothing pushed to Redis yet — we are degraded/single-node.
    expect(sub.subscribeCalls).toHaveLength(0);

    sub.goReady();

    // On connect, every tracked channel is (re)subscribed in one batch.
    expect(sub.subscribeCalls).toHaveLength(1);
    expect(new Set(sub.subscribeCalls[0])).toEqual(
      new Set(['quantchat:room:__presence__', 'quantchat:room:conv-1', 'quantchat:room:conv-2']),
    );
  });

  it('re-subscribes all active channels after a disconnect/reconnect cycle (Requirement 6.2)', async () => {
    const { backplane, sub } = makeBackplane();
    sub.goReady();
    await backplane.subscribe('__presence__');
    await backplane.subscribe('conv-1');
    expect(backplane.isHealthy()).toBe(true);

    // Connection drops → degraded.
    sub.goDown();
    expect(backplane.isHealthy()).toBe(false);
    const callsBeforeReconnect = sub.subscribeCalls.length;

    // Connection restored → healthy + full resubscribe of presence + conversations.
    sub.goReady();
    expect(backplane.isHealthy()).toBe(true);
    expect(sub.subscribeCalls.length).toBe(callsBeforeReconnect + 1);
    expect(new Set(sub.subscribeCalls.at(-1))).toEqual(
      new Set(['quantchat:room:__presence__', 'quantchat:room:conv-1']),
    );
  });

  it('short-circuits publish while disconnected — single-node, no doomed commands (Requirement 6.3)', async () => {
    const { backplane, pub, sub } = makeBackplane();
    const event: RoomEvent = { type: 'new_message', originInstanceId: '', payload: { id: 1 } };

    // Degraded: publish is a no-op against Redis (local delivery already happened).
    await backplane.publish('conv-1', event);
    expect(pub.publishCalls).toHaveLength(0);

    // Healthy: publish reaches Redis, stamped with this instance's id.
    sub.goReady();
    await backplane.publish('conv-1', event);
    expect(pub.publishCalls).toHaveLength(1);
    expect(pub.publishCalls[0].channel).toBe('quantchat:room:conv-1');
    expect(JSON.parse(pub.publishCalls[0].message).originInstanceId).toBe('inst-test');
  });

  it('notifies the health-change observer on transitions', async () => {
    const { backplane, sub } = makeBackplane();
    const transitions: boolean[] = [];
    backplane.onHealthChange((healthy) => transitions.push(healthy));

    sub.goReady();
    sub.goDown();
    sub.goReady();

    expect(transitions).toEqual([true, false, true]);
  });
});

describe('InProcessBackplane is a healthy single-node steady state', () => {
  it('always reports healthy (degraded applies only to a downed Redis backplane)', () => {
    expect(new InProcessBackplane().isHealthy()).toBe(true);
  });
});
