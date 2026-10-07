// ============================================================================
// Realtime Event Bus - Cross-App Event Publishing
// ============================================================================

import type { RealtimeEvent } from './events';

export type EventBusHandler = (event: RealtimeEvent) => void | Promise<void>;

export interface EventBusSubscription {
  channel: string;
  handler: EventBusHandler;
  unsubscribe: () => void;
}

/**
 * EventBus provides a centralized pub/sub mechanism for cross-app events.
 * App backends publish events here, and the ws-gateway subscribes to relay
 * them to connected WebSocket clients.
 */
export class EventBus {
  private static instance: EventBus | null = null;
  private subscriptions: Map<string, Set<EventBusHandler>> = new Map();

  constructor() {
    // Public constructor for testing; use getInstance() for singleton access
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Publish an event to a channel.
   */
  publish(channel: string, event: Omit<RealtimeEvent, 'channel'>): void {
    const fullEvent: RealtimeEvent = { ...event, channel } as RealtimeEvent;
    const handlers = this.subscriptions.get(channel);
    if (handlers) {
      for (const handler of handlers) {
        try {
          void handler(fullEvent);
        } catch {
          // Don't let one handler failure affect others
        }
      }
    }
    // Also emit on wildcard channel for gateway consumption
    const wildcardHandlers = this.subscriptions.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          void handler(fullEvent);
        } catch {
          // Don't let one handler failure affect others
        }
      }
    }
  }

  /**
   * Subscribe to events on a channel.
   */
  subscribe(channel: string, handler: EventBusHandler): EventBusSubscription {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel)!.add(handler);

    return {
      channel,
      handler,
      unsubscribe: () => {
        this.subscriptions.get(channel)?.delete(handler);
      },
    };
  }

  /**
   * Get all active subscription channels.
   */
  getChannels(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Clear all subscriptions (useful for testing).
   */
  clear(): void {
    this.subscriptions.clear();
  }
}
