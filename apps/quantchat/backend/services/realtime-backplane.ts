// ============================================================================
// QuantChat — RealtimeBackplane (W2, design Component 2)
// ============================================================================
//
// Decouples "which socket is in which room" from "which instance hosts the
// socket". Each backend instance keeps its LOCAL room map (the sockets it
// owns) but subscribes to a shared pub/sub channel per conversation. Publishing
// a room event broadcasts it to every subscribed instance, which then fans it
// out to its own local sockets (design Algorithm 4, wired in Task 6.2).
//
// Two implementations sit behind the same interface:
//  - RedisRealtimeBackplane: ioredis pub/sub, one channel per conversation
//    (the default when REDIS_URL is configured).
//  - InProcessBackplane: a no-op single-node fallback for local dev / tests
//    where same-instance delivery already happens at publish time.
//
// Each process is assigned a unique Instance_Id, stamped onto every published
// event so the originating instance can suppress duplicate local delivery
// (de-dup, used by the websocket wiring in Task 6.2 — Requirement 4.4).
// ============================================================================

import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import type { ChatEventEnvelope } from './chat-event-envelope';

/**
 * The set of room event types fanned across the cluster. Mirrors the event
 * `type` values already produced by the websocket layer (`new_message`,
 * `typing_indicator`) plus the delivery/presence events introduced by W2/W3.
 */
export type RoomEventType =
  | 'new_message'
  | 'typing_indicator'
  | 'message:delivered'
  | 'message:read'
  | 'presence:update';

/**
 * A room event as it travels over the backplane. `originInstanceId` identifies
 * the publishing instance so peers can tell a locally-originated echo apart
 * from a genuine remote event and avoid double-delivering (Requirement 4.4).
 */
export interface RoomEvent {
  type: RoomEventType;
  /** De-dupe: ignore events this instance published (set by {@link RealtimeBackplane.publish}). */
  originInstanceId: string;
  payload: unknown;
  /**
   * K25 — contract §18 envelope. New publishers set this; the websocket layer
   * delivers the envelope to sockets. Kept optional so older in-flight events
   * and test harnesses that only set `payload` keep working.
   */
  envelope?: ChatEventEnvelope;
}

/** Handler invoked with each inbound backplane event for a conversation. */
export type RoomEventHandler = (conversationId: string, event: RoomEvent) => void;

/**
 * Cross-instance realtime fan-out contract (design Component 2). Implementations
 * maintain this instance's subscriptions to active conversation channels and
 * relay published events to every subscribed instance.
 */
export interface RealtimeBackplane {
  /** Unique id for this process; stamped onto published events for de-dup. */
  readonly instanceId: string;
  /** Subscribe this instance to a conversation channel (idempotent). */
  subscribe(conversationId: string): Promise<void>;
  /** Unsubscribe when no local sockets remain in the room. */
  unsubscribe(conversationId: string): Promise<void>;
  /** Publish an event to all instances subscribed to the channel. */
  publish(conversationId: string, event: RoomEvent): Promise<void>;
  /** Register the handler that fans an inbound backplane event to local sockets. */
  onMessage(handler: RoomEventHandler): void;
  /** Graceful shutdown — used by the existing onClose hook. */
  shutdown(): Promise<void>;
  /**
   * K25 — monotonic per-channel sequence for the contract §18 envelope
   * (`sequence`/`cursor`, gap detection). Redis-backed implementations use an
   * atomic INCR so the sequence is cluster-correct; single-node fallbacks use
   * an in-memory counter. Never throws — degrades to memory on Redis failure.
   */
  nextSequence(channel: string): Promise<number>;
  /**
   * Whether cross-instance fan-out is fully operational. `false` means the
   * backplane is running in degraded single-node mode (no peer connectivity);
   * the health endpoint reports `degraded` in that state (Requirement 6.1/6.2).
   */
  isHealthy(): boolean;
}

