import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

export interface RoomSettings {
  maxParticipants: number;
  waitingRoom: boolean;
  muteOnEntry: boolean;
  allowScreenShare: boolean;
  enableRecording: boolean;
  enableTranscript: boolean;
}

export interface Participant {
  id: string;
  userId: string;
  displayName: string;
  joinedAt: Date;
  role: 'host' | 'co-host' | 'participant';
  audioEnabled: boolean;
  videoEnabled: boolean;
}

export interface Room {
  id: string;
  name: string;
  hostId: string;
  participants: Participant[];
  createdAt: Date;
  status: 'active' | 'closed';
  settings: RoomSettings;
}

export const CreateRoomSchema = z.object({
  name: z.string().min(1).max(200),
  hostId: z.string().min(1),
  settings: z
    .object({
      maxParticipants: z.number().int().min(2).max(500).optional().default(50),
      waitingRoom: z.boolean().optional().default(false),
      muteOnEntry: z.boolean().optional().default(false),
      allowScreenShare: z.boolean().optional().default(true),
      enableRecording: z.boolean().optional().default(false),
      enableTranscript: z.boolean().optional().default(false),
    })
    .optional()
    .default({}),
});

export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;

export const JoinParticipantSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1).max(100),
  role: z.enum(['host', 'co-host', 'participant']).optional().default('participant'),
  audioEnabled: z.boolean().optional().default(true),
  videoEnabled: z.boolean().optional().default(true),
});

export type JoinParticipantInput = z.infer<typeof JoinParticipantSchema>;

export class RoomService {
  private readonly rooms = new Map<string, Room>();

  createRoom(input: CreateRoomInput): Room {
    const parsed = CreateRoomSchema.parse(input);

    const room: Room = {
      id: randomUUID(),
      name: parsed.name,
      hostId: parsed.hostId,
      participants: [],
      createdAt: new Date(),
      status: 'active',
      settings: {
        maxParticipants: parsed.settings.maxParticipants,
        waitingRoom: parsed.settings.waitingRoom,
        muteOnEntry: parsed.settings.muteOnEntry,
        allowScreenShare: parsed.settings.allowScreenShare,
        enableRecording: parsed.settings.enableRecording,
        enableTranscript: parsed.settings.enableTranscript,
      },
    };

    this.rooms.set(room.id, room);
    return room;
  }

  joinRoom(roomId: string, participant: JoinParticipantInput): Room {
    const room = this.getRoom(roomId);
    const parsed = JoinParticipantSchema.parse(participant);

    if (room.status === 'closed') {
      throw createAppError('Room is closed', 400, 'ROOM_CLOSED');
    }

    if (room.participants.length >= room.settings.maxParticipants) {
      throw createAppError('Room is full', 400, 'ROOM_FULL');
    }

    const existing = room.participants.find((p) => p.userId === parsed.userId);
    if (existing) {
      throw createAppError('User already in room', 409, 'ALREADY_IN_ROOM');
    }

    const newParticipant: Participant = {
      id: randomUUID(),
      userId: parsed.userId,
      displayName: parsed.displayName,
      joinedAt: new Date(),
      role: parsed.role,
      audioEnabled: room.settings.muteOnEntry ? false : parsed.audioEnabled,
      videoEnabled: parsed.videoEnabled,
    };

    room.participants.push(newParticipant);
    return room;
  }

  leaveRoom(roomId: string, participantId: string): Room {
    const room = this.getRoom(roomId);

    const index = room.participants.findIndex((p) => p.id === participantId);
    if (index === -1) {
      throw createAppError('Participant not found in room', 404, 'PARTICIPANT_NOT_FOUND');
    }

    room.participants.splice(index, 1);
    return room;
  }

  getRoom(roomId: string): Room {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw createAppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    return room;
  }

  listParticipants(roomId: string): Participant[] {
    const room = this.getRoom(roomId);
    return room.participants;
  }

  closeRoom(roomId: string): void {
    const room = this.getRoom(roomId);
    room.status = 'closed';
    room.participants = [];
  }
}
