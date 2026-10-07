// Client-safe exports (no Node.js dependencies)
export { WebSocketClient } from './websocket-client';
export type { WebSocketClientConfig, ClientState, ClientCallbacks } from './websocket-client';
export { CloseCodes } from './websocket-client';
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
