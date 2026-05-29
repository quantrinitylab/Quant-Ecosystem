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

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: In-memory Map-based room management, delegates to LiveKit when gateway provided
 * Production path: Persist rooms in database, integrate fully with LiveKit room API
 */
export class BreakoutService {
  private readonly breakoutRooms = new Map<string, BreakoutRoom>();

  constructor(private readonly livekitGateway?: LiveKitGateway) {}

  async createBreakoutRoom(
    parentRoomId: string,
    name: string,
    assignedParticipantIds: string[],
  ): Promise<BreakoutRoom> {
    const id = randomUUID();
    const livekitRoomName = `${parentRoomId}:breakout:${name}`;

    if (this.livekitGateway) {
      await this.livekitGateway.createRoom(livekitRoomName, 50);
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

  async closeBreakoutRoom(breakoutRoomId: string): Promise<void> {
    const room = this.breakoutRooms.get(breakoutRoomId);
    if (!room) {
      throw createAppError('Breakout room not found', 404, 'BREAKOUT_ROOM_NOT_FOUND');
    }

    if (room.closedAt) {
      throw createAppError('Breakout room already closed', 400, 'BREAKOUT_ROOM_ALREADY_CLOSED');
    }

    if (this.livekitGateway) {
      await this.livekitGateway.deleteRoom(room.livekitRoomName);
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
