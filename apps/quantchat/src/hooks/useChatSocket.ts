'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  chatSocket,
  type ChatConnectionState,
  type ChatEventHandler,
  type ClientEvent,
} from '../services/chat-socket';

export type { ChatConnectionState, ClientEvent } from '../services/chat-socket';

/**
 * Resilient, app-wide chat WebSocket hook (design Component 4, Requirement 13).
 *
 * Every caller shares the SAME underlying connection — the module-level
 * `chatSocket` singleton owns exactly one socket app-wide (Requirement 13.1).
 * That socket reconnects on unexpected close with exponential backoff from 1s
 * capped at 30s (Requirement 13.2) and re-joins all previously active
 * conversation rooms on reconnect (Requirement 13.3).
 *
 * @param onEvent Optional handler invoked for every inbound server event
 *   (`new_message`, `typing_indicator`, `presence:update`, `message:read`,
 *   `message:delivered`, ...). Registered for the lifetime of the component.
 *   While the WebSocket is unreachable the shared socket degrades to HTTP
 *   long-polling and `new_message` events still arrive via `GET
 *   /api/messages/:id`.
 * @returns `{ send, subscribe, connectionState }` where `connectionState` is
 *   exactly one of `connecting` | `open` | `closed` | `degraded` (Requirement
 *   13.4).
 */
export function useChatSocket(onEvent?: ChatEventHandler): {
  send: (event: ClientEvent) => void;
  subscribe: (conversationId: string) => void;
  connectionState: ChatConnectionState;
} {
  const [connectionState, setConnectionState] = useState<ChatConnectionState>(() =>
    chatSocket.getState(),
  );

  // Acquire the shared connection while this component is mounted; the singleton
  // opens on the first consumer and tears down when the last one unmounts, while
  // always remaining a single connection in between (Requirement 13.1).
  useEffect(() => {
    chatSocket.acquire();
    const unsubscribeState = chatSocket.onStateChange(setConnectionState);
    // Sync immediately in case the state changed between render and effect.
    setConnectionState(chatSocket.getState());
    return () => {
      unsubscribeState();
      chatSocket.release();
    };
  }, []);

  // Register the optional inbound-event handler for the component's lifetime.
  useEffect(() => {
    if (!onEvent) return;
    return chatSocket.onMessage(onEvent);
  }, [onEvent]);

  const send = useCallback((event: ClientEvent) => {
    chatSocket.send(event);
  }, []);

  const subscribe = useCallback((conversationId: string) => {
    chatSocket.subscribe(conversationId);
  }, []);

  return { send, subscribe, connectionState };
}

export default useChatSocket;
