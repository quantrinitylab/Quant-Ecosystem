import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  RoomService,
  type Room,
  type RoomPrisma,
  type RoomSettings,
} from '../services/room.service';
import { MeetingChatService } from '../services/meeting-chat.service';
import { LiveKitGateway } from '../services/livekit-gateway.service';
import {
  RecordingService,
  type RecordingPrisma,
  type StorageClient,
} from '../services/recording.service';
import { SummaryService, type SummaryPrisma } from '../services/summary.service';
import {
  ActionItemsService,
  type ActionItemsPrisma,
} from '../services/action-items.service';
import { MeetingAIAdapter } from '../services/meeting-ai-adapter';
import { LiveKitWebhookService } from '../services/livekit-webhook.service';
import type { TranscriptSegment } from '../services/transcript.service';

const roomSettingsSchema = z.object({
  maxParticipants: z.number().int().min(2).max(500),
  waitingRoom: z.boolean(),
  muteOnEntry: z.boolean(),
  allowScreenShare: z.boolean(),
  enableRecording: z.boolean(),
  enableTranscript: z.boolean(),
});

const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
  settings: roomSettingsSchema,
});

const joinRoomSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  // QC-F-040: no `role` field — a joiner must never self-assign 'host' or
  // 'co-host'. Zod strips unknown fields, so legacy clients that still send
  // `role` are ignored (not rejected); the stored role is server-derived in
  // the join handler from room.hostId.
  audioEnabled: z.boolean().optional(),
  videoEnabled: z.boolean().optional(),
});

const chatMessageSchema = z.object({
  text: z.string().min(1).max(4000),
  displayName: z.string().min(1).max(100).optional(),
});

const reactionSchema = z.object({
  emoji: z.string().min(1).max(40),
});

