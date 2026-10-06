// ============================================================================
// QuantChat - Shared Chat Socket Manager (W4, Task 20.2)
//
// A module-level singleton that owns EXACTLY ONE WebSocket connection to the
// backend `/ws/chat` route for realtime chat events. Every `useChatSocket()`
// caller shares this single connection (Requirement 13.1) — no component opens
// its own duplicate socket.
//
// Responsibilities (design Component 4 / Sequence 3):
//   - Maintain a single shared connection app-wide (Req 13.1).
//   - Reconnect on unexpected close with exponential backoff starting at 1s and
//     capped at 30s (Req 13.2).
//   - Re-subscribe (re-`join_conversation`) to the conversation channels that
//     were active before a disconnect once the connection is re-established
//     (Req 13.3).
//   - Expose the connection state as exactly one of `connecting` | `open` |
//     `closed` | `degraded` (Req 13.4; `degraded` = HTTP long-poll fallback).
//   - Graceful degradation (P0-1): after 3 consecutive unexpected WS failures
//     the manager polls `GET /api/messages/:id` per subscribed conversation and
//     fans unseen messages as `new_message` events, while the socket keeps
//     retrying in the background. The first successful open stops polling.
//   - Auth travels as a negotiated WebSocket subprotocol (see
//     `getWsProtocols`), never as a `?token=` query parameter.
//
// Wire protocol aligns with `backend/routes/websocket.ts`:
//   client -> server: { type: 'join_conversation', conversationId }
//                      { type: 'chat_message', conversationId, ... }
//                      { type: 'typing', conversationId, isTyping }
//                      { type: 'heartbeat' }
//   server -> client: { type: 'new_message' | 'typing_indicator' |
//                       'presence:update' | 'message:read' |
//                       'message:delivered', ... }
// ============================================================================

import { getAuthHeaders, getChatSocketUrl, getWsProtocols } from '../lib/auth';

/** Connection state surfaced to consumers (Requirement 13.4).
 * `degraded` means the WebSocket is unreachable and the HTTP long-poll
 * fallback is serving inbound events (P0-1 graceful degradation). */
export type ChatConnectionState = 'connecting' | 'open' | 'closed' | 'degraded';

/** A client event sent over the shared socket. `type` selects the wire frame. */
export interface ClientEvent {
  type: string;
  [key: string]: unknown;
}

/** Handler invoked for every inbound server event. */

export type ChatEventHandler = (event: any) => void;

type StateHandler = (state: ChatConnectionState) => void;

// Backoff schedule (Requirement 13.2): 1s, 2s, 4s, ... capped at 30s.
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;
// Keepalive cadence — keeps the socket (and server-side presence) fresh without
// tripping idle timeouts. Well under any typical proxy idle window.
const HEARTBEAT_INTERVAL_MS = 25_000;

// HTTP long-poll fallback (P0-1 graceful degradation). When the WebSocket
// cannot be established — e.g. the production WS endpoint is unreachable —
// the manager keeps retrying the socket in the background AND polls the
// existing `GET /api/messages/:id` HTTP endpoint so inbound chat events still
// arrive instead of the app hanging forever. Outbound realtime frames
// (typing, receipts) are dropped while degraded; sends go through the normal
// HTTP mutation hooks.
const MAX_FAILED_ATTEMPTS_BEFORE_POLL = 3;
const POLL_INTERVAL_MS = 5_000;
const POLL_PAGE_LIMIT = 25;
// Cap per-conversation id memory so a long degraded session cannot grow it
// without bound.
const MAX_KNOWN_MESSAGE_IDS = 1_000;

/** Normalize the several envelope shapes `GET /api/messages/:id` can return. */
function extractMessages(body: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(body)) return body as Array<Record<string, unknown>>;
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (Array.isArray(b.messages)) return b.messages as Array<Record<string, unknown>>;
    const data = b.data as Record<string, unknown> | undefined;
    if (data && Array.isArray(data.messages))
      return data.messages as Array<Record<string, unknown>>;
  }
  return [];
}

/**
 * Owns the single shared chat WebSocket. Exported as the `chatSocket` singleton
 * below; not intended to be instantiated more than once.
 */
export class ChatSocketManager {
  private ws: WebSocket | null = null;
  private state: ChatConnectionState = 'closed';

