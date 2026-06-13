import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MatchmakingService } from '../matchmaker';
import type { MatchmakingConfig } from '../matchmaker';

vi.mock('livekit-server-sdk', () => {
  const mockCreateRoom = vi.fn().mockResolvedValue({
    name: 'max-random:test-pair',
    sid: 'RM_pair123',
    numParticipants: 0,
    maxParticipants: 2,
    creationTime: BigInt(1700000000),
  });

  const mockDeleteRoom = vi.fn().mockResolvedValue(undefined);

  const RoomServiceClient = vi.fn().mockImplementation(function () {
    return {
      createRoom: mockCreateRoom,
      deleteRoom: mockDeleteRoom,
    };
  });

  const mockToJwt = vi.fn().mockResolvedValue('eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJkZXZrZXkifQ.sig');
  const mockAddGrant = vi.fn();

  const AccessToken = vi.fn().mockImplementation(function () {
    return {
      addGrant: mockAddGrant,
      toJwt: mockToJwt,
    };
  });

  return {
    RoomServiceClient,
    AccessToken,
  };
});

describe('MatchmakingService', () => {
  let service: MatchmakingService;
  const config: MatchmakingConfig = {
    apiKey: 'devkey',
    apiSecret: 'devsecret',
    wsUrl: 'ws://localhost:7880',
    queueTimeoutMs: 1000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    service = new MatchmakingService(config);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('joinQueue', () => {
    it('adds a user to the queue when no match available', async () => {
      const result = await service.joinQueue('user-1', {});

      expect(result).toBeNull();
      const status = service.getQueueStatus('user-1');
      expect(status.userInQueue).toBe(true);
      expect(status.queueSize).toBe(1);
    });

    it('pairs two compatible users immediately', async () => {
      await service.joinQueue('user-1', { language: 'en' });
      const result = await service.joinQueue('user-2', { language: 'en' });

      expect(result).not.toBeNull();
      expect(result!.roomName).toMatch(/^max-random:/);
      expect(result!.tokens).toHaveLength(2);
      expect(result!.tokens[0]!.userId).toBe('user-2');
      expect(result!.tokens[1]!.userId).toBe('user-1');
    });

    it('does not pair incompatible users (different language)', async () => {
      await service.joinQueue('user-1', { language: 'en' });
      const result = await service.joinQueue('user-2', { language: 'fr' });

      expect(result).toBeNull();
      const status = service.getQueueStatus('user-1');
      expect(status.queueSize).toBe(2);
    });

    it('throws ALREADY_IN_QUEUE if user joins twice', async () => {
      await service.joinQueue('user-1', {});

      await expect(service.joinQueue('user-1', {})).rejects.toThrow('User already in queue');
    });

    it('creates a LiveKit room when pairing', async () => {
      await service.joinQueue('user-1', {});
      await service.joinQueue('user-2', {});

      const { RoomServiceClient } = await import('livekit-server-sdk');
      const mockInstance = (RoomServiceClient as unknown as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;
      expect(mockInstance.createRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          maxParticipants: 2,
          emptyTimeout: 30,
        }),
      );
    });
  });

  describe('leaveQueue', () => {
    it('removes a user from the queue', async () => {
      await service.joinQueue('user-1', {});
      const removed = service.leaveQueue('user-1');

      expect(removed).toBe(true);
      expect(service.getQueueStatus('user-1').userInQueue).toBe(false);
    });

    it('returns false if user is not in queue', () => {
      const removed = service.leaveQueue('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('timeout', () => {
    it('removes user from queue after timeout', async () => {
      await service.joinQueue('user-1', {});

      expect(service.getQueueStatus('user-1').userInQueue).toBe(true);

      vi.advanceTimersByTime(1000);

      expect(service.getQueueStatus('user-1').userInQueue).toBe(false);
    });

    it('clears timeout when user is paired', async () => {
      await service.joinQueue('user-1', {});
      await service.joinQueue('user-2', {});

      // After pairing, user-1 should not be in queue
      expect(service.getQueueStatus('user-1').userInQueue).toBe(false);

      // Advance time beyond timeout - should not cause errors
      vi.advanceTimersByTime(2000);
    });
  });

  describe('getQueueStatus', () => {
    it('returns correct queue size and user status', async () => {
      await service.joinQueue('user-1', { language: 'en' });

      const status1 = service.getQueueStatus('user-1');
      expect(status1.queueSize).toBe(1);
      expect(status1.userInQueue).toBe(true);

      const status3 = service.getQueueStatus('user-3');
      expect(status3.queueSize).toBe(1);
      expect(status3.userInQueue).toBe(false);
    });

    it('shows multiple users in queue when incompatible', async () => {
      await service.joinQueue('user-1', { language: 'en' });
      await service.joinQueue('user-2', { language: 'fr' });

      const status = service.getQueueStatus('user-1');
      expect(status.queueSize).toBe(2);
      expect(status.userInQueue).toBe(true);
    });
  });

  describe('destroyRoom', () => {
    it('deletes a LiveKit room', async () => {
      await expect(service.destroyRoom('max-random:test')).resolves.toBeUndefined();
    });

    it('throws when room deletion fails', async () => {
      const { RoomServiceClient } = await import('livekit-server-sdk');
      const mockInstance = (RoomServiceClient as unknown as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;
      mockInstance.deleteRoom.mockRejectedValueOnce(new Error('not found'));

      await expect(service.destroyRoom('max-random:nonexistent')).rejects.toThrow(
        'Failed to destroy matchmaking room',
      );
    });
  });
});
