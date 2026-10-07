export type AudioRoomRole = 'host' | 'co_host' | 'speaker' | 'listener';

export interface AudioRoomParticipant {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  role: AudioRoomRole;
  isMuted: boolean;
  handRaised: boolean;
  handRaisedAt?: string;
  joinedAt: string;
}

export interface AudioRoom {
  id: string;
  title: string;
  topic: string;
  tags: string[];
  hostId: string;
  isPrivate: boolean;
  maxSpeakers: number;
  isActive: boolean;
  createdAt: string;
  participants: AudioRoomParticipant[];
}

export class AudioRoomService {
  private static rooms: Map<string, AudioRoom> = new Map();

  public static clearAllRoomsForTesting(): void {
    AudioRoomService.rooms.clear();
  }

  public static createAudioRoom(
    hostId: string,
    hostProfile: { username: string; displayName: string; avatarUrl?: string },
    options: {
      title: string;
      topic?: string;
      tags?: string[];
      isPrivate?: boolean;
      maxSpeakers?: number;
    },
  ): AudioRoom {
    const id = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const hostParticipant: AudioRoomParticipant = {
      userId: hostId,
      username: hostProfile.username,
      displayName: hostProfile.displayName,
      avatarUrl: hostProfile.avatarUrl,
      role: 'host',
      isMuted: false,
      handRaised: false,
      joinedAt: now,
    };

    const room: AudioRoom = {
      id,
      title: options.title,
      topic: options.topic || '',
      tags: options.tags || [],
      hostId,
      isPrivate: options.isPrivate || false,
      maxSpeakers: options.maxSpeakers || 10,
      isActive: true,
      createdAt: now,
      participants: [hostParticipant],
    };

    AudioRoomService.rooms.set(id, room);
    return room;
  }

  public static getAudioRoom(roomId: string): AudioRoom | null {
    return AudioRoomService.rooms.get(roomId) || null;
  }