  /** Conversation rooms to (re)join — the source of truth for resubscribe. */
  private readonly activeConversations = new Set<string>();
  private readonly stateHandlers = new Set<StateHandler>();
  private readonly messageHandlers = new Set<ChatEventHandler>();

  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /** Consecutive unexpected WS failures (reset on every successful open). */
  private failedAttempts = 0;
  /** HTTP long-poll fallback timer; non-null while degraded. */
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  /** Message ids already seen per conversation (drives new_message fan-out). */
  private readonly knownMessageIds = new Map<string, Set<string>>();

  /** True only while a caller explicitly requested a close (no reconnect). */
  private intentionalClose = false;
  /** Number of mounted consumers; the socket lives while this is > 0. */
  private refCount = 0;

  // --------------------------------------------------------------------------
  // Public API consumed by the useChatSocket hook
  // --------------------------------------------------------------------------

  /** Current connection state (Requirement 13.4). */
  getState(): ChatConnectionState {
    return this.state;
  }

  /**
   * Register a consumer. The shared connection is opened on the first consumer
   * and torn down when the last one unmounts, while always remaining a single
   * connection in between (Requirement 13.1).
   */
  acquire(): void {
    this.refCount += 1;
    if (this.refCount === 1) {
      this.connect();
    }
  }

