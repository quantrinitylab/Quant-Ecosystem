import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { RoomService } from '../services/room.service';
import { MeetingChatService } from '../services/meeting-chat.service';

const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
  isPrivate: z.boolean().optional(),
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

const DEFAULT_SETTINGS = {
  maxParticipants: 50,
  waitingRoom: false,
  muteOnEntry: false,
  allowScreenShare: true,
  enableRecording: false,
  enableTranscript: false,
};

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

/** Map a RoomService plain Error to the right HTTP status. */
function mapRoomError(error: unknown): never {
  const message = error instanceof Error ? error.message : 'Room error';
  if (message === 'Room not found') {
    throw createAppError('Room not found', 404, 'ROOM_NOT_FOUND');
  }
  if (message === 'Room is closed') {
    throw createAppError('Room is closed', 409, 'ROOM_CLOSED');
  }
  if (message === 'Room is full') {
    throw createAppError('Room is full', 409, 'ROOM_FULL');
  }
  if (message === 'Only the host can end the meeting') {
    throw createAppError('Only the host can end the meeting', 403, 'FORBIDDEN');
  }
  throw createAppError(message, 400, 'ROOM_ERROR');
}

export default async function roomsRoutes(fastify: FastifyInstance) {
  // RoomService is now Prisma-backed (durable rooms/participants). Build it with
  // the shared `fastify.prisma` decorator exactly as the other Prisma-backed
  // routes across the ecosystem do. MeetingChatService stays in-memory: meeting
  // chat/reactions are intentionally EPHEMERAL for the duration of a call.
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  const roomService = new RoomService(prisma as never);
  const chatService = new MeetingChatService();

  // Create a room
  fastify.post('/', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = createRoomSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const room = await roomService.createRoom({
      name: parsed.data.name,
      hostId: userId,
      settings: {
        ...DEFAULT_SETTINGS,
        waitingRoom: parsed.data.isPrivate ?? false,
      },
    });

    return reply.status(201).send(room);
  });

  // List the rooms the caller hosts or participates in
  fastify.get('/', async (request, reply) => {
    const userId = requireUserId(request);
    return reply.send(await roomService.listRooms(userId));
  });

  // Get a single room
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return reply.send(await roomService.getRoom(id));
    } catch (error) {
      mapRoomError(error);
    }
  });

  // Join a room (idempotent — re-joining returns the current room)
  fastify.post('/:id/join', async (request, reply) => {
    const userId = requireUserId(request);
    const { id } = request.params as { id: string };
    const parsed = joinRoomSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw parsed.error;
    }

    try {
      const existing = await roomService.getRoom(id);
      const already = existing.participants.find((p) => p.userId === userId);
      if (already) {
        return reply.send(existing);
      }

      const room = await roomService.joinRoom(id, {
        userId,
        displayName: parsed.data.displayName ?? userId,
        role: parsed.data.role ?? 'participant',
        audioEnabled: parsed.data.audioEnabled ?? true,
        videoEnabled: parsed.data.videoEnabled ?? true,
      });
      return reply.send(room);
    } catch (error) {
      mapRoomError(error);
    }
  });

  // Leave a room (idempotent — leaving when not present returns the room)
  fastify.post('/:id/leave', async (request, reply) => {
    const userId = requireUserId(request);
    const { id } = request.params as { id: string };

    try {
      const room = await roomService.getRoom(id);
      const participant = room.participants.find((p) => p.userId === userId);
      if (!participant) {
        return reply.send(room);
      }
      return reply.send(await roomService.leaveRoom(id, participant.id));
    } catch (error) {
      mapRoomError(error);
    }
  });

  // List participants
  fastify.get('/:id/participants', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return reply.send(await roomService.listParticipants(id));
    } catch (error) {
      mapRoomError(error);
    }
  });

  // End the meeting (host only) — also clears ephemeral chat/reactions
  fastify.post('/:id/end', async (request, reply) => {
    const userId = requireUserId(request);
    const { id } = request.params as { id: string };
    try {
      const room = await roomService.endMeeting(id, userId);
      chatService.clearRoom(id);
      return reply.send(room);
    } catch (error) {
      mapRoomError(error);
    }
  });

  // In-meeting chat
  fastify.get('/:id/chat', async (request, reply) => {
    const requserId = requireUserId(request);
    void requserId;
    const { id } = request.params as { id: string };
    try {
      await roomService.getRoom(id);
    } catch (error) {
      mapRoomError(error);
    }
    return reply.send(chatService.listMessages(id));
  });

  fastify.post('/:id/chat', async (request, reply) => {
    const userId = requireUserId(request);
    const { id } = request.params as { id: string };
    const parsed = chatMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    let displayName = parsed.data.displayName ?? userId;
    try {
      const room = await roomService.getRoom(id);
      const participant = room.participants.find((p) => p.userId === userId);
      if (participant) displayName = parsed.data.displayName ?? participant.displayName;
    } catch (error) {
      mapRoomError(error);
    }

    const message = chatService.postMessage(id, {
      userId,
      displayName,
      text: parsed.data.text,
    });
    return reply.status(201).send(message);
  });

  // In-meeting reactions
  fastify.get('/:id/reactions', async (request, reply) => {
    requireUserId(request);
    const { id } = request.params as { id: string };
    try {
      await roomService.getRoom(id);
    } catch (error) {
      mapRoomError(error);
    }
    return reply.send(chatService.listReactions(id));
  });

  fastify.post('/:id/reactions', async (request, reply) => {
    const userId = requireUserId(request);
    const { id } = request.params as { id: string };
    const parsed = reactionSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    try {
      await roomService.getRoom(id);
    } catch (error) {
      mapRoomError(error);
    }

    const reaction = chatService.postReaction(id, { userId, emoji: parsed.data.emoji });
    return reply.status(201).send(reaction);
  });
}
