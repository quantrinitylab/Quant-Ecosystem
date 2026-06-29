// ============================================================================
// QuantMeet — Durable meeting rooms (Prisma-backed)
//
// Previously RoomService kept every room and its participants in an in-memory
// `Map<string, Room>`, so all rooms — and who was in them — were lost on
// restart/redeploy and never shared across backend instances. This rewrite
// makes rooms DURABLE by persisting them to the Prisma `MeetingRoom` /
// `RoomParticipant` models.
//
// The public API shape and error-message semantics are preserved EXACTLY; the
// only change is that every method is now ASYNC (returns a Promise). The route
// layer (`routes/rooms.ts`) maps the plain-Error messages thrown here to HTTP
// status codes via `mapRoomError`, so the message strings below are a contract
// and must not change:
//   'Room not found' | 'Room is closed' | 'Room is full' |
//   'User already in room' | 'Participant not found in room' |
//   'Only the host can end the meeting'
//
// The Prisma client is injected through a NARROW interface (`RoomPrisma`)
// covering only the `meetingRoom` / `roomParticipant` delegate operations this
// service issues, mirroring the repo's established DI pattern (see
// CallRecordService / PrismaKeyStorage). This keeps the service unit-testable
// against an in-memory fake with no live Postgres.
// ============================================================================

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

// ---------------------------------------------------------------------------
// Persisted row shapes (the subset of columns this service reads/writes).
// ---------------------------------------------------------------------------

/** A persisted `RoomParticipant` row. */
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

/** A persisted `MeetingRoom` row. `participants` is present when included. */
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

/**
 * Narrow view of the Prisma client — exactly the `meetingRoom` /
 * `roomParticipant` delegate operations {@link RoomService} issues. Injected
 * via the constructor so the service can run against the real client in
 * production and an in-memory fake in tests.
 */
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

  /**
   * Create a durable `MeetingRoom` (status 'active') with its RoomSettings
   * stored as JSON. Returns the Room shape with an empty participant list.
   */
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

  /**
   * Find a room INCLUDING its participants.
   * @throws Error('Room not found') when the room does not exist.
   */
  async getRoom(roomId: string): Promise<Room> {
    const row = await this.prisma.meetingRoom.findUnique({
      where: { id: roomId },
      include: { participants: true },
    });
    if (!row) throw new Error('Room not found');
    return this.toRoom(row);
  }

  /**
   * Add a participant to a room.
   * @throws Error('Room not found') when the room does not exist.
   * @throws Error('Room is closed') when the room status is 'closed'.
   * @throws Error('Room is full') when participants >= settings.maxParticipants.
   * @throws Error('User already in room') when the user is already a participant.
   */
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

  /**
   * Remove a participant (by participant id) from a room.
   * @throws Error('Room not found') when the room does not exist.
   * @throws Error('Participant not found in room') when no such participant row
   *   belongs to this room.
   */
  async leaveRoom(roomId: string, participantId: string): Promise<Room> {
    const room = await this.getRoom(roomId);
    const exists = room.participants.some((p) => p.id === participantId);
    if (!exists) throw new Error('Participant not found in room');

    await this.prisma.roomParticipant.delete({ where: { id: participantId } });
    return this.getRoom(roomId);
  }

  /**
   * List the participants of a room.
   * @throws Error('Room not found') when the room does not exist.
   */
  async listParticipants(roomId: string): Promise<Participant[]> {
    const room = await this.getRoom(roomId);
    return room.participants;
  }

  /**
   * Mark a room 'closed' and remove all of its participants.
   * @throws Error('Room not found') when the room does not exist.
   */
  async closeRoom(roomId: string): Promise<Room> {
    // Ensure the room exists first so callers get the exact 'Room not found'
    // contract rather than a Prisma error.
    await this.getRoom(roomId);

    await this.prisma.meetingRoom.update({
      where: { id: roomId },
      data: { status: 'closed' },
    });
    await this.prisma.roomParticipant.deleteMany({ where: { roomId } });

    return this.getRoom(roomId);
  }

  /** List the rooms the user hosts OR participates in. */
  async listRooms(userId: string): Promise<Room[]> {
    const rows = await this.prisma.meetingRoom.findMany({
      where: {
        OR: [{ hostId: userId }, { participants: { some: { userId } } }],
      },
      include: { participants: true },
    });
    return rows.map((row) => this.toRoom(row));
  }

  /**
   * End a meeting (host only) — closes the room and clears participants.
   * @throws Error('Room not found') when the room does not exist.
   * @throws Error('Only the host can end the meeting') when `userId` is not the host.
   */
  async endMeeting(roomId: string, userId: string): Promise<Room> {
    const room = await this.getRoom(roomId);
    if (room.hostId !== userId) throw new Error('Only the host can end the meeting');
    return this.closeRoom(roomId);
  }

  // -------------------------------------------------------------------------
  // Mapping helpers
  // -------------------------------------------------------------------------

  /** Map a persisted room row (+ participants) to the public Room shape. */
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

  /** Map a persisted participant row to the public Participant shape. */
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

  /** Coerce the `settings` Json column into a complete RoomSettings object. */
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