const transcriptInputSchema = z.object({
  id: z.string().optional(),
  roomId: z.string().optional(),
  participantId: z.string().min(1),
  text: z.string(),
  timestamp: z.coerce.date().optional(),
  duration: z.number().nonnegative().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const aiRequestSchema = z.object({
  transcript: z.array(transcriptInputSchema).min(1),
});

type MeetingPrisma = RoomPrisma & RecordingPrisma & SummaryPrisma & ActionItemsPrisma;

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function mapRoomError(error: unknown): never {
  const message = error instanceof Error ? error.message : 'Room error';
  const mappings: Record<string, { status: number; code: string }> = {
    'Room not found': { status: 404, code: 'ROOM_NOT_FOUND' },
    'Room is closed': { status: 409, code: 'ROOM_CLOSED' },
    'Room is full': { status: 409, code: 'ROOM_FULL' },
    'User already in room': { status: 409, code: 'USER_ALREADY_IN_ROOM' },
    'Participant not found in room': { status: 404, code: 'PARTICIPANT_NOT_FOUND' },
    'Only the host can end the meeting': { status: 403, code: 'FORBIDDEN' },
    'Not a participant of this meeting': { status: 403, code: 'NOT_A_PARTICIPANT' },
  };
  const mapping = mappings[message];
  throw createAppError(message, mapping?.status ?? 400, mapping?.code ?? 'ROOM_ERROR');
}

// QC-F-061: shared read-access definition for meeting rooms. The host owns
// the room even before joining (createRoom seeds no participant row), so
// read access is host-or-participant — the same definition QC-F-040's
// RecordingService gates recordings with, and the same error message /
// NOT_A_PARTICIPANT code (mapped in mapRoomError above).
function isRoomParticipant(room: Room, userId: string): boolean {
  return room.hostId === userId || room.participants.some((p) => p.userId === userId);
}

function requireRoomParticipant(room: Room, userId: string): void {
  if (!isRoomParticipant(room, userId)) {
    throw new Error('Not a participant of this meeting');
  }
}

// QC-F-061: identity-free room preview for logged-in non-participants. The
// meet join gate renders only from name/status/count; who is inside the
// room (hostId, settings, participant rows) is never part of the preview.
function toRoomPreview(room: Room) {
  return {
    id: room.id,
    name: room.name,
    status: room.status,
    createdAt: room.createdAt,
    participantCount: room.participants.length,
    participants: [] as Room['participants'],
  };
}

function toTranscript(
  input: z.infer<typeof transcriptInputSchema>,
  index: number,
): TranscriptSegment {
  return {
    id: input.id ?? `input-${index}`,
    roomId: input.roomId ?? '',
    participantId: input.participantId,
    text: input.text,
    timestamp: input.timestamp ?? new Date(),
    duration: input.duration ?? 0,
    confidence: input.confidence ?? 0,
  };
}

export default async function meetingsRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as unknown as { prisma: MeetingPrisma }).prisma;
  const roomService = new RoomService(prisma);
  const chatService = new MeetingChatService();
  const storage: StorageClient = {};
  const recordingService = new RecordingService(prisma, storage);
  const ai = new MeetingAIAdapter();
  const summaryService = new SummaryService(prisma, ai);
  const actionItemsService = new ActionItemsService(prisma, ai);

  const livekitGateway = new LiveKitGateway({
    apiKey: process.env['LIVEKIT_API_KEY'] ?? 'devkey',
    apiSecret: process.env['LIVEKIT_API_SECRET'] ?? 'devsecret',
    wsUrl:
      process.env['LIVEKIT_WS_URL'] ??
      process.env['LIVEKIT_URL'] ??
      process.env['NEXT_PUBLIC_LIVEKIT_URL'] ??
      'ws://localhost:7880',
  });
  const webhookService = new LiveKitWebhookService(
    process.env['LIVEKIT_API_KEY'] ?? 'devkey',
    process.env['LIVEKIT_API_SECRET'] ?? 'devsecret',
  );

  fastify.post('/rooms', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = createRoomSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;

    const room = await roomService.createRoom({
      name: parsed.data.name,
      hostId: userId,
      settings: parsed.data.settings as RoomSettings,
    });
    return reply.status(201).send(room);
  });

  // C08.1 Meet Lobby: the caller's own recent/active rooms. Real data only —
  // the lobby must never render fabricated meetings.
  fastify.get('/rooms', async (request, reply) => {
    const userId = requireUserId(request);
    try {
      return reply.send(await roomService.listRooms(userId));
    } catch (error) {
      mapRoomError(error);
    }
  });

  fastify.get<{ Params: { id: string } }>('/rooms/:id', async (request, reply) => {
    const userId = requireUserId(request);
    try {
      const room = await roomService.getRoom(request.params.id);
      // QC-F-061: the full room (hostId, settings, every participant row)
      // goes only to the host/participants; any other logged-in caller gets
      // the identity-free preview the join gate renders from.
      return reply.send(isRoomParticipant(room, userId) ? room : toRoomPreview(room));
    } catch (error) {
      mapRoomError(error);
    }
  });

  fastify.post<{ Params: { id: string } }>('/rooms/:id/join', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = joinRoomSchema.safeParse(request.body ?? {});
    if (!parsed.success) throw parsed.error;

    try {
      const current = await roomService.getRoom(request.params.id);
      let participant = current.participants.find((item) => item.userId === userId);
      let room = current;

      if (!participant) {
        room = await roomService.joinRoom(request.params.id, {
          userId,
          displayName: parsed.data.displayName ?? userId,
          // QC-F-040: role is always server-derived — host iff the caller
          // owns the room, otherwise participant. There is no join path to
          // 'co-host' (that requires a future host-granted promotion).
          role: current.hostId === userId ? 'host' : 'participant',
          audioEnabled: parsed.data.audioEnabled ?? true,
          videoEnabled: parsed.data.videoEnabled ?? true,
        });
        participant = room.participants.find((item) => item.userId === userId);
      }

      if (!participant) {
        throw createAppError('Participant not found in room', 404, 'PARTICIPANT_NOT_FOUND');
      }

      const token = await livekitGateway.generateToken(
        room.id,
        userId,
        participant.displayName,
        {
          canPublish: true,
          canSubscribe: true,
          isAdmin: room.hostId === userId,
        },
      );

      return reply.send({
        room,
        token,
        participant,
        // Public SFU connection URL (not a secret — media auth is the token).
        serverUrl: livekitGateway.getServerUrl(),
      });
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode) throw error;
      mapRoomError(error);
    }
  });

  fastify.post<{ Params: { id: string } }>('/rooms/:id/leave', async (request, reply) => {
    const userId = requireUserId(request);
    try {
      const room = await roomService.getRoom(request.params.id);
      const participant = room.participants.find((item) => item.userId === userId);
      if (!participant) {
        // QC-F-061: leaving a room you are not in is a no-op, but it must
        // not leak the full room — this branch used to return every
        // participant row to any logged-in caller. The host keeps the full
        // room (read access is host-or-participant); outsiders get the
        // identity-free preview, and nobody is removed.
        return reply.send(isRoomParticipant(room, userId) ? room : toRoomPreview(room));
      }
      return reply.send(await roomService.leaveRoom(request.params.id, participant.id));
    } catch (error) {
      mapRoomError(error);
    }
  });

  fastify.post<{ Params: { id: string } }>('/rooms/:id/close', async (request, reply) => {
    const userId = requireUserId(request);
    try {
      const room = await roomService.endMeeting(request.params.id, userId);
      chatService.clearRoom(request.params.id);
      return reply.send(room);
    } catch (error) {
      mapRoomError(error);
    }
  });

  fastify.post<{ Params: { id: string } }>('/rooms/:id/chat', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = chatMessageSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;

    try {
      const room = await roomService.getRoom(request.params.id);
      const participant = room.participants.find((item) => item.userId === userId);
      // QC-F-061: writing requires a participant row, and the author's
      // displayName comes from that row — never from the request body — so
      // a caller can neither inject into a meeting they are not in nor post
      // under someone else's name. (The schema still accepts a body
      // displayName for legacy clients; it is ignored here.)
      if (!participant) throw new Error('Not a participant of this meeting');
      const message = chatService.postMessage(request.params.id, {
        userId,
        displayName: participant.displayName,
        text: parsed.data.text,
      });
      return reply.status(201).send(message);
    } catch (error) {
      mapRoomError(error);
    }
  });

  fastify.get<{ Params: { id: string } }>('/rooms/:id/chat', async (request, reply) => {
    const userId = requireUserId(request);
    try {
      const room = await roomService.getRoom(request.params.id);
      requireRoomParticipant(room, userId);
      return reply.send(chatService.listMessages(request.params.id));
    } catch (error) {
      mapRoomError(error);
    }
  });

  fastify.post<{ Params: { id: string } }>('/rooms/:id/reactions', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = reactionSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;

    try {
      const room = await roomService.getRoom(request.params.id);
      // QC-F-061: same participant-row write gate as chat — a reaction is
      // stored under the caller's userId, so non-participants must not be
      // able to plant one inside a meeting they are not in.
      const participant = room.participants.find((item) => item.userId === userId);
      if (!participant) throw new Error('Not a participant of this meeting');
      return reply.status(201).send(
        chatService.postReaction(request.params.id, {
          userId,
          emoji: parsed.data.emoji,
        }),
      );
    } catch (error) {
      mapRoomError(error);
    }
  });

  fastify.get<{ Params: { id: string } }>('/rooms/:id/reactions', async (request, reply) => {
    const userId = requireUserId(request);
    try {
      const room = await roomService.getRoom(request.params.id);
      requireRoomParticipant(room, userId);
      return reply.send(chatService.listReactions(request.params.id));
    } catch (error) {
      mapRoomError(error);
    }
  });

  fastify.post<{ Params: { roomId: string } }>(
    '/rooms/:roomId/recordings/start',
    async (request, reply) => {
      const userId = requireUserId(request);
      await roomService.getRoom(request.params.roomId).catch((error) => mapRoomError(error));
      const recording = await recordingService.startRecording(request.params.roomId, userId);
      return reply.status(201).send(recording);
    },
  );

  fastify.post<{ Params: { id: string } }>('/recordings/:id/stop', async (request, reply) => {
    const userId = requireUserId(request);
    return reply.send(await recordingService.stopRecording(request.params.id, userId));
  });

  fastify.get<{ Params: { roomId: string } }>(
    '/rooms/:roomId/recordings',
    async (request, reply) => {
      const userId = requireUserId(request);
      return reply.send(await recordingService.listRecordings(request.params.roomId, userId));
    },
  );

  fastify.get<{ Params: { id: string } }>('/recordings/:id/url', async (request, reply) => {
    const userId = requireUserId(request);
    const url = await recordingService.getRecordingUrl(request.params.id, userId);
    return reply.send({ url });
  });

  fastify.post('/ai/summary', async (request, reply) => {
    requireUserId(request);
    const parsed = aiRequestSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const transcript = parsed.data.transcript.map(toTranscript);
    return reply.send(await summaryService.generateSummary(transcript));
  });

  fastify.post('/ai/action-items', async (request, reply) => {
    requireUserId(request);
    const parsed = aiRequestSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const transcript = parsed.data.transcript.map(toTranscript);
    return reply.send(await actionItemsService.extractActionItems(transcript));
  });

  fastify.post('/webhooks/livekit', {
    config: { rawBody: true },
    handler: async (request, reply) => {
      const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      const event = await webhookService.handleWebhook(body, request.headers.authorization);
      if (event) {
        fastify.log.info({ event: event.type, room: event.roomName }, 'LiveKit webhook processed');
      }
      return reply.status(200).send({ received: true });
    },
  });
}
