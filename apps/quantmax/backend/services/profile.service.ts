import type { PrismaClient } from '../types';
import { createAppError } from '@quant/server-core';
import { assertMinAge } from '../lib/age-gate';

export interface DatingProfile {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  age: number;
  gender: string;
  genderPreference: unknown;
  location: unknown;
  photos: unknown;
  interests: unknown;
  verificationStatus: string;
  isActive: boolean;
  profileScore: number;
  lastActive: Date;
}

export interface CreateProfileInput {
  userId: string;
  displayName: string;
  bio?: string;
  age: number;
  gender: string;
  genderPreference?: unknown[];
  location?: Record<string, unknown>;
  photos?: unknown[];
  interests?: string[];
}

export interface UpdateProfileInput {
  displayName?: string;
  bio?: string;
  age?: number;
  gender?: string;
  genderPreference?: unknown[];
  location?: Record<string, unknown>;
  photos?: unknown[];
  interests?: string[];
}

export class ProfileService {
  constructor(private readonly prisma: PrismaClient) {}

  async createProfile(input: CreateProfileInput): Promise<DatingProfile> {
    const existing = await this.prisma.datingProfile.findUnique({
      where: { userId: input.userId },
    });

    if (existing) {
      throw createAppError('Profile already exists for this user', 409, 'PROFILE_EXISTS');
    }

    // AGE GATE (18+): dating is an adult-only surface. The authoritative age is
    // derived from the user's verified date of birth — NOT the client-supplied
    // `input.age` — so an underage user (or one with no verified DOB) cannot
    // enter the dating pool. The stored profile age is set from the DOB.
    const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) {
      throw createAppError('User not found', 404, 'USER_NOT_FOUND');
    }
    const verifiedAge = assertMinAge(user.dateOfBirth ?? null);

    return this.prisma.datingProfile.create({
      data: {
        userId: input.userId,
        displayName: input.displayName,
        bio: input.bio ?? null,
        age: verifiedAge,
        gender: input.gender,
        genderPreference: input.genderPreference ?? [],
        location: input.location ?? {},
        photos: input.photos ?? [],
        interests: input.interests ?? [],
        verificationStatus: 'UNVERIFIED',
        isActive: true,
        profileScore: 0,
        lastActive: new Date(),
      },
    });
  }

  async getProfile(userId: string): Promise<DatingProfile> {
    const profile = await this.prisma.datingProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw createAppError('Profile not found', 404, 'PROFILE_NOT_FOUND');
    }

    return profile;
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<DatingProfile> {
    const profile = await this.prisma.datingProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw createAppError('Profile not found', 404, 'PROFILE_NOT_FOUND');
    }

    return this.prisma.datingProfile.update({
      where: { userId },
      data: { ...input, lastActive: new Date() },
    });
  }

  async deactivateProfile(userId: string): Promise<DatingProfile> {
    const profile = await this.prisma.datingProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw createAppError('Profile not found', 404, 'PROFILE_NOT_FOUND');
    }

    return this.prisma.datingProfile.update({
      where: { userId },
      data: { isActive: false },
    });
  }

  async follow(
    userId: string,
    targetUserId: string,
  ): Promise<{ followerId: string; followingId: string }> {
    if (userId === targetUserId) {
      throw createAppError('Cannot follow yourself', 400, 'SELF_FOLLOW');
    }

    const existing = await this.prisma.userRelationship.findFirst({
      where: { followerId: userId, followingId: targetUserId, type: 'FOLLOW' },
    });

    if (existing) {
      throw createAppError('Already following this user', 409, 'ALREADY_FOLLOWING');
    }

    await this.prisma.userRelationship.create({
      data: { followerId: userId, followingId: targetUserId, type: 'FOLLOW' },
    });

    return { followerId: userId, followingId: targetUserId };
  }

  async unfollow(userId: string, targetUserId: string): Promise<void> {
    const existing = await this.prisma.userRelationship.findFirst({
      where: { followerId: userId, followingId: targetUserId, type: 'FOLLOW' },
    });

    if (!existing) {
      throw createAppError('Not following this user', 404, 'NOT_FOLLOWING');
    }

    await this.prisma.userRelationship.delete({
      where: { id: existing.id },
    });
  }

  async getFollowers(userId: string): Promise<{ followerId: string; followingId: string }[]> {
    const relationships = await this.prisma.userRelationship.findMany({
      where: { followingId: userId, type: 'FOLLOW' },
    });

    return relationships.map((r: { followerId: string; followingId: string }) => ({
      followerId: r.followerId,
      followingId: r.followingId,
    }));
  }

  async getFollowing(userId: string): Promise<{ followerId: string; followingId: string }[]> {
    const relationships = await this.prisma.userRelationship.findMany({
      where: { followerId: userId, type: 'FOLLOW' },
    });

    return relationships.map((r: { followerId: string; followingId: string }) => ({
      followerId: r.followerId,
      followingId: r.followingId,
    }));
  }

  async calculateProfileScore(userId: string): Promise<number> {
    const profile = await this.prisma.datingProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw createAppError('Profile not found', 404, 'PROFILE_NOT_FOUND');
    }

    let score = 0;

    // Score based on profile completeness
    if (profile.bio) score += 20;
    if (profile.displayName) score += 10;

    const photos = profile.photos as unknown[];
    if (photos && photos.length > 0) score += 20;
    if (photos && photos.length >= 3) score += 10;

    const interests = profile.interests as string[];
    if (interests && interests.length > 0) score += 20;
    if (interests && interests.length >= 5) score += 10;

    if (profile.verificationStatus === 'VERIFIED') score += 10;

    // Update the stored score
    await this.prisma.datingProfile.update({
      where: { userId },
      data: { profileScore: score },
    });

    return score;
  }
}
