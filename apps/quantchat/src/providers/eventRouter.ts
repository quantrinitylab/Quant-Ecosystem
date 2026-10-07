// ============================================================================
// ChannelRouter — pure event-routing/dispatch core for the real-time layer
//
// Extracted from RealtimeProvider so the multiplexing/dispatch logic is a
// plain, testable unit (no React, no WebSocket). A single ChannelRouter
// instance models a single client's single connection: handlers for many
// channels are multiplexed through one router, and route() dispatches an
// incoming event to exactly the handlers registered for event.channel.
//
// Task 16.2 / 16.5 — channel routing + multiplexed channels over one socket.
// ============================================================================

/** An event carries the channel it belongs to plus an arbitrary payload. */
export interface RoutableEvent {
  channel: string;
  [key: string]: unknown;
}

/** Handler invoked with an event delivered on a subscribed channel. */
export type RouterHandler<E extends RoutableEvent = RoutableEvent> = (
  event: E,
) => void | Promise<void>;

/**
 * ChannelRouter dispatches events to handlers registered per channel.
 *
 * Multiple handlers may subscribe to the same channel; an event routed to a
 * channel is delivered to every handler registered for that channel and to no
 * handler registered for any other channel (no cross-channel leakage).
 */
export class ChannelRouter<E extends RoutableEvent = RoutableEvent> {
  private readonly handlers = new Map<string, Set<RouterHandler<E>>>();

  /**
   * Register a handler for a channel. Returns an unsubscribe function that
   * removes exactly this handler (idempotent).
   */
  subscribe(channel: string, handler: RouterHandler<E>): () => void {
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
    }
    set.add(handler);
    return () => this.unsubscribe(channel, handler);
  }

  /** Remove a handler from a channel. No-op if not registered. */
  unsubscribe(channel: string, handler: RouterHandler<E>): void {
    const set = this.handlers.get(channel);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      this.handlers.delete(channel);
    }
  }

  /** Whether any handler is registered for the given channel. */
  hasChannel(channel: string): boolean {
    return this.handlers.has(channel);
  }

  /** The set of channels with at least one registered handler. */
  channels(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Dispatch an event to every handler registered for event.channel.
   * Handlers for other channels are never invoked. Errors thrown by an
   * individual handler are swallowed so one bad handler cannot break delivery
   * to the others. Returns the number of handlers invoked.
   */
  route(event: E): number {
    const set = this.handlers.get(event.channel);
    if (!set) return 0;
    // Snapshot so handlers that (un)subscribe during dispatch don't corrupt
    // the iteration.
    let delivered = 0;
    for (const handler of Array.from(set)) {
      delivered++;
      try {
        handler(event);
      } catch {
        // Swallow handler errors to protect the event loop / other handlers.
      }
    }
    return delivered;
  }

  /** Remove all handlers across all channels. */
  clear(): void {
    this.handlers.clear();
  }
}
