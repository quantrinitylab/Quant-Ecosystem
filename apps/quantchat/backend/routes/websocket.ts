import type { FastifyInstance, FastifyRequest } from 'fastify';
import websocketPlugin, { type WebSocket } from '@fastify/websocket';
import { ConnectionAuth, AuthError } from '@quant/realtime';
import type { PresenceManager } from '@quant/realtime/presence';
import type { RealtimeBackplane, RoomEvent } from '../services/realtime-backplane';
import { BACKPLANE_PRESENCE_CHANNEL } from '../services/realtime-backplane';
import {
  buildChatEvent,
  conversationChannel,
  isChatEventEnvelope,
  isEphemeralEvent,
  parseCursor,
  type ChatEventEnvelope,
  type ChatEventType,
} from '../services/chat-event-envelope';
import { DeliveryReceiptService } from '../services/delivery-receipt.service';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET must be set to a value of at least 32 characters in production');
    }
    return secret;
  }
  if (!secret) {
    globalThis.console.warn(
      '[SECURITY] JWT_SECRET not set - using dev-only fallback. NEVER use in production.',
    );
    return 'dev-only-insecure-jwt-secret-not-for-production-use-000';
  }
  return secret;
}

/**
 * K25 — resume ring buffer. Contract §20: on (re)join the client may send
 * `last_event_cursor`; buffered events with a greater sequence are replayed so
 * a brief disconnect loses nothing. Ephemeral events (typing/presence, §19)
 * are never buffered — they are not durable facts. When the gap exceeds the
 * buffer the server answers `snapshot_required` and the client recovers durable
 * state through the REST query path (contract: "durable state remains
 * recoverable through queries/cursors").
 */
const RESUME_BUFFER_SIZE = 100;

