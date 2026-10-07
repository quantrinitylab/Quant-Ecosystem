// ============================================================================
// Realtime - Core Types
// ============================================================================

import type { QuantApp } from '@quant/common';

/** Redis configuration */
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

/** NATS configuration */
export interface NatsConfig {
  url: string;
  token?: string;
  maxReconnectAttempts?: number;
  reconnectTimeWaitMs?: number;
}

/** Realtime server configuration */
export interface RealtimeConfig {
  port: number;
  host: string;
  path: string;
  maxConnections: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  maxMessageSize: number;
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  redis?: RedisConfig;
  nats?: NatsConfig;
}

/** Connection info stored per WebSocket connection */
export interface ConnectionInfo {
  id: string;
  userId: string;
  app: QuantApp;
  connectedAt: number;
  lastPing: number;
  metadata: Record<string, unknown>;
}

/** Auth payload extracted from JWT */
export interface AuthPayload {
  userId: string;
  email?: string;
  username?: string;
  role?: string;
  scopes: string[];
  app: QuantApp;
}

/** Delivery receipt sent by client to acknowledge a message */
export interface DeliveryReceipt {
  messageId: string;
  sequence: number;
  acknowledgedAt: number;
}

/** Message envelope wrapping events with delivery metadata */
export interface MessageEnvelope {
  id: string;
  sequence: number;
  channel: string;
  type: string;
  payload: unknown;
  senderId: string;
  timestamp: number;
  requiresAck: boolean;
}

/** Presence entry stored in Redis ZSET */
export interface PresenceEntry {
  userId: string;
  status: string;
  app: QuantApp;
  lastSeen: number;
  metadata?: Record<string, unknown>;
}

/** Default configuration values */
export const DEFAULT_REALTIME_CONFIG: RealtimeConfig = {
  port: 8080,
  host: '0.0.0.0',
  path: '/ws',
  maxConnections: 10000,
  heartbeatIntervalMs: 30000,
  heartbeatTimeoutMs: 60000,
  maxMessageSize: 65536,
  jwtSecret: '',
  jwtIssuer: 'quant-ecosystem',
  jwtAudience: 'quant-realtime',
};
