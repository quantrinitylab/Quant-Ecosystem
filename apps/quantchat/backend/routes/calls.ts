import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import { CallService, type CallRegistryLookup } from '../services/call.service';
import { CallRecordService, type CallRecordPrisma } from '../services/call-record.service';
import { ConversationService } from '../services/conversation.service';
import { getPrivacyService } from '../services/privacy.service';

const initiate1v1Schema = z.object({
  calleeId: z.string().min(1),
  // QC-F-218: conversationId is REQUIRED so the membership gate has a
  // conversation to check. Without it, authorization is impossible by
  // construction — that was the bypass: any logged-in user could "call"
  // any userId, member or not. The shipped thread page always knows its
  // conversation id and sends it.
  conversationId: z.string().min(1),
});

const initiateGroupSchema = z.object({
  participantIds: z.array(z.string().min(1)).min(1).max(7),
  // QC-F-218: same requirement as the 1:1 schema — see above.
  conversationId: z.string().min(1),
});

const createCallSchema = z.object({
  conversationId: z.string().min(1),
  participantIds: z.array(z.string().min(1)).min(1),
  maxParticipants: z.number().int().min(2).max(8).optional().default(2),
});

const endCallSchema = z.object({
  roomId: z.string().min(1),
});

const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

/**
 * Build the durable call-history service from the shared `fastify.prisma`
 * decorator. Returns null when Prisma is unavailable (e.g. a minimal test
 * harness) so call persistence is skipped without breaking live signaling.
 */
function getCallRecordService(fastify: FastifyInstance): CallRecordService | null {
  const prisma = (fastify as unknown as { prisma?: CallRecordPrisma }).prisma;
  return prisma && prisma.call ? new CallRecordService(prisma) : null;
}

/**
 * Returns the shared CallService, constructed lazily on first use so the plugin
 * registers (and the backend boots) even when LiveKit is not configured.
 *
 * SECURITY (fail closed): LiveKit credentials are REQUIRED. When they are not
 * configured this throws instead of minting unsigned `mock_token_*` values a
 * client could forge. There is intentionally no 'devsecret' fallback — the API
 * secret must come from the LIVEKIT_API_SECRET environment variable.
 *
 * The instance is shared across requests so the in-memory call registry
 * (`CallService.calls`) stays consistent for join/token/leave lookups.
 *
 * QC-F-287: that registry is only a per-process CACHE — after a restart (or
 * on a second replica) it is empty while the call is still live. The shared
 * instance is therefore constructed with the durable CallRecordService as
 * its rehydration lookup, so a registry miss falls back to the persisted
 * `Call` row. The lookup binds at first construction; nothing outside this
 * plugin constructs the singleton, and every handler in this plugin passes
 * the same record service, so first-construction binding is sufficient.
 * When Prisma is unavailable (callRecord === null) the service is built
 * without a lookup and keeps the pre-QC-F-287 in-memory-only behaviour.
 */
let sharedCallService: CallService | null = null;

function getCallService(lookup?: CallRegistryLookup | null): CallService {
  if (!sharedCallService) {
    const apiKey = process.env['LIVEKIT_API_KEY'];
    const apiSecret = process.env['LIVEKIT_API_SECRET'];
    const wsUrl = process.env['LIVEKIT_WS_URL'] ?? process.env['LIVEKIT_URL'];
    if (!apiKey || !apiSecret || !wsUrl) {
      throw createAppError(
        'Calls are unavailable: LiveKit is not configured. ' +
          'Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET and LIVEKIT_WS_URL (or LIVEKIT_URL) to enable calls.',
        503,
        'CALLS_UNAVAILABLE',
      );
    }
    sharedCallService = new CallService({ apiKey, apiSecret, wsUrl }, lookup ?? undefined);
  }
  return sharedCallService;
}

