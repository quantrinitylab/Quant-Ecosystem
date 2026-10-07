// ============================================================================
// WS Gateway - Cross-App Event Handlers
// Subscribes to EventBus and relays events to WebSocket clients
// ============================================================================

import type { RealtimeEvent } from '@quant/realtime';
import { EventBus } from '@quant/realtime';
import pino from 'pino';

const logger = pino({ name: 'ws-gateway:events' });

export interface EventRelayConfig {
  broadcast: (channel: string, event: RealtimeEvent) => void;
}

let registered = false;

/**
 * Register cross-app event handlers on the EventBus.
 * These handlers relay events from app backends to connected WebSocket clients.
 */
export function registerEventHandlers(config: EventRelayConfig): void {
  if (registered) return;
  registered = true;

  const bus = EventBus.getInstance();

  // Channel-specific handlers for known event types
  bus.subscribe('notifications', (event: RealtimeEvent) => {
    logger.info({ type: event.type }, 'Broadcasting notification');
    config.broadcast(`user:${event.senderId}:notifications`, event);
  });

  bus.subscribe('messages', (event: RealtimeEvent) => {
    const conversationId = (event.payload as Record<string, unknown>)?.conversationId;
    if (conversationId) {
      config.broadcast(`conversation:${conversationId as string}`, event);
    }
  });

  bus.subscribe('presence', (event: RealtimeEvent) => {
    config.broadcast('presence', event);
  });

  // Catch-all for any other channels
  bus.subscribe('*', (event: RealtimeEvent) => {
    // Only relay if not already handled by a specific handler
    if (!['notifications', 'messages', 'presence'].includes(event.channel)) {
      logger.debug({ type: event.type, channel: event.channel }, 'Relaying unhandled event');
      config.broadcast(event.channel, event);
    }
  });

  logger.info('Cross-app event handlers registered');
}
