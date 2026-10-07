import type { PrismaClient } from '../types';
import { createAppError } from '@quant/server-core';

export interface Swipe {
  id: string;
  swiperId: string;
  targetId: string;
  direction: string;
  createdAt: Date;
}

export interface Match {
  id: string;
  user1Id: string;
  user2Id: string;
  matchedAt: Date;
  conversationId: string | null;
  isActive: boolean;
}

export interface SwipeResult {
  swipe: Swipe;
  isMatch: boolean;
  match?: Match;
}

export class SwipeService {
  constructor(private readonly prisma: PrismaClient) {}

  async swipe(swiperId: string, targetId: string, direction: string): Promise<SwipeResult> {
    if (swiperId === targetId) {
      throw createAppError('Cannot swipe on yourself', 400, 'SELF_SWIPE');
    }

    // Check for existing swipe
    const existing = await this.prisma.swipe.findFirst({
      where: { swiperId, targetId },
    });

    if (existing) {
      throw createAppError('Already swiped on this user', 409, 'ALREADY_SWIPED');
    }

    const swipe = await this.prisma.swipe.create({
      data: {
        swiperId,
        targetId,
        direction,
      },
    });

    // Check for mutual match
    if (direction === 'RIGHT' || direction === 'SUPER_LIKE') {
      const matchResult = await this.checkMatch(swiperId, targetId);
      if (matchResult) {
        return { swipe, isMatch: true, match: matchResult };
      }
    }

    return { swipe, isMatch: false };
  }

  async checkMatch(swiperId: string, targetId: string): Promise<Match | null> {
    // Check if the target has already swiped RIGHT or SUPER_LIKE on the swiper
    const reciprocalSwipe = await this.prisma.swipe.findFirst({
      where: {
        swiperId: targetId,
        targetId: swiperId,
        direction: { in: ['RIGHT', 'SUPER_LIKE'] },
      },
    });

    if (!reciprocalSwipe) {
      return null;
    }

    // Check if match already exists
    const existingMatch = await this.prisma.match.findFirst({
      where: {
        OR: [
          { user1Id: swiperId, user2Id: targetId },
          { user1Id: targetId, user2Id: swiperId },
        ],
      },
    });

    if (existingMatch) {
      return existingMatch;
    }

    // Create a new match
    return this.prisma.match.create({
      data: {
        user1Id: swiperId,
        user2Id: targetId,
        matchedAt: new Date(),
        isActive: true,
      },
    });
  }

  async getSwipeHistory(userId: string): Promise<Swipe[]> {
    return this.prisma.swipe.findMany({
      where: { swiperId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