  public static listActiveRooms(filter?: { topic?: string; tag?: string }): AudioRoom[] {
    const allRooms = Array.from(AudioRoomService.rooms.values()).filter((r) => r.isActive);
    return allRooms.filter((room) => {
      if (filter?.topic && !room.topic.toLowerCase().includes(filter.topic.toLowerCase())) {
        return false;
      }
      if (
        filter?.tag &&
        !room.tags.map((t) => t.toLowerCase()).includes(filter.tag.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }

  public static joinAudioRoom(
    roomId: string,
    user: { userId: string; username: string; displayName: string; avatarUrl?: string },
    role: AudioRoomRole = 'listener',
  ): { room: AudioRoom; participant: AudioRoomParticipant } {
    const room = AudioRoomService.rooms.get(roomId);
    if (!room || !room.isActive) {
      throw new Error('Audio room not found or inactive');
    }

    let participant = room.participants.find((p) => p.userId === user.userId);
    const now = new Date().toISOString();

    if (participant) {
      participant.username = user.username;
      participant.displayName = user.displayName;
      if (user.avatarUrl) participant.avatarUrl = user.avatarUrl;
    } else {
      participant = {
        userId: user.userId,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        role,
        isMuted: role === 'listener' || role === 'speaker',
        handRaised: false,
        joinedAt: now,
      };
      room.participants.push(participant);
    }

    return { room, participant };
  }

  public static leaveAudioRoom(
    roomId: string,
    userId: string,
  ): { room: AudioRoom | null; hostTransferred?: boolean } {
    const room = AudioRoomService.rooms.get(roomId);
    if (!room) {
      return { room: null };
    }

    const index = room.participants.findIndex((p) => p.userId === userId);
    if (index === -1) {
      return { room };
    }

    const leavingParticipant = room.participants[index];
    room.participants.splice(index, 1);

    if (room.participants.length === 0) {
      room.isActive = false;
      AudioRoomService.rooms.delete(roomId);
      return { room: null };
    }

    let hostTransferred = false;
    if (leavingParticipant.role === 'host') {
      let nextHost = room.participants.find((p) => p.role === 'co_host');
      if (!nextHost) {
        nextHost = room.participants.find((p) => p.role === 'speaker');
      }
      if (!nextHost) {
        nextHost = room.participants[0];
      }

      if (nextHost) {
        nextHost.role = 'host';
        nextHost.isMuted = false;
        room.hostId = nextHost.userId;
        hostTransferred = true;
      }
    }

    return { room, hostTransferred };
  }

  public static raiseHand(roomId: string, userId: string): AudioRoomParticipant {
    const room = AudioRoomService.rooms.get(roomId);
    if (!room || !room.isActive) {
      throw new Error('Audio room not found or inactive');
    }

    const participant = room.participants.find((p) => p.userId === userId);
    if (!participant) {
      throw new Error('Participant not found in room');
    }

    participant.handRaised = true;
    participant.handRaisedAt = new Date().toISOString();
    return participant;
  }

  public static lowerHand(roomId: string, userId: string): AudioRoomParticipant {
    const room = AudioRoomService.rooms.get(roomId);
    if (!room || !room.isActive) {
      throw new Error('Audio room not found or inactive');
    }

    const participant = room.participants.find((p) => p.userId === userId);
    if (!participant) {
      throw new Error('Participant not found in room');
    }

    participant.handRaised = false;
    participant.handRaisedAt = undefined;
    return participant;
  }

  public static promoteToSpeaker(
    roomId: string,
    hostOrCoHostId: string,
    targetUserId: string,
  ): AudioRoomParticipant {
    const room = AudioRoomService.rooms.get(roomId);
    if (!room || !room.isActive) {
      throw new Error('Audio room not found or inactive');
    }

    const actor = room.participants.find((p) => p.userId === hostOrCoHostId);
    if (!actor || (actor.role !== 'host' && actor.role !== 'co_host')) {
      const err = new Error('Unauthorized: only host or co_host can promote users to speaker');
      (err as any).statusCode = 403;
      throw err;
    }

    const target = room.participants.find((p) => p.userId === targetUserId);
    if (!target) {
      throw new Error('Target participant not found in room');
    }

    target.role = 'speaker';
    target.isMuted = false;
    target.handRaised = false;
    target.handRaisedAt = undefined;

    return target;
  }

  public static demoteToListener(
    roomId: string,
    hostOrCoHostId: string,
    targetUserId: string,
  ): AudioRoomParticipant {
    const room = AudioRoomService.rooms.get(roomId);
    if (!room || !room.isActive) {
      throw new Error('Audio room not found or inactive');
    }

    const actor = room.participants.find((p) => p.userId === hostOrCoHostId);
    if (!actor || (actor.role !== 'host' && actor.role !== 'co_host')) {
      const err = new Error('Unauthorized: only host or co_host can demote users');
      (err as any).statusCode = 403;
      throw err;
    }

    const target = room.participants.find((p) => p.userId === targetUserId);
    if (!target) {
      throw new Error('Target participant not found in room');
    }

    if (target.role === 'host') {
      const err = new Error('Cannot demote the room host');
      (err as any).statusCode = 400;
      throw err;
    }

    target.role = 'listener';
    target.isMuted = true;
    target.handRaised = false;
    target.handRaisedAt = undefined;

    return target;
  }

  public static muteSpeaker(
    roomId: string,
    hostOrCoHostId: string,
    targetUserId: string,
  ): AudioRoomParticipant {
    const room = AudioRoomService.rooms.get(roomId);
    if (!room || !room.isActive) {
      throw new Error('Audio room not found or inactive');
    }

    const actor = room.participants.find((p) => p.userId === hostOrCoHostId);
    if (!actor || (actor.role !== 'host' && actor.role !== 'co_host')) {
      const err = new Error('Unauthorized: only host or co_host can mute speakers');
      (err as any).statusCode = 403;
      throw err;
    }

    const target = room.participants.find((p) => p.userId === targetUserId);
    if (!target) {
      throw new Error('Target participant not found in room');
    }

    target.isMuted = true;
    return target;
  }
}
