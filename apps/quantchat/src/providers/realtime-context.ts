import { createContext, useContext } from 'react';
import type { ClientState, EventHandler } from '@quant/realtime';
import type { WebSocketClient } from '@quant/realtime';

export interface RealtimeContextValue {
  client: WebSocketClient | null;
  connectionState: ClientState;
  isConnected: boolean;
  subscribe: (channel: string, handler: EventHandler) => () => void;
  publish: (channel: string, payload: unknown) => void;
}

export const RealtimeContext = createContext<RealtimeContextValue>({
  client: null,
  connectionState: 'disconnected',
  isConnected: false,
  subscribe: () => () => {},
  publish: () => {},
});

export function useRealtime(): RealtimeContextValue {
  return useContext(RealtimeContext);
}
