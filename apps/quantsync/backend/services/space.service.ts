import { PrismaClient, SpaceRole, SpaceStatus } from '@prisma/client';
import { createAppError } from '@quant/server-core';

/**
 * QuantWave audio Spaces.
 *
 * Backs `backend/routes/spaces.ts`. Every `/spaces/*` proxy under `src/app/api` forwarded to
 * a backend module that did not exist, so `src/app/spaces/page.tsx` and `src/hooks/useSpaces.ts`
 * were entirely non-functional.
 *
 * State lives in Postgres (`Space` / `SpaceParticipant`, migration 0069) rather than in
 * process memory so a Space survives a restart and can be served by more than one instance.
 *
 * Role model:
 * - `HOST`     — one per Space, the creator. Only the host can manage speakers, recording,
 *                or end the Space.
 * - `SPEAKER`  — may unmute themselves.
 * - `LISTENER` — cannot unmute; may raise a hand to request promotion.
 */

const PARTICIPANT_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

export interface CreateSpaceInput {
  title: string;
  description?: string;
  topics?: string[];
  scheduledAt?: Date;
}

/** Shape consumed by `useSpaces`: speakers, listeners and the hand-raise queue. */
export interface SpaceStateView {
  id: string;
  title: string;
  description: string;
  status: SpaceStatus;
  isRecording: boolean;
  hostId: string;
  speakers: Array<{
    id: string;
    name: string;
    avatar: string;
    isSpeaking: boolean;
    isMuted: boolean;
    isHost: boolean;
  }>;
  listeners: Array<{ id: string; name: string; avatar: string }>;
  handRaiseQueue: Array<{ id: string; name: string; avatar: string; raisedAt: string }>;
  listenerCount: number;
  isHost: boolean;
  isSpeaker: boolean;
  isMicOn: boolean;
  hasRaisedHand: boolean;
}

export class SpaceService {
  constructor(private readonly prisma: PrismaClient) {}

  // --- helpers -------------------------------------------------------------

  private async requireSpace(spaceId: string) {
    const space = await this.prisma.space.findUnique({ where: { id: spaceId } });
    if (!space) {
      throw createAppError('Space not found', 404, 'SPACE_NOT_FOUND');
    }
    return space;
  }

  /** Load a live Space, refusing mutations against one that has already ended. */
  private async requireLiveSpace(spaceId: string) {
    const space = await this.requireSpace(spaceId);
    if (space.status === 'ENDED') {
      throw createAppError('This Space has ended', 409, 'SPACE_ENDED');
    }
    return space;
  }

  /** Assert the actor hosts this Space; used by every moderation action. */
  private async requireHost(spaceId: string, userId: string) {
    const space = await this.requireLiveSpace(spaceId);
    if (space.hostId !== userId) {
      throw createAppError('Only the host can perform this action', 403, 'NOT_SPACE_HOST');
    }
    return space;
  }

  /** Load an active (not-left) participant row or 403. */
  private async requireActiveParticipant(spaceId: string, userId: string) {
    const participant = await this.prisma.spaceParticipant.findUnique({
      where: { spaceId_userId: { spaceId, userId } },
    });
    if (!participant || participant.leftAt) {
      throw createAppError('You are not in this Space', 403, 'NOT_IN_SPACE');
    }
    return participant;
  }

  // --- lifecycle -----------------------------------------------------------

  /** Create a Space. The creator is persisted as the HOST participant, unmuted. */
  async createSpace(userId: string, input: CreateSpaceInput) {
    const title = input.title.trim();
    if (!title) {
      throw createAppError('Space title is required', 400, 'INVALID_TITLE');
    }

    // Scheduling in the future leaves the Space SCHEDULED; otherwise it goes live now.
    const scheduled = input.scheduledAt && input.scheduledAt.getTime() > Date.now();

    return this.prisma.space.create({
      data: {
        hostId: userId,
        title,
        description: input.description?.trim() || null,
        topics: input.topics ?? [],
        status: scheduled ? 'SCHEDULED' : 'LIVE',
        scheduledAt: input.scheduledAt ?? null,
        startedAt: scheduled ? null : new Date(),
        participants: {
          create: { userId, role: 'HOST', isMuted: false },
        },
      },
    });
  }

  /** List live Spaces, busiest first. */
  async listLiveSpaces(options: { page?: number; pageSize?: number } = {}) {
    return this.listSpaces({ ...options, status: 'LIVE' });
  }

