import type { Room, Participant } from './types.js';
import crypto from 'node:crypto';

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  createRoom(id?: string, maxParticipants: number = 50): Room {
    const roomId = id ?? crypto.randomUUID();
    if (this.rooms.has(roomId)) {
      throw new Error(`Room ${roomId} already exists`);
    }
    const room: Room = {
      id: roomId,
      createdAt: new Date(),
      participants: new Map(),
      maxParticipants,
    };
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId: string): Room | null {
    return this.rooms.get(roomId) ?? null;
  }

  joinRoom(roomId: string, participantId: string, displayName?: string): Participant {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = this.createRoom(roomId);
    }
    if (room.participants.has(participantId)) {
      throw new Error(`Participant ${participantId} already in room ${roomId}`);
    }
    if (room.participants.size >= room.maxParticipants) {
      throw new Error(`Room ${roomId} is full (max ${room.maxParticipants})`);
    }
    const participant: Participant = {
      id: participantId,
      displayName: displayName ?? participantId,
      joinedAt: new Date(),
      audioMuted: false,
      videoMuted: false,
    };
    room.participants.set(participantId, participant);
    return participant;
  }

  leaveRoom(roomId: string, participantId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const removed = room.participants.delete(participantId);
    if (room.participants.size === 0) {
      this.rooms.delete(roomId);
    }
    return removed;
  }

  getRoomParticipants(roomId: string): Participant[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.participants.values());
  }

  listRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  cleanupStaleRooms(maxIdleMs: number): string[] {
    const now = Date.now();
    const cleaned: string[] = [];
    for (const [roomId, room] of this.rooms) {
      if (room.participants.size === 0) {
        this.rooms.delete(roomId);
        cleaned.push(roomId);
      } else {
        const lastActivity = Math.max(
          room.createdAt.getTime(),
          ...Array.from(room.participants.values()).map((p) => p.joinedAt.getTime()),
        );
        if (now - lastActivity > maxIdleMs) {
          this.rooms.delete(roomId);
          cleaned.push(roomId);
        }
      }
    }
    return cleaned;
  }

  getStats(): { totalRooms: number; totalParticipants: number } {
    let totalParticipants = 0;
    for (const room of this.rooms.values()) {
      totalParticipants += room.participants.size;
    }
    return { totalRooms: this.rooms.size, totalParticipants };
  }
}