export async function websocketRoutes(fastify: FastifyInstance) {
  await fastify.register(websocketPlugin);

  const auth = new ConnectionAuth({
    jwtSecret: getJwtSecret(),
    jwtIssuer: process.env.JWT_ISSUER || 'quantchat',
    jwtAudience: process.env.JWT_AUDIENCE || 'quant-ecosystem',
  });

  const rooms = new Map<string, Set<WebSocket>>();
  const socketUsers = new Map<WebSocket, string>();
  /** Per-channel recent envelopes for §20 resume. Keyed by canonical channel. */
  const resumeBuffers = new Map<string, ChatEventEnvelope[]>();

  // W3 — First-class delivery and read receipts (Task 14, design Data Model 5 /
  // Sequence 2 / Requirement 10). Recipient sockets ack receipt and signal reads
  // over the WS connection; the receipts are persisted in the `MessageDelivery`
  // table (one row per `(messageId, userId)`) and the corresponding
  // delivery/read room events are fanned across the cluster so the SENDER's
  // socket can render sent/delivered/read ticks (ties into Requirement 12.5 on
  // the frontend). The service is built from the shared `fastify.prisma`
  // decorator; when Prisma is unavailable (e.g. a minimal test harness) receipt
  // recording is skipped but realtime fan-out of the tick event still happens.
  const prismaClient = (fastify as unknown as { prisma?: unknown }).prisma;
  const deliveryReceipts = prismaClient ? new DeliveryReceiptService(prismaClient as never) : null;

  // W2 — Cross-instance realtime fan-out (design Component 2 / Algorithm 4).
  // Select the backplane implementation here (Task 6.2): use the Redis pub/sub
  // backplane when REDIS_URL is configured, otherwise fall back to the no-op
  // single-node InProcessBackplane. The `rooms` map above remains this
  // instance's LOCAL socket registry; the backplane only carries events between
  // instances.
  //
  // W2 — Degraded single-node fallback + reconnect (Task 8, design Error
  // Handling "Redis/NATS unavailable"). ioredis owns reconnection: a
  // `retryStrategy` with exponential backoff (1s → cap 30s — Requirement 6.2)
  // keeps retrying a downed Redis, while `maxRetriesPerRequest: null` prevents
  // individual commands from erroring out mid-outage. The RedisRealtimeBackplane
  // starts degraded until its first `ready`, re-subscribes every active
  // conversation channel AND the presence channel on (re)connect, and reports
  // its health via `isHealthy()` (surfaced on /healthz below). Throughout an
  // outage local delivery still happens at publish time (Requirement 6.3).
  // W2/W3 — Shared realtime context. The backplane + presence manager are
  // created once in buildApp() and decorated on the app, so this websocket layer
  // and the DeliveryWorker share the SAME instances (one Redis client, one
  // presence ZSET, one channel-subscription set) — the single source of truth
  // required for at-least-once cross-instance delivery. Backplane health
  // transitions are logged at the factory; the contributor below reflects them.
  const realtime = fastify as unknown as {
    realtimeBackplane: RealtimeBackplane;
    presence: PresenceManager;
  };
  const backplane = realtime.realtimeBackplane;

  // Surface backplane health on the shared /healthz endpoint (Requirement
  // 6.1/6.2). The contributor is evaluated per request, so it always reflects
  // the live connection state: `degraded` while a configured Redis backplane is
  // unreachable (single-node mode), `ok` once connected (or when running as a
  // deliberate single-node InProcessBackplane). Guarded so the route still works
  // if the host app's health plugin predates the contributor registry.
  const healthAware = fastify as unknown as {
    addHealthContributor?: (
      name: string,
      contributor: () => { status: 'ok' | 'degraded' | 'unavailable'; detail?: string },
    ) => void;
  };
  if (typeof healthAware.addHealthContributor === 'function') {
    healthAware.addHealthContributor('realtime-backplane', () =>
      backplane.isHealthy()
        ? { status: 'ok' }
        : {
            status: 'degraded',
            detail: 'realtime backplane unreachable; running in single-node mode',
          },
    );
  }

  // Presence shares the same instance created in buildApp() (Redis-backed when
  // REDIS_URL is set, in-memory otherwise) so the DeliveryWorker's offline
  // check sees the exact same online set this layer maintains.
  const presence = realtime.presence;

  // Dedicated, cluster-wide channel carrying user presence transitions. Presence
  // is user-scoped rather than conversation-scoped, so it rides its own channel
  // (reusing the per-conversation backplane plumbing) instead of a room channel.
  backplane.subscribe(BACKPLANE_PRESENCE_CHANNEL).catch((err: unknown) => {
    fastify.log.error({ err }, 'backplane presence subscribe failed');
  });

  /** Append an envelope to the per-channel resume buffer (bounded). */
  function bufferForResume(channel: string, envelope: ChatEventEnvelope): void {
    if (isEphemeralEvent(envelope.event_type)) return;
    let buffer = resumeBuffers.get(channel);
    if (!buffer) {
      buffer = [];
      resumeBuffers.set(channel, buffer);
    }
    buffer.push(envelope);
    while (buffer.length > RESUME_BUFFER_SIZE) buffer.shift();
  }

  /** Latest cursor for a channel, or null when nothing was published yet. */
  function latestCursor(channel: string): string | null {
    const buffer = resumeBuffers.get(channel);
    if (!buffer || buffer.length === 0) return null;
    return buffer[buffer.length - 1]?.cursor ?? null;
  }

  /**
   * Algorithm 4 — cross-instance fan-out. Inbound backplane events whose origin
   * is THIS instance were already delivered to local sockets at publish time, so
   * they are discarded here to avoid double-delivery (Requirement 4.4). Genuine
   * remote events are forwarded to every open local socket in the room
   * (Requirement 4.5), guaranteeing each member socket receives the event
   * exactly once across the cluster (Requirement 4.6).
   *
   * K25 — the wire frame is now the contract §18 envelope (`event.envelope`);
   * legacy `payload`-only events are still forwarded for rolling-deploy
   * compatibility.
   */
  backplane.onMessage((conversationId: string, event: RoomEvent) => {
    if (event.originInstanceId === backplane.instanceId) return;
    const frame = event.envelope ?? event.payload;
    // Buffer remote envelopes for §20 resume as well.
    if (event.envelope && conversationId !== BACKPLANE_PRESENCE_CHANNEL) {
      bufferForResume(conversationChannel(conversationId), event.envelope);
    }
    // Presence transitions are user-scoped, not room-scoped: a remote instance
    // published it on the dedicated presence channel, so fan it out to every
    // open local socket (Requirement 5.3 — subscribed instances receive it; the
    // frontend re-renders affected indicators per Requirement 11.3).
    if (
      conversationId === BACKPLANE_PRESENCE_CHANNEL ||
      (isChatEventEnvelope(frame) && frame.event_type === 'chat.presence.v1')
    ) {
      broadcastToAllSockets(frame);
      return;
    }
    const room = rooms.get(conversationId);
    if (!room) return;
    const data = JSON.stringify(frame);
    for (const client of room) {
      if (client.readyState === client.OPEN) {
        client.send(data);
      }
    }
  });

  /** Send a payload to every open socket connected to THIS instance. */
  function broadcastToAllSockets(payload: unknown): void {
    const data = JSON.stringify(payload);
    for (const socket of socketUsers.keys()) {
      if (socket.readyState === socket.OPEN) {
        socket.send(data);
      }
    }
  }

  /**
   * Publish a user's online/offline transition over the backplane so every
   * subscribed instance learns about it (Requirement 5.3), and deliver it to
   * this instance's own sockets immediately. Stamped with this instance's id so
   * the origin does not double-deliver when the event echoes back.
   *
   * K25 — carried as a `chat.presence.v1` §18 envelope (ephemeral, §19).
   */
  async function publishPresence(userId: string, status: 'online' | 'offline'): Promise<void> {
    // Sender identity comes from the authenticated socket — never from client
    // input (fail-closed, QuantWave radar P0 lesson).
    const envelope = await buildChatEvent({
      eventType: 'chat.presence.v1',
      resourceRef: userId,
      aggregateVersion: 1,
      payload: { type: 'presence:update', userId, status, lastSeen: Date.now() },
      channel: BACKPLANE_PRESENCE_CHANNEL,
      sequencer: { next: (c: string) => backplane.nextSequence(c) },
    });
    broadcastToAllSockets(envelope);
    const event: RoomEvent = {
      type: 'presence:update',
      originInstanceId: backplane.instanceId,
      payload: envelope,
      envelope,
    };
    try {
      await backplane.publish(BACKPLANE_PRESENCE_CHANNEL, event);
    } catch (err: unknown) {
      fastify.log.error({ err, userId }, 'backplane presence publish failed');
    }
  }

  /**
   * Add a socket to a conversation's local room. Returns true when this is the
   * first local socket for the conversation (i.e. the room did not previously
   * exist), which is the signal that this instance must subscribe to the
   * conversation channel on the backplane (Requirement 4.1).
   */
  function joinRoom(conversationId: string, socket: WebSocket): boolean {
    let room = rooms.get(conversationId);
    const isNewRoom = !room;
    if (!room) {
      room = new Set();
      rooms.set(conversationId, room);
    }
    room.add(socket);
    return isNewRoom;
  }

  /**
   * Subscribe this instance to a conversation channel the first time a local
   * socket joins the room (Requirement 4.1). Subscription is idempotent at the
   * backplane level, so a redundant call is harmless.
   */
  function ensureSubscribed(conversationId: string): void {
    backplane.subscribe(conversationId).catch((err: unknown) => {
      fastify.log.error({ err, conversationId }, 'backplane subscribe failed');
    });
  }

  /**
   * K25 — §20 resume. Replays buffered envelopes newer than the client's
   * `last_event_cursor` for the conversation channel. Answers:
   *   { type: 'resumed', replayed, cursor } — all missed events replayed, or
   *   { type: 'snapshot_required', cursor } — the gap exceeds the buffer; the
   * client must recover durable state through the REST query path.
   */
  function resumeForJoin(
    socket: WebSocket,
    conversationId: string,
    lastEventCursor: unknown,
  ): void {
    const channel = conversationChannel(conversationId);
    const send = (frame: unknown): void => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(frame));
      }
    };
    if (typeof lastEventCursor !== 'string' || lastEventCursor.length === 0) {
      const cursor = latestCursor(channel);
      send({ type: 'resumed', replayed: 0, cursor });
      return;
    }
    const parsed = parseCursor(lastEventCursor);
    if (!parsed || parsed.channel !== channel) {
      // Fail-closed on malformed/foreign cursors: never replay the wrong room.
      send({ type: 'snapshot_required', cursor: latestCursor(channel) });
      return;
    }
    const buffer = resumeBuffers.get(channel) ?? [];
    const missed = buffer.filter((e) => e.sequence > parsed.sequence);
    const oldestBuffered = buffer.length > 0 ? buffer[0]?.sequence ?? null : null;
    if (oldestBuffered !== null && parsed.sequence < oldestBuffered) {
      send({ type: 'snapshot_required', cursor: latestCursor(channel) });
      return;
    }
    for (const envelope of missed) send(envelope);
    send({ type: 'resumed', replayed: missed.length, cursor: latestCursor(channel) });
  }

  /**
   * Deliver a room event to the local sockets AND publish it to the backplane so
   * peer instances can fan it out to their own sockets (Requirement 4.3). Local
   * delivery happens first so that — even if the backplane publish fails — the
   * sockets on this instance still receive the event (the publish-failure
   * retry/record path is completed in Task 8 / Requirement 4.7).
   *
   * K25 — every event is wrapped in the contract §18 envelope before delivery.
   */
  async function publishRoomEvent(
    conversationId: string,
    eventType: ChatEventType,
    input: { resourceRef: string; aggregateVersion?: number; data: unknown },
    opts?: { exclude?: WebSocket },
  ): Promise<ChatEventEnvelope | null> {
    const channel = conversationChannel(conversationId);
    let envelope: ChatEventEnvelope;
    try {
      envelope = await buildChatEvent({
        eventType,
        resourceRef: input.resourceRef,
        aggregateVersion: input.aggregateVersion,
        payload: input.data,
        channel,
        sequencer: { next: (c: string) => backplane.nextSequence(c) },
      });
    } catch (err) {
      fastify.log.error({ err, conversationId, eventType }, 'event envelope build failed');
      return null;
    }
    bufferForResume(channel, envelope);

    // 1. Local delivery (origin instance delivers at publish time).
    const room = rooms.get(conversationId);
    if (room) {
      const data = JSON.stringify(envelope);
      for (const client of room) {
        if (client !== opts?.exclude && client.readyState === client.OPEN) {
          client.send(data);
        }
      }
    }

    // 2. Cross-instance fan-out — stamped with this instance's id by publish().
    const event: RoomEvent = {
      type: 'new_message',
      originInstanceId: backplane.instanceId,
      payload: envelope,
      envelope,
    };
    try {
      await backplane.publish(conversationId, event);
    } catch (err) {
      fastify.log.error({ err, conversationId }, 'backplane publish failed');
    }
    return envelope;
  }

  /**
   * Persist a delivery/read receipt for `(messageId, userId)` and fan the
   * matching tick event across the cluster so the sender's socket updates its
   * sent/delivered/read indicator (Requirement 10.1/10.2 + 12.5). Recording and
   * fan-out are independent: if Prisma is unavailable the receipt is skipped but
   * the realtime tick still propagates; if recording fails it is logged and the
   * tick is suppressed so peers are not told of a receipt that was not stored.
   *
   * K25 — the tick is a `chat.message.receipt_updated.v1` §18 envelope.
   */
  function recordAndFan(
    method: 'recordDelivered' | 'recordRead',
    receipt: 'delivered' | 'read',
    messageId: string,
    conversationId: string,
    recipientId: string,
  ): void {
    const fan = (): void => {
      void publishRoomEvent(conversationId, 'chat.message.receipt_updated.v1', {
        resourceRef: messageId,
        aggregateVersion: 1,
        data: { messageId, conversationId, userId: recipientId, receipt },
      });
    };

    if (!deliveryReceipts) {
      // No durable store wired (minimal harness): still propagate the tick.
      fan();
      return;
    }

    deliveryReceipts[method](messageId, recipientId)
      .then(fan)
      .catch((err: unknown) => {
        fastify.log.error({ err, messageId, recipientId, receipt }, 'receipt recording failed');
      });
  }

  /**
   * Remove a socket from every room it belongs to. When a room becomes empty
   * (the last local socket left), unsubscribe this instance from the backplane
   * channel for that conversation (Requirement 4.2).
   */
  function leaveAllRooms(socket: WebSocket): void {
    for (const [conversationId, room] of rooms) {
      if (!room.delete(socket)) continue;
      if (room.size === 0) {
        rooms.delete(conversationId);
        backplane.unsubscribe(conversationId).catch((err: unknown) => {
          fastify.log.error({ err, conversationId }, 'backplane unsubscribe failed');
        });
      }
    }
  }

  // The backplane + Redis connection are owned by buildApp() (shared with the
  // DeliveryWorker) and torn down there on app close, so this layer no longer
  // registers its own shutdown hook.

  fastify.get(
    '/chat',
    {
      websocket: true,
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async (socket: WebSocket, request: FastifyRequest) => {
      let userId: string;
      try {
        const payload = await auth.authenticateUpgrade(request.raw);
        userId = payload.userId;
      } catch (error) {
        const code = error instanceof AuthError ? error.code : 4001;
        socket.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
        socket.close(code, 'Authentication required');
        return;
      }

      socketUsers.set(socket, userId);
      // Record presence in the shared ZSET (score = now). When this is the
      // first live device for the user, publish the online transition across
      // the cluster (Requirement 5.1, 5.3).
      if (presence.setOnline(userId, 'quantchat')) {
        void publishPresence(userId, 'online');
      }

      const query = request.query as { conversationId?: string };
      if (query.conversationId) {
        if (joinRoom(query.conversationId, socket)) {
          ensureSubscribed(query.conversationId);
        }
        resumeForJoin(socket, query.conversationId, undefined);
      }

      socket.on('message', (rawData: Buffer | string) => {
        try {
          const message = JSON.parse(rawData.toString());

          // Any inbound activity refreshes the user's last-seen timestamp in the
          // shared ZSET so the 30s freshness window stays accurate while the
          // socket is alive (Requirement 5.2). Explicit heartbeat/ping frames
          // exist so idle-but-connected clients keep their presence fresh.
          presence.heartbeat(userId, 'quantchat');

          if (message.type === 'heartbeat' || message.type === 'ping') {
            return;
          }

          if (message.type === 'join_conversation' && typeof message.conversationId === 'string') {
            if (joinRoom(message.conversationId, socket)) {
              ensureSubscribed(message.conversationId);
            }
            // K25 §20 — resume from the client's last cursor when provided.
            resumeForJoin(socket, message.conversationId, message.last_event_cursor);
          }

          if (message.type === 'chat_message' && typeof message.conversationId === 'string') {
            // Sender identity is stamped server-side from the authenticated
            // session — never trusted from the client frame.
            void publishRoomEvent(message.conversationId, 'chat.message.created.v1', {
              resourceRef:
                typeof message.client_message_id === 'string' && message.client_message_id
                  ? message.client_message_id
                  : `ws-${Date.now()}`,
              aggregateVersion: 1,
              data: { ...message, senderId: userId },
            });
          }

          if (message.type === 'typing' && typeof message.conversationId === 'string') {
            void publishRoomEvent(
              message.conversationId,
              'chat.typing.v1',
              {
                resourceRef: userId,
                aggregateVersion: 1,
                data: { userId, isTyping: Boolean(message.isTyping) },
              },
              { exclude: socket },
            );
          }

          // W3 — delivery acknowledgement (Requirement 10.1). A recipient socket
          // confirms it received a message; persist `deliveredAt` for
          // `(messageId, userId)` and fan a `message:delivered` tick across the
          // cluster so the sender's socket can render the delivered state
          // (Requirement 12.5). Accept `delivery_ack` and the `message:delivered`
          // alias.
          if (
            (message.type === 'delivery_ack' || message.type === 'message:delivered') &&
            typeof message.messageId === 'string' &&
            typeof message.conversationId === 'string'
          ) {
            const { messageId, conversationId } = message;
            recordAndFan('recordDelivered', 'delivered', messageId, conversationId, userId);
          }

          // W3 — read receipt (Requirements 10.2, 10.4). A recipient reads a
          // message; persist `readAt` (back-filling `deliveredAt` so it is never
          // later than `readAt`) and fan a `message:read` tick across the cluster.
          // Accept `read_receipt` and the `message:read` alias.
          if (
            (message.type === 'read_receipt' || message.type === 'message:read') &&
            typeof message.messageId === 'string' &&
            typeof message.conversationId === 'string'
          ) {
            const { messageId, conversationId } = message;
            recordAndFan('recordRead', 'read', messageId, conversationId, userId);
          }
        } catch (err) {
          fastify.log.error({ err }, 'WebSocket message handling failed');
        }
      });

      socket.on('close', () => {
        leaveAllRooms(socket);
        socketUsers.delete(socket);
        // When the last live device disconnects, publish the offline transition
        // across the cluster (Requirement 5.3).
        if (presence.setOffline(userId)) {
          void publishPresence(userId, 'offline');
        }
      });
    },
  );

  fastify.get('/presence', async () => {
    return { online: presence.getOnlineInApp('quantchat') };
  });
}
