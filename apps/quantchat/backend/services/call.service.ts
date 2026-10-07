import { createAppError } from '@quant/server-core';
import { RoomServiceClient, AccessToken, type VideoGrant } from 'livekit-server-sdk';

export interface CallServiceConfig {
  apiKey: string;
  apiSecret: string;
  wsUrl: string;
}

export interface CallInfo {
  callId: string;
  roomName: string;
  type: 'one-to-one' | 'group';
  initiatorId: string;
  participantIds: string[];
  createdAt: number;
}

const MAX_GROUP_PARTICIPANTS = 8;

export class CallService {
  private readonly roomClient: RoomServiceClient;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly calls = new Map<string, CallInfo>();

  constructor(config: CallServiceConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.roomClient = new RoomServiceClient(config.wsUrl, config.apiKey, config.apiSecret);
  }

  async initiate1v1Call(callerId: string, calleeId: string): Promise<CallInfo> {
    const callId = this.generateCallId();
    const roomName = `chat-call:${callId}`;

    try {
      await this.roomClient.createRoom({
        name: roomName,
        maxParticipants: 2,
        emptyTimeout: 60,
      });
    } catch (err) {
      throw createAppError(
        `Failed to create call room: ${(err as Error).message}`,
        502,
        'CALL_CREATE_FAILED',
      );
    }

    const callInfo: CallInfo = {
      callId,
      roomName,
      type: 'one-to-one',
      initiatorId: callerId,
      participantIds: [callerId, calleeId],
      createdAt: Date.now(),
    };

    this.calls.set(callId, callInfo);
    return callInfo;
  }

  async initiateGroupCall(initiatorId: string, participantIds: string[]): Promise<CallInfo> {
    const allParticipants = [initiatorId, ...participantIds.filter((id) => id !== initiatorId)];

    if (allParticipants.length > MAX_GROUP_PARTICIPANTS) {
      throw createAppError(
        `Group calls are limited to ${MAX_GROUP_PARTICIPANTS} participants`,
        400,
        'GROUP_CALL_LIMIT_EXCEEDED',
      );
    }

    if (allParticipants.length < 2) {
      throw createAppError(
        'Group calls require at least 2 participants',
        400,
        'GROUP_CALL_MIN_PARTICIPANTS',
      );
    }

    const callId = this.generateCallId();
    const roomName = `chat-call:${callId}`;

    try {
      await this.roomClient.createRoom({
        name: roomName,
        maxParticipants: MAX_GROUP_PARTICIPANTS,
        emptyTimeout: 60,
      });
    } catch (err) {
      throw createAppError(
        `Failed to create group call room: ${(err as Error).message}`,
        502,
        'GROUP_CALL_CREATE_FAILED',
      );
    }

    const callInfo: CallInfo = {
      callId,
      roomName,
      type: 'group',
      initiatorId,
      participantIds: allParticipants,
      createdAt: Date.now(),
    };

    this.calls.set(callId, callInfo);
    return callInfo;
  }

  async leaveCall(callId: string, userId: string): Promise<{ ended: boolean }> {
    const call = this.calls.get(callId);
    if (!call) {
      throw createAppError('Call not found', 404, 'CALL_NOT_FOUND');
    }

    if (!call.participantIds.includes(userId)) {
      throw createAppError('User is not a participant of this call', 403, 'CALL_NOT_PARTICIPANT');
    }

    // Remove the participant from the call
    call.participantIds = call.participantIds.filter((id) => id !== userId);

    try {
      await this.roomClient.removeParticipant(call.roomName, userId);
    } catch {
      // Participant may have already disconnected - safe to ignore
    }

    // If no participants remain, destroy the room
    if (call.participantIds.length === 0) {
      try {
        await this.roomClient.deleteRoom(call.roomName);
      } catch {
        // Room may already be gone due to emptyTimeout
      }
      this.calls.delete(callId);
      return { ended: true };
    }

    return { ended: false };
  }

  async endCall(callId: string): Promise<void> {
    const call = this.calls.get(callId);
    if (!call) {
      throw createAppError('Call not found', 404, 'CALL_NOT_FOUND');
    }

    try {
      await this.roomClient.deleteRoom(call.roomName);
    } catch (err) {
      throw createAppError(`Failed to end call: ${(err as Error).message}`, 502, 'CALL_END_FAILED');
    }

    this.calls.delete(callId);
  }

  /**
   * Generate a LiveKit access token for a call participant.
   *
   * Token TTL: 1 hour. Calls are typically shorter than meetings. A 1-hour
   * window covers the vast majority of voice/video calls while limiting the
   * blast radius of a leaked token.
   */
  async generateCallToken(callId: string, userId: string): Promise<string> {
    const call = this.calls.get(callId);
    if (!call) {
      throw createAppError('Call not found', 404, 'CALL_NOT_FOUND');
    }

    if (!call.participantIds.includes(userId)) {
      throw createAppError('User is not a participant of this call', 403, 'CALL_NOT_PARTICIPANT');
    }

    const grant: VideoGrant = {
      room: call.roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    };

    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: userId,
      name: userId,
      ttl: '1h',
    });
    token.addGrant(grant);

    return await token.toJwt();
  }

  getCall(callId: string): CallInfo | undefined {
    return this.calls.get(callId);
  }

  private generateCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
