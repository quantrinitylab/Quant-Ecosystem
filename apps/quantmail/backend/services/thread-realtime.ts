/**
 * ThreadRealtimeHub — in-process pub/sub for email-thread chat.
 *
 * Subscribes browser WebSocket clients to a conversation (EmailThread) and
 * fans out two event types:
 *   - `message.new`  — a new mail/chat message landed in the thread (realtime
 *                      delivery, replaces the 30s mailbox poll in the thread view)
 *   - `typing`       — a participant is typing in the thread's quick-reply bar
 *
 * Scope note: this is a single-pod hub. Cross-pod fan-out (Redis pub/sub) is
 * a follow-up; typing state is ephemeral so a missed relay only degrades to
 * no indicator, never to lost mail. `message.new` is a delivery *hint* — the
 * REST `GET /threads/:id` remains the source of truth and the client refetches
 * when it reconnects.
 */

export interface ThreadRealtimeSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
  /** 1 === WebSocket.OPEN; kept as a literal so tests can use fakes. */
  // (deliberately not imported from 'ws' to stay dependency-free)
}

export interface ThreadRealtimePeer {
  connId: string;
  userId: string;
  displayName: string;
  socket: ThreadRealtimeSocket;
  /** epoch ms of the last typing event this connection forwarded */
  lastTypingAt: number;
}

export interface ThreadMessagePayload {
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
  /** echoed back so the sender can swap its optimistic bubble for the server row */
  clientMessageId?: string;
}

export interface ThreadTypingPayload {
  userId: string;
  displayName: string;
  typing: boolean;
}

export interface WireEvent {
  type: 'message.new' | 'typing' | 'ping' | 'pong' | 'error';
  threadId: string;
  ts: number;
  message?: ThreadMessagePayload;
  typing?: ThreadTypingPayload;
  error?: string;
}

const OPEN = 1;
const MAX_ROOMS = 5_000;
const MAX_PEERS_PER_ROOM = 50;

class ThreadRealtimeHub {
  private rooms = new Map<string, Map<string, ThreadRealtimePeer>>();
  private connSeq = 0;

  /** Subscribe a socket to a thread. Returns an unsubscribe function. */
  subscribe(
    threadId: string,
    userId: string,
    displayName: string,
    socket: ThreadRealtimeSocket,
  ): () => void {
    if (this.rooms.size >= MAX_ROOMS && !this.rooms.has(threadId)) {
      // Fail closed under memory pressure instead of growing unbounded.
      try {
        socket.close(1013, 'server overloaded');
      } catch {
        /* ignore */
      }
      return () => undefined;
    }
    const room = this.rooms.get(threadId) ?? new Map<string, ThreadRealtimePeer>();
    if (room.size >= MAX_PEERS_PER_ROOM) {
      // Evict the oldest connection (e.g. a stale tab) to make room.
      const oldest = room.keys().next().value;
      if (oldest) {
        const peer = room.get(oldest);
        room.delete(oldest);
        try {
          peer?.socket.close(4000, 'superseded');
        } catch {
          /* ignore */
        }
      }
    }
    const connId = `c${++this.connSeq}`;
    room.set(connId, { connId, userId, displayName, socket, lastTypingAt: 0 });
    this.rooms.set(threadId, room);
    return () => {
      const r = this.rooms.get(threadId);
      if (r) {
        r.delete(connId);
        if (r.size === 0) this.rooms.delete(threadId);
      }
    };
  }

  /** Remove a specific connection (called on socket close). */
  remove(threadId: string, connId: string): void {
    const room = this.rooms.get(threadId);
    if (!room) return;
    room.delete(connId);
    if (room.size === 0) this.rooms.delete(threadId);
  }

  /** Find a peer in a thread room. Used by the route to enforce typing rate limits. */
  peer(threadId: string, connId: string): ThreadRealtimePeer | undefined {
    return this.rooms.get(threadId)?.get(connId);
  }

  roomSize(threadId: string): number {
    return this.rooms.get(threadId)?.size ?? 0;
  }

  totalRooms(): number {
    return this.rooms.size;
  }

  private sendTo(peer: ThreadRealtimePeer, event: WireEvent): void {
    if (peer.socket.readyState !== OPEN) return;
    try {
      peer.socket.send(JSON.stringify(event));
    } catch {
      /* a dead socket is pruned on close */
    }
  }

  /**
   * Broadcast a newly persisted message to every subscriber of the thread.
   * `excludeUserId` skips the sender (they already have the optimistic bubble —
   * unless the broadcast carries their `clientMessageId`, in which case they
   * DO get it so they can reconcile the optimistic row).
   */
  broadcastMessage(threadId: string, message: ThreadMessagePayload): void {
    const room = this.rooms.get(threadId);
    if (!room || room.size === 0) return;
    const event: WireEvent = {
      type: 'message.new',
      threadId,
      ts: Date.now(),
      message,
    };
    for (const peer of room.values()) this.sendTo(peer, event);
  }

  /**
   * Broadcast typing state to everyone in the thread *except* the typist.
   * Rate-limited on the sender's connection: returns false and drops the
   * packet when the same connection typed within `minIntervalMs`.
   */
  broadcastTyping(
    threadId: string,
    from: { userId: string; displayName: string },
    typing: boolean,
    opts: { senderConnId?: string; minIntervalMs?: number } = {},
  ): boolean {
    const room = this.rooms.get(threadId);
    if (!room || room.size === 0) return true;
    const now = Date.now();
    const minIntervalMs = opts.minIntervalMs ?? 800;
    if (opts.senderConnId) {
      const sender = room.get(opts.senderConnId);
      if (sender && minIntervalMs > 0 && now - sender.lastTypingAt < minIntervalMs) {
        return false;
      }
      if (sender) sender.lastTypingAt = now;
    }
    const event: WireEvent = {
      type: 'typing',
      threadId,
      ts: now,
      typing: { userId: from.userId, displayName: from.displayName, typing },
    };
    for (const peer of room.values()) {
      if (opts.senderConnId && peer.connId === opts.senderConnId) continue;
      if (peer.userId === from.userId) continue;
      this.sendTo(peer, event);
    }
    return true;
  }

  /** Reset all rooms (tests only). */
  __reset(): void {
    this.rooms.clear();
    this.connSeq = 0;
  }
}

/** Process-wide singleton hub. */
export const threadRealtimeHub = new ThreadRealtimeHub();
