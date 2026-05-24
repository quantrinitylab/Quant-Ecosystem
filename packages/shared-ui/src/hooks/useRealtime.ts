// ============================================================================
// Shared UI - useRealtime Hook
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseRealtimeOptions {
  url: string;
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectInterval?: number;
}

export interface UseRealtimeReturn {
  isConnected: boolean;
  isReconnecting: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  subscribe: (channel: string, handler: (data: unknown) => void) => () => void;
  emit: (event: string, data: unknown) => void;
}

/**
 * Real-time WebSocket hook for live features across Quant apps
 */
export function useRealtime(options: UseRealtimeOptions): UseRealtimeReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<(data: unknown) => void>>>(new Map());
  const reconnectCountRef = useRef(0);

  const { url, autoConnect = true, reconnectAttempts = 5, reconnectInterval = 3000 } = options;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setIsReconnecting(false);
        setError(null);
        reconnectCountRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string);
          const channel = message.channel || message.type;
          const handlers = handlersRef.current.get(channel);
          if (handlers) {
            handlers.forEach((handler) => handler(message.payload || message.data));
          }
        } catch {
          // Invalid message format
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        if (reconnectCountRef.current < reconnectAttempts) {
          setIsReconnecting(true);
          reconnectCountRef.current++;
          setTimeout(connect, reconnectInterval);
        }
      };

      ws.onerror = () => {
        setError('WebSocket connection error');
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, [url, reconnectAttempts, reconnectInterval]);

  const disconnect = useCallback(() => {
    reconnectCountRef.current = reconnectAttempts; // Prevent reconnection
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
  }, [reconnectAttempts]);

  const subscribe = useCallback((channel: string, handler: (data: unknown) => void): (() => void) => {
    if (!handlersRef.current.has(channel)) {
      handlersRef.current.set(channel, new Set());
    }
    handlersRef.current.get(channel)!.add(handler);

    // Send subscription message
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', channel }));
    }

    return () => {
      handlersRef.current.get(channel)?.delete(handler);
      if (handlersRef.current.get(channel)?.size === 0) {
        handlersRef.current.delete(channel);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'unsubscribe', channel }));
        }
      }
    };
  }, []);

  const emit = useCallback((event: string, data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: event, data, timestamp: Date.now() }));
    }
  }, []);

  useEffect(() => {
    if (autoConnect) connect();
    return () => disconnect();
  }, [autoConnect, connect, disconnect]);

  return { isConnected, isReconnecting, error, connect, disconnect, subscribe, emit };
}
