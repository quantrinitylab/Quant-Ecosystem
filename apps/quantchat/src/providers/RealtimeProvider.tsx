'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { getAuthToken, getWsProtocols } from '../lib/auth';
import { ChannelRouter } from './eventRouter';
import { RealtimeContext } from './realtime-context';
import type {
  RealtimeContextValue,
  ChannelId,
  RealtimeEvent,
  ChannelHandler,
  ConnectionState,
} from './realtime-context';

// Re-export the hook for convenience
export { useRealtime } from './realtime-context';

// ============================================================================
// Task 16: Real-Time WebSocket Infrastructure
//
// 16.1 - Persistent WebSocket connection with JWT auth on connect
// 16.2 - Real-time event delivery with JSON parsing and channel routing
// 16.3 - Auto-reconnection with exponential backoff (1s, 2s, 3s cap), max 5 attempts
// 16.4 - HTTP long-polling fallback after 5 failed reconnects
// 16.5 - Multiplexed channels over single WebSocket
// 16.6 - Degraded-connectivity indicator UI
// ============================================================================

/** Critical channels that get long-polling fallback */
const CRITICAL_CHANNELS: readonly string[] = ['chat', 'calls'];

/** Max reconnect attempts before switching to long-polling */
const MAX_RECONNECT_ATTEMPTS = 5;

/** Polling interval for long-poll fallback (ms) */
const POLL_INTERVAL_MS = 3000;

/** Exponential backoff delays (capped at 3s) */
function getBackoffDelay(attempt: number): number {
  // 1s, 2s, 3s (capped at 3s)
  return Math.min((attempt + 1) * 1000, 3000);
}

/** Default WebSocket URL — same origin as the page; the ingress routes `/ws`
 * to the chat backend. (P0-1: previously hardcoded the undeployed
 * `wss://quantws.quantrinity.in/ws`, whose handshake timed out.) */
