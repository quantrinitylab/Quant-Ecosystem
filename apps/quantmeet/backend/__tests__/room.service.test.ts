// ============================================================================
// Unit tests — RoomService (durable meeting rooms, Prisma-backed)
//
// RoomService persists rooms/participants to the Prisma `MeetingRoom` /
// `RoomParticipant` models so rooms survive restarts and are shared across
// backend instances. A live PostgreSQL is not available in the sandbox, so —
// mirroring the repo's fake-prisma approach (see call-record.service.test.ts) —
// these tests drive the REAL RoomService against a faithful in-memory model of
// the exact delegate operations it issues:
//
//   prisma.meetingRoom.create / findUnique (+include participants) / update / findMany
//   prisma.roomParticipant.create / delete / deleteMany / findMany / count
//
// Covers: create, get (with participants + not-found), join (full / closed /
// duplicate / muteOnEntry), leave (+ not-found / room-not-found),
// listParticipants, closeRoom, listRooms (host or participant),
// endMeeting (host-only). Every method is async (await / rejects).
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { RoomService } from '../services/room.service';
import type {
  CreateRoomInput,
  JoinParticipantInput,
  RoomPrisma,
  MeetingRoomRow,
  RoomParticipantRow,
} from '../services/room.service';

// ---------------------------------------------------------------------------
// In-memory fake of the Prisma `meetingRoom` / `roomParticipant` delegates.
// ---------------------------------------------------------------------------
function createFakeRoomPrisma(): RoomPrisma & {
  __rooms: MeetingRoomRow[];
  __participants: RoomParticipantRow[];
} {
  const rooms: MeetingRoomRow[] = [];
  const participants: RoomParticipantRow[] = [];
  let roomSeq = 0;
  let partSeq = 0;
  // Monotonic clock so createdAt/joinedAt ordering is deterministic.
  let clock = 1_700_000_000_000;
  const tick = (): Date => new Date((clock += 1000));

  const participantsFor = (roomId: string): RoomParticipantRow[] =>
    participants.filter((p) => p.roomId === roomId).map((p) => ({ ...p }));

  const withInclude = (
    room: MeetingRoomRow,
    include?: { participants?: boolean },
  ): MeetingRoomRow => {
    const base: MeetingRoomRow = { ...room };
    if (include?.participants) {
      base.participants = participantsFor(room.id);
    }
    return base;
  };

  // Match a `meetingRoom.findMany` where clause of the exact shape RoomService
  // issues: { OR: [{ hostId }, { participants: { some: { userId } } }] }.
  const matchesRoom = (room: MeetingRoomRow, where?: Record<string, unknown>): boolean => {
    if (!where) return true;
    if ('OR' in where && Array.isArray(where['OR'])) {
      const clauses = where['OR'] as Array<Record<string, unknown>>;
      return clauses.some((clause) => {
        if ('hostId' in clause) {
          return room.hostId === clause['hostId'];
        }
        if ('participants' in clause) {
          const some = (clause['participants'] as { some?: { userId?: string } }).some;
          const userId = some?.userId;
          return (
            userId !== undefined &&
            participants.some((p) => p.roomId === room.id && p.userId === userId)
          );
        }
        return false;
      });
    }
    return true;
  };

  return {
    meetingRoom: {
      async create({ data }) {
        const now = tick();
        const row: MeetingRoomRow = {
          id: `room_${(roomSeq += 1)}`,
          name: String(data['name']),
          hostId: String(data['hostId']),
          status: (data['status'] as string) ?? 'active',
          settings: (data['settings'] as unknown) ?? {},
          createdAt: now,
          updatedAt: now,
        };
        rooms.push(row);
        return { ...row };
      },
      async findUnique({ where, include }) {
        const row = rooms.find((r) => r.id === where.id);
        return row ? withInclude(row, include) : null;
      },
      async update({ where, data, include }) {
        const row = rooms.find((r) => r.id === where.id);
        if (!row) {
          throw new Error(`No MeetingRoom row with id ${where.id}`);
        }
        Object.assign(row, data, { updatedAt: tick() });
        return withInclude(row, include);
      },
      async findMany({ where, include }) {
        return rooms.filter((r) => matchesRoom(r, where)).map((r) => withInclude(r, include));
      },
    },
    roomParticipant: {
      async create({ data }) {
        const row: RoomParticipantRow = {
          id: `part_${(partSeq += 1)}`,
          roomId: String(data['roomId']),
          userId: String(data['userId']),
          displayName: String(data['displayName']),
          role: (data['role'] as string) ?? 'participant',
          audioEnabled: (data['audioEnabled'] as boolean) ?? true,
          videoEnabled: (data['videoEnabled'] as boolean) ?? true,
          joinedAt: tick(),
        };
        participants.push(row);
        return { ...row };
      },
      async delete({ where }) {
        const index = participants.findIndex((p) => p.id === where.id);
        if (index === -1) {
          throw new Error(`No RoomParticipant row with id ${where.id}`);
        }
        const [removed] = participants.splice(index, 1);
        return { ...removed! };
      },
      async deleteMany({ where }) {
        let count = 0;
        for (let i = participants.length - 1; i >= 0; i -= 1) {
          if (participants[i]!.roomId === where.roomId) {
            participants.splice(i, 1);
            count += 1;
          }
        }
        return { count };
      },
      async findMany({ where }) {
        const roomId = where['roomId'];
        return participants
          .filter((p) => (roomId === undefined ? true : p.roomId === roomId))
          .map((p) => ({ ...p }));
      },
      async count({ where }) {
        const roomId = where['roomId'];
        return participants.filter((p) => (roomId === undefined ? true : p.roomId === roomId))
          .length;
      },
    },
    __rooms: rooms,
    __participants: participants,
  };
}

