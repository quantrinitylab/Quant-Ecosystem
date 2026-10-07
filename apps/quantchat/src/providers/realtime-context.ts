'use client';

import { createContext, useContext } from 'react';

// ============================================================================
// Real-Time WebSocket Infrastructure — Context & Hook
// Task 16.1-16.6: Persistent WebSocket connection with reconnection,
// long-polling fallback, multiplexed channels, and degraded-connectivity UI
// ============================================================================

/** Well-known real-time channels (multiplexed over single WebSocket) */
export type RealtimeChannel =
  | 'chat'
  | 'calls'
  | 'map'
  | 'notifications'
  | 'streaks'
  | 'typing'
  | 'presence';

/** Connection state exposed to consumers */
export type ConnectionState = 'connected' | 'disconnected' | 'reconnecting' | 'degraded';

/** Incoming real-time event shape */
export interface RealtimeEvent {
  channel: string;
  type: string;
  payload: unknown;
  timestamp: number;
  /** Optional fields for compatibility with @quant/realtime event shape */
  id?: string;
  senderId?: string;
  sequence?: number;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Handler function for channel events — accepts any event-like object */

export type ChannelHandler = (event: any) => void | Promise<void>;

/**
 * Channel identifier — accepts well-known RealtimeChannel literals
 * as well as dynamic channel strings (e.g. "chat:conv123").
 */
export type ChannelId = RealtimeChannel | (string & {});

/** Context value exposed via useRealtime() hook */
export interface RealtimeContextValue {
  /** Current connection state */
  connectionState: ConnectionState;
  /** Subscribe to a channel; returns unsubscribe function */
  subscribe: (channel: ChannelId, handler: ChannelHandler) => () => void;
  /** Publish an event to a channel */
  publish: (channel: ChannelId, event: Record<string, unknown>) => void;
  /** Whether the connection is fully healthy */
  isConnected: boolean;
}

export const RealtimeContext = createContext<RealtimeContextValue>({
  connectionState: 'disconnected',
  subscribe: () => () => {},
  publish: () => {},
  isConnected: false,
});

/**
 * Hook for components to access real-time functionality.
 * Provides subscribe/publish and connection state.
 */
export function useRealtime(): RealtimeContextValue {
  return useContext(RealtimeContext);
}
