export interface RoomSettings {
  maxParticipants: number;
  waitingRoom: boolean;
  muteOnEntry: boolean;
  allowScreenShare: boolean;
  enableRecording: boolean;
  enableTranscript: boolean;
}

export interface CreateRoomInput {
  name: string;
  hostId: string;
  settings: RoomSettings;
}

export interface JoinParticipantInput {
  userId: string;
  displayName: string;
  role: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
}

export interface Participant extends JoinParticipantInput {
  id: string;
}

export type RoomStatus = 'active' | 'closed';

export interface Room {
  id: string;
  name: string;
  hostId: string;
  status: RoomStatus;
  settings: RoomSettings;
  participants: Participant[];
  createdAt: Date;
}

export interface RoomParticipantRow {
  id: string;
  roomId: string;
  userId: string;
  displayName: string;
  role: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  joinedAt: Date;
}

export interface MeetingRoomRow {
  id: string;
  name: string;
  hostId: string;
  status: string;
  settings: unknown;
  createdAt: Date;
  updatedAt: Date;
  participants?: RoomParticipantRow[];
}

export interface RoomPrisma {
  meetingRoom: {
    create(args: { data: Record<string, unknown> }): Promise<MeetingRoomRow>;
    findUnique(args: {
      where: { id: string };
      include?: { participants?: boolean };
    }): Promise<MeetingRoomRow | null>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
      include?: { participants?: boolean };
    }): Promise<MeetingRoomRow>;
    findMany(args: {
      where?: Record<string, unknown>;
      include?: { participants?: boolean };
      orderBy?: Record<string, unknown> | Array<Record<string, unknown>>;
    }): Promise<MeetingRoomRow[]>;
  };
  roomParticipant: {
    create(args: { data: Record<string, unknown> }): Promise<RoomParticipantRow>;
    delete(args: { where: { id: string } }): Promise<RoomParticipantRow>;
    deleteMany(args: { where: { roomId: string } }): Promise<{ count: number }>;
    findMany(args: { where: Record<string, unknown> }): Promise<RoomParticipantRow[]>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
  };
}

const DEFAULT_SETTINGS: RoomSettings = {
  maxParticipants: 50,
  waitingRoom: false,
  muteOnEntry: false,
  allowScreenShare: true,
  enableRecording: false,
  enableTranscript: false,
};

export class RoomService {
  constructor(private readonly prisma: RoomPrisma) {}

  async createRoom(input: CreateRoomInput): Promise<Room> {
    const row = await this.prisma.meetingRoom.create({
      data: {
        name: input.name,
        hostId: input.hostId,
        status: 'active',
        settings: { ...input.settings },
      },
    });
    return this.toRoom({ ...row, participants: [] });
  }

  async getRoom(roomId: string): Promise<Room> {
    const row = await this.prisma.meetingRoom.findUnique({
      where: { id: roomId },
      include: { participants: true },
    });
    if (!row) throw new Error('Room not found');
    return this.toRoom(row);
  }

  async joinRoom(roomId: string, participant: JoinParticipantInput): Promise<Room> {
    const room = await this.getRoom(roomId);
    if (room.status === 'closed') throw new Error('Room is closed');
    if (room.participants.length >= room.settings.maxParticipants) {
      throw new Error('Room is full');
    }
    if (room.participants.some((p) => p.userId === participant.userId)) {
      throw new Error('User already in room');
    }

    await this.prisma.roomParticipant.create({
      data: {
        roomId,
        userId: participant.userId,
        displayName: participant.displayName,
        role: participant.role,
        audioEnabled: room.settings.muteOnEntry ? false : participant.audioEnabled,
        videoEnabled: participant.videoEnabled,
      },
    });

    return this.getRoom(roomId);
  }

  async leaveRoom(roomId: string, participantId: string): Promise<Room> {
    const room = await this.getRoom(roomId);
    const exists = room.participants.some((p) => p.id === participantId);
    if (!exists) throw new Error('Participant not found in room');

    await this.prisma.roomParticipant.delete({ where: { id: participantId } });
    return this.getRoom(roomId);
  }

  async listParticipants(roomId: string): Promise<Participant[]> {
    const room = await this.getRoom(roomId);
    return room.participants;
  }

  async closeRoom(roomId: string): Promise<Room> {
    await this.getRoom(roomId);
    await this.prisma.meetingRoom.update({
      where: { id: roomId },
      data: { status: 'closed' },
    });
    await this.prisma.roomParticipant.deleteMany({ where: { roomId } });
    return this.getRoom(roomId);
  }

  async listRooms(userId: string): Promise<Room[]> {
    const rows = await this.prisma.meetingRoom.findMany({
      where: {
        OR: [{ hostId: userId }, { participants: { some: { userId } } }],
      },
      include: { participants: true },
    });
    return rows.map((row) => this.toRoom(row));
  }

  async endMeeting(roomId: string, userId: string): Promise<Room> {
    const room = await this.getRoom(roomId);
    if (room.hostId !== userId) throw new Error('Only the host can end the meeting');
    return this.closeRoom(roomId);
  }

  private toRoom(row: MeetingRoomRow): Room {
    return {
      id: row.id,
      name: row.name,
      hostId: row.hostId,
      status: row.status === 'closed' ? 'closed' : 'active',
      settings: this.parseSettings(row.settings),
      participants: (row.participants ?? []).map((p) => this.toParticipant(p)),
      createdAt: row.createdAt,
    };
  }

  private toParticipant(row: RoomParticipantRow): Participant {
    return {
      id: row.id,
      userId: row.userId,
      displayName: row.displayName,
      role: row.role,
      audioEnabled: row.audioEnabled,
      videoEnabled: row.videoEnabled,
    };
  }

  private parseSettings(value: unknown): RoomSettings {
    const raw: Record<string, unknown> =
      value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    return {
      maxParticipants:
        typeof raw['maxParticipants'] === 'number'
          ? (raw['maxParticipants'] as number)
          : DEFAULT_SETTINGS.maxParticipants,
      waitingRoom:
        typeof raw['waitingRoom'] === 'boolean'
          ? (raw['waitingRoom'] as boolean)
          : DEFAULT_SETTINGS.waitingRoom,
      muteOnEntry:
        typeof raw['muteOnEntry'] === 'boolean'
          ? (raw['muteOnEntry'] as boolean)
          : DEFAULT_SETTINGS.muteOnEntry,
      allowScreenShare:
        typeof raw['allowScreenShare'] === 'boolean'
          ? (raw['allowScreenShare'] as boolean)
          : DEFAULT_SETTINGS.allowScreenShare,
      enableRecording:
        typeof raw['enableRecording'] === 'boolean'
          ? (raw['enableRecording'] as boolean)
          : DEFAULT_SETTINGS.enableRecording,
      enableTranscript:
        typeof raw['enableTranscript'] === 'boolean'
          ? (raw['enableTranscript'] as boolean)
          : DEFAULT_SETTINGS.enableTranscript,
    };
  }
}