/**
 * Prefix for per-conversation pub/sub channel names.
 * K25 — contract §19 canonical form: `conversation.{ref}`.
 */
const CHANNEL_PREFIX = 'conversation.';

/** Dedicated presence channel (contract §19 ephemeral semantics). */
export const BACKPLANE_PRESENCE_CHANNEL = 'presence';

/** Build the pub/sub channel name for a conversation (contract §19). */
function channelFor(conversationId: string): string {
  // The presence channel is a literal, not a conversation room.
  if (conversationId === BACKPLANE_PRESENCE_CHANNEL) return BACKPLANE_PRESENCE_CHANNEL;
  return `${CHANNEL_PREFIX}${conversationId}`;
}

/** Extract the conversation id from a pub/sub channel name. */
function conversationFromChannel(channel: string): string | null {
  if (channel === BACKPLANE_PRESENCE_CHANNEL) return BACKPLANE_PRESENCE_CHANNEL;
  if (!channel.startsWith(CHANNEL_PREFIX)) return null;
  return channel.slice(CHANNEL_PREFIX.length);
}

/**
 * Generate a unique per-process Instance_Id (Requirement 4.4). A human-readable
 * prefix keeps logs/diagnostics legible while the random suffix guarantees
 * uniqueness across replicas of the same image.
 */
export function createInstanceId(): string {
  return `quantchat-${randomUUID()}`;
}

/**
 * Exponential backoff schedule for backplane reconnect attempts (Requirement
 * 6.2): the first retry waits 1 second and each subsequent attempt doubles, up
 * to a hard cap of 30 seconds. Wired into the ioredis `retryStrategy` so a
 * transient Redis/NATS outage is retried automatically with bounded backoff.
 *
 * @param attempt 1-based reconnect attempt number (as supplied by ioredis).
 * @returns delay in milliseconds before the next attempt.
 */
export function backplaneRetryStrategy(attempt: number): number {
  const baseMs = 1000; // start at 1s
  const capMs = 30000; // cap at 30s
  const exponent = Math.max(0, attempt - 1);
  // Guard the shift against absurd attempt counts before clamping to the cap.
  const delay = exponent >= 30 ? capMs : baseMs * 2 ** exponent;
  return Math.min(delay, capMs);
}

/**
 * Redis-backed realtime backplane (default). Uses one ioredis pub/sub channel
 * per conversation. A dedicated subscriber connection is duplicated from the
 * supplied client because ioredis connections in subscriber mode cannot also
 * issue ordinary commands (e.g. PUBLISH).
 */
export class RedisRealtimeBackplane implements RealtimeBackplane {
  readonly instanceId: string;

  /** Connection used for PUBLISH (and SUBSCRIBE bookkeeping commands). */
  private readonly pub: Redis;
  /** Dedicated connection placed into subscriber mode. */
  private readonly sub: Redis;
  /** Channels this instance is currently subscribed to (drives idempotency + resubscribe). */
  private readonly subscribed = new Set<string>();
  private handler: RoomEventHandler | null = null;
  /** In-memory sequence fallback for nextSequence while Redis is unreachable. */
  private readonly memorySequence = new Map<string, number>();
  private listening = false;
  /**
   * Whether the subscriber connection is currently established. Starts `false`
   * — until the first `ready` event the backplane is in degraded single-node
   * mode (Requirement 6.1). Flipped by the ioredis connection lifecycle events
   * wired in the constructor.
   */
  private connected = false;
  /** Optional observer notified whenever the connection health flips. */
  private healthListener: ((healthy: boolean) => void) | null = null;

  constructor(redis: Redis, instanceId: string = createInstanceId()) {
    this.instanceId = instanceId;
    this.pub = redis;
    // A separate connection is required for subscriber mode.
    this.sub = redis.duplicate();
    this.wireConnectionLifecycle();
  }

