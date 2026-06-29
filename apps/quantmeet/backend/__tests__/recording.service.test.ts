// ============================================================================
// Unit tests — RecordingService (durable meeting recordings, Prisma-backed)
//
// RecordingService persists recordings to the Prisma `Recording` model so
// recording metadata survives restarts and is shared across backend instances.
// A live PostgreSQL is not available in the sandbox, so — mirroring the repo's
// fake-prisma approach (see room.service.test.ts / call-record.service.test.ts)
// — these tests drive the REAL RecordingService against a faithful in-memory
// model of the exact `recording` delegate operations it issues:
//
//   prisma.recording.create / findUnique / update / findMany (orderBy) / count
//
// Covers: start (persists 'recording'; rejects when one already active; egress
// start + failure), stop (completed + duration; not-found; not-active; egress
// stop + failure), getRecording (not-found), getRecordingUrl (not-ready vs
// ready), listRecordings (room-scoped, newest-first). Every read method is now
// async (await / rejects).
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecordingService } from '../services/recording.service';
import type { RecordingPrisma, RecordingRow } from '../services/recording.service';

// ---------------------------------------------------------------------------
// In-memory fake of the Prisma `recording` delegate.
// ---------------------------------------------------------------------------
function createFakeRecordingPrisma(): RecordingPrisma & { __recordings: RecordingRow[] } {
  const recordings: RecordingRow[] = [];
  // Monotonic clock so createdAt ordering is deterministic.
  let clock = 1_700_000_000_000;
  const tick = (): Date => new Date((clock += 1000));

  const matches = (row: RecordingRow, where?: Record<string, unknown>): boolean => {
    if (!where) return true;
    return Object.entries(where).every(([key, value]) => {
      return (row as unknown as Record<string, unknown>)[key] === value;
    });
  };

  return {
    recording: {
      async create({ data }) {
        const row: RecordingRow = {
          id: (data['id'] as string) ?? `rec_${recordings.length + 1}`,
          roomId: String(data['roomId']),
          userId: String(data['userId']),
          status: (data['status'] as string) ?? 'recording',
          startedAt: (data['startedAt'] as Date) ?? tick(),
          stoppedAt: (data['stoppedAt'] as Date | null) ?? null,
          storageKey: String(data['storageKey']),
          duration: (data['duration'] as number | null) ?? null,
          fileSize: (data['fileSize'] as number | null) ?? null,
          egressId: (data['egressId'] as string | null) ?? null,
          createdAt: tick(),
        };
        recordings.push(row);
        return { ...row };
      },
      async findUnique({ where }) {
        const row = recordings.find((r) => r.id === where.id);
        return row ? { ...row } : null;
      },
      async update({ where, data }) {
        const row = recordings.find((r) => r.id === where.id);
        if (!row) {
          throw new Error(`No Recording row with id ${where.id}`);
        }
        Object.assign(row, data);
        return { ...row };
      },
      async findMany({ where, orderBy }) {
        let result = recordings.filter((r) => matches(r, where)).map((r) => ({ ...r }));
        if (orderBy && !Array.isArray(orderBy) && orderBy['startedAt'] === 'desc') {
          result = result.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
        }
        return result;
      },
      async count({ where }) {
        return recordings.filter((r) => matches(r, where)).length;
      },
    },
    __recordings: recordings,
  };
}

function createStubStorageClient() {
  return {
    upload: vi.fn(),
    download: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    getSignedUrl: vi.fn(),
    listObjects: vi.fn(),
    copy: vi.fn(),
    headObject: vi.fn(),
  };
}

const s3Config = {
  bucket: 'quant-recordings',
  region: 'us-east-1',
  accessKey: 'minioadmin',
  secret: 'minioadmin',
  endpoint: 'http://localhost:9000',
};