function getWsUrl(): string {
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }
  if (typeof window !== 'undefined') {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}/ws`;
    }
  }
  return 'ws://localhost:3006/ws';
}

/** Default API base URL for long-polling */
function getHttpFallbackUrl(): string {
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_HTTP_FALLBACK_URL) {
    return process.env.NEXT_PUBLIC_HTTP_FALLBACK_URL;
  }
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== 'undefined') {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return window.location.origin;
    }
  }
  return 'http://localhost:3006';
}

interface Props {
  children: ReactNode;
}

/**
 * RealtimeProvider — wraps the application and manages a single persistent
 * WebSocket connection with authentication, auto-reconnection, multiplexed
 * channels, and HTTP long-polling fallback.
 */
export function RealtimeProvider({ children }: Props) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

  // Refs to persist across renders without causing re-renders
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEventTimestampRef = useRef<number>(Date.now());
  // Task 16.2 / 16.5: pure ChannelRouter multiplexes all channel handlers over
  // this provider's single WebSocket connection.
  const routerRef = useRef<ChannelRouter<RealtimeEvent>>(new ChannelRouter<RealtimeEvent>());
  const subscribedChannelsRef = useRef<Set<string>>(new Set());
  const isUnmountedRef = useRef(false);

  // ─── Task 16.2: Route incoming events to registered channel handlers ────
  const routeEvent = useCallback((event: RealtimeEvent) => {
    // Dispatch to all handlers registered for event.channel (and no others).
    routerRef.current.route(event);
    // Track the latest event timestamp for long-polling
    if (event.timestamp) {
      lastEventTimestampRef.current = event.timestamp;
    }
  }, []);

  // ─── Task 16.5: Send subscribe/unsubscribe action over the WebSocket ────
  const sendSubscribeAction = useCallback((channel: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'subscribe', channel }));
    }
  }, []);

  const sendUnsubscribeAction = useCallback((channel: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'unsubscribe', channel }));
    }
  }, []);

  // ─── Task 16.4: HTTP long-polling fallback ──────────────────────────────
  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return; // Already polling

    setConnectionState('degraded');

    pollTimerRef.current = setInterval(async () => {
      try {
        const token = getAuthToken();
        const since = lastEventTimestampRef.current;
        const url = `${getHttpFallbackUrl()}/api/events?since=${since}`;

        const response = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!response.ok) return;

        const events: RealtimeEvent[] = await response.json();
        // Only route events on critical channels
        events
          .filter((e) => CRITICAL_CHANNELS.includes(e.channel))
          .forEach((event) => routeEvent(event));
      } catch {
        // Network error during polling — keep trying
      }
    }, POLL_INTERVAL_MS);
  }, [routeEvent]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // ─── Task 16.1 & 16.3: WebSocket connection + auto-reconnection ─────────
  const connectWebSocket = useCallback(() => {
    if (isUnmountedRef.current) return;

    const token = getAuthToken();
    if (!token) {
      // No token yet — retry after a short delay
      reconnectTimerRef.current = setTimeout(() => connectWebSocket(), 1000);
      return;
    }

    const wsUrl = getWsUrl();
    setConnectionState('reconnecting');

    try {
      // P1: the bearer token travels as a negotiated subprotocol
      // (Sec-WebSocket-Protocol handshake header) — never in the URL, and no
      // post-connect `{type:'auth'}` frame (the backend authenticates the
      // upgrade itself and ignores unknown frames).
      const ws = new WebSocket(wsUrl, getWsProtocols());
      wsRef.current = ws;

      ws.onopen = () => {
        if (isUnmountedRef.current) {
          ws.close();
          return;
        }

        // Task 16.5: Re-subscribe all active channels on (re)connect
        subscribedChannelsRef.current.forEach((channel) => {
          ws.send(JSON.stringify({ action: 'subscribe', channel }));
        });

        // Reset reconnection state
        reconnectAttemptRef.current = 0;
        stopPolling();
        setConnectionState('connected');
      };

      // Task 16.2: Parse incoming messages and route to handlers
      ws.onmessage = (messageEvent) => {
        try {
          const data = JSON.parse(messageEvent.data as string) as RealtimeEvent;
          if (data.channel && data.type && data.payload !== undefined) {
            routeEvent(data);
          }
        } catch {
          // Non-JSON or malformed message — ignore
        }
      };

      // Task 16.3: Handle close with exponential backoff reconnection
      ws.onclose = () => {
        if (isUnmountedRef.current) return;
        wsRef.current = null;

        const attempt = reconnectAttemptRef.current;

        if (attempt >= MAX_RECONNECT_ATTEMPTS) {
          // Task 16.4: Switch to long-polling fallback
          startPolling();
          return;
        }

        // Exponential backoff: 1s, 2s, 3s (capped)
        const delay = getBackoffDelay(attempt);
        reconnectAttemptRef.current = attempt + 1;
        setConnectionState('reconnecting');

        reconnectTimerRef.current = setTimeout(() => {
          connectWebSocket();
        }, delay);
      };

      // Task 16.3: Handle error — trigger reconnection flow
      ws.onerror = () => {
        // The close event will fire after onerror, which handles reconnection
        ws.close();
      };
    } catch {
      // Failed to construct WebSocket — attempt reconnection
      const attempt = reconnectAttemptRef.current;
      if (attempt >= MAX_RECONNECT_ATTEMPTS) {
        startPolling();
        return;
      }
      const delay = getBackoffDelay(attempt);
      reconnectAttemptRef.current = attempt + 1;
      setConnectionState('reconnecting');
      reconnectTimerRef.current = setTimeout(() => connectWebSocket(), delay);
    }
  }, [routeEvent, startPolling, stopPolling]);

  // ─── Lifecycle: mount/unmount ───────────────────────────────────────────
  useEffect(() => {
    isUnmountedRef.current = false;
    connectWebSocket();

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      stopPolling();
      if (wsRef.current) {
        wsRef.current.close(1000, 'Provider unmounting');
        wsRef.current = null;
      }
    };
  }, [connectWebSocket, stopPolling]);

  // ─── Task 16.5: subscribe() — multiplexed channel subscription ──────────
  const subscribe = useCallback(
    (channel: ChannelId, handler: ChannelHandler): (() => void) => {
      // Register the handler with the multiplexing router.
      const removeHandler = routerRef.current.subscribe(channel, handler);

      // Track subscribed channel and send subscribe action
      if (!subscribedChannelsRef.current.has(channel)) {
        subscribedChannelsRef.current.add(channel);
        sendSubscribeAction(channel);
      }

      // Return unsubscribe function
      return () => {
        removeHandler();
        // If no more handlers for this channel, unsubscribe at wire level
        if (!routerRef.current.hasChannel(channel)) {
          subscribedChannelsRef.current.delete(channel);
          sendUnsubscribeAction(channel);
        }
      };
    },
    [sendSubscribeAction, sendUnsubscribeAction],
  );

  // ─── publish() — send event to a channel via WebSocket ──────────────────
  const publish = useCallback((channel: ChannelId, event: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          channel,
          ...event,
          timestamp: event.timestamp ?? Date.now(),
        }),
      );
    }
  }, []);

  // ─── Context value (memoized) ───────────────────────────────────────────
  const contextValue: RealtimeContextValue = useMemo(
    () => ({
      connectionState,
      subscribe,
      publish,
      isConnected: connectionState === 'connected',
    }),
    [connectionState, subscribe, publish],
  );

  return <RealtimeContext.Provider value={contextValue}>{children}</RealtimeContext.Provider>;
}
