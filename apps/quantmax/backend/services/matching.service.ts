import type { PrismaClient } from '../types';
import { createAppError } from '@quant/server-core';
import crypto from 'node:crypto';

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

  /**
   * Generate a deterministic embedding vector from a dating profile's attributes.
   * Uses interests, age, and preferences to create a normalized 256-dimension vector.
   */
  generateEmbedding(profile: {
    interests: string[];
    age: number;
    gender: string | null;
    genderPreference: unknown;
  }): number[] {
    const VECTOR_DIM = 256;
    const vector = new Array<number>(VECTOR_DIM).fill(0);

    // Hash each interest to deterministic positions in the vector
    for (const interest of profile.interests) {
      const hash = crypto.createHash('sha256').update(interest).digest();
      for (let i = 0; i < 8; i++) {
        const pos = hash[i * 4]! % VECTOR_DIM;
        const weight = (hash[i * 4 + 1]! + 1) / 256; // value between ~0.004 and 1
        vector[pos] = (vector[pos] ?? 0) + weight;
      }
    }

    // Encode age as a normalized value spread across dimensions
    const normalizedAge = (profile.age - 18) / 62; // normalize 18-80 to 0-1
    for (let i = 0; i < 16; i++) {
      const pos = (i * 16) % VECTOR_DIM;
      vector[pos] = (vector[pos] ?? 0) + normalizedAge * 0.5;
    }

    // Encode gender as a hash-based vector component
    if (profile.gender) {
      const genderHash = crypto.createHash('sha256').update(profile.gender).digest();
      for (let i = 0; i < 4; i++) {
        const pos = genderHash[i]! % VECTOR_DIM;
        vector[pos] = (vector[pos] ?? 0) + 0.3;
      }
    }

    // Normalize to unit length (divide by magnitude)
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < VECTOR_DIM; i++) {
        vector[i] = vector[i]! / magnitude;
      }
    }

    return vector;
  }

  /**
   * Find matches using pgvector cosine similarity.
   * Uses $queryRaw for vector similarity search.
   */
  async findMatches(
    userId: string,
    limit: number = 10,
  ): Promise<Array<{ userId: string; similarity: number }>> {
    const userProfile = await this.prisma.datingProfile.findUnique({ where: { userId } });
    if (!userProfile) {
      throw createAppError('Profile not found', 404, 'PROFILE_NOT_FOUND');
    }

    const interests = (userProfile.interests as string[]) ?? [];
    const embedding = this.generateEmbedding({
      interests,
      age: userProfile.age,
      gender: userProfile.gender,
      genderPreference: userProfile.genderPreference,
    });

    // Use raw SQL with pgvector cosine similarity operator
    // Embedding values are self-generated numbers, safe for interpolation.
    // We use $queryRawUnsafe because Prisma's tagged template parameterization
    // breaks the ::vector cast when the vector literal is passed as a parameter.
    const vectorStr = `[${embedding.join(',')}]`;

    const results = await this.prisma.$queryRawUnsafe<
      Array<{ user_id: string; similarity: number }>
    >(
      `SELECT dp.user_id, 1 - (dp.embedding <=> $1::vector) as similarity
       FROM dating_profiles dp
       WHERE dp.user_id != $2
         AND dp.is_active = true
         AND dp.embedding IS NOT NULL
       ORDER BY dp.embedding <=> $1::vector
       LIMIT $3`,
      vectorStr,
      userId,
      limit,
    );

    return results.map((r: { user_id: string; similarity: number }) => ({
      userId: r.user_id,
      similarity: r.similarity,
    }));
  }
}
