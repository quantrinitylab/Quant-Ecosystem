import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecordingService } from '../services/recording.service';

function createMockStorageClient() {
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

describe('RecordingService', () => {
  let service: RecordingService;
  let mockStorage: ReturnType<typeof createMockStorageClient>;

  beforeEach(() => {
    mockStorage = createMockStorageClient();
    service = new RecordingService(mockStorage as never);
  });

  describe('startRecording', () => {
    it('creates a recording with recording status', () => {
      const recording = service.startRecording('room-1', 'user-1');

      expect(recording.id).toBeDefined();
      expect(recording.roomId).toBe('room-1');
      expect(recording.userId).toBe('user-1');
      expect(recording.status).toBe('recording');
      expect(recording.startedAt).toBeInstanceOf(Date);
      expect(recording.stoppedAt).toBeNull();
      expect(recording.duration).toBeNull();
    });

    it('stores recording in internal registry', () => {
      const recording = service.startRecording('room-1', 'user-1');
      const fetched = service.getRecording(recording.id);

      expect(fetched.id).toBe(recording.id);
    });

    it('generates a storageKey with room and recording ids', () => {
      const recording = service.startRecording('room-1', 'user-1');

      expect(recording.storageKey).toContain('recordings/room-1/');
      expect(recording.storageKey).toContain('.webm');
    });

    it('creates unique recording ids', () => {
      const r1 = service.startRecording('room-1', 'user-1');
      const r2 = service.startRecording('room-1', 'user-1');

      expect(r1.id).not.toBe(r2.id);
    });
  });

  describe('stopRecording', () => {
    it('updates status to completed and sets stoppedAt', () => {
      const recording = service.startRecording('room-1', 'user-1');
      const stopped = service.stopRecording(recording.id);

      expect(stopped.status).toBe('completed');
      expect(stopped.stoppedAt).toBeInstanceOf(Date);
      expect(stopped.duration).toBeGreaterThanOrEqual(0);
    });

    it('throws RECORDING_NOT_FOUND when recording does not exist', () => {
      expect(() => service.stopRecording('non-existent')).toThrow('Recording not found');
    });

    it('throws RECORDING_NOT_ACTIVE if already stopped', () => {
      const recording = service.startRecording('room-1', 'user-1');
      service.stopRecording(recording.id);

      expect(() => service.stopRecording(recording.id)).toThrow('Recording is not active');
    });

    it('calculates duration based on start and stop time', () => {
      const recording = service.startRecording('room-1', 'user-1');
      const stopped = service.stopRecording(recording.id);

      expect(typeof stopped.duration).toBe('number');
      expect(stopped.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getRecording', () => {
    it('returns recording by id', () => {
      const recording = service.startRecording('room-1', 'user-1');
      const fetched = service.getRecording(recording.id);

      expect(fetched).toEqual(recording);
    });

    it('throws RECORDING_NOT_FOUND for non-existent id', () => {
      expect(() => service.getRecording('does-not-exist')).toThrow('Recording not found');
    });

    it('returns updated recording after stop', () => {
      const recording = service.startRecording('room-1', 'user-1');
      service.stopRecording(recording.id);

      const fetched = service.getRecording(recording.id);

      expect(fetched.status).toBe('completed');
      expect(fetched.stoppedAt).not.toBeNull();
    });
  });

  describe('listRecordings', () => {
    it('returns all recordings for a given roomId', () => {
      service.startRecording('room-1', 'user-1');
      service.startRecording('room-1', 'user-2');
      service.startRecording('room-2', 'user-1');

      const recordings = service.listRecordings('room-1');

      expect(recordings).toHaveLength(2);
      expect(recordings.every((r) => r.roomId === 'room-1')).toBe(true);
    });

    it('returns empty array for room with no recordings', () => {
      const recordings = service.listRecordings('empty-room');

      expect(recordings).toEqual([]);
    });

    it('does not return recordings from other rooms', () => {
      service.startRecording('room-1', 'user-1');
      service.startRecording('room-2', 'user-2');

      const recordings = service.listRecordings('room-1');

      expect(recordings).toHaveLength(1);
      expect(recordings[0]!.roomId).toBe('room-1');
    });
  });
});
