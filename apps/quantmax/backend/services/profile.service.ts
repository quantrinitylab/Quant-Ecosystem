import type { PrismaClient } from '../types';
import { createAppError } from '@quant/server-core';

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

    return this.prisma.datingProfile.create({
      data: {
        userId: input.userId,
        displayName: input.displayName,
        bio: input.bio ?? null,
        age: input.age,
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
