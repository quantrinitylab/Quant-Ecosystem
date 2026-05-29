'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { WebSocketClient } from '@quant/realtime';
import type { ClientState, EventHandler } from '@quant/realtime';
import { getAuthToken } from '../lib/auth';
import { RealtimeContext } from './realtime-context';
import type { RealtimeContextValue } from './realtime-context';

export { useRealtime } from './realtime-context';

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<WebSocketClient | null>(null);
  const [connectionState, setConnectionState] = useState<ClientState>('disconnected');
  const [token, setToken] = useState<string | null>(null);

  // Poll for token availability so we re-connect when auth completes
  useEffect(() => {
    const currentToken = getAuthToken();
    if (currentToken) {
      setToken(currentToken);
      return;
    }
    // Re-check every 500ms until a token becomes available
    const interval = setInterval(() => {
      const t = getAuthToken();
      if (t) {
        setToken(t);
        clearInterval(interval);
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Gate connection on token availability - do not connect with empty token
    if (!token) return;

    const url = process.env.NEXT_PUBLIC_WS_URL || 'wss://chat.quant.app/ws';

    const client = new WebSocketClient(
      {
        url,
        token,
        app: 'quantchat' as any,
        autoReconnect: true,
      },
      {
        onConnect: () => setConnectionState('connected'),
        onDisconnect: () => setConnectionState('disconnected'),
        onReconnecting: () => setConnectionState('reconnecting'),
      },
    );

    clientRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [token]);

  const subscribe = useCallback((channel: string, handler: EventHandler) => {
    if (clientRef.current) {
      return clientRef.current.subscribe(channel, handler);
    }
    return () => {};
  }, []);

  const publish = useCallback((channel: string, payload: unknown) => {
    if (clientRef.current) {
      clientRef.current.publish(channel, payload);
    }
  }, []);

  const value: RealtimeContextValue = {
    client: clientRef.current,
    connectionState,
    isConnected: connectionState === 'connected',
    subscribe,
    publish,
  };

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