  /**
   * Track the subscriber connection lifecycle so the backplane can report its
   * health and recover after an outage (Requirement 6.2). ioredis performs the
   * actual reconnection (with the {@link backplaneRetryStrategy} backoff wired
   * at client construction); here we react to the resulting state changes:
   *  - on `ready` (initial connect OR reconnect) we mark healthy and re-subscribe
   *    every tracked channel — all active conversation channels AND the presence
   *    channel — so fan-out resumes exactly where it left off;
   *  - on `close`/`end` we mark degraded so the health endpoint reports it and
   *    publishes short-circuit to local-only (single-node) delivery.
   */
  private wireConnectionLifecycle(): void {
    this.sub.on('ready', () => {
      this.setConnected(true);
      this.resubscribeAll();
    });
    this.sub.on('close', () => this.setConnected(false));
    this.sub.on('end', () => this.setConnected(false));
    // `error` events are emitted during reconnect attempts; ioredis keeps
    // retrying, so we leave the connection state for the close/ready events to
    // drive and simply swallow the error here to avoid an unhandled emission.
    this.sub.on('error', () => {
      /* handled by the retry strategy; connection state driven by close/ready */
    });
  }

  /** Flip the cached connection state and notify any health observer on change. */
  private setConnected(connected: boolean): void {
    if (this.connected === connected) return;
    this.connected = connected;
    this.healthListener?.(connected);
  }

  /**
   * Re-subscribe every tracked channel after a (re)connect (Requirement 6.2).
   * Idempotent at the Redis level; failures are swallowed because the next
   * `ready` event will retry the full set.
   */
  private resubscribeAll(): void {
    const channels = [...this.subscribed];
    if (channels.length === 0) return;
    void this.sub.subscribe(...channels).catch(() => {
      /* a subsequent `ready` will re-attempt the full subscription set */
    });
  }

  /**
   * Whether cross-instance fan-out is operational. `false` until the subscriber
   * connection is `ready`, and again after a disconnect — the degraded
   * single-node state surfaced on the health endpoint (Requirement 6.1).
   */
  isHealthy(): boolean {
    return this.connected;
  }

  /**
   * K25 — cluster-correct per-channel sequence via atomic Redis INCR (§18).
   * While disconnected (or on Redis failure) degrades to an in-memory counter
   * rather than blocking event publication.
   */
  async nextSequence(channel: string): Promise<number> {
    if (this.connected) {
      try {
        const n = await this.pub.incr(`quantchat:evtseq:${channel}`);
        if (Number.isInteger(n) && n > 0) return n;
      } catch {
        // Degrade to memory below.
      }
    }
    const next = (this.memorySequence.get(channel) ?? 0) + 1;
    this.memorySequence.set(channel, next);
    return next;
  }

  /** Register an observer notified when connection health flips (degraded/healthy). */
  onHealthChange(listener: (healthy: boolean) => void): void {
    this.healthListener = listener;
  }

  /**
   * Subscribe this instance to a conversation channel. Idempotent: a repeat
   * call for an already-subscribed conversation is a no-op (Requirement 4.1).
   * While disconnected the channel is only tracked; it is applied to Redis on
   * the next `ready` event via {@link resubscribeAll} (Requirement 6.2).
   */
  async subscribe(conversationId: string): Promise<void> {
    this.ensureListening();
    const channel = channelFor(conversationId);
    if (this.subscribed.has(channel)) return;
    this.subscribed.add(channel);
    if (this.connected) {
      await this.sub.subscribe(channel);
    }
  }

  /**
   * Unsubscribe this instance from a conversation channel once the last local
   * socket has left the room (Requirement 4.2).
   */
  async unsubscribe(conversationId: string): Promise<void> {
    const channel = channelFor(conversationId);
    if (!this.subscribed.has(channel)) return;
    this.subscribed.delete(channel);
    if (this.connected) {
      await this.sub.unsubscribe(channel);
    }
  }

