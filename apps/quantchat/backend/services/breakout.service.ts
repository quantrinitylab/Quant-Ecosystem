import { randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';
import type { LiveKitGateway } from './livekit-gateway.service';

export interface BreakoutRoom {
  id: string;
  parentRoomId: string;
  name: string;
  livekitRoomName: string;
  participants: string[];
  createdAt: Date;
  closedAt: Date | null;
}

export class BreakoutService {
  private readonly breakoutRooms = new Map<string, BreakoutRoom>();
  private readonly roomsByParent = new Map<string, Set<string>>();
  private readonly participantToRoom = new Map<string, string>();

  constructor(private readonly livekitGateway?: LiveKitGateway) {}

  async createBreakoutRoom(
    parentRoomId: string,
    name: string,
    assignedParticipantIds: string[],
  ): Promise<BreakoutRoom> {
    const existing = this.listBreakoutRooms(parentRoomId);
    const duplicate = existing.find((r) => r.name === name && !r.closedAt);
    if (duplicate) {
      throw createAppError(
        'Breakout room with this name already exists',
        409,
        'BREAKOUT_ROOM_NAME_TAKEN',
      );
    }

    const id = randomUUID();
    const livekitRoomName = `${parentRoomId}:breakout:${name}`;

    if (this.livekitGateway) {
      try {
        await this.livekitGateway.createRoom(livekitRoomName, 50);
      } catch {
        throw createAppError(
          'Failed to create LiveKit breakout room',
          502,
          'BREAKOUT_LIVEKIT_CREATE_FAILED',
        );
      }
    }

    const breakoutRoom: BreakoutRoom = {
      id,
      parentRoomId,
      name,
      livekitRoomName,
      participants: [...assignedParticipantIds],
      createdAt: new Date(),
      closedAt: null,
    };

    this.breakoutRooms.set(id, breakoutRoom);
    if (!this.roomsByParent.has(parentRoomId)) {
      this.roomsByParent.set(parentRoomId, new Set());
    }
    this.roomsByParent.get(parentRoomId)!.add(id);

    for (const pid of assignedParticipantIds) {
      this.participantToRoom.set(pid, id);
    }
    return breakoutRoom;
  }

  assignParticipant(breakoutRoomId: string, participantId: string): BreakoutRoom {
    const room = this.breakoutRooms.get(breakoutRoomId);
    if (!room) {
      throw createAppError('Breakout room not found', 404, 'BREAKOUT_ROOM_NOT_FOUND');
    }
    if (room.closedAt) {
      throw createAppError('Breakout room is closed', 400, 'BREAKOUT_ROOM_CLOSED');
    }

    const existingRoomId = this.participantToRoom.get(participantId);
    if (existingRoomId && existingRoomId !== breakoutRoomId) {
      const prevRoom = this.breakoutRooms.get(existingRoomId);
      if (prevRoom && !prevRoom.closedAt) {
        const idx = prevRoom.participants.indexOf(participantId);
        if (idx !== -1) prevRoom.participants.splice(idx, 1);
      }
    }

    if (room.participants.includes(participantId)) {
      throw createAppError('Participant already in breakout room', 409, 'ALREADY_IN_BREAKOUT');
    }

    room.participants.push(participantId);
    this.participantToRoom.set(participantId, breakoutRoomId);
    return room;
  }

  async closeBreakoutRoom(breakoutRoomId: string): Promise<void> {
    const room = this.breakoutRooms.get(breakoutRoomId);
    if (!room) {
      throw createAppError('Breakout room not found', 404, 'BREAKOUT_ROOM_NOT_FOUND');
    }
    if (room.closedAt) {
      throw createAppError('Breakout room already closed', 400, 'BREAKOUT_ROOM_ALREADY_CLOSED');
    }

    if (this.livekitGateway) {
      try {
        await this.livekitGateway.deleteRoom(room.livekitRoomName);
      } catch {
        throw createAppError(
          'Failed to delete LiveKit breakout room',
          502,
          'BREAKOUT_LIVEKIT_DELETE_FAILED',
        );
      }
    }

    for (const pid of room.participants) {
      this.participantToRoom.delete(pid);
    }
    room.closedAt = new Date();
    room.participants = [];
  }

  listBreakoutRooms(parentRoomId: string): BreakoutRoom[] {
    const ids = this.roomsByParent.get(parentRoomId);
    if (!ids) return [];

    const results: BreakoutRoom[] = [];
    for (const id of ids) {
      const room = this.breakoutRooms.get(id);
      if (room) results.push(room);
    }
    return results;
  }

  returnToMainRoom(breakoutRoomId: string, participantId: string): void {
    const room = this.breakoutRooms.get(breakoutRoomId);
    if (!room) {
      throw createAppError('Breakout room not found', 404, 'BREAKOUT_ROOM_NOT_FOUND');
    }

    const index = room.participants.indexOf(participantId);
    if (index === -1) {
      throw createAppError('Participant not in breakout room', 404, 'PARTICIPANT_NOT_IN_BREAKOUT');
    }

    room.participants.splice(index, 1);
    this.participantToRoom.delete(participantId);
  }
}