  /** Release a consumer; closes the shared socket when none remain. */
  release(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0) {
      this.close();
    }
  }

  /** Subscribe to connection-state changes; returns an unsubscribe function. */
  onStateChange(handler: StateHandler): () => void {
    this.stateHandlers.add(handler);
    return () => {
      this.stateHandlers.delete(handler);
    };
  }

  /** Subscribe to inbound server events; returns an unsubscribe function. */
  onMessage(handler: ChatEventHandler): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  /**
   * Join a conversation room (`join_conversation`) and remember it so it is
   * re-joined automatically after a reconnect (Requirement 13.3).
   */
  subscribe(conversationId: string): void {
    if (!conversationId) return;
    this.activeConversations.add(conversationId);
    // If we are not yet open the join is deferred to the next `onopen`, which
    // replays every active conversation.
    this.rawSend({ type: 'join_conversation', conversationId });
    // While the HTTP fallback is active, seed the new conversation immediately
    // so its next poll tick only surfaces genuinely new messages.
    if (this.pollTimer) void this.pollConversations(true);
  }

  /** Forget a conversation room so it is not re-joined on reconnect. */
  unsubscribe(conversationId: string): void {
    this.activeConversations.delete(conversationId);
  }

  /** Send a client event over the shared socket (no-op when not open). */
  send(event: ClientEvent): void {
    this.rawSend(event);
  }

  // --------------------------------------------------------------------------
  // Internal connection lifecycle
  // --------------------------------------------------------------------------

  private connect(): void {
    // Never run in non-browser environments (SSR / unit harness without WS).
    if (typeof WebSocket === 'undefined') return;
    // Guard against opening a second socket — there is only ever one.
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.intentionalClose = false;
    this.setState('connecting');

    let socket: WebSocket;
    try {
      // Auth travels as a negotiated subprotocol (see getWsProtocols) — never
      // in the URL.
      socket = new WebSocket(getChatSocketUrl(), getWsProtocols());
    } catch {
      // Construction failed (e.g. bad URL) — treat as an unexpected close and
      // retry with backoff.
      this.noteConnectFailure();
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.failedAttempts = 0;
      this.stopPolling();
      this.setState('open');
      this.startHeartbeat();
      // Requirement 13.3 — replay every conversation that was active before the
      // disconnect so the user keeps receiving that room's events.
      for (const conversationId of this.activeConversations) {
        this.rawSend({ type: 'join_conversation', conversationId });
      }
    };

    socket.onmessage = (event: MessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
      } catch {
        return; // ignore malformed frames
      }
      this.dispatchEvent(parsed);
    };

    socket.onerror = () => {
      // The browser fires `close` after `error`; let onclose drive reconnection.
      try {
        socket.close();
      } catch {
        /* noop */
      }
    };

    socket.onclose = () => {
      this.stopHeartbeat();
      if (this.ws === socket) this.ws = null;
      if (this.intentionalClose) {
        this.setState('closed');
        return;
      }
      // Unexpected close — engage the HTTP fallback after repeated failures,
      // and keep reconnecting with exponential backoff (Requirement 13.2).
      this.noteConnectFailure();
      this.scheduleReconnect();
    };
  }

  /**
   * Record one failed WS establishment attempt. Once the threshold is hit the
   * HTTP long-poll fallback engages so inbound events keep flowing while the
   * socket keeps retrying in the background.
   */
  private noteConnectFailure(): void {
    this.failedAttempts += 1;
    if (this.failedAttempts >= MAX_FAILED_ATTEMPTS_BEFORE_POLL) {
      this.startPolling();
    }
  }

  /** Fan one inbound event (WS frame or poll tick) to every message handler. */
  private dispatchEvent(parsed: unknown): void {
    for (const handler of this.messageHandlers) {
      try {
        handler(parsed);
      } catch {
        // A faulty consumer must not break fan-out to the others.
      }
    }
  }

  /**
   * Start the HTTP long-poll fallback: every POLL_INTERVAL_MS each subscribed
   * conversation is fetched via the existing `GET /api/messages/:id` endpoint
   * and unseen messages are fanned out as `new_message` events — the same
   * shape the backend emits over the socket. State becomes `degraded` so the
   * UI can say so. Idempotent: a second call while polling is a no-op.
   */
  private startPolling(): void {
    if (this.pollTimer) return;
    // Only poll while somebody is actually consuming the socket.
    if (this.intentionalClose || this.refCount === 0) return;
    this.setState('degraded');
    // Seed the known-id sets immediately so the first tick does not replay
    // history as "new" messages.
    void this.pollConversations(true);
    this.pollTimer = setInterval(() => {
      void this.pollConversations(false);
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * One poll tick. When `seedOnly` is true the known-id sets are populated but
   * no events are dispatched (used on fallback start / new subscription).
   */
  private async pollConversations(seedOnly: boolean): Promise<void> {
    if (typeof fetch === 'undefined') return;
    const headers = getAuthHeaders();
    for (const conversationId of this.activeConversations) {
      let known = this.knownMessageIds.get(conversationId);
      if (!known) {
        known = new Set<string>();
        this.knownMessageIds.set(conversationId, known);
      }
      try {
        const res = await fetch(
          `/api/messages/${encodeURIComponent(conversationId)}?limit=${POLL_PAGE_LIMIT}`,
          { headers },
        );
        if (!res.ok) continue;
        const body: unknown = await res.json();
        for (const msg of extractMessages(body)) {
          const id = msg.id;
          if (typeof id !== 'string' || id.length === 0) continue;
          if (known.has(id)) continue;
          known.add(id);
          // Bound memory: drop the oldest ids once over the cap (Sets iterate
          // in insertion order).
          while (known.size > MAX_KNOWN_MESSAGE_IDS) {
            const oldest = known.values().next();
            if (oldest.done) break;
            known.delete(oldest.value);
          }
          if (!seedOnly) {
            this.dispatchEvent({ type: 'new_message', data: msg });
          }
        }
      } catch {
        // Transient network failure — the next tick retries. Never throw out
        // of the interval callback.
      }
    }
  }

  private scheduleReconnect(): void {
    // No consumers left or an explicit close means we must not reconnect.
    if (this.intentionalClose || this.refCount === 0) {
      this.setState('closed');
      return;
    }
    if (this.reconnectTimer) return; // a reconnect is already pending

    // We are actively trying to restore the connection. While the HTTP
    // fallback is serving traffic we stay visibly `degraded` instead of
    // flapping to `connecting` on every retry.
    if (!this.pollTimer) this.setState('connecting');
    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts,
      MAX_RECONNECT_DELAY_MS,
    );
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private close(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.stopPolling();
    this.reconnectAttempts = 0;
    this.failedAttempts = 0;
    const socket = this.ws;
    this.ws = null;
    if (socket) {
      try {
        socket.close(1000, 'client released');
      } catch {
        /* noop */
      }
    }
    this.setState('closed');
  }

  private rawSend(event: ClientEvent): void {
    const socket = this.ws;
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(event));
      } catch {
        /* dropped — the reconnect path will recover the room subscriptions */
      }
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.rawSend({ type: 'heartbeat' });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private setState(state: ChatConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    for (const handler of this.stateHandlers) {
      try {
        handler(state);
      } catch {
        /* noop */
      }
    }
  }
}

/** App-wide singleton — the single shared chat WebSocket (Requirement 13.1). */
export const chatSocket = new ChatSocketManager();
