import { randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';

export interface BreakoutRoom {
  id: string;
  parentRoomId: string;
  name: string;
  participants: string[];
  createdAt: Date;
  closedAt: Date | null;
}

export class BreakoutService {
  private readonly breakoutRooms = new Map<string, BreakoutRoom>();

  createBreakoutRoom(
    parentRoomId: string,
    name: string,
    assignedParticipantIds: string[],
  ): BreakoutRoom {
    const id = randomUUID();

    const breakoutRoom: BreakoutRoom = {
      id,
      parentRoomId,
      name,
      participants: [...assignedParticipantIds],
      createdAt: new Date(),
      closedAt: null,
    };

    this.breakoutRooms.set(id, breakoutRoom);
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

    if (room.participants.includes(participantId)) {
      throw createAppError('Participant already in breakout room', 409, 'ALREADY_IN_BREAKOUT');
    }

    room.participants.push(participantId);
    return room;
  }

  closeBreakoutRoom(breakoutRoomId: string): void {
    const room = this.breakoutRooms.get(breakoutRoomId);
    if (!room) {
      throw createAppError('Breakout room not found', 404, 'BREAKOUT_ROOM_NOT_FOUND');
    }

    if (room.closedAt) {
      throw createAppError('Breakout room already closed', 400, 'BREAKOUT_ROOM_ALREADY_CLOSED');
    }

    room.closedAt = new Date();
    room.participants = [];
  }

  listBreakoutRooms(parentRoomId: string): BreakoutRoom[] {
    const results: BreakoutRoom[] = [];
    for (const room of this.breakoutRooms.values()) {
      if (room.parentRoomId === parentRoomId) {
        results.push(room);
      }
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
  }
}
