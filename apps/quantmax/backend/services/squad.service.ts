// ============================================================================
// QuantMax - Squad groups + group video rooms
// ============================================================================
//
// A squad is a persistent, durable group of users (party games / group video).
// Group video rooms reuse the same own-token-only LiveKit issuance as random
// video chat (#453): each member gets ONLY their own token, env-gated, and the
// service FAILS CLOSED (no token) when LiveKit is not configured — never a fake
// token. Membership + room-name resolution are fully sandbox-verifiable; the
// live LiveKit connection is needs-staging.

import { createAppError } from '@quant/server-core';
import { createLiveKitTokenIssuer, type VideoChatTokenIssuer } from './video-chat.service';

const ADMIN_ROLES = new Set(['OWNER', 'ADMIN']);
const MAX_NAME = 120;

interface SquadRow {
  id: string;
  name: string;
  ownerId: string;
}
interface SquadMemberRow {
  id: string;
  squadId: string;
  userId: string;
  role: string;
  leftAt: Date | string | null;
}

export interface SquadPrisma {
  squad: {
    create(args: { data: Record<string, unknown> }): Promise<SquadRow>;
    findUnique(args: { where: { id: string } }): Promise<SquadRow | null>;
  };
  squadMember: {
    create(args: { data: Record<string, unknown> }): Promise<SquadMemberRow>;
    findFirst(args: { where: Record<string, unknown> }): Promise<SquadMemberRow | null>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
}

export interface SquadView {
  id: string;
  name: string;
  ownerId: string;
  memberCount: number;
}

export interface RoomToken {
  roomName: string;
  /** The CALLER's own LiveKit token (never another member's). Undefined when
   * LiveKit is unconfigured (fail-closed — media cannot start, no fake token). */
  token?: string;
}

export interface SquadServiceOptions {
  tokenIssuer?: VideoChatTokenIssuer | undefined;
}

export class SquadService {
  private readonly tokenIssuer: VideoChatTokenIssuer | undefined;

  constructor(
    private readonly prisma: SquadPrisma,
    options: SquadServiceOptions = {},
  ) {
    this.tokenIssuer =
      options.tokenIssuer !== undefined ? options.tokenIssuer : createLiveKitTokenIssuer();
  }

  async createSquad(ownerId: string, input: { name: string }): Promise<SquadView> {
    if (!ownerId) throw createAppError('ownerId is required', 400, 'OWNER_ID_REQUIRED');
    const name = input.name?.trim();
    if (!name || name.length > MAX_NAME) {
      throw createAppError('A valid squad name is required', 400, 'INVALID_SQUAD_NAME');
    }
    const squad = await this.prisma.squad.create({ data: { name, ownerId } });
    await this.prisma.squadMember.create({
      data: { squadId: squad.id, userId: ownerId, role: 'OWNER', joinedAt: new Date() },
    });
    return { id: squad.id, name: squad.name, ownerId: squad.ownerId, memberCount: 1 };
  }

  private async requireSquad(squadId: string): Promise<SquadRow> {
    const squad = await this.prisma.squad.findUnique({ where: { id: squadId } });
    if (!squad) throw createAppError('Squad not found', 404, 'SQUAD_NOT_FOUND');
    return squad;
  }

  private activeMember(squadId: string, userId: string): Promise<SquadMemberRow | null> {
    return this.prisma.squadMember.findFirst({
      where: { squadId, userId, leftAt: null },
    });
  }

  /** Join a squad (idempotent) as a MEMBER. */
  async join(squadId: string, userId: string): Promise<{ joined: true }> {
    await this.requireSquad(squadId);
    const existing = await this.activeMember(squadId, userId);
    if (existing) return { joined: true };
    await this.prisma.squadMember.create({
      data: { squadId, userId, role: 'MEMBER', joinedAt: new Date() },
    });
    return { joined: true };
  }

  /** Leave a squad (idempotent). */
  async leave(squadId: string, userId: string): Promise<{ left: boolean }> {
    await this.requireSquad(squadId);
    const res = await this.prisma.squadMember.updateMany({
      where: { squadId, userId, leftAt: null },
      data: { leftAt: new Date() },
    });
    return { left: res.count > 0 };
  }

  async memberCount(squadId: string): Promise<number> {
    return this.prisma.squadMember.count({ where: { squadId, leftAt: null } });
  }

  /** True iff the user is an OWNER/ADMIN of the squad. */
  async isAdmin(squadId: string, userId: string): Promise<boolean> {
    const member = await this.activeMember(squadId, userId);
    return member != null && ADMIN_ROLES.has(member.role);
  }

  /**
   * Issue a group-room join token for a squad member. Only active members may
   * get a room token, and each receives ONLY their own (own-token-only). Fails
   * closed (no token) when LiveKit is unconfigured.
   */
  async createRoomToken(squadId: string, userId: string): Promise<RoomToken> {
    await this.requireSquad(squadId);
    const member = await this.activeMember(squadId, userId);
    if (!member) {
      throw createAppError('Not a member of this squad', 403, 'NOT_A_MEMBER');
    }
    const roomName = `max-squad:${squadId}`;
    const token = this.tokenIssuer ? await this.tokenIssuer.issue(roomName, userId) : undefined;
    return { roomName, ...(token ? { token } : {}) };
  }
}
