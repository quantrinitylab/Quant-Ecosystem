// ============================================================================
// @quant/realtime - WebSocket and Real-time Infrastructure
// ============================================================================

// Server
export { WebSocketServer } from './websocket-server';
export type { WebSocketServerConfig, ConnectedClient, ServerStats } from './websocket-server';

// Client
export { WebSocketClient } from './websocket-client';
export type { WebSocketClientConfig, ClientState, ClientCallbacks } from './websocket-client';
export { CloseCodes } from './websocket-client';

// Channels
export { ChannelManager } from './channels';
export type { ChannelConfig, ChannelMember, ChannelState, ChannelManagerConfig } from './channels';

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
  ClientMessage,
  ServerMessage,
  AckMessage,
  ErrorMessage,
} from './events';

// Presence
export { PresenceManager } from './presence';
export type { PresenceStatus, UserPresenceState, PresenceConfig } from './presence';

// Types
export type {
  RealtimeConfig,
  ConnectionInfo,
  AuthPayload,
  DeliveryReceipt,
  MessageEnvelope,
  PresenceEntry,
  RedisConfig,
  NatsConfig,
} from './types';
export { DEFAULT_REALTIME_CONFIG } from './types';

// Auth
export { ConnectionAuth, AuthError } from './auth';
export type { AuthConfig } from './auth';

// Delivery
export { DeliveryManager } from './delivery';
export type { DeliveryConfig } from './delivery';

// Backpressure
export { BackpressureHandler } from './backpressure';
export type { BackpressureConfig, BackpressureStats, BufferedSocket } from './backpressure';

// NATS Bridge
export { NatsBridge } from './nats-bridge';
export type { NatsBridgeConfig, NatsHandler } from './nats-bridge';

// Event Schema Registry
export { EventSchemaRegistry } from './event-schema-registry';
export type {
  ValidationResult,
  ValidationSuccess,
  ValidationFailure,
} from './event-schema-registry';

// Event Bus
export { EventBus } from './event-bus';
export type { EventBusHandler, EventBusSubscription } from './event-bus';