const baseSettings = {
  maxParticipants: 50,
  waitingRoom: false,
  muteOnEntry: false,
  allowScreenShare: true,
  enableRecording: false,
  enableTranscript: false,
};

const aliceJoin: JoinParticipantInput = {
  userId: 'user-2',
  displayName: 'Alice',
  role: 'participant',
  audioEnabled: true,
  videoEnabled: true,
};

describe('RoomService — durable meeting rooms', () => {
  let prisma: ReturnType<typeof createFakeRoomPrisma>;
  let service: RoomService;

  beforeEach(() => {
    prisma = createFakeRoomPrisma();
    service = new RoomService(prisma);
  });

  // --------------------------------------------------------------------------
  // createRoom
  // --------------------------------------------------------------------------
  describe('createRoom', () => {
    it('creates an active room with id, name, hostId, settings, and no participants', async () => {
      const input: CreateRoomInput = {
        name: 'Sprint Planning',
        hostId: 'user-1',
        settings: { ...baseSettings, maxParticipants: 10 },
      };

      const room = await service.createRoom(input);

      expect(room.id).toBeDefined();
      expect(room.name).toBe('Sprint Planning');
      expect(room.hostId).toBe('user-1');
      expect(room.status).toBe('active');
      expect(room.participants).toEqual([]);
      expect(room.createdAt).toBeInstanceOf(Date);
      expect(prisma.__rooms).toHaveLength(1);
    });

    it('persists the full RoomSettings as JSON', async () => {
      const room = await service.createRoom({
        name: 'Secure Room',
        hostId: 'user-admin',
        settings: {
          maxParticipants: 5,
          waitingRoom: true,
          muteOnEntry: true,
          allowScreenShare: false,
          enableRecording: true,
          enableTranscript: true,
        },
      });

      expect(room.settings.maxParticipants).toBe(5);
      expect(room.settings.waitingRoom).toBe(true);
      expect(room.settings.muteOnEntry).toBe(true);
      expect(room.settings.allowScreenShare).toBe(false);
      expect(room.settings.enableRecording).toBe(true);
      expect(room.settings.enableTranscript).toBe(true);
    });

    it('generates unique ids for multiple rooms', async () => {
      const input: CreateRoomInput = { name: 'Room', hostId: 'user-1', settings: baseSettings };
      const room1 = await service.createRoom(input);
      const room2 = await service.createRoom(input);
      expect(room1.id).not.toBe(room2.id);
    });
  });

  // --------------------------------------------------------------------------
  // getRoom
  // --------------------------------------------------------------------------
  describe('getRoom', () => {
    it('returns the room when it exists', async () => {
      const created = await service.createRoom({
        name: 'Existing Room',
        hostId: 'user-1',
        settings: baseSettings,
      });

      const room = await service.getRoom(created.id);
      expect(room.id).toBe(created.id);
      expect(room.name).toBe('Existing Room');
    });

    it('returns the room including its current participants', async () => {
      const created = await service.createRoom({
        name: 'Active Room',
        hostId: 'user-1',
        settings: baseSettings,
      });
      await service.joinRoom(created.id, aliceJoin);

      const room = await service.getRoom(created.id);
      expect(room.participants).toHaveLength(1);
      expect(room.participants[0]!.userId).toBe('user-2');
    });

    it('rejects with Room not found for a non-existent room', async () => {
      await expect(service.getRoom('does-not-exist')).rejects.toThrow('Room not found');
    });
  });

  // --------------------------------------------------------------------------
  // joinRoom
  // --------------------------------------------------------------------------
  describe('joinRoom', () => {
    it('adds a participant to the room', async () => {
      const room = await service.createRoom({
        name: 'Team Standup',
        hostId: 'user-1',
        settings: baseSettings,
      });

      const updated = await service.joinRoom(room.id, aliceJoin);

      expect(updated.participants).toHaveLength(1);
      expect(updated.participants[0]!.userId).toBe('user-2');
      expect(updated.participants[0]!.displayName).toBe('Alice');
      expect(updated.participants[0]!.role).toBe('participant');
      expect(updated.participants[0]!.id).toBeDefined();
    });

    it('rejects with Room not found if the room does not exist', async () => {
      await expect(service.joinRoom('non-existent-id', aliceJoin)).rejects.toThrow(
        'Room not found',
      );
    });

    it('rejects with Room is full when at max capacity', async () => {
      const room = await service.createRoom({
        name: 'Small Room',
        hostId: 'user-1',
        settings: { ...baseSettings, maxParticipants: 2 },
      });

      await service.joinRoom(room.id, aliceJoin);
      await service.joinRoom(room.id, { ...aliceJoin, userId: 'user-3', displayName: 'Bob' });

      await expect(
        service.joinRoom(room.id, { ...aliceJoin, userId: 'user-4', displayName: 'Charlie' }),
      ).rejects.toThrow('Room is full');
    });

    it('rejects with User already in room if the user is already a participant', async () => {
      const room = await service.createRoom({
        name: 'Test Room',
        hostId: 'user-1',
        settings: baseSettings,
      });
      await service.joinRoom(room.id, aliceJoin);

      await expect(
        service.joinRoom(room.id, { ...aliceJoin, displayName: 'Alice Again' }),
      ).rejects.toThrow('User already in room');
    });

    it('rejects with Room is closed when joining a closed room', async () => {
      const room = await service.createRoom({
        name: 'Closed Room',
        hostId: 'user-1',
        settings: baseSettings,
      });
      await service.closeRoom(room.id);

      await expect(service.joinRoom(room.id, aliceJoin)).rejects.toThrow('Room is closed');
    });

    it('mutes audio on entry when muteOnEntry is enabled', async () => {
      const room = await service.createRoom({
        name: 'Muted Room',
        hostId: 'user-1',
        settings: { ...baseSettings, muteOnEntry: true },
      });

      const updated = await service.joinRoom(room.id, aliceJoin);
      expect(updated.participants[0]!.audioEnabled).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // leaveRoom
  // --------------------------------------------------------------------------
  describe('leaveRoom', () => {
    it('removes a participant from the room', async () => {
      const room = await service.createRoom({
        name: 'Team Room',
        hostId: 'user-1',
        settings: baseSettings,
      });
      const updated = await service.joinRoom(room.id, aliceJoin);
      const participantId = updated.participants[0]!.id;

      const result = await service.leaveRoom(room.id, participantId);
      expect(result.participants).toHaveLength(0);
    });

    it('rejects with Participant not found in room if participant is not present', async () => {
      const room = await service.createRoom({
        name: 'Team Room',
        hostId: 'user-1',
        settings: baseSettings,
      });

      await expect(service.leaveRoom(room.id, 'non-existent-participant')).rejects.toThrow(
        'Participant not found in room',
      );
    });

    it('rejects with Room not found if the room does not exist', async () => {
      await expect(service.leaveRoom('non-existent-room', 'participant-1')).rejects.toThrow(
        'Room not found',
      );
    });
  });

  // --------------------------------------------------------------------------
  // listParticipants
  // --------------------------------------------------------------------------
  describe('listParticipants', () => {
    it('returns an empty array for a room with no participants', async () => {
      const room = await service.createRoom({
        name: 'Empty Room',
        hostId: 'user-1',
        settings: baseSettings,
      });
      await expect(service.listParticipants(room.id)).resolves.toEqual([]);
    });

    it('returns all current participants', async () => {
      const room = await service.createRoom({
        name: 'Full Room',
        hostId: 'user-1',
        settings: baseSettings,
      });
      await service.joinRoom(room.id, aliceJoin);
      await service.joinRoom(room.id, {
        ...aliceJoin,
        userId: 'user-3',
        displayName: 'Bob',
        role: 'co-host',
      });

      const list = await service.listParticipants(room.id);
      expect(list).toHaveLength(2);
      expect(list.map((p) => p.displayName).sort()).toEqual(['Alice', 'Bob']);
    });

    it('rejects with Room not found for a non-existent room', async () => {
      await expect(service.listParticipants('ghost-room')).rejects.toThrow('Room not found');
    });
  });

  // --------------------------------------------------------------------------
  // closeRoom
  // --------------------------------------------------------------------------
  describe('closeRoom', () => {
    it('marks the room as closed and clears participants', async () => {
      const room = await service.createRoom({
        name: 'Closing Room',
        hostId: 'user-1',
        settings: baseSettings,
      });
      await service.joinRoom(room.id, aliceJoin);

      await service.closeRoom(room.id);

      const closed = await service.getRoom(room.id);
      expect(closed.status).toBe('closed');
      expect(closed.participants).toHaveLength(0);
      expect(prisma.__participants).toHaveLength(0);
    });

    it('rejects with Room not found if the room does not exist', async () => {
      await expect(service.closeRoom('non-existent')).rejects.toThrow('Room not found');
    });
  });

  // --------------------------------------------------------------------------
  // listRooms
  // --------------------------------------------------------------------------
  describe('listRooms', () => {
    it('returns rooms where the user is host', async () => {
      await service.createRoom({ name: 'Room A', hostId: 'user-1', settings: baseSettings });
      await service.createRoom({ name: 'Room B', hostId: 'user-2', settings: baseSettings });

      const rooms = await service.listRooms('user-1');
      expect(rooms).toHaveLength(1);
      expect(rooms[0]!.name).toBe('Room A');
    });

    it('returns rooms where the user is a participant', async () => {
      const room = await service.createRoom({
        name: 'Room C',
        hostId: 'user-2',
        settings: baseSettings,
      });
      await service.joinRoom(room.id, { ...aliceJoin, userId: 'user-1', displayName: 'Alice' });

      const rooms = await service.listRooms('user-1');
      expect(rooms).toHaveLength(1);
      expect(rooms[0]!.name).toBe('Room C');
    });

    it('does not return rooms the user neither hosts nor participates in', async () => {
      await service.createRoom({ name: 'Foreign Room', hostId: 'user-9', settings: baseSettings });
      const rooms = await service.listRooms('user-1');
      expect(rooms).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // endMeeting
  // --------------------------------------------------------------------------
  describe('endMeeting', () => {
    it('closes the room when called by the host', async () => {
      const room = await service.createRoom({
        name: 'Meeting Room',
        hostId: 'user-1',
        settings: baseSettings,
      });
      await service.joinRoom(room.id, aliceJoin);

      await service.endMeeting(room.id, 'user-1');

      const closed = await service.getRoom(room.id);
      expect(closed.status).toBe('closed');
      expect(closed.participants).toHaveLength(0);
    });

    it('rejects with Only the host can end the meeting when a non-host calls it', async () => {
      const room = await service.createRoom({
        name: 'Meeting Room',
        hostId: 'user-1',
        settings: baseSettings,
      });

      await expect(service.endMeeting(room.id, 'user-2')).rejects.toThrow(
        'Only the host can end the meeting',
      );
    });

    it('rejects with Room not found if the room does not exist', async () => {
      await expect(service.endMeeting('nope', 'user-1')).rejects.toThrow('Room not found');
    });
  });
});