  /**
   * Publish a room event to every instance subscribed to the conversation
   * channel (Requirement 4.3). The event is stamped with this instance's
   * Instance_Id so the origin can later suppress duplicate local delivery.
   * While the backplane is disconnected this short-circuits: same-instance
   * sockets were already served by the websocket layer at publish time, and
   * there are no reachable peers, so we stay in single-node mode rather than
   * buffering doomed commands (Requirement 6.3).
   */
  async publish(conversationId: string, event: RoomEvent): Promise<void> {
    const stamped: RoomEvent = { ...event, originInstanceId: this.instanceId };
    if (!this.connected) return;
    await this.pub.publish(channelFor(conversationId), JSON.stringify(stamped));
  }

  /**
   * Register the single handler that fans inbound backplane events out to local
   * sockets (Requirements 4.4, 4.5 — the de-dup/fan-out decision lives in the
   * handler wired by Task 6.2).
   */
  onMessage(handler: RoomEventHandler): void {
    this.handler = handler;
    this.ensureListening();
  }

  /** Tear down both connections (called from the existing onClose hook). */
  async shutdown(): Promise<void> {
    try {
      await this.sub.unsubscribe();
    } catch {
      // best-effort — connection may already be closing
    }
    this.subscribed.clear();
    this.sub.disconnect();
    // The `pub` connection is owned by the caller (shared app-wide Redis client),
    // so it is not disconnected here.
  }

  /** Attach the ioredis `message` listener exactly once. */
  private ensureListening(): void {
    if (this.listening) return;
    this.listening = true;
    this.sub.on('message', (channel: string, message: string) => {
      this.dispatch(channel, message);
    });
  }

  /** Parse an inbound pub/sub message and forward it to the registered handler. */
  private dispatch(channel: string, message: string): void {
    if (!this.handler) return;
    const conversationId = conversationFromChannel(channel);
    if (conversationId === null) return;

    let event: RoomEvent;
    try {
      event = JSON.parse(message) as RoomEvent;
    } catch {
      // Drop malformed payloads rather than crash the subscriber.
      return;
    }

    this.handler(conversationId, event);
  }
}

/**
 * No-op single-node fallback (design Component 2). Used for local dev / tests
 * and as the degraded mode when no backplane is configured. In single-node
 * operation, same-instance delivery already happens synchronously in the
 * websocket layer at publish time, so there is nothing to fan out across
 * instances — every method is intentionally a no-op.
 */
export class InProcessBackplane implements RealtimeBackplane {
  readonly instanceId: string;
  private handler: RoomEventHandler | null = null;
  private readonly memorySequence = new Map<string, number>();

  constructor(instanceId: string = createInstanceId()) {
    this.instanceId = instanceId;
  }

  /** K25 — single-node monotonic per-channel sequence (§18). */
  async nextSequence(channel: string): Promise<number> {
    const next = (this.memorySequence.get(channel) ?? 0) + 1;
    this.memorySequence.set(channel, next);
    return next;
  }

  async subscribe(_conversationId: string): Promise<void> {
    // No cross-instance channel exists in single-node mode.
  }

  async unsubscribe(_conversationId: string): Promise<void> {
    // No cross-instance channel exists in single-node mode.
  }

  async publish(_conversationId: string, _event: RoomEvent): Promise<void> {
    // Same-instance sockets are served directly by the websocket layer; there
    // are no peer instances to forward to.
  }

  onMessage(handler: RoomEventHandler): void {
    // Retained for interface parity; never invoked without a remote source.
    this.handler = handler;
  }

  async shutdown(): Promise<void> {
    this.handler = null;
  }

  /**
   * Single-node operation is a deliberate, fully-functional steady state (not a
   * fault), so the in-process backplane always reports healthy. The degraded
   * status applies specifically to a configured Redis backplane that has lost
   * its connection (Requirement 6.1).
   */
  isHealthy(): boolean {
    return true;
  }
}
