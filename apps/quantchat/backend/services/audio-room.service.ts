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
  // QC-F-199 — invite-or-membership admission model for private rooms.
  // `isPrivate` was stored but never read (C1): strangers could list, read
  // and join any "private" room. An invite is a JOIN ticket only (host OR
  // participant OR invited may join); READ (list/detail) stays host OR
  // participant — an invited-but-not-joined user sees nothing. Rides the
  // room (same in-memory lifetime); NOT consumed on join, so leave->rejoin
  // keeps working while the room lives. Visible ONLY to the host in
  // responses (stripForViewer); durable slice is separate (§(c)).
  invitedUserIds: string[];
}

// Non-host view of a room: identical minus the invite roster.
export type AudioRoomPublicView = Omit<AudioRoom, 'invitedUserIds'>;

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
      invitedUserIds: [],
    };

    AudioRoomService.rooms.set(id, room);
    return room;
  }

  public static getAudioRoom(roomId: string): AudioRoom | null {
    return AudioRoomService.rooms.get(roomId) || null;
  }

  // QC-F-199 — admission + view helpers.
  // READ (list/detail): a private room is visible ONLY to its host and
  // current participants. An invite is a JOIN ticket only — an invited but
  // not-yet-joined user sees nothing (no title/roster leak) and joins with
  // the room id shared out-of-band. Absent userId fails closed (stranger)
  // on private rooms.
  private static canView(room: AudioRoom, userId?: string): boolean {
    if (!room.isPrivate) return true;
    if (!userId) return false;
    if (userId === room.hostId) return true;
    return room.participants.some((p) => p.userId === userId);
  }

  // JOIN admission: host OR participant OR invited.
  private static isAdmitted(room: AudioRoom, userId?: string): boolean {
    if (AudioRoomService.canView(room, userId)) return true;
    if (!room.isPrivate || !userId) return false;
    return room.invitedUserIds.includes(userId);
  }

  // Host sees the full room (incl. invite roster); everyone else gets a
  // copy WITHOUT invitedUserIds. Does not mutate the stored room.
  public static stripForViewer(
    room: AudioRoom,
    viewerId?: string,
  ): AudioRoom | AudioRoomPublicView {
    if (viewerId && viewerId === room.hostId) return room;
    const { invitedUserIds: _inviteRoster, ...rest } = room;
    return { ...rest, participants: [...room.participants] };
  }

  public static getRoomForViewer(
    roomId: string,
    viewerId?: string,
  ): AudioRoom | AudioRoomPublicView | null {
    const room = AudioRoomService.rooms.get(roomId) || null;
    if (!room || !room.isActive) return null;
    // Existence oracle avoided: non-admitted callers get the same null
    // as unknown ids; the route renders it as the byte-identical 404.
    // READ rule: host or participant only — an invite alone grants JOIN,
    // not visibility.
    if (room.isPrivate && !AudioRoomService.canView(room, viewerId)) return null;
    return AudioRoomService.stripForViewer(room, viewerId);
  }

  public static listActiveRooms(
    filter?: { topic?: string; tag?: string },
    viewerId?: string,
  ): Array<AudioRoom | AudioRoomPublicView> {
    const allRooms = Array.from(AudioRoomService.rooms.values()).filter((r) => r.isActive);
    return allRooms
      .filter((room) => {
        // QC-F-199 (C2): private rooms drop for non-viewers (host or
        // participant only — an invite alone is a JOIN ticket, not a
        // read ticket). Topic/tag filters apply after the gate.
        if (room.isPrivate && !AudioRoomService.canView(room, viewerId)) {
          return false;
        }
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
      })
      .map((room) => AudioRoomService.stripForViewer(room, viewerId));
  }

  // QC-F-107 — role self-assignment fix.
  // A joiner NEVER supplies their own role: previously the caller-passed
  // `role` was stored verbatim on the new participant row, and the
  // promote/mute/demote gates (plus host succession) trust that stored
  // role — so any logged-in user could join with { role: 'co_host' } and
  // mute the real host or promote anyone. The parameter is removed
  // entirely (root cause, not a route-side ignore a future caller could
  // bypass): every NEW participant joins as 'listener'. Role changes
  // happen only through the host/co-host-authorised promote path (or
  // host succession on leave). Re-joining an existing participant keeps
  // their current role untouched (see branch below).
  public static joinAudioRoom(
    roomId: string,
    user: { userId: string; username: string; displayName: string; avatarUrl?: string },
  ): { room: AudioRoom; participant: AudioRoomParticipant } {
    const room = AudioRoomService.rooms.get(roomId);
    if (!room || !room.isActive) {
      throw new Error('Audio room not found or inactive');
    }

    // QC-F-199 (C4): private rooms admit only host / participant / invited.
    // Same existing error string — the route already maps it to 404, so a
    // stranger learns nothing a non-existent id would not teach.
    if (room.isPrivate && !AudioRoomService.isAdmitted(room, user.userId)) {
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
        role: 'listener',
        isMuted: true,
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
      // QC-F-199 (C6): a non-participant probe must not receive the room
      // (it used to leak the full object incl. roster). Fail closed.
      return { room: null };
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

  // QC-F-199 — invite model (host-only). Invites ride the room: they are
  // not consumed on join (leave->rejoin keeps working), and revocation
  // stops not-yet-joined users only (no kick for joined participants —
  // pinned limit). 403 pattern mirrors promote/mute/demote.
  public static inviteToRoom(
    roomId: string,
    actorId: string,
    targetUserId: string,
  ): AudioRoom {
    const room = AudioRoomService.rooms.get(roomId);
    if (!room || !room.isActive) {
      const err = new Error('Audio room not found or inactive');
      (err as any).statusCode = 404;
      throw err;
    }
    if (!targetUserId) {
      throw new Error('targetUserId is required');
    }
    if (actorId !== room.hostId) {
      const err = new Error('Unauthorized: only the host can invite users to a private room');
      (err as any).statusCode = 403;
      throw err;
    }
    if (room.participants.some((p) => p.userId === targetUserId)) {
      return room; // already a participant — idempotent no-op
    }
    if (!room.invitedUserIds.includes(targetUserId)) {
      room.invitedUserIds.push(targetUserId);
    }
    return room;
  }

  public static revokeInvite(
    roomId: string,
    actorId: string,
    targetUserId: string,
  ): AudioRoom {
    const room = AudioRoomService.rooms.get(roomId);
    if (!room || !room.isActive) {
      const err = new Error('Audio room not found or inactive');
      (err as any).statusCode = 404;
      throw err;
    }
    if (actorId !== room.hostId) {
      const err = new Error('Unauthorized: only the host can revoke invites');
      (err as any).statusCode = 403;
      throw err;
    }
    room.invitedUserIds = room.invitedUserIds.filter((id) => id !== targetUserId);
    return room;
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
