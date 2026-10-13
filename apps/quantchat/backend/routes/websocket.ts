import type { FastifyInstance, FastifyRequest } from 'fastify';
import websocketPlugin, { type WebSocket } from '@fastify/websocket';
import { ConnectionAuth, AuthError } from '@quant/realtime';
import { assertProductionSecret, requiresRealSecret } from '@quant/server-core';
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
import { getPrivacyService, type PrivacyService } from '../services/privacy.service';
import type { AccountStatusGate } from '../lib/account-status';

/**
 * QC-F-080: the WS verifier reads its secret straight from the env, so the
 * REST boot guards never covered it — and its old check was production-only
 * AND length-only, so staging booted on a second public fallback string and
 * production accepted any long-enough public placeholder explicitly set as
 * JWT_SECRET (the value itself was never checked). Now: deployed
 * (non-local) envs get the same value check as REST (assertProductionSecret)
 * and a missing secret is a hard boot failure; the dev fallback survives
 * ONLY for local development/test.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  const env = process.env.NODE_ENV ?? 'development';
  if (secret) {
    if (requiresRealSecret(env)) {
      return assertProductionSecret(secret, {
        name: 'JWT_SECRET',
        provisionedBy: 'External Secrets (AWS Secrets Manager key quant/jwt)',
      });
    }
    return secret;
  }
  if (requiresRealSecret(env)) {
    throw new Error(`JWT_SECRET environment variable is required in ${env}`);
  }
  globalThis.console.warn(
    '[SECURITY] JWT_SECRET not set - using dev-only fallback. NEVER use in production.',
  );
  return 'dev-only-insecure-jwt-secret-not-for-production-use-000';
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

/**
 * QC-F-041 — live-socket registry for account-status enforcement.
 *
 * The connect-time gate (ConnectionAuth accountStatus resolver) stops NEW
 * sockets for deleted/suspended users, but a socket opened BEFORE the
 * delete would otherwise live forever (sockets have no TTL). This
 * module-level registry tracks every live socket by userId so the delete
 * handler (routes/settings.ts) can close the deleter's already-open
 * sockets on THIS instance. Other instances pick the account up via the
 * connect-time gate + the REST gate; already-open sockets on other
 * instances are the documented residual (see build-QC-F-041 report).
 */
const liveSocketsByUser = new Map<string, Set<WebSocket>>();

export function registerLiveSocket(userId: string, socket: WebSocket): void {
  let set = liveSocketsByUser.get(userId);
  if (!set) {
    set = new Set();
    liveSocketsByUser.set(userId, set);
  }
  set.add(socket);
}

export function unregisterLiveSocket(userId: string, socket: WebSocket): void {
  const set = liveSocketsByUser.get(userId);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) liveSocketsByUser.delete(userId);
}

/**
 * Close every live socket belonging to `userId` on this instance: an
 * error frame carrying the machine-readable `code`, then close 4001
 * (the same code the connect-time gate uses). Returns how many sockets
 * were closed.
 */
export function closeLiveSocketsForUser(userId: string, code: string): number {
  const set = liveSocketsByUser.get(userId);
  if (!set || set.size === 0) return 0;
  let closed = 0;
  for (const socket of [...set]) {
    try {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'error', code, message: 'Authentication required' }));
      }
      socket.close(4001, code);
      closed++;
    } catch {
      // A half-dead socket must not stop the others from closing.
    }
    unregisterLiveSocket(userId, socket);
  }
  return closed;
}

