'use client';

// ============================================================================
// API Client SDK - WebSocket Subscription Hook
// ============================================================================

import { useEffect, useRef, useCallback, useState } from 'react';

/** Subscription options */
export interface SubscriptionOptions {
  url: string;
  autoConnect?: boolean;
}

/** Subscription state */
export interface SubscriptionState<T> {
  data: T | null;
  isConnected: boolean;
  error: Error | null;
  connect: () => void;
  disconnect: () => void;
}

/**
 * React hook for WebSocket real-time data subscriptions.
 */
export function useSubscription<T>(
  channel: string,
  options: SubscriptionOptions,
): SubscriptionState<T> {
  const [data, setData] = useState<T | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(options.url);

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        // Subscribe to channel
        ws.send(JSON.stringify({ type: 'subscribe', channel }));
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data as string) as { channel: string; data: T };
          if (parsed.channel === channel) {
            setData(parsed.data);
          }
        } catch {
          // Skip invalid messages
        }
      };

      ws.onerror = () => {
        setError(new Error('WebSocket connection error'));
      };

      ws.onclose = () => {
        setIsConnected(false);
      };

      wsRef.current = ws;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to connect'));
    }
  }, [channel, options.url]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (options.autoConnect !== false) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [connect, disconnect, options.autoConnect]);

  return { data, isConnected, error, connect, disconnect };
}
