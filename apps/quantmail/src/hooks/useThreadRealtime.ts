'use client';

/**
 * useThreadRealtime — WebSocket subscription for email-thread chat (email-chat P0-3 / P0-4).
 *
 * Connects to the thread realtime gateway (`GET /ws/thread/:threadId`, publicly
 * reachable as `/api/ws/thread/:threadId` via the ingress /api rewrite) and fans out:
 *   - server → client `message.new`  — a new mail/chat message landed in this
 *     thread. Replaces the 30s mailbox poll for the open thread view.
 *   - server → client `typing`       — a participant started/stopped typing.
 *   - client → server `typing`       — our own typing state (rate-limited).
 *   - client → server `ping`         — heartbeat; the server closes idle sockets.
 *
 * Auth is the session token from `browserAuthSession` — the same token the
 * REST client uses. SECURITY: the token is never placed in the WebSocket URL
 * query string (query params land in proxy/server logs and browser history);
 * browsers cannot set an `Authorization` header on a WebSocket upgrade
 * request, so the session token travels as a `Sec-WebSocket-Protocol`
 * offer (`bearer.<jwt>`) instead. If there is no token, the socket never
 * opens and `connected` stays false; the mailbox poll remains the fallback.
 *
 * Reconnects with exponential backoff (1s → 30s max). A 4000 close means another
 * tab superseded this connection, so it does not retry — navigating back
 * re-mounts the hook and reconnects.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { browserAuthSession } from '../services/browser-auth-session';

export interface ThreadRealtimeMessage {
  /** server email id */
  id: string;
  threadId: string;
  messageKind: string;
  from: { name?: string; email: string };
  subject?: string | null;
  snippet?: string | null;
  bodyHtml?: string | null;
  bodyText?: string | null;
  receivedAt?: string | Date | null;
  createdAt?: string | Date | null;
  /** echoed back so the sender swaps its optimistic bubble for the server row */
  clientMessageId?: string;
}

export interface ThreadTypingPeer {
  userId: string;
  displayName: string;
  typing: boolean;
  ts: number;
}

export interface UseThreadRealtimeOptions {
  threadId: string | null | undefined;
  enabled?: boolean;
  onMessage?: (message: ThreadRealtimeMessage) => void;
  onTyping?: (peer: ThreadTypingPeer) => void;
}

export interface UseThreadRealtimeResult {
  /** true while the socket is open and the thread is subscribed */
  connected: boolean;
  /** send our typing state; no-op when disconnected */
  sendTyping: (typing: boolean) => void;
}

const HEARTBEAT_INTERVAL_MS = 25_000;
const SUPERSEDED_CLOSE_CODE = 4000;
const MAX_RETRY_DELAY_MS = 30_000;

interface WireEvent {
  type?: string;
  threadId?: string;
  ts?: number;
  message?: ThreadRealtimeMessage;
  typing?: { userId?: string; displayName?: string; typing?: boolean };
}

// ============================================================================
// Thread WebSocket handshake auth — SECURITY
// The session access token must NEVER be placed in the WebSocket URL query
// string: query params land in reverse-proxy/server access logs and in browser
// history. Browsers cannot set an `Authorization` header on a WebSocket upgrade
// request, so the session token travels as a `Sec-WebSocket-Protocol` offer
// (`bearer.<jwt>`) instead; the backend reads it from the offered protocol
// list and never echoes it back in the 101 response.
// ============================================================================
export const THREAD_WS_SUBPROTOCOL = 'thread-v1';
const THREAD_WS_BEARER_PREFIX = 'bearer.';

export function buildThreadWsHandshake(opts: {
  threadId: string;
  wsHost: string;
  secure: boolean;
  token?: string | null;
}): { url: string; protocols: string[] } {
  const protocol = opts.secure ? 'wss:' : 'ws:';
  const url = `${protocol}//${opts.wsHost}/api/ws/thread/${encodeURIComponent(opts.threadId)}`;
  const protocols = [THREAD_WS_SUBPROTOCOL];
  const token = opts.token?.trim();
  if (token) {
    // JWTs are base64url segments joined by '.' — all valid
    // Sec-WebSocket-Protocol token characters (RFC 7230 tchar).
    protocols.push(`${THREAD_WS_BEARER_PREFIX}${token}`);
  }
  return { url, protocols };
}

