// ============================================================================
// Test support — in-memory shared-bus realtime harness for RealtimeBackplane
// Spec: quantchat-launch-readiness, Tasks 6.3 / 6.4
//
// The cross-instance fan-out logic in `routes/websocket.ts` (design Algorithm 4)
// lives inside the Fastify route closure and is not independently importable,
// and a real Redis is not available in the sandbox. So — mirroring the repo's
// established `fake-key-prisma.ts` approach — these tests drive a faithful
// in-memory model of the EXACT behaviour the websocket layer wires up:
//
//   * one shared pub/sub bus (models Redis pub/sub) that routes every published
//     event to ALL instances currently subscribed to that conversation channel,
//     INCLUDING the originating instance (just like Redis does);
//   * a per-instance `RealtimeBackplane` (the real interface) backed by that bus;
//   * a per-instance node that replicates websocket.ts verbatim:
//       - LOCAL room registry (`Map<conversationId, Set<socket>>`),
//       - origin delivers locally at publish time, then publishes to the bus,
//       - the `onMessage` handler discards self-origin echoes (Requirement 4.4)
//         and fans genuine remote events out to open local sockets (Req 4.5),
//       - publish-failure still delivers locally and records the failure (Req 4.7).
//
// This lets the property/unit tests exercise the real fan-out contract and
// assert per-socket receipt counts without a live cluster.
//
// NOTE: this module is intentionally NOT a `*.test.ts`/`*.spec.ts` file so the
// vitest include glob does not collect it as a suite — it is a shared helper.
// ============================================================================

import {
  createInstanceId,
  type RealtimeBackplane,
  type RoomEvent,
  type RoomEventType,
} from '../services/realtime-backplane';

/** A subscriber callback registered on the shared bus for one channel. */
type BusSubscriber = (conversationId: string, raw: string) => void;

/**
 * In-memory stand-in for Redis pub/sub. `publish` delivers the (already
 * serialized) payload synchronously to every subscriber registered on the
 * channel — including the publisher's own subscription, exactly as Redis pub/sub
 * behaves. This is what makes the `originInstanceId` de-dup (Requirement 4.4)
 * load-bearing rather than incidental.
 */
export class InMemoryBus {
  private readonly channels = new Map<string, Set<BusSubscriber>>();

  subscribe(conversationId: string, sub: BusSubscriber): void {
    let subs = this.channels.get(conversationId);
    if (!subs) {
      subs = new Set();
      this.channels.set(conversationId, subs);
    }
    subs.add(sub);
  }

  unsubscribe(conversationId: string, sub: BusSubscriber): void {
    const subs = this.channels.get(conversationId);
    if (!subs) return;
    subs.delete(sub);
    if (subs.size === 0) this.channels.delete(conversationId);
  }

  publish(conversationId: string, raw: string): void {
    const subs = this.channels.get(conversationId);
    if (!subs) return;
    // Snapshot so a handler mutating subscriptions can't disturb this fan-out.
    for (const sub of [...subs]) sub(conversationId, raw);
  }
}

/**
 * A `RealtimeBackplane` implementation backed by {@link InMemoryBus}. Models
 * `RedisRealtimeBackplane`: publish stamps the event with this instance's id and
 * broadcasts to every subscribed instance (origin included); inbound bus
 * messages are parsed and handed to the registered handler.
 */
export class SharedBusBackplane implements RealtimeBackplane {
  readonly instanceId: string;
  private readonly bus: InMemoryBus;
  private readonly subscribed = new Set<string>();
  private handler: ((conversationId: string, event: RoomEvent) => void) | null = null;
  /** When set, `publish` rejects with this error (models a backplane outage). */
  failPublishWith: Error | null = null;
  /** K25 — in-memory per-channel sequence (mirrors InProcessBackplane). */
  private readonly memorySequence = new Map<string, number>();

  private readonly deliver: BusSubscriber = (conversationId, raw) => {
    if (!this.handler) return;
    let event: RoomEvent;
    try {
      event = JSON.parse(raw) as RoomEvent;
    } catch {
      return; // drop malformed payloads, mirroring RedisRealtimeBackplane
    }
    this.handler(conversationId, event);
  };

  constructor(bus: InMemoryBus, instanceId: string = createInstanceId()) {
    this.bus = bus;
    this.instanceId = instanceId;
  }

  /** K25 — single-node monotonic per-channel sequence (§18). */
  async nextSequence(channel: string): Promise<number> {
    const next = (this.memorySequence.get(channel) ?? 0) + 1;
    this.memorySequence.set(channel, next);
    return next;
  }

  async subscribe(conversationId: string): Promise<void> {
    if (this.subscribed.has(conversationId)) return;
    this.subscribed.add(conversationId);
    this.bus.subscribe(conversationId, this.deliver);
  }

