import { PrismaClient } from '@prisma/client';

export class MatchingService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async findMatches(userId: string, limit: number = 10) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { datingProfile: true },
    });

    if (!user?.datingProfile) {
      return [];
    }

    // Exclude the user themselves AND everyone they have already swiped on, so
    // the deck never re-shows a profile that was already acted on (Tinder rule).
    const swiped = await this.prisma.swipe.findMany({
      where: { swiperId: userId },
      select: { targetId: true },
    });
    const excludeIds = [userId, ...swiped.map((s: { targetId: string }) => s.targetId)];

    const matches = await this.prisma.user.findMany({
      where: {
        id: { notIn: excludeIds },
        datingProfile: {
          isNot: null,
        },
      },
      include: {
        datingProfile: true,
      },
      take: limit,
    });

    return matches;
  }

  async recordSwipe(
    swiperId: string,
    targetId: string,
    direction: 'LEFT' | 'RIGHT' | 'SUPER_LIKE',
  ) {
    // Idempotent on the unique (swiperId, targetId): re-swiping updates the
    // direction instead of throwing on the unique constraint.
    await this.prisma.swipe.upsert({
      where: { swiperId_targetId: { swiperId, targetId } },
      create: { swiperId, targetId, direction },
      update: { direction },
    });

    // Check for mutual interest
    if (direction === 'RIGHT' || direction === 'SUPER_LIKE') {
      const mutual = await this.prisma.swipe.findFirst({
        where: {
          swiperId: targetId,
          targetId: swiperId,
          direction: { in: ['RIGHT', 'SUPER_LIKE'] },
        },
      });

      if (mutual) {
        // Create the match with deterministic ordering; upsert so a concurrent
        // mutual super-like (or a re-swipe) never throws on the unique pair.
        const [user1Id, user2Id] = [swiperId, targetId].sort();
        const match = await this.prisma.match.upsert({
          where: { user1Id_user2Id: { user1Id, user2Id } },
          create: { user1Id, user2Id },
          update: {},
        });
        return { matched: true, match };
      }
    }

    return { matched: false };
  }
}
