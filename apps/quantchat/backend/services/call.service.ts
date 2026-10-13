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

/**
 * QC-F-287: the durable-row shape {@link CallRegistryLookup} returns — a
 * structural subset of CallRecordService's `CallRow`, declared here so this
 * service does not import the record service (the repo's narrow-DI pattern:
 * dependency points from the live tier toward a minimal read interface,
 * never the other way around).
 */
export interface CallRegistryRow {
  roomId: string | null;
  initiatorId: string;
  participants: unknown;
  status: string;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
}

/**
 * QC-F-287: read-only durable lookup used to rehydrate the in-memory call
 * registry after a restart / on a second replica. Optional by design:
 * instances constructed without one (voice-bot services, older tests) keep
 * the exact pre-QC-F-287 in-memory-only behaviour.
 */
export interface CallRegistryLookup {
  findCallRowByRoomId(roomId: string): Promise<CallRegistryRow | null>;
}

const MAX_GROUP_PARTICIPANTS = 8;

export class CallService {
  private readonly roomClient: RoomServiceClient;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly calls = new Map<string, CallInfo>();
  private readonly lookup?: CallRegistryLookup;

  constructor(config: CallServiceConfig, lookup?: CallRegistryLookup) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.roomClient = new RoomServiceClient(config.wsUrl, config.apiKey, config.apiSecret);
    this.lookup = lookup;
  }

  /**
   * The one place a LiveKit room name is derived from a callId. Initiation
   * builds room names through here and QC-F-287 rehydration derives them
   * through here, so the two can never drift apart: for every persisted row,
   * `roomName === roomNameForCallId(row.roomId)` holds by construction (the
   * routes layer persists roomId = callId).
   */
  private roomNameForCallId(callId: string): string {
    return `chat-call:${callId}`;
  }

  /**
   * QC-F-287: resolve a call for the gated operations (token / leave / end /
   * internal end). The in-memory registry is a per-process CACHE, not the
   * source of truth: on a cache miss, when a durable lookup was injected,
   * the persisted `Call` row is consulted and an ACTIVE, unterminated row is
   * rehydrated into the cache BEFORE the caller's participant check runs —
   * so the authorization ordering (404 CALL_NOT_FOUND first, then 403
   * CALL_NOT_PARTICIPANT) is byte-identical to the pre-restart behaviour.
   *
   * Failure semantics (fail closed, honestly labelled):
   * - no lookup injected → the old 404 (voice-bot / legacy instances);
   * - lookup throws (database unavailable) → 503 CALL_LOOKUP_UNAVAILABLE —
   *   never a token, never a room operation, never a guessed 404;
   * - no row, a terminal row, or a malformed row → the honest 404.
   */
  private async resolveCall(callId: string): Promise<CallInfo> {
    const cached = this.calls.get(callId);
    if (cached) {
      return cached;
    }

    if (!this.lookup) {
      throw createAppError('Call not found', 404, 'CALL_NOT_FOUND');
    }

    let row: CallRegistryRow | null;
    try {
      row = await this.lookup.findCallRowByRoomId(callId);
    } catch {
      throw createAppError('Call lookup unavailable', 503, 'CALL_LOOKUP_UNAVAILABLE');
    }

    const info = row ? this.callInfoFromRow(row, callId) : null;
    if (!info) {
      throw createAppError('Call not found', 404, 'CALL_NOT_FOUND');
    }

    this.calls.set(callId, info);
    return info;
  }

  /**
   * Build a CallInfo from a durable row, or return null when the row cannot
   * honestly represent a live call: roomId must be present and equal to the
   * requested callId (the row's cuid `id` is NEVER a callId), the row must
   * be ACTIVE with no endedAt (a finished call must never be resurrected),
   * and the Json participants column must coerce to a non-empty string list
   * (the CallRecordService coercion rule) — a call with no knowable roster
   * can never be authorized, so it is not rehydrated.
   *
   * `type` cannot come from the row: the persisted `type` is the Prisma
   * media enum (AUDIO/VIDEO, in practice always the VIDEO default), while
   * CallInfo.type is cardinality. It is therefore derived from the roster
   * size (<= 2 → 'one-to-one', otherwise 'group'); a 2-participant group
   * call rehydrates as 'one-to-one'. No gated operation reads `type` — it
   * is informational (getCall / initiate responses) only.
   */
  private callInfoFromRow(row: CallRegistryRow, callId: string): CallInfo | null {
    if (!row.roomId || row.roomId !== callId) {
      return null;
    }
    if (row.status !== 'ACTIVE' || row.endedAt != null) {
      return null;
    }
    const participantIds = Array.isArray(row.participants)
      ? row.participants.filter((v): v is string => typeof v === 'string')
      : [];
    if (participantIds.length === 0) {
      return null;
    }
    return {
      callId: row.roomId,
      roomName: this.roomNameForCallId(row.roomId),
      type: participantIds.length <= 2 ? 'one-to-one' : 'group',
      initiatorId: row.initiatorId,
      participantIds,
      createdAt: (row.startedAt ?? row.createdAt).getTime(),
    };
  }

  async initiate1v1Call(callerId: string, calleeId: string): Promise<CallInfo> {
    const callId = this.generateCallId();
    const roomName = this.roomNameForCallId(callId);

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
    const roomName = this.roomNameForCallId(callId);

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
    const call = await this.resolveCall(callId);

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

  /**
   * End a call on behalf of a requesting user (HTTP path).
   *
   * Authorization: the requester must be a CURRENT participant of the call —
   * the same gate `leaveCall` and `generateCallToken` already apply
   * (404 CALL_NOT_FOUND first, then 403 CALL_NOT_PARTICIPANT). A participant
   * who already left is no longer in `participantIds` and cannot end the call.
   */
  async endCall(callId: string, userId: string): Promise<void> {
    const call = await this.resolveCall(callId);

    if (!call.participantIds.includes(userId)) {
      throw createAppError('User is not a participant of this call', 403, 'CALL_NOT_PARTICIPANT');
    }

    await this.destroyCall(call);
  }

  /**
   * SYSTEM ONLY — end a call with NO authorization check.
   *
   * Reserved for trusted in-process callers that have no requesting user:
   * the call-ring generator's decline / dialogue-end / ring-timeout teardown
   * (those paths carry their own authorization and session state). No HTTP
   * route may call this — HTTP callers must use `endCall(callId, userId)` so
   * the participant gate always applies. Never make the userId on `endCall`
   * optional instead: an optional bypass would silently reopen this hole if
   * a future route forgot to pass it.
   */
  async endCallInternal(callId: string): Promise<void> {
    const call = await this.resolveCall(callId);

    await this.destroyCall(call);
  }

  private async destroyCall(call: CallInfo): Promise<void> {
    try {
      await this.roomClient.deleteRoom(call.roomName);
    } catch (err) {
      throw createAppError(`Failed to end call: ${(err as Error).message}`, 502, 'CALL_END_FAILED');
    }

    this.calls.delete(call.callId);
  }

  /**
   * Generate a LiveKit access token for a call participant.
   *
   * Token TTL: 1 hour. Calls are typically shorter than meetings. A 1-hour
   * window covers the vast majority of voice/video calls while limiting the
   * blast radius of a leaked token.
   */
  async generateCallToken(callId: string, userId: string): Promise<string> {
    const call = await this.resolveCall(callId);

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

  /**
   * Synchronous cache peek ONLY: this reads this process's in-memory
   * registry and never the durable store, so a miss does NOT mean the call
   * does not exist (it may live on another replica / predate a restart).
   * Callers that need the durable truth must use the async gated operations,
   * which rehydrate via {@link CallService.resolveCall}.
   */
  getCall(callId: string): CallInfo | undefined {
    return this.calls.get(callId);
  }

  private generateCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