  async unsubscribe(conversationId: string): Promise<void> {
    if (!this.subscribed.has(conversationId)) return;
    this.subscribed.delete(conversationId);
    this.bus.unsubscribe(conversationId, this.deliver);
  }

  async publish(conversationId: string, event: RoomEvent): Promise<void> {
    if (this.failPublishWith) throw this.failPublishWith;
    const stamped: RoomEvent = { ...event, originInstanceId: this.instanceId };
    this.bus.publish(conversationId, JSON.stringify(stamped));
  }

  onMessage(handler: (conversationId: string, event: RoomEvent) => void): void {
    this.handler = handler;
  }

  async shutdown(): Promise<void> {
    for (const conversationId of this.subscribed) {
      this.bus.unsubscribe(conversationId, this.deliver);
    }
    this.subscribed.clear();
    this.handler = null;
  }

  /** The in-memory bus is always reachable, so the harness reports healthy. */
  isHealthy(): boolean {
    return true;
  }
}

/** Minimal fake socket matching the `readyState === OPEN` check in websocket.ts. */
export class FakeSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readonly OPEN = FakeSocket.OPEN;
  readyState: number = FakeSocket.OPEN;
  /** Every payload string delivered to this socket, in arrival order. */
  readonly inbox: string[] = [];

  constructor(readonly id: string) {}

  send(data: string): void {
    this.inbox.push(data);
  }

  /** How many times this socket received a payload deep-equal to `payload`. */
  receiptCount(payload: unknown): number {
    const target = JSON.stringify(payload);
    return this.inbox.filter((d) => d === target).length;
  }
}

/**
 * One backend instance: a LOCAL room registry plus a backplane on the shared
 * bus. The `onMessage` handler and `publishRoomEvent`/`joinRoom`/`leaveAllRooms`
 * replicate `routes/websocket.ts` verbatim (design Algorithm 4) so the harness
 * exercises the real cross-instance fan-out contract.
 */
export class InstanceNode {
  readonly backplane: SharedBusBackplane;
  private readonly rooms = new Map<string, Set<FakeSocket>>();
  /** Publish failures recorded for retry (Requirement 4.7). */
  readonly publishFailures: Array<{ conversationId: string; error: Error }> = [];

  constructor(bus: InMemoryBus, instanceId?: string) {
    this.backplane = new SharedBusBackplane(bus, instanceId);

    // Algorithm 4 — cross-instance fan-out (verbatim from websocket.ts).
    this.backplane.onMessage((conversationId: string, event: RoomEvent) => {
      if (event.originInstanceId === this.backplane.instanceId) return; // Req 4.4
      const room = this.rooms.get(conversationId);
      if (!room) return;
      const data = JSON.stringify(event.payload);
      for (const client of room) {
        if (client.readyState === client.OPEN) client.send(data); // Req 4.5
      }
    });
  }

  get instanceId(): string {
    return this.backplane.instanceId;
  }

  /** Join a socket to a room; subscribe on the first local socket (Req 4.1). */
  async joinRoom(conversationId: string, socket: FakeSocket): Promise<void> {
    let room = this.rooms.get(conversationId);
    const isNewRoom = !room;
    if (!room) {
      room = new Set();
      this.rooms.set(conversationId, room);
    }
    room.add(socket);
    if (isNewRoom) await this.backplane.subscribe(conversationId);
  }

  /** Remove a socket from every room; unsubscribe when a room empties (Req 4.2). */
  async leaveAllRooms(socket: FakeSocket): Promise<void> {
    for (const [conversationId, room] of this.rooms) {
      if (!room.delete(socket)) continue;
      if (room.size === 0) {
        this.rooms.delete(conversationId);
        await this.backplane.unsubscribe(conversationId);
      }
    }
  }

  /**
   * Deliver a room event locally AND publish it to the backplane (verbatim from
   * websocket.ts). Local delivery happens FIRST so that — even if the backplane
   * publish fails — local sockets still receive the event; the failure is then
   * recorded for retry (Requirement 4.7).
   */
  async publishRoomEvent(
    conversationId: string,
    type: RoomEventType,
    payload: unknown,
    exclude?: FakeSocket,
  ): Promise<void> {
    // 1. Local delivery (origin instance delivers at publish time).
    const room = this.rooms.get(conversationId);
    if (room) {
      const data = JSON.stringify(payload);
      for (const client of room) {
        if (client !== exclude && client.readyState === client.OPEN) client.send(data);
      }
    }

    // 2. Cross-instance fan-out — stamped with this instance's id by publish().
    const event: RoomEvent = { type, originInstanceId: this.backplane.instanceId, payload };
    try {
      await this.backplane.publish(conversationId, event);
    } catch (error) {
      // Local sockets already received it; record the failure for retry (Req 4.7).
      this.publishFailures.push({ conversationId, error: error as Error });
    }
  }
}