export async function websocketRoutes(fastify: FastifyInstance) {
  await fastify.register(websocketPlugin);

  // QC-F-041: the shared account-status gate decorated in buildApp — the
  // WS verifier applies the same deny-list verdicts as the REST gate.
  const statusGate = (fastify as unknown as { accountStatusGate?: AccountStatusGate })
    .accountStatusGate;

  const auth = new ConnectionAuth({
    jwtSecret: getJwtSecret(),
    jwtIssuer: process.env.JWT_ISSUER || 'quantchat',
    jwtAudience: process.env.JWT_AUDIENCE || 'quant-ecosystem',
    accountStatus: statusGate?.resolver,
  });

  const rooms = new Map<string, Set<WebSocket>>();
  const socketUsers = new Map<WebSocket, string>();
  /**
   * QC-F-037 — conversations whose membership has been verified for a given
   * socket on THIS connection. Populated only by a successful membership
   * check; used as a cache for high-frequency typing frames. Write frames
   * with durable side effects (chat_message, receipts) always re-verify
   * against the DB. Cleared when the socket closes.
   */
  const verifiedRooms = new Map<WebSocket, Set<string>>();
  /**
   * Per-channel recent envelopes for §20 resume. Keyed by canonical channel.
   * QC-F-042 amend (gap 3): each entry also carries the event's per-recipient
   * delivery exclusions, so a resume replay can never disclose an event to a
   * user the live delivery deliberately withheld it from.
   */
  const resumeBuffers = new Map<
    string,
    Array<{ envelope: ChatEventEnvelope; excludeUserIds?: string[] }>
  >();

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

  // QC-F-042 — privacy enforcement for the realtime layer. One shared
  // PrivacyService (30s-cached resolver) gates presence publication, the
  // presence list, typing frames, and read-receipt fan-out below. When no
  // Prisma is wired (minimal harness) there is no prefs store to consult
  // and the layer keeps its previous behaviour.
  const privacy: PrivacyService | null = prismaClient
    ? getPrivacyService(prismaClient)
    : null;

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
  function bufferForResume(
    channel: string,
    envelope: ChatEventEnvelope,
    excludeUserIds?: readonly string[],
  ): void {
    if (isEphemeralEvent(envelope.event_type)) return;
    let buffer = resumeBuffers.get(channel);
    if (!buffer) {
      buffer = [];
      resumeBuffers.set(channel, buffer);
    }
    buffer.push({
      envelope,
      ...(excludeUserIds && excludeUserIds.length > 0
        ? { excludeUserIds: [...excludeUserIds] }
        : {}),
    });
    while (buffer.length > RESUME_BUFFER_SIZE) buffer.shift();
  }

  /** Latest cursor for a channel, or null when nothing was published yet. */
  function latestCursor(channel: string): string | null {
    const buffer = resumeBuffers.get(channel);
    if (!buffer || buffer.length === 0) return null;
    return buffer[buffer.length - 1]?.envelope.cursor ?? null;
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
    // Buffer remote envelopes for §20 resume as well (with their delivery
    // exclusions, so a replay honours them too).
    if (event.envelope && conversationId !== BACKPLANE_PRESENCE_CHANNEL) {
      bufferForResume(conversationChannel(conversationId), event.envelope, event.excludeUserIds);
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
      if (client.readyState !== client.OPEN) continue;
      // QC-F-042 amend (gap 3): per-recipient exclusion — never deliver an
      // event to a socket whose user the publisher excluded (e.g. a read
      // tick withheld from a receipts-off sender).
      const clientUserId = socketUsers.get(client);
      if (clientUserId && event.excludeUserIds?.includes(clientUserId)) continue;
      client.send(data);
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
    // QC-F-042: a user with showOnlineStatus off never has their transitions
    // published — not to this instance's sockets and not over the backplane
    // (which is why remote instances need no second gate: the event simply
    // never exists). The presence ZSET itself is untouched — the
    // DeliveryWorker's offline check depends on it; only PUBLICATION is
    // gated. A prefs read failure resolves most-restrictive (false), so an
    // error hides the transition instead of leaking it.
    if (privacy) {
      const { prefs } = await privacy.resolve(userId);
      if (!prefs.showOnlineStatus) return;
    }
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
   * QC-F-037 — membership gate. The WS layer previously joined ANY
   * authenticated socket to ANY conversation room without ever checking
   * that the user belongs to the conversation (BOLA): a logged-in user
   * could read live events + resume replays, inject chat_message/typing
   * frames, and record forged delivery/read receipts for conversations
   * they are not a member of. Identity comes only from the verified JWT
   * (the `userId` bound to the socket at upgrade time); the check mirrors
   * MessageService.sendMessage's membership query exactly
   * (`conversationMember.findFirst({ conversationId, userId, leftAt: null })`).
   *
   * Fail-closed: with no Prisma client, no membership delegate, or a DB
   * error, membership is treated as NOT proven and the join/frame is
   * denied — never assumed.
   */
  async function isConversationMember(
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    if (!prismaClient) return false;
    const prisma = prismaClient as {
      conversationMember?: {
        findFirst(args: unknown): Promise<unknown>;
      };
    };
    if (!prisma.conversationMember?.findFirst) return false;
    try {
      const membership = await prisma.conversationMember.findFirst({
        where: { conversationId, userId, leftAt: null },
      });
      return membership !== null && membership !== undefined;
    } catch (err: unknown) {
      fastify.log.error(
        { err, conversationId, userId },
        'conversation membership check failed; denying (fail-closed)',
      );
      return false;
    }
  }

  /**
   * QC-F-037 — room-level denial. The socket is NOT closed: web clients use
   * one shared singleton socket for every conversation, so closing it would
   * drop the user's legitimate rooms too. Instead the client receives the
   * WS form of the REST convention (403 NOT_A_MEMBER) scoped to this one
   * conversation; the socket and its other rooms are unaffected.
   */
  function sendNotMember(socket: WebSocket, conversationId: string): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(
        JSON.stringify({
          type: 'error',
          code: 'NOT_A_MEMBER',
          conversationId,
          message: 'User is not a member of this conversation',
        }),
      );
    }
  }

  /** Remember a verified membership for this socket/connection. */
  function markVerified(socket: WebSocket, conversationId: string): void {
    let set = verifiedRooms.get(socket);
    if (!set) {
      set = new Set<string>();
      verifiedRooms.set(socket, set);
    }
    set.add(conversationId);
  }

  /**
   * QC-F-037 — gated join used by BOTH join paths (connect-time
   * `?conversationId=` and the `join_conversation` frame). A non-member is
   * never added to the room, never subscribed, and `resumeForJoin` is never
   * called for them — so they receive no replay, no `resumed` frame and not
   * even the channel's latest cursor (which would leak activity metadata).
   */
  async function tryJoinRoom(
    conversationId: string,
    socket: WebSocket,
    userId: string,
    lastEventCursor: unknown,
  ): Promise<boolean> {
    if (!(await isConversationMember(conversationId, userId))) {
      sendNotMember(socket, conversationId);
      return false;
    }
    markVerified(socket, conversationId);
    if (joinRoom(conversationId, socket)) {
      ensureSubscribed(conversationId);
    }
    resumeForJoin(socket, conversationId, lastEventCursor, userId);
    return true;
  }

  /**
   * QC-F-037 — gate for a write/side-effect frame. Frames can arrive without
   * any prior join, so room membership in the local Map is not proof.
   * `fresh: true` (chat_message, receipts — durable/visible effects) always
   * re-checks the DB, like REST sendMessage does per request. `fresh: false`
   * (typing — high-frequency, ephemeral) may reuse this connection's
   * verified set, falling back to a fresh DB check on a miss.
   */
  async function ensureFrameMember(
    conversationId: string,
    socket: WebSocket,
    userId: string,
    opts: { fresh: boolean },
  ): Promise<boolean> {
    if (!opts.fresh && verifiedRooms.get(socket)?.has(conversationId)) {
      return true;
    }
    if (await isConversationMember(conversationId, userId)) {
      markVerified(socket, conversationId);
      return true;
    }
    sendNotMember(socket, conversationId);
    return false;
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
    userId: string,
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
    // QC-F-042 amend (gap 3): entries excluded for THIS user are never
    // replayed to them — a reconnect must not undo the live withholding.
    const missed = buffer.filter(
      (e) =>
        e.envelope.sequence > parsed.sequence &&
        !(e.excludeUserIds?.includes(userId) ?? false),
    );
    const oldestBuffered = buffer.length > 0 ? buffer[0]?.envelope.sequence ?? null : null;
    if (oldestBuffered !== null && parsed.sequence < oldestBuffered) {
      send({ type: 'snapshot_required', cursor: latestCursor(channel) });
      return;
    }
    for (const entry of missed) send(entry.envelope);
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
    opts?: { exclude?: WebSocket; excludeUserIds?: readonly string[] },
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
    bufferForResume(channel, envelope, opts?.excludeUserIds);

    // 1. Local delivery (origin instance delivers at publish time).
    // QC-F-042 amend (gap 3): sockets belonging to an excluded user are
    // skipped — the per-recipient filter travels with the event (see the
    // RoomEvent below) so remote instances and resume replays honour it too.
    const room = rooms.get(conversationId);
    if (room) {
      const data = JSON.stringify(envelope);
      for (const client of room) {
        if (client === opts?.exclude || client.readyState !== client.OPEN) continue;
        const clientUserId = socketUsers.get(client);
        if (clientUserId && opts?.excludeUserIds?.includes(clientUserId)) continue;
        client.send(data);
      }
    }

    // 2. Cross-instance fan-out — stamped with this instance's id by publish().
    const event: RoomEvent = {
      type: 'new_message',
      originInstanceId: backplane.instanceId,
      payload: envelope,
      envelope,
      ...(opts?.excludeUserIds && opts.excludeUserIds.length > 0
        ? { excludeUserIds: [...opts.excludeUserIds] }
        : {}),
    };
    try {
      await backplane.publish(conversationId, event);
    } catch (err) {
      fastify.log.error({ err, conversationId }, 'backplane publish failed');
    }
    return envelope;
  }

  /**
   * QC-F-042 amend (PR #956 review gap 2) — bind a receipt frame's messageId
   * to the conversation it claims. QC-F-037's `ensureFrameMember` proves the
   * caller belongs to the CLIENT-SUPPLIED conversationId, but nothing proved
   * the messageId lives in that conversation: a member of conversation A
   * could pass conversationId=A + a messageId from conversation B and get a
   * receipt written (and a tick fanned into A) for B's message. Returns the
   * message's owning conversation + sender, or null when the binding cannot
   * be proven (no store, no message delegate, unknown message, DB error) —
   * callers treat null as "drop the frame" (fail-closed).
   */
  async function lookupMessageBinding(
    messageId: string,
  ): Promise<{ conversationId: string; senderId: string } | null> {
    if (!prismaClient) return null;
    const prisma = prismaClient as {
      message?: {
        findUnique: (
          args: unknown,
        ) => Promise<{ conversationId?: unknown; senderId?: unknown } | null>;
      };
    };
    if (!prisma.message?.findUnique) return null;
    try {
      const row = await prisma.message.findUnique({
        where: { id: messageId },
        select: { conversationId: true, senderId: true },
      });
      if (
        !row ||
        typeof row.conversationId !== 'string' ||
        typeof row.senderId !== 'string'
      ) {
        return null;
      }
      return { conversationId: row.conversationId, senderId: row.senderId };
    } catch (err: unknown) {
      fastify.log.error(
        { err, messageId },
        'message binding lookup failed; dropping receipt frame (fail-closed)',
      );
      return null;
    }
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
    void (async () => {
      // QC-F-042 amend (gap 2): bind the message to the frame's conversation
      // before anything is written or fanned out. With a store wired, an
      // unprovable or mismatched binding — or the message's own sender
      // trying to ack it (the sender is never its recipient) — drops the
      // frame silently: no DB write, no event. Without any store (minimal
      // harness) there is nothing to bind against and the historical
      // fan-only behaviour is kept.
      let senderId: string | null = null;
      if (prismaClient) {
        const binding = await lookupMessageBinding(messageId);
        if (
          !binding ||
          binding.conversationId !== conversationId ||
          binding.senderId === recipientId
        ) {
          fastify.log.error(
            { messageId, conversationId, recipientId, receipt },
            'receipt frame dropped: message not bound to this conversation for this recipient',
          );
          return;
        }
        senderId = binding.senderId;
      }

      const fan = (): void => {
        void (async () => {
          // QC-F-042 amend (gap 3): sender-side reciprocity on the LIVE
          // event. The reader-side gate below stops a receipts-off READER
          // from emitting reads; this stops a receipts-off SENDER from
          // RECEIVING them live — previously only the REST status view was
          // masked, so the disclosure happened anyway over WS. The event
          // still reaches the room's other members (per-recipient filter,
          // carried through the backplane and the resume buffer).
          // Delivered ticks are never gated (transport fact).
          let excludeUserIds: string[] | undefined;
          if (receipt === 'read' && senderId && privacy) {
            const { prefs } = await privacy.resolve(senderId);
            if (!prefs.showReadReceipts) excludeUserIds = [senderId];
          }
          void publishRoomEvent(
            conversationId,
            'chat.message.receipt_updated.v1',
            {
              resourceRef: messageId,
              aggregateVersion: 1,
              data: { messageId, conversationId, userId: recipientId, receipt },
            },
            { excludeUserIds },
          );
        })();
      };

      if (!deliveryReceipts) {
        // No durable store wired (minimal harness): still propagate the tick.
        fan();
        return;
      }

      // QC-F-042 reader-side gate (WS path): when the reader's
      // showReadReceipts is off, the read is neither persisted nor fanned
      // out — the REST path in ReceiptService.markMessageRead applies the
      // same rule. Delivered receipts are never gated. The check runs before
      // recording so a suppressed read leaves no row behind.
      if (method === 'recordRead' && privacy) {
        const { prefs } = await privacy.resolve(recipientId);
        if (!prefs.showReadReceipts) return;
      }

      try {
        await deliveryReceipts[method](messageId, recipientId);
        fan();
      } catch (err: unknown) {
        fastify.log.error({ err, messageId, recipientId, receipt }, 'receipt recording failed');
      }
    })();
  }

  /**
   * Remove a socket from every room it belongs to. When a room becomes empty
   * (the last local socket left), unsubscribe this instance from the backplane
   * channel for that conversation (Requirement 4.2).
   */
  function leaveAllRooms(socket: WebSocket): void {
    verifiedRooms.delete(socket);
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
        // QC-F-041: carry the machine-readable reason (ACCOUNT_DELETED /
        // ACCOUNT_SUSPENDED / UPSTREAM_UNAVAILABLE) when the gate supplied
        // one, so the client can tell a dead account from an expired token
        // instead of refresh-looping. Plain auth failures keep the exact
        // pre-existing frame shape — no `code` field at all (pinned by
        // QC-F-037 case 8).
        const authCode = error instanceof AuthError ? error.authCode : undefined;
        socket.send(
          JSON.stringify(
            authCode
              ? { type: 'error', code: authCode, message: 'Authentication required' }
              : { type: 'error', message: 'Authentication required' },
          ),
        );
        socket.close(code, 'Authentication required');
        return;
      }

      socketUsers.set(socket, userId);
      registerLiveSocket(userId, socket);
      // Record presence in the shared ZSET (score = now). When this is the
      // first live device for the user, publish the online transition across
      // the cluster (Requirement 5.1, 5.3).
      if (presence.setOnline(userId, 'quantchat')) {
        void publishPresence(userId, 'online');
      }

      const query = request.query as { conversationId?: string };
      if (query.conversationId) {
        // QC-F-037 — membership-gated: a non-member is not joined, not
        // resumed, and receives only a NOT_A_MEMBER error frame (the socket
        // itself stays open for the user's legitimate conversations).
        await tryJoinRoom(query.conversationId, socket, userId, undefined);
      }

      // QC-F-037 — frames are handled through a per-socket promise queue.
      // The membership gates are async (DB lookup), and without sequencing
      // two frames sent back-to-back could interleave at an await point and
      // publish out of order. The queue preserves the exact per-socket
      // frame ordering the previous synchronous handler had.
      const handleMessage = async (rawData: Buffer | string): Promise<void> => {
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
            // QC-F-037 — membership-gated join; resume (§20) only ever runs
            // for a verified member (see tryJoinRoom).
            await tryJoinRoom(
              message.conversationId,
              socket,
              userId,
              message.last_event_cursor,
            );
          }

          if (message.type === 'chat_message' && typeof message.conversationId === 'string') {
            // QC-F-037 — a non-member must not inject a live message into a
            // conversation (nor into its resume buffer). Fresh DB check on
            // every frame, mirroring REST sendMessage.
            if (
              await ensureFrameMember(message.conversationId, socket, userId, {
                fresh: true,
              })
            ) {
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
          }

          if (message.type === 'typing' && typeof message.conversationId === 'string') {
            // QC-F-037 — typing ghosts from non-members are dropped. Typing
            // is high-frequency + ephemeral, so this connection's verified
            // set may be reused (fresh DB check on a miss).
            if (
              await ensureFrameMember(message.conversationId, socket, userId, {
                fresh: false,
              })
            ) {
              const conversationId = message.conversationId;
              const isTyping = Boolean(message.isTyping);
              // QC-F-042: the sender's showTypingIndicator gates their own
              // typing frames. A suppressed frame is dropped SILENTLY — no
              // error frame back to the sender (typing is a soft signal; an
              // error would invite client retries/spam).
              void (async () => {
                if (privacy) {
                  const { prefs } = await privacy.resolve(userId);
                  if (!prefs.showTypingIndicator) return;
                }
                await publishRoomEvent(
                  conversationId,
                  'chat.typing.v1',
                  {
                    resourceRef: userId,
                    aggregateVersion: 1,
                    data: { userId, isTyping },
                  },
                  { exclude: socket },
                );
              })();
            }
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
            // QC-F-037 — receipts persist + fan out, so a non-member must
            // never record a forged delivered tick. Fresh DB check.
            if (
              await ensureFrameMember(conversationId, socket, userId, { fresh: true })
            ) {
              recordAndFan('recordDelivered', 'delivered', messageId, conversationId, userId);
            }
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
            // QC-F-037 — same gate as delivery_ack: a forged "read" tick
            // from a non-member is a lie to the sender. Fresh DB check.
            if (
              await ensureFrameMember(conversationId, socket, userId, { fresh: true })
            ) {
              recordAndFan('recordRead', 'read', messageId, conversationId, userId);
            }
          }
        } catch (err) {
          fastify.log.error({ err }, 'WebSocket message handling failed');
        }
      };
      let messageQueue: Promise<void> = Promise.resolve();
      socket.on('message', (rawData: Buffer | string) => {
        messageQueue = messageQueue.then(() => handleMessage(rawData));
      });

      socket.on('close', () => {
        leaveAllRooms(socket);
        socketUsers.delete(socket);
        unregisterLiveSocket(userId, socket);
        // When the last live device disconnects, publish the offline transition
        // across the cluster (Requirement 5.3).
        if (presence.setOffline(userId)) {
          void publishPresence(userId, 'offline');
        }
      });
    },
  );

  fastify.get('/presence', async () => {
    const online = presence.getOnlineInApp('quantchat');
    // QC-F-042: users with showOnlineStatus off are filtered out of the
    // snapshot (their ZSET entry stays — only visibility is gated). A
    // prefs failure hides the user rather than failing the whole list.
    if (!privacy || online.length === 0) return { online };
    const resolved = await privacy.resolveMany(online);
    return {
      online: online.filter((id) => resolved.get(id)?.prefs.showOnlineStatus ?? false),
    };
  });
}
