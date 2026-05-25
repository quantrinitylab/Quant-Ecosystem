import type { PrismaClient } from '../types';
import { createAppError } from '@quant/server-core';

export interface Community {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  category: string | null;
  rules: unknown;
  memberCount: number;
  isPrivate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommunityMember {
  id: string;
  communityId: string;
  userId: string;
  role: string;
  joinedAt: Date;
}

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface CreateCommunityInput {
  name: string;
  slug: string;
  description?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  category?: string;
  rules?: unknown[];
  isPrivate?: boolean;
}

export interface UpdateCommunityInput {
  name?: string;
  description?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  category?: string;
  rules?: unknown[];
  isPrivate?: boolean;
}

export class CommunityService {
  constructor(private readonly prisma: PrismaClient) {}

  async createCommunity(userId: string, input: CreateCommunityInput): Promise<Community> {
    const existing = await this.prisma.community.findUnique({
      where: { slug: input.slug },
    });

    if (existing) {
      throw createAppError('Community slug already exists', 409, 'SLUG_EXISTS');
    }

    const community = await this.prisma.community.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        avatarUrl: input.avatarUrl ?? null,
        bannerUrl: input.bannerUrl ?? null,
        category: input.category ?? null,
        rules: input.rules ?? [],
        memberCount: 1,
        isPrivate: input.isPrivate ?? false,
      },
    });

    // Add creator as OWNER
    await this.prisma.communityMember.create({
      data: {
        communityId: community.id,
        userId,
        role: 'OWNER',
      },
    });

    return community;
  }

  async getCommunity(communityId: string): Promise<Community> {
    const community = await this.prisma.community.findUnique({
      where: { id: communityId },
    });

    if (!community) {
      throw createAppError('Community not found', 404, 'COMMUNITY_NOT_FOUND');
    }

    return community;
  }

  async joinCommunity(communityId: string, userId: string): Promise<CommunityMember> {
    const community = await this.prisma.community.findUnique({
      where: { id: communityId },
    });

    if (!community) {
      throw createAppError('Community not found', 404, 'COMMUNITY_NOT_FOUND');
    }

    const existing = await this.prisma.communityMember.findFirst({
      where: { communityId, userId },
    });

    if (existing) {
      throw createAppError('Already a member of this community', 409, 'ALREADY_MEMBER');
    }

    const member = await this.prisma.communityMember.create({
      data: {
        communityId,
        userId,
        role: 'MEMBER',
      },
    });

    await this.prisma.community.update({
      where: { id: communityId },
      data: { memberCount: community.memberCount + 1 },
    });

    return member;
  }

  async leaveCommunity(communityId: string, userId: string): Promise<void> {
    const member = await this.prisma.communityMember.findFirst({
      where: { communityId, userId },
    });

    if (!member) {
      throw createAppError('Not a member of this community', 404, 'NOT_A_MEMBER');
    }

    if (member.role === 'OWNER') {
      throw createAppError('Owner cannot leave the community', 403, 'OWNER_CANNOT_LEAVE');
    }

    await this.prisma.communityMember.delete({
      where: { id: member.id },
    });

    const community = await this.prisma.community.findUnique({
      where: { id: communityId },
    });

    if (community) {
      await this.prisma.community.update({
        where: { id: communityId },
        data: { memberCount: community.memberCount - 1 },
      });
    }
  }

  async listMembers(
    communityId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<CommunityMember>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.communityMember.findMany({
        where: { communityId },
        skip,
        take: pageSize,
        orderBy: { joinedAt: 'desc' },
      }),
      this.prisma.communityMember.count({ where: { communityId } }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async updateSettings(
    communityId: string,
    userId: string,
    input: UpdateCommunityInput,
  ): Promise<Community> {
    const member = await this.prisma.communityMember.findFirst({
      where: { communityId, userId },
    });

    if (!member || (member.role !== 'OWNER' && member.role !== 'ADMIN')) {
      throw createAppError(
        'Only owners and admins can update community settings',
        403,
        'INSUFFICIENT_ROLE',
      );
    }

    return this.prisma.community.update({
      where: { id: communityId },
      data: { ...input, updatedAt: new Date() },
    });
  }

  async listCommunities(options: PaginationOptions = {}): Promise<PaginatedResult<Community>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.community.findMany({
        where: { isPrivate: false },
        skip,
        take: pageSize,
        orderBy: { memberCount: 'desc' },
      }),
      this.prisma.community.count({ where: { isPrivate: false } }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }
}
