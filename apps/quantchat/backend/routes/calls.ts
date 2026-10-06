import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { CallService } from '../services/call.service';
import { CallRecordService, type CallRecordPrisma } from '../services/call-record.service';

const initiate1v1Schema = z.object({
  calleeId: z.string().min(1),
});

const initiateGroupSchema = z.object({
  participantIds: z.array(z.string().min(1)).min(1).max(7),
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
 */
let sharedCallService: CallService | null = null;

function getCallService(): CallService {
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
    sharedCallService = new CallService({ apiKey, apiSecret, wsUrl });
  }
  return sharedCallService;
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

  // POST /calls/create — Creates a LiveKit room and generates participant tokens
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
    const callService = getCallService();

    // Create real LiveKit room and generate tokens
    try {
      const call = await callService.initiateGroupCall(userId, participantIds);

      // Generate tokens for all participants
      const tokens: Record<string, string> = {};
      for (const pid of allParticipants) {
        tokens[pid] = await callService.generateCallToken(call.callId, pid);
      }

      await persistStarted({
        conversationId,
        initiatorId: userId,
        roomId: call.callId,
        participants: allParticipants,
      });

      return reply.status(201).send({
        success: true,
        data: { roomId: call.callId, tokens },
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

    // Fail closed: throws 503 CALLS_UNAVAILABLE when LiveKit is not configured.
    // Never return a fake "Call ended" acknowledgement without a real teardown.
    const callService = getCallService();

    try {
      await callService.endCall(roomId);
      await persistEnded(roomId);
      return reply.send({ success: true, data: { message: 'Call ended' } });
    } catch (err) {
      // If call not found, it may have already ended
      if ((err as { statusCode?: number }).statusCode === 404) {
        await persistEnded(roomId);
        return reply.send({ success: true, data: { message: 'Call already ended' } });
      }
      throw err;
    }
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
  fastify.post('/initiate', async (request, reply) => {
    const parseResult = initiate1v1Schema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    // POST /calls/initiate - Initiate a 1:1 call
    // (also reaches getCallService → fail closed without LiveKit)
    const callService = getCallService();
    const call = await callService.initiate1v1Call(userId, parseResult.data.calleeId);
    return reply.status(201).send({ success: true, data: call });
  });

  // POST /calls/group - Initiate a group call
  fastify.post('/group', async (request, reply) => {
    const parseResult = initiateGroupSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    // (also reaches getCallService → fail closed without LiveKit)
    const callService = getCallService();
    const call = await callService.initiateGroupCall(userId, parseResult.data.participantIds);
    return reply.status(201).send({ success: true, data: call });
  });

  // POST /calls/:id/join - Join a call and get token
  fastify.post<{ Params: { id: string } }>('/:id/join', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    // Fail closed without LiveKit: token issuance requires LIVEKIT_API_SECRET.
    const callService = getCallService();
    const token = await callService.generateCallToken(request.params.id, userId);
    return reply.send({ success: true, data: { token } });
  });

  // POST /calls/:id/leave - Leave a call (only removes the requesting participant)
  fastify.post<{ Params: { id: string } }>('/:id/leave', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    // (also reaches getCallService → fail closed without LiveKit)
    const callService = getCallService();
    const result = await callService.leaveCall(request.params.id, userId);
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
    const callService = getCallService();
    const token = await callService.generateCallToken(request.params.id, userId);
    return reply.send({ success: true, data: { token } });
  });
}
