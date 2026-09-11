import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { RoomService, type RoomPrisma, type RoomSettings } from '../services/room.service';
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
  role: z.enum(['host', 'co-host', 'participant']).optional(),
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
  };
  const mapping = mappings[message];
  throw createAppError(message, mapping?.status ?? 400, mapping?.code ?? 'ROOM_ERROR');
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

  fastify.get<{ Params: { id: string } }>('/rooms/:id', async (request, reply) => {
    requireUserId(request);
    try {
      return reply.send(await roomService.getRoom(request.params.id));
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
          role: parsed.data.role ?? (current.hostId === userId ? 'host' : 'participant'),
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

      return reply.send({ room, token, participant });
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
      if (!participant) return reply.send(room);
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
      const message = chatService.postMessage(request.params.id, {
        userId,
        displayName: parsed.data.displayName ?? participant?.displayName ?? userId,
        text: parsed.data.text,
      });
      return reply.status(201).send(message);
    } catch (error) {
      mapRoomError(error);
    }
  });

  fastify.get<{ Params: { id: string } }>('/rooms/:id/chat', async (request, reply) => {
    requireUserId(request);
    try {
      await roomService.getRoom(request.params.id);
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
      await roomService.getRoom(request.params.id);
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
    requireUserId(request);
    try {
      await roomService.getRoom(request.params.id);
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
    requireUserId(request);
    return reply.send(await recordingService.stopRecording(request.params.id));
  });

  fastify.get<{ Params: { roomId: string } }>(
    '/rooms/:roomId/recordings',
    async (request, reply) => {
      requireUserId(request);
      return reply.send(await recordingService.listRecordings(request.params.roomId));
    },
  );

  fastify.get<{ Params: { id: string } }>('/recordings/:id/url', async (request, reply) => {
    requireUserId(request);
    const url = await recordingService.getRecordingUrl(request.params.id);
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
