// ============================================================================
// @quant/realtime - WebSocket and Real-time Infrastructure
// ============================================================================

// Server
export { WebSocketServer } from './websocket-server';
export type { WebSocketServerConfig, ConnectedClient, ServerStats } from './websocket-server';

// Client
export { WebSocketClient } from './websocket-client';
export type { WebSocketClientConfig, ClientState, ClientCallbacks } from './websocket-client';

// Channels
export { ChannelManager } from './channels';
export type { ChannelConfig, ChannelMember, ChannelState } from './channels';

// Events
export { TypedEventEmitter } from './events';
export type {
  RealtimeEvent,
  EventHandler,
  EventSubscription,
  EventMap,
  MessageNewEvent,
  MessageTypingEvent,
  MessageReadEvent,
  PresenceUpdateEvent,
  PostNewEvent,
  CallSignalEvent,
  CallIncomingEvent,
  StreamEvent,
  NotificationEvent,
  AIResponseChunkEvent,
  AIDeviceCommandEvent,
} from './events';

// Presence
export { PresenceManager } from './presence';
export type { PresenceStatus, UserPresenceState, PresenceConfig } from './presence';