export function useThreadRealtime({
  threadId,
  enabled = true,
  onMessage,
  onTyping,
}: UseThreadRealtimeOptions): UseThreadRealtimeResult {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const retryDelayRef = useRef(1000);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const closedRef = useRef(false);
  const supersededRef = useRef(false);
  const onMessageRef = useRef(onMessage);
  const onTypingRef = useRef(onTyping);
  onMessageRef.current = onMessage;
  onTypingRef.current = onTyping;

  const clearTimers = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(
    (connect: () => void) => {
      if (closedRef.current || supersededRef.current) return;
      const delay = retryDelayRef.current;
      retryDelayRef.current = Math.min(delay * 2, MAX_RETRY_DELAY_MS);
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        connect();
      }, delay);
    },
    [],
  );

  useEffect(() => {
    closedRef.current = false;
    supersededRef.current = false;
    retryDelayRef.current = 1000;
    setConnected(false);

    if (!threadId || !enabled) return;

    const token = browserAuthSession.getAccessToken();
    // No session token — the handshake would 401 and spin the retry loop.
    // The mailbox poll remains the fallback.
    if (!token) return;

    let socket: WebSocket | null = null;

    const connect = () => {
      if (closedRef.current || supersededRef.current) return;
      clearTimers();
      // SECURITY: the token never goes into the URL query string — it travels
      // as a Sec-WebSocket-Protocol `bearer.<jwt>` offer instead.
      const { url: wsUrl, protocols } = buildThreadWsHandshake({
        threadId,
        wsHost: window.location.host,
        secure: window.location.protocol === 'https:',
        token,
      });
      try {
        socket = new WebSocket(wsUrl, protocols);
      } catch {
        scheduleReconnect(connect);
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        retryDelayRef.current = 1000;
        setConnected(true);
        heartbeatRef.current = setInterval(() => {
          try {
            if (socketRef.current?.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify({ type: 'ping' }));
            }
          } catch {
            /* the close handler reconnects */
          }
        }, HEARTBEAT_INTERVAL_MS);
      };

      socket.onmessage = (event) => {
        let parsed: WireEvent | null = null;
        try {
          parsed = JSON.parse(String(event.data)) as WireEvent;
        } catch {
          return;
        }
        if (!parsed || parsed.threadId !== threadId) return;
        if (parsed.type === 'message.new' && parsed.message) {
          onMessageRef.current?.(parsed.message);
        } else if (parsed.type === 'typing' && parsed.typing) {
          const { userId, displayName, typing } = parsed.typing;
          if (typeof userId === 'string' && userId) {
            onTypingRef.current?.({
              userId,
              displayName: typeof displayName === 'string' ? displayName : userId,
              typing: typing === true,
              ts: typeof parsed.ts === 'number' ? parsed.ts : Date.now(),
            });
          }
        }
        // 'pong' / 'error' need no handling here.
      };

      const handleClose = (event: CloseEvent) => {
        setConnected(false);
        clearTimers();
        socketRef.current = null;
        if (event.code === SUPERSEDED_CLOSE_CODE) {
          // Another tab took the room slot — reconnecting would evict it back.
          supersededRef.current = true;
          return;
        }
        scheduleReconnect(connect);
      };
      socket.onclose = handleClose;
      socket.onerror = () => {
        // onclose follows and drives the reconnect.
      };
    };

    connect();

    return () => {
      closedRef.current = true;
      clearTimers();
      try {
        socketRef.current?.close();
      } catch {
        /* ignore */
      }
      socketRef.current = null;
      setConnected(false);
    };
  }, [threadId, enabled]);

  const sendTyping = useCallback((typing: boolean) => {
    try {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'typing', typing }));
      }
    } catch {
      /* best-effort — a failed send just means no indicator on the other side */
    }
  }, []);

  return { connected, sendTyping };
}
