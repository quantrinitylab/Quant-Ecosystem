import { PrismaClient, CommunityRole } from '@prisma/client';
import { createAppError } from '@quant/server-core';

export interface CreateCommunityInput {
  name: string;
  slug: string;
  description?: string;
  isPrivate?: boolean;
}

/** Role hierarchy rank — higher rank can manage lower-ranked members. */
const ROLE_RANK: Record<CommunityRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  MODERATOR: 1,
  MEMBER: 0,
};

export class CommunityService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createCommunity(userId: string, input: CreateCommunityInput) {
    const existing = await this.prisma.community.findUnique({
      where: { slug: input.slug },
    });

    if (existing) {
      throw new Error('Community slug already exists');
    }

    const community = await this.prisma.community.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description,
        isPrivate: input.isPrivate ?? false,
        memberCount: 1,
      },
    });

    await this.prisma.communityMember.create({
      data: {
        communityId: community.id,
        userId,
        role: 'OWNER',
      },
    });

    return community;
  }

  async joinCommunity(userId: string, communityId: string) {
    const existing = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId,
        },
      },
    });

    if (existing) {
      return { success: false, message: 'Already a member' };
    }

    await this.prisma.communityMember.create({
      data: {
        communityId,
        userId,
        role: 'MEMBER',
      },
    });

    await this.prisma.community.update({
      where: { id: communityId },
      data: { memberCount: { increment: 1 } },
    });

    return { success: true };
  }

  async getCommunity(communityId: string) {
    return this.prisma.community.findUnique({
      where: { id: communityId },
      include: {
        _count: {
          select: { members: true, posts: true },
        },
      },
    });
  }

  async getTrendingCommunities(limit: number = 10) {
    return this.prisma.community.findMany({
      orderBy: {
        memberCount: 'desc',
      },
      take: limit,
    });
  }

  // --- Membership / moderator tools (role-based access) ---------------------

  /** Load a member's row or throw 404/403 — the authz lookup helper. */
  private async requireMember(communityId: string, userId: string) {
    const member = await this.prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
    });
    if (!member) {
      throw createAppError('Not a member of this community', 403, 'NOT_A_MEMBER');
    }
    return member;
  }

  /** Paginated member list (anyone can read; ordered owner/admins first). */
  async listMembers(communityId: string, options: { page?: number; pageSize?: number } = {}) {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(options.pageSize ?? 50, 100);
    const [data, total] = await Promise.all([
      this.prisma.communityMember.findMany({
        where: { communityId },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { joinedAt: 'asc' },
      }),
      this.prisma.communityMember.count({ where: { communityId } }),
    ]);
    return { data, total, page, pageSize };
  }

  /**
   * Leave a community. The OWNER cannot leave without transferring ownership
   * first (prevents an orphaned community).
   */
  async leaveCommunity(userId: string, communityId: string) {
    const member = await this.requireMember(communityId, userId);
    if (member.role === 'OWNER') {
      throw createAppError(
        'The owner must transfer ownership before leaving',
        409,
        'OWNER_CANNOT_LEAVE',
      );
    }
    await this.prisma.communityMember.delete({
      where: { communityId_userId: { communityId, userId } },
    });
    await this.prisma.community.update({
      where: { id: communityId },
      data: { memberCount: { decrement: 1 } },
    });
    return { success: true };
  }

  /**
   * Change a member's role. Only ADMIN+ may manage roles, only over
   * lower-ranked members, and only to a role strictly below the actor's own
   * (so e.g. an ADMIN cannot mint another ADMIN; only the OWNER can). The
   * OWNER's role cannot be changed here, and OWNER cannot be granted (use a
   * dedicated transfer flow).
   */
  async setMemberRole(
    actorId: string,
    communityId: string,
    targetUserId: string,
    newRole: CommunityRole,
  ) {
    if (newRole === 'OWNER') {
      throw createAppError('Use ownership transfer to assign OWNER', 400, 'INVALID_ROLE');
    }
    const actor = await this.requireMember(communityId, actorId);
    if (ROLE_RANK[actor.role] < ROLE_RANK.ADMIN) {
      throw createAppError('Only admins or the owner can manage roles', 403, 'FORBIDDEN');
    }
    const target = await this.requireMember(communityId, targetUserId);
    if (target.role === 'OWNER') {
      throw createAppError("Cannot change the owner's role", 403, 'FORBIDDEN');
    }
    if (ROLE_RANK[actor.role] <= ROLE_RANK[target.role]) {
      throw createAppError('Cannot manage a member of equal or higher rank', 403, 'FORBIDDEN');
    }
    if (ROLE_RANK[actor.role] <= ROLE_RANK[newRole]) {
      throw createAppError('Cannot grant a role at or above your own', 403, 'FORBIDDEN');
    }
    return this.prisma.communityMember.update({
      where: { communityId_userId: { communityId, userId: targetUserId } },
      data: { role: newRole },
    });
  }

  /**
   * Remove (kick) a member. MODERATOR+ may remove a strictly lower-ranked
   * member; the OWNER can never be removed.
   */
  async removeMember(actorId: string, communityId: string, targetUserId: string) {
    const actor = await this.requireMember(communityId, actorId);
    if (ROLE_RANK[actor.role] < ROLE_RANK.MODERATOR) {
      throw createAppError(
        'Only moderators, admins or the owner can remove members',
        403,
        'FORBIDDEN',
      );
    }
    const target = await this.requireMember(communityId, targetUserId);
    if (target.role === 'OWNER') {
      throw createAppError('The owner cannot be removed', 403, 'FORBIDDEN');
    }
    if (ROLE_RANK[actor.role] <= ROLE_RANK[target.role]) {
      throw createAppError('Cannot remove a member of equal or higher rank', 403, 'FORBIDDEN');
    }
    await this.prisma.communityMember.delete({
      where: { communityId_userId: { communityId, userId: targetUserId } },
    });
    await this.prisma.community.update({
      where: { id: communityId },
      data: { memberCount: { decrement: 1 } },
    });
    return { success: true };
  }
}