describe('RecordingService — durable meeting recordings', () => {
  let prisma: ReturnType<typeof createFakeRecordingPrisma>;
  let storage: ReturnType<typeof createStubStorageClient>;
  let service: RecordingService;

  beforeEach(() => {
    prisma = createFakeRecordingPrisma();
    storage = createStubStorageClient();
    service = new RecordingService(prisma, storage as never);
  });

  // --------------------------------------------------------------------------
  // startRecording
  // --------------------------------------------------------------------------
  describe('startRecording', () => {
    it('persists a recording with recording status', async () => {
      const recording = await service.startRecording('room-1', 'user-1');

      expect(recording.id).toBeDefined();
      expect(recording.roomId).toBe('room-1');
      expect(recording.userId).toBe('user-1');
      expect(recording.status).toBe('recording');
      expect(recording.startedAt).toBeInstanceOf(Date);
      expect(recording.stoppedAt).toBeNull();
      expect(recording.duration).toBeNull();
      expect(recording.fileSize).toBeNull();
      expect(prisma.__recordings).toHaveLength(1);
    });

    it('generates a storageKey with room and recording ids', async () => {
      const recording = await service.startRecording('room-1', 'user-1');

      expect(recording.storageKey).toContain('recordings/room-1/');
      expect(recording.storageKey).toContain('.webm');
      expect(recording.storageKey).toContain(recording.id);
    });

    it('creates unique recording ids', async () => {
      const r1 = await service.startRecording('room-1', 'user-1');
      await service.stopRecording(r1.id);
      const r2 = await service.startRecording('room-1', 'user-1');

      expect(r1.id).not.toBe(r2.id);
    });

    it('rejects when the room already has an active recording', async () => {
      await service.startRecording('room-1', 'user-1');

      await expect(service.startRecording('room-1', 'user-2')).rejects.toThrow(
        'Room already has an active recording',
      );
    });

    it('allows a new recording once the previous one has stopped', async () => {
      const first = await service.startRecording('room-1', 'user-1');
      await service.stopRecording(first.id);

      await expect(service.startRecording('room-1', 'user-1')).resolves.toMatchObject({
        status: 'recording',
      });
    });

    it('starts a LiveKit egress and persists the egressId when configured', async () => {
      const livekit = {
        startRecordingEgress: vi.fn().mockResolvedValue({
          egressId: 'egress-123',
          roomName: 'room-1',
          status: 'EGRESS_ACTIVE',
        }),
        stopEgress: vi.fn(),
      };
      service = new RecordingService(prisma, storage as never, livekit as never, s3Config);

      const recording = await service.startRecording('room-1', 'user-1');

      expect(livekit.startRecordingEgress).toHaveBeenCalledWith('room-1', s3Config);
      expect(recording.egressId).toBe('egress-123');
    });

    it('throws RECORDING_EGRESS_FAILED and persists nothing when egress start fails', async () => {
      const livekit = {
        startRecordingEgress: vi.fn().mockRejectedValue(new Error('livekit down')),
        stopEgress: vi.fn(),
      };
      service = new RecordingService(prisma, storage as never, livekit as never, s3Config);

      await expect(service.startRecording('room-1', 'user-1')).rejects.toThrow(
        'Failed to start egress for recording',
      );
      expect(prisma.__recordings).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // stopRecording
  // --------------------------------------------------------------------------
  describe('stopRecording', () => {
    it('updates status to completed and sets stoppedAt + duration', async () => {
      const recording = await service.startRecording('room-1', 'user-1');
      const stopped = await service.stopRecording(recording.id);

      expect(stopped.status).toBe('completed');
      expect(stopped.stoppedAt).toBeInstanceOf(Date);
      expect(typeof stopped.duration).toBe('number');
      expect(stopped.duration).toBeGreaterThanOrEqual(0);
    });

    it('rejects with Recording not found when recording does not exist', async () => {
      await expect(service.stopRecording('non-existent')).rejects.toThrow('Recording not found');
    });

    it('rejects with Recording is not active if already stopped', async () => {
      const recording = await service.startRecording('room-1', 'user-1');
      await service.stopRecording(recording.id);

      await expect(service.stopRecording(recording.id)).rejects.toThrow('Recording is not active');
    });

    it('stops the LiveKit egress when configured', async () => {
      const livekit = {
        startRecordingEgress: vi.fn().mockResolvedValue({
          egressId: 'egress-123',
          roomName: 'room-1',
          status: 'EGRESS_ACTIVE',
        }),
        stopEgress: vi.fn().mockResolvedValue({
          egressId: 'egress-123',
          roomName: 'room-1',
          status: 'EGRESS_COMPLETE',
        }),
      };
      service = new RecordingService(prisma, storage as never, livekit as never, s3Config);

      const recording = await service.startRecording('room-1', 'user-1');
      const stopped = await service.stopRecording(recording.id);

      expect(livekit.stopEgress).toHaveBeenCalledWith('egress-123');
      expect(stopped.status).toBe('completed');
    });

    it('marks the recording failed and rethrows when egress stop fails', async () => {
      const livekit = {
        startRecordingEgress: vi.fn().mockResolvedValue({
          egressId: 'egress-123',
          roomName: 'room-1',
          status: 'EGRESS_ACTIVE',
        }),
        stopEgress: vi.fn().mockRejectedValue(new Error('cannot stop')),
      };
      service = new RecordingService(prisma, storage as never, livekit as never, s3Config);

      const recording = await service.startRecording('room-1', 'user-1');

      await expect(service.stopRecording(recording.id)).rejects.toThrow('Failed to stop egress');

      const persisted = await service.getRecording(recording.id);
      expect(persisted.status).toBe('failed');
    });
  });

  // --------------------------------------------------------------------------
  // getRecording
  // --------------------------------------------------------------------------
  describe('getRecording', () => {
    it('returns the recording by id', async () => {
      const recording = await service.startRecording('room-1', 'user-1');
      const fetched = await service.getRecording(recording.id);

      expect(fetched.id).toBe(recording.id);
    });

    it('rejects with Recording not found for a non-existent id', async () => {
      await expect(service.getRecording('does-not-exist')).rejects.toThrow('Recording not found');
    });

    it('returns the updated recording after stop', async () => {
      const recording = await service.startRecording('room-1', 'user-1');
      await service.stopRecording(recording.id);

      const fetched = await service.getRecording(recording.id);
      expect(fetched.status).toBe('completed');
      expect(fetched.stoppedAt).not.toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // getRecordingUrl
  // --------------------------------------------------------------------------
  describe('getRecordingUrl', () => {
    it('rejects with Recording not yet available while still recording', async () => {
      const recording = await service.startRecording('room-1', 'user-1');

      await expect(service.getRecordingUrl(recording.id)).rejects.toThrow(
        'Recording not yet available',
      );
    });

    it('returns the storageKey once completed', async () => {
      const recording = await service.startRecording('room-1', 'user-1');
      await service.stopRecording(recording.id);

      await expect(service.getRecordingUrl(recording.id)).resolves.toBe(recording.storageKey);
    });

    it('rejects with Recording not found for a non-existent id', async () => {
      await expect(service.getRecordingUrl('nope')).rejects.toThrow('Recording not found');
    });
  });

  // --------------------------------------------------------------------------
  // listRecordings
  // --------------------------------------------------------------------------
  describe('listRecordings', () => {
    it('returns all recordings for a given roomId', async () => {
      const r1 = await service.startRecording('room-1', 'user-1');
      await service.stopRecording(r1.id);
      const r2 = await service.startRecording('room-1', 'user-2');
      await service.stopRecording(r2.id);
      await service.startRecording('room-2', 'user-1');

      const recordings = await service.listRecordings('room-1');

      expect(recordings).toHaveLength(2);
      expect(recordings.every((r) => r.roomId === 'room-1')).toBe(true);
    });

    it('returns an empty array for a room with no recordings', async () => {
      await expect(service.listRecordings('empty-room')).resolves.toEqual([]);
    });

    it('does not return recordings from other rooms', async () => {
      await service.startRecording('room-1', 'user-1');
      await service.startRecording('room-2', 'user-2');

      const recordings = await service.listRecordings('room-1');
      expect(recordings).toHaveLength(1);
      expect(recordings[0]!.roomId).toBe('room-1');
    });

    it('returns recordings newest-first by startedAt', async () => {
      // startRecording stamps startedAt with real `new Date()`; drive the clock
      // so each recording gets a distinct startedAt and the desc ordering is
      // deterministic (no millisecond ties between rapid creations).
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
        const r1 = await service.startRecording('room-1', 'user-1');
        await service.stopRecording(r1.id);

        vi.setSystemTime(new Date('2024-01-01T00:01:00.000Z'));
        const r2 = await service.startRecording('room-1', 'user-2');
        await service.stopRecording(r2.id);

        vi.setSystemTime(new Date('2024-01-01T00:02:00.000Z'));
        const r3 = await service.startRecording('room-1', 'user-3');

        const recordings = await service.listRecordings('room-1');
        expect(recordings.map((r) => r.id)).toEqual([r3.id, r2.id, r1.id]);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