  async listSpaces(
    options: { page?: number; pageSize?: number; status?: SpaceStatus } = {},
  ): Promise<{
    data: Array<Record<string, unknown>>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(Math.max(1, options.pageSize ?? 20), 50);
    // Default to everything still joinable rather than including dead rooms.
    const where = { status: options.status ?? { in: ['LIVE', 'SCHEDULED'] as SpaceStatus[] } };

    const [rows, total] = await Promise.all([
      this.prisma.space.findMany({
        where,
        include: {
          host: { select: PARTICIPANT_USER_SELECT },
          _count: { select: { participants: true } },
        },
        orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.space.count({ where }),
    ]);

    // `_count.participants` counts historical rows too; report only those still present.
    const activeCounts = await Promise.all(
      rows.map((s) =>
        this.prisma.spaceParticipant.count({ where: { spaceId: s.id, leftAt: null } }),
      ),
    );

    return {
      data: rows.map((s, i) => ({ ...s, activeParticipants: activeCounts[i] ?? 0 })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Full Space state, projected for the requesting user.
   *
   * `viewerId` drives the `isHost` / `isSpeaker` / `isMicOn` / `hasRaisedHand` flags so the
   * client does not have to derive its own permissions.
   */
  async getSpaceState(spaceId: string, viewerId: string): Promise<SpaceStateView> {
    const space = await this.requireSpace(spaceId);
    const participants = await this.prisma.spaceParticipant.findMany({
      where: { spaceId, leftAt: null },
      include: { user: { select: PARTICIPANT_USER_SELECT } },
      orderBy: { joinedAt: 'asc' },
    });

    const name = (p: (typeof participants)[number]) =>
      p.user?.displayName || p.user?.username || p.userId;
    const avatar = (p: (typeof participants)[number]) => p.user?.avatarUrl ?? '';

    const speakers = participants
      .filter((p) => p.role === 'HOST' || p.role === 'SPEAKER')
      .map((p) => ({
        id: p.userId,
        name: name(p),
        avatar: avatar(p),
        // Live audio level is carried on the realtime channel, not the database.
        isSpeaking: false,
        isMuted: p.isMuted,
        isHost: p.role === 'HOST',
      }));

    const listeners = participants
      .filter((p) => p.role === 'LISTENER')
      .map((p) => ({ id: p.userId, name: name(p), avatar: avatar(p) }));

    const handRaiseQueue = participants
      .filter((p) => p.handRaisedAt !== null)
      .sort((a, b) => (a.handRaisedAt!.getTime() ?? 0) - (b.handRaisedAt!.getTime() ?? 0))
      .map((p) => ({
        id: p.userId,
        name: name(p),
        avatar: avatar(p),
        raisedAt: p.handRaisedAt!.toISOString(),
      }));

    const me = participants.find((p) => p.userId === viewerId);

    return {
      id: space.id,
      title: space.title,
      description: space.description ?? '',
      status: space.status,
      isRecording: space.isRecording,
      hostId: space.hostId,
      speakers,
      listeners,
      handRaiseQueue,
      listenerCount: listeners.length,
      isHost: space.hostId === viewerId,
      isSpeaker: me?.role === 'SPEAKER' || me?.role === 'HOST',
      isMicOn: me ? !me.isMuted : false,
      hasRaisedHand: Boolean(me?.handRaisedAt),
    };
  }

  // --- membership ----------------------------------------------------------

  /**
   * Join as a listener.
   *
   * Idempotent: an existing row is reactivated (clearing `leftAt`) rather than duplicated,
   * which the `@@unique([spaceId, userId])` constraint also enforces. A returning host keeps
   * HOST; anyone else rejoins as a muted LISTENER.
   */
  async joinSpace(spaceId: string, userId: string) {
    const space = await this.requireLiveSpace(spaceId);
    const isHost = space.hostId === userId;

    await this.prisma.spaceParticipant.upsert({
      where: { spaceId_userId: { spaceId, userId } },
      create: {
        spaceId,
        userId,
        role: isHost ? 'HOST' : 'LISTENER',
        isMuted: !isHost,
      },
      update: {
        leftAt: null,
        joinedAt: new Date(),
        // Re-joining never silently restores speaker rights; the host re-invites.
        role: isHost ? 'HOST' : 'LISTENER',
        isMuted: !isHost,
        handRaisedAt: null,
      },
    });

    return this.getSpaceState(spaceId, userId);
  }

  /**
   * Leave a Space. When the host leaves, the Space ends — an audio room with no host has no
   * one who can moderate it.
   */
  async leaveSpace(spaceId: string, userId: string) {
    const space = await this.requireSpace(spaceId);
    await this.prisma.spaceParticipant.updateMany({
      where: { spaceId, userId, leftAt: null },
      data: { leftAt: new Date(), handRaisedAt: null, isMuted: true },
    });

    if (space.hostId === userId && space.status !== 'ENDED') {
      await this.prisma.space.update({
        where: { id: spaceId },
        data: { status: 'ENDED', endedAt: new Date(), isRecording: false },
      });
      return { left: true, spaceEnded: true };
    }

    return { left: true, spaceEnded: false };
  }

  // --- audio + hand queue --------------------------------------------------

  /** Toggle your own mic. Listeners have no mic to toggle. */
  async toggleMic(spaceId: string, userId: string, muted?: boolean) {
    await this.requireLiveSpace(spaceId);
    const me = await this.requireActiveParticipant(spaceId, userId);

    if (me.role === 'LISTENER') {
      throw createAppError(
        'Listeners cannot unmute; raise your hand to request to speak',
        403,
        'NOT_A_SPEAKER',
      );
    }

    const next = muted ?? !me.isMuted;
    await this.prisma.spaceParticipant.update({
      where: { spaceId_userId: { spaceId, userId } },
      data: { isMuted: next },
    });
    return { isMuted: next, isMicOn: !next };
  }

  /** Raise a hand to request promotion. Speakers already have the floor. */
  async raiseHand(spaceId: string, userId: string) {
    await this.requireLiveSpace(spaceId);
    const me = await this.requireActiveParticipant(spaceId, userId);
    if (me.role !== 'LISTENER') {
      throw createAppError('You already have speaking rights', 409, 'ALREADY_SPEAKER');
    }
    // Preserve the original position if the hand is already up.
    if (me.handRaisedAt) return { hasRaisedHand: true, raisedAt: me.handRaisedAt.toISOString() };

    const raisedAt = new Date();
    await this.prisma.spaceParticipant.update({
      where: { spaceId_userId: { spaceId, userId } },
      data: { handRaisedAt: raisedAt },
    });
    return { hasRaisedHand: true, raisedAt: raisedAt.toISOString() };
  }

  async lowerHand(spaceId: string, userId: string) {
    await this.requireLiveSpace(spaceId);
    await this.requireActiveParticipant(spaceId, userId);
    await this.prisma.spaceParticipant.update({
      where: { spaceId_userId: { spaceId, userId } },
      data: { handRaisedAt: null },
    });
    return { hasRaisedHand: false };
  }

  // --- host moderation -----------------------------------------------------

  /** Promote a listener to speaker (host only). Clears their raised hand. */
  async inviteSpeaker(spaceId: string, hostId: string, targetUserId: string) {
    await this.requireHost(spaceId, hostId);
    const target = await this.requireActiveParticipant(spaceId, targetUserId);
    if (target.role === 'HOST') {
      throw createAppError('The host already has the floor', 409, 'ALREADY_SPEAKER');
    }

    await this.prisma.spaceParticipant.update({
      where: { spaceId_userId: { spaceId, userId: targetUserId } },
      data: { role: 'SPEAKER', handRaisedAt: null, isMuted: true },
    });
    return { userId: targetUserId, role: 'SPEAKER' as SpaceRole };
  }

  /** Demote a speaker back to listener (host only). The host cannot be demoted. */
  async removeSpeaker(spaceId: string, hostId: string, targetUserId: string) {
    const space = await this.requireHost(spaceId, hostId);
    if (space.hostId === targetUserId) {
      throw createAppError('The host cannot be removed as a speaker', 403, 'CANNOT_DEMOTE_HOST');
    }
    await this.requireActiveParticipant(spaceId, targetUserId);

    await this.prisma.spaceParticipant.update({
      where: { spaceId_userId: { spaceId, userId: targetUserId } },
      data: { role: 'LISTENER', isMuted: true, handRaisedAt: null },
    });
    return { userId: targetUserId, role: 'LISTENER' as SpaceRole };
  }

  /** Force-mute a participant (host only). */
  async muteSpeaker(spaceId: string, hostId: string, targetUserId: string) {
    await this.requireHost(spaceId, hostId);
    await this.requireActiveParticipant(spaceId, targetUserId);
    await this.prisma.spaceParticipant.update({
      where: { spaceId_userId: { spaceId, userId: targetUserId } },
      data: { isMuted: true },
    });
    return { userId: targetUserId, isMuted: true };
  }

  /** End the Space (host only) and mark everyone as departed. */
  async endSpace(spaceId: string, hostId: string) {
    await this.requireHost(spaceId, hostId);
    const endedAt = new Date();
    const [space] = await this.prisma.$transaction([
      this.prisma.space.update({
        where: { id: spaceId },
        data: { status: 'ENDED', endedAt, isRecording: false },
      }),
      this.prisma.spaceParticipant.updateMany({
        where: { spaceId, leftAt: null },
        data: { leftAt: endedAt, handRaisedAt: null, isMuted: true },
      }),
    ]);
    return space;
  }

  /** Start/stop recording (host only). */
  async setRecording(spaceId: string, hostId: string, isRecording: boolean) {
    await this.requireHost(spaceId, hostId);
    const space = await this.prisma.space.update({
      where: { id: spaceId },
      data: { isRecording },
    });
    return { id: space.id, isRecording: space.isRecording };
  }
}
