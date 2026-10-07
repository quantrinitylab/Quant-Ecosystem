import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CallService } from '../services/call.service';
import type { CallServiceConfig } from '../services/call.service';

vi.mock('livekit-server-sdk', () => {
  const mockCreateRoom = vi.fn().mockResolvedValue({
    name: 'chat-call:test-call',
    sid: 'RM_call123',
    numParticipants: 0,
    maxParticipants: 2,
    creationTime: BigInt(1700000000),
  });

  const mockDeleteRoom = vi.fn().mockResolvedValue(undefined);
  const mockRemoveParticipant = vi.fn().mockResolvedValue(undefined);

  const RoomServiceClient = vi.fn().mockImplementation(function () {
    return {
      createRoom: mockCreateRoom,
      deleteRoom: mockDeleteRoom,
      removeParticipant: mockRemoveParticipant,
    };
  });

  const mockToJwt = vi
    .fn()
    .mockResolvedValue('eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJkZXZrZXkiLCJzdWIiOiJ1c2VyLTEifQ.sig');
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

describe('CallService', () => {
  let service: CallService;
  const config: CallServiceConfig = {
    apiKey: 'devkey',
    apiSecret: 'devsecret',
    wsUrl: 'ws://localhost:7880',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CallService(config);
  });

  describe('initiate1v1Call', () => {
    it('creates a 1:1 call between two users', async () => {
      const call = await service.initiate1v1Call('user-a', 'user-b');

      expect(call.type).toBe('one-to-one');
      expect(call.initiatorId).toBe('user-a');
      expect(call.participantIds).toContain('user-a');
      expect(call.participantIds).toContain('user-b');
      expect(call.roomName).toMatch(/^chat-call:/);
      expect(call.callId).toBeTruthy();
    });

    it('creates a LiveKit room with max 2 participants', async () => {
      await service.initiate1v1Call('user-a', 'user-b');

      const { RoomServiceClient } = await import('livekit-server-sdk');
      const mockInstance = (RoomServiceClient as unknown as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;
      expect(mockInstance.createRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          maxParticipants: 2,
          emptyTimeout: 60,
        }),
      );
    });

    it('throws CALL_CREATE_FAILED when room creation fails', async () => {
      const { RoomServiceClient } = await import('livekit-server-sdk');
      const mockInstance = (RoomServiceClient as unknown as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;
      mockInstance.createRoom.mockRejectedValueOnce(new Error('connection refused'));

      await expect(service.initiate1v1Call('user-a', 'user-b')).rejects.toThrow(
        'Failed to create call room',
      );
    });
  });

  describe('initiateGroupCall', () => {
    it('creates a group call with multiple participants', async () => {
      const call = await service.initiateGroupCall('user-a', ['user-b', 'user-c', 'user-d']);

      expect(call.type).toBe('group');
      expect(call.initiatorId).toBe('user-a');
      expect(call.participantIds).toHaveLength(4);
      expect(call.roomName).toMatch(/^chat-call:/);
    });

    it('rejects group calls with more than 8 participants', async () => {
      const participants = Array.from({ length: 9 }, (_, i) => `user-${i}`);

      await expect(service.initiateGroupCall('user-initiator', participants)).rejects.toThrow(
        'Group calls are limited to 8 participants',
      );
    });

    it('rejects group calls with fewer than 2 participants total', async () => {
      await expect(service.initiateGroupCall('user-a', [])).rejects.toThrow(
        'Group calls require at least 2 participants',
      );
    });

    it('deduplicates the initiator from participant list', async () => {
      const call = await service.initiateGroupCall('user-a', ['user-a', 'user-b', 'user-c']);

      expect(call.participantIds).toHaveLength(3);
    });
  });

  describe('endCall', () => {
    it('deletes the LiveKit room and removes the call', async () => {
      const call = await service.initiate1v1Call('user-a', 'user-b');
      await service.endCall(call.callId);

      expect(service.getCall(call.callId)).toBeUndefined();
    });

    it('throws CALL_NOT_FOUND for unknown call ID', async () => {
      await expect(service.endCall('nonexistent')).rejects.toThrow('Call not found');
    });

    it('throws CALL_END_FAILED when room deletion fails', async () => {
      const { RoomServiceClient } = await import('livekit-server-sdk');
      const mockInstance = (RoomServiceClient as unknown as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      const call = await service.initiate1v1Call('user-a', 'user-b');
      mockInstance.deleteRoom.mockRejectedValueOnce(new Error('network error'));

      await expect(service.endCall(call.callId)).rejects.toThrow('Failed to end call');
    });
  });

  describe('leaveCall', () => {
    it('removes the participant from the call without ending it', async () => {
      const call = await service.initiateGroupCall('user-a', ['user-b', 'user-c']);
      const result = await service.leaveCall(call.callId, 'user-b');

      expect(result.ended).toBe(false);
      const updatedCall = service.getCall(call.callId);
      expect(updatedCall).toBeDefined();
      expect(updatedCall!.participantIds).not.toContain('user-b');
    });

    it('ends the call when the last participant leaves', async () => {
      const call = await service.initiate1v1Call('user-a', 'user-b');
      await service.leaveCall(call.callId, 'user-a');
      const result = await service.leaveCall(call.callId, 'user-b');

      expect(result.ended).toBe(true);
      expect(service.getCall(call.callId)).toBeUndefined();
    });

    it('throws CALL_NOT_FOUND for unknown call ID', async () => {
      await expect(service.leaveCall('nonexistent', 'user-a')).rejects.toThrow('Call not found');
    });

    it('throws CALL_NOT_PARTICIPANT for non-participant', async () => {
      const call = await service.initiate1v1Call('user-a', 'user-b');
      await expect(service.leaveCall(call.callId, 'user-c')).rejects.toThrow(
        'User is not a participant of this call',
      );
    });
  });

  describe('generateCallToken', () => {
    it('returns a JWT token for a valid participant', async () => {
      const call = await service.initiate1v1Call('user-a', 'user-b');
      const token = await service.generateCallToken(call.callId, 'user-a');

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('throws CALL_NOT_FOUND for unknown call ID', async () => {
      await expect(service.generateCallToken('nonexistent', 'user-a')).rejects.toThrow(
        'Call not found',
      );
    });

    it('throws CALL_NOT_PARTICIPANT for non-participant', async () => {
      const call = await service.initiate1v1Call('user-a', 'user-b');

      await expect(service.generateCallToken(call.callId, 'user-c')).rejects.toThrow(
        'User is not a participant of this call',
      );
    });

    it('creates AccessToken with correct room grant', async () => {
      const call = await service.initiate1v1Call('user-a', 'user-b');
      await service.generateCallToken(call.callId, 'user-a');

      const { AccessToken } = await import('livekit-server-sdk');
      const mockInstance = (AccessToken as unknown as ReturnType<typeof vi.fn>).mock.results[0]
        ?.value;
      expect(mockInstance.addGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          room: call.roomName,
          roomJoin: true,
          canPublish: true,
          canSubscribe: true,
        }),
      );
    });
  });
});