/**
 * QC-F-075: build the conversation-membership gate used by POST /calls/create.
 * QC-F-218: the same gate now also guards POST /calls/initiate and
 * POST /calls/group, which previously bypassed it entirely.
 *
 * The gate lives in ConversationService (the QC-F-017 service-layer pattern),
 * so this helper only resolves the shared `fastify.prisma` decorator into a
 * service instance. Authorization must FAIL CLOSED: when Prisma (or the
 * delegates the gate needs) is unavailable, membership cannot be verified
 * and call creation is refused with 503 MEMBERSHIP_CHECK_UNAVAILABLE —
 * deliberately a different code from CALLS_UNAVAILABLE ("LiveKit is down")
 * so the two failure modes stay distinguishable. Skipping the gate when the
 * database handle is missing would silently reopen the impersonation hole.
 */
function getMembershipGate(fastify: FastifyInstance): ConversationService {
  const prisma = (fastify as unknown as { prisma?: PrismaClient }).prisma;
  if (
    !prisma ||
    typeof prisma.conversation?.findUnique !== 'function' ||
    typeof prisma.conversationMember?.findMany !== 'function'
  ) {
    throw createAppError(
      'Call creation is unavailable: conversation membership cannot be verified.',
      503,
      'MEMBERSHIP_CHECK_UNAVAILABLE',
    );
  }
  return new ConversationService(prisma);
}

/**
 * QC-F-218 blocked-check (specialist brief §4 Step-4, option (i)): on the
 * 1:1 initiate path, a callee who has blocked the caller must not be
 * call-able — membership alone does not capture this (a blocked user can
 * still be a conversation member). The block list is the callee's own
 * `chatSettings.blockedUsers`, resolved through the shared PrivacyService
 * (the QC-F-042 single-resolver pattern). Like the membership gate this
 * FAILS CLOSED: when block status cannot be verified the call is refused
 * with 503 BLOCKED_CHECK_UNAVAILABLE instead of silently ringing someone
 * who may have blocked the caller.
 *
 * Scope decision (recorded, not silent; QC-F-470 supersedes the route-name
 * reading of it): the blocked check is bound to the CALL SHAPE, not the
 * endpoint. On /initiate this helper checks the body-supplied callee. On
 * /calls/create and /calls/group, ConversationService
 * .assertDirectCallNotBlocked applies the same fail-closed check to the
 * DIRECT conversation's other active member(s) — a DIRECT conversation
 * relabelled as a "group" call gets no bypass. For conversations that
 * really are GROUP or CHANNEL, QC-F-218's original decision stands
 * unchanged: group participants are already members of a shared
 * conversation, and per-participant block semantics inside existing
 * groups are a separate product question (the same reason
 * PrivacyService.checkCanMessage never gates existing conversations).
 */
async function assertCalleeHasNotBlockedCaller(
  fastify: FastifyInstance,
  calleeId: string,
  callerId: string,
): Promise<void> {
  const prisma = (fastify as unknown as { prisma?: PrismaClient }).prisma;
  if (!prisma || typeof prisma.user?.findUnique !== 'function') {
    throw createAppError(
      'Call creation is unavailable: block status cannot be verified.',
      503,
      'BLOCKED_CHECK_UNAVAILABLE',
    );
  }
  const verdict = await getPrivacyService(prisma).checkBlockedBy(calleeId, callerId);
  if (verdict === 'unavailable') {
    throw createAppError(
      'Call creation is unavailable: block status cannot be verified.',
      503,
      'BLOCKED_CHECK_UNAVAILABLE',
    );
  }
  if (verdict === 'blocked') {
    throw createAppError('This user cannot receive calls from you.', 403, 'CALLER_BLOCKED');
  }
}

