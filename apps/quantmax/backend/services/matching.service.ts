import type { PrismaClient } from '../types';
import { createAppError } from '@quant/server-core';

export interface Match {
  id: string;
  user1Id: string;
  user2Id: string;
  matchedAt: Date;
  conversationId: string | null;
  isActive: boolean;
}

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

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface CompatibilityResult {
  user1Id: string;
  user2Id: string;
  score: number;
  sharedInterests: string[];
}

export class MatchingService {
  constructor(private readonly prisma: PrismaClient) {}

  async getPotentialMatches(userId: string, limit: number = 10): Promise<DatingProfile[]> {
    const userProfile = await this.prisma.datingProfile.findUnique({
      where: { userId },
    });

    if (!userProfile) {
      throw createAppError('Profile not found', 404, 'PROFILE_NOT_FOUND');
    }

    // Get all swipes by this user to exclude already-swiped profiles
    const existingSwipes = await this.prisma.swipe.findMany({
      where: { swiperId: userId },
      select: { targetId: true },
    });

    const excludeIds = [userId, ...existingSwipes.map((s: { targetId: string }) => s.targetId)];

    // Find active profiles excluding already swiped
    const profiles = await this.prisma.datingProfile.findMany({
      where: {
        userId: { notIn: excludeIds },
        isActive: true,
      },
      take: limit,
      orderBy: { profileScore: 'desc' },
    });

    return profiles;
  }

  async calculateCompatibility(user1Id: string, user2Id: string): Promise<CompatibilityResult> {
    const [profile1, profile2] = await Promise.all([
      this.prisma.datingProfile.findUnique({ where: { userId: user1Id } }),
      this.prisma.datingProfile.findUnique({ where: { userId: user2Id } }),
    ]);

    if (!profile1 || !profile2) {
      throw createAppError('One or both profiles not found', 404, 'PROFILE_NOT_FOUND');
    }

    const interests1 = (profile1.interests as string[]) ?? [];
    const interests2 = (profile2.interests as string[]) ?? [];

    // Calculate shared interests
    const sharedInterests = interests1.filter((i) => interests2.includes(i));

    // Score based on shared interests (max 50 points)
    let score = Math.min(50, sharedInterests.length * 10);

    // Score based on age proximity (max 30 points)
    const ageDiff = Math.abs(profile1.age - profile2.age);
    score += Math.max(0, 30 - ageDiff * 5);

    // Score based on both having verified status (20 points)
    if (profile1.verificationStatus === 'VERIFIED' && profile2.verificationStatus === 'VERIFIED') {
      score += 20;
    }

    return {
      user1Id,
      user2Id,
      score: Math.min(100, score),
      sharedInterests,
    };
  }

  async getMatches(userId: string): Promise<Match[]> {
    return this.prisma.match.findMany({
      where: {
        isActive: true,
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      orderBy: { matchedAt: 'desc' },
    });
  }
}