export default async function callsRoutes(fastify: FastifyInstance) {
  const callRecord = getCallRecordService(fastify);

  /**
   * Best-effort durable persistence of a call's start. Never fails the live
   * call: a history-write error is logged and swallowed so signaling proceeds.
   */
  async function persistStarted(input: {
    conversationId: string;
    initiatorId: string;
    roomId: string;
    participants: string[];
  }): Promise<void> {
    if (!callRecord) {
      return;
    }
    try {
      await callRecord.recordStarted({
        conversationId: input.conversationId,
        initiatorId: input.initiatorId,
        roomId: input.roomId,
        participants: input.participants,
      });
    } catch (err) {
      fastify.log.error({ err }, 'Failed to persist call-started record');
    }
  }

  /**
   * Best-effort durable persistence of a call's end, keyed by roomId. Logged
   * and swallowed on failure so ending a call always succeeds for the client.
   */
  async function persistEnded(roomId: string): Promise<void> {
    if (!callRecord) {
      return;
    }
    try {
      const existing = await (
        fastify as unknown as { prisma: CallRecordPrisma }
      ).prisma.call.findFirst({ where: { roomId } });
      if (existing) {
        await callRecord.recordEnded(existing.id);
      }
    } catch (err) {
      fastify.log.error({ err }, 'Failed to persist call-ended record');
    }
  }

  /**
   * QC-F-129: shared teardown path for POST /calls/end and
   * POST /calls/:id/end. One participant-gated destroy — F-039's shipped
   * gate (404 not-found → 403 CALL_NOT_PARTICIPANT → destroy) — plus the
   * durable ENDED write, so the two route spellings can never diverge.
   * Fail closed without LiveKit (503 CALLS_UNAVAILABLE); never returns a
   * fake "Call ended" without a real teardown. Unknown / already-ended
   * callIds answer idempotent 'Call already ended' (200 at the route).
   * 403/502 rethrow — a denied end must NOT write ENDED into history.
   */
  async function endCallAndPersist(
    callId: string,
    userId: string,
  ): Promise<{ alreadyEnded: boolean }> {
    // Fail closed: throws 503 CALLS_UNAVAILABLE when LiveKit is not configured.
    // Never return a fake "Call ended" acknowledgement without a real teardown.
    const callService = getCallService(callRecord);

    try {
      await callService.endCall(callId, userId);
      await persistEnded(callId);
      return { alreadyEnded: false };
    } catch (err) {
      // If call not found, it may have already ended
      if ((err as { statusCode?: number }).statusCode === 404) {
        await persistEnded(callId);
        return { alreadyEnded: true };
      }
      throw err;
    }
  }

  // POST /calls/create — Creates a LiveKit room for conversation members.
  //
  // QC-F-075: this handler used to mint a LiveKit token for EVERY
  // participantId and return the whole map to the initiator — a valid,
  // signed, canPublish JWT in each participant's name (identity = that
  // user), for arbitrary userIds the caller made up. That is call
  // impersonation by design, so token minting no longer happens here at
  // all: the response is only the roomId, and every participant fetches
  // their OWN token via POST /calls/:id/join or GET /calls/:id/token,
  // where CallService.generateCallToken enforces call participation.
  fastify.post('/create', async (request, reply) => {
    const parseResult = createCallSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { conversationId, participantIds, maxParticipants } = parseResult.data;
    const allParticipants = [userId, ...participantIds.filter((id) => id !== userId)];

    // Fail closed: throws 503 CALLS_UNAVAILABLE when LiveKit is not configured.
    // Never mint unsigned mock tokens.
    const callService = getCallService(callRecord);

    // QC-F-075 membership gate — AFTER the LiveKit check (the pre-existing
    // 503 suite runs without a database and "calls are down" is the honest
    // first answer), BEFORE the room is created (a rejected attempt must
    // not orphan a LiveKit room) and OUTSIDE the try below (a 403/404 from
    // the gate must not be wrapped into 502 CALL_CREATE_FAILED). Every id
    // in allParticipants — caller included — must be an active member of
    // conversationId, and the conversation must exist; otherwise no room,
    // no token and no durable history row is created.
    const membershipGate = getMembershipGate(fastify);
    await membershipGate.assertAllMembers(conversationId, allParticipants);

    // QC-F-470 blocked gate: when this conversation is DIRECT, the call is
    // 1:1 whatever this route is called, so the QC-F-218 blocked check
    // applies to the other member — fail-closed, AFTER membership (a
    // non-member payload must answer NOT_A_MEMBER first) and OUTSIDE the
    // try below (its 403/503 must not be wrapped into CALL_CREATE_FAILED,
    // and a rejected attempt must not orphan a room).
    await membershipGate.assertDirectCallNotBlocked(conversationId, userId);

    // Create the real LiveKit room. No tokens are generated here (see the
    // QC-F-075 note above); participants join via /:id/join for their own.
    try {
      const call = await callService.initiateGroupCall(userId, participantIds);

      await persistStarted({
        conversationId,
        initiatorId: userId,
        roomId: call.callId,
        participants: allParticipants,
      });

      return reply.status(201).send({
        success: true,
        data: { roomId: call.callId },
      });
    } catch (err) {
      throw createAppError(
        `Failed to create call room: ${(err as Error).message}`,
        502,
        'CALL_CREATE_FAILED',
      );
    }
  });

  // POST /calls/end — Destroys the LiveKit room
  //
  // QC-F-129: the body field is named `roomId` but carries a CALL id —
  // the registry and persistStarted are both keyed by call.callId, and the
  // real LiveKit room name (chat-call:<callId>) is internal to the service.
  // Sending the actual LiveKit room name here 404s into the idempotent
  // 'already ended' reply, so new clients must use POST /calls/:id/end.
  fastify.post('/end', async (request, reply) => {
    const parseResult = endCallSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { roomId } = parseResult.data;
    const { alreadyEnded } = await endCallAndPersist(roomId, userId);
    return reply.send({
      success: true,
      data: { message: alreadyEnded ? 'Call already ended' : 'Call ended' },
    });
  });

  // POST /calls/:id/end — QC-F-129: the frontend's endCall() contract.
  //
  // Before this route existed the web hangup posted to a phantom path —
  // apiClient.endCall(callId) targets POST /calls/:id/end, but there was no
  // Next proxy and no backend route, so the UI claimed 'ended' while the
  // server-side call stayed alive. Same gate + teardown as POST /end via
  // the shared helper, so the two spellings can never diverge. The body is
  // ignored (the client sends {}); params.id is the authority.
  fastify.post<{ Params: { id: string } }>('/:id/end', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { alreadyEnded } = await endCallAndPersist(request.params.id, userId);
    return reply.send({
      success: true,
      data: { message: alreadyEnded ? 'Call already ended' : 'Call ended' },
    });
  });

  // GET /calls/history — Durable, user-scoped call history (newest-first)
  fastify.get('/history', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const parseResult = historyQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    if (!callRecord) {
      // Persistence not available (e.g. dev/test without Prisma): empty history.
      const { page, pageSize } = parseResult.data;
      return reply.send({
        success: true,
        data: { calls: [], page, pageSize, total: 0 },
      });
    }

    const history = await callRecord.listHistory(userId, parseResult.data);
    return reply.send({ success: true, data: history });
  });

  // POST /calls/initiate - Initiate a 1:1 call
  //
  // QC-F-218: this handler (the SHIPPED thread-page path) used to create a
  // LiveKit room for ANY calleeId with no authorization at all — it fully
  // bypassed the QC-F-075 membership gate on /calls/create, and the call
  // left no durable history row. It now applies the exact same gate and
  // persistence as /create: LiveKit fail-closed check first, then the
  // membership gate (caller AND callee must be active members of
  // conversationId; the conversation must exist), then room creation,
  // then persistStarted. A rejected attempt creates no room and no row.
  fastify.post('/initiate', async (request, reply) => {
    const parseResult = initiate1v1Schema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { calleeId, conversationId } = parseResult.data;

    // QC-F-218: a self-call is a malformed request, not a call — without
    // this check the gate below dedupes [userId, userId] and a one-person
    // "call" (and its history row) would be created.
    if (calleeId === userId) {
      throw createAppError('You cannot call yourself.', 400, 'VALIDATION_ERROR');
    }

    // Fail closed: throws 503 CALLS_UNAVAILABLE when LiveKit is not
    // configured (same ordering as /create — "calls are down" is the
    // honest first answer, and the pre-existing 503 suite runs without
    // a database).
    const callService = getCallService(callRecord);

    // QC-F-218 membership gate (QC-F-075 pattern, shared helper).
    const membershipGate = getMembershipGate(fastify);
    await membershipGate.assertAllMembers(conversationId, [userId, calleeId]);

    // QC-F-218 blocked-check: the callee's own block list, fail-closed
    // (see assertCalleeHasNotBlockedCaller for the recorded scope call).
    await assertCalleeHasNotBlockedCaller(fastify, calleeId, userId);

    const call = await callService.initiate1v1Call(userId, calleeId);

    await persistStarted({
      conversationId,
      initiatorId: userId,
      roomId: call.callId,
      participants: call.participantIds,
    });

    return reply.status(201).send({ success: true, data: call });
  });

  // POST /calls/group - Initiate a group call
  //
  // QC-F-218: same bypass and same fix as /initiate above — arbitrary
  // participantIds used to get a LiveKit room with zero checks and no
  // durable record. Every participant (caller included) must now be an
  // active member of conversationId, and the started call is persisted.
  // (The blocked-check follows the call shape — see the QC-F-470 note on
  // assertCalleeHasNotBlockedCaller: DIRECT conversations are gated here
  // too; real GROUP/CHANNEL conversations keep the QC-F-218 exemption.)
  fastify.post('/group', async (request, reply) => {
    const parseResult = initiateGroupSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { participantIds, conversationId } = parseResult.data;
    const allParticipants = [userId, ...participantIds.filter((id) => id !== userId)];

    // Fail closed without LiveKit (see /initiate note on ordering).
    const callService = getCallService(callRecord);

    // QC-F-218 membership gate (QC-F-075 pattern, shared helper).
    const membershipGate = getMembershipGate(fastify);
    await membershipGate.assertAllMembers(conversationId, allParticipants);

    // QC-F-470 blocked gate (same placement contract as /create: after
    // membership, before any room exists).
    await membershipGate.assertDirectCallNotBlocked(conversationId, userId);

    const call = await callService.initiateGroupCall(userId, participantIds);

    await persistStarted({
      conversationId,
      initiatorId: userId,
      roomId: call.callId,
      participants: call.participantIds,
    });

    return reply.status(201).send({ success: true, data: call });
  });

  // POST /calls/:id/join - Join a call and get token
  fastify.post<{ Params: { id: string } }>('/:id/join', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    // Fail closed without LiveKit: token issuance requires LIVEKIT_API_SECRET.
    const callService = getCallService(callRecord);
    const token = await callService.generateCallToken(request.params.id, userId);
    const serverUrl =
      process.env['LIVEKIT_WS_URL'] ?? process.env['LIVEKIT_URL'] ?? '';
    return reply.send({ success: true, data: { token, serverUrl } });
  });

  // POST /calls/:id/leave - Leave a call (only removes the requesting participant)
  fastify.post<{ Params: { id: string } }>('/:id/leave', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    // (also reaches getCallService → fail closed without LiveKit)
    const callService = getCallService(callRecord);
    const result = await callService.leaveCall(request.params.id, userId);
    if (result.ended) {
      // QC-F-287: a call ended by its last participant leaving must also be
      // closed in the durable record. Without this the row stays ACTIVE and
      // the rehydration path would resurrect a finished call after a
      // restart (this gap existed even before QC-F-287: leave-ended calls
      // never closed their history row).
      await persistEnded(request.params.id);
    }
    return reply.send({
      success: true,
      data: { message: result.ended ? 'Call ended' : 'Left call' },
    });
  });

  // GET /calls/:id/token - Get participant token
  fastify.get<{ Params: { id: string } }>('/:id/token', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    // Fail closed without LiveKit: token issuance requires LIVEKIT_API_SECRET.
    const callService = getCallService(callRecord);
    const token = await callService.generateCallToken(request.params.id, userId);
    const serverUrl =
      process.env['LIVEKIT_WS_URL'] ?? process.env['LIVEKIT_URL'] ?? '';
    return reply.send({ success: true, data: { token, serverUrl } });
  });
}
