import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MatchingService } from '../services/matching.service';
import { SwipeService } from '../services/swipe.service';

function createMockPrisma() {
  return {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    datingProfile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    swipe: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn().mockResolvedValue({ id: 'swipe-1' }),
    },
    match: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  };
}

describe('MatchingService', () => {
  let service: MatchingService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new MatchingService(prisma as never);
  });

  describe('findMatches', () => {
    it('returns empty array when user has no dating profile', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.findMatches('user-1');

      expect(result).toEqual([]);
    });

    it('returns empty array when user exists but datingProfile is null', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        datingProfile: null,
      });

      const result = await service.findMatches('user-1');

      expect(result).toEqual([]);
    });

    it('returns other users with dating profiles', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        datingProfile: { id: 'dp-1', userId: 'user-1' },
      });

      const otherUsers = [
        { id: 'user-2', datingProfile: { id: 'dp-2', displayName: 'Jane' } },
        { id: 'user-3', datingProfile: { id: 'dp-3', displayName: 'Alice' } },
      ];
      prisma.swipe.findMany.mockResolvedValue([{ targetId: 'user-9' }]);
      prisma.user.findMany.mockResolvedValue(otherUsers);

      const result = await service.findMatches('user-1', 10);

      expect(result).toHaveLength(2);
      expect(result).toEqual(otherUsers);
      // Excludes self AND already-swiped targets.
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          id: { notIn: ['user-1', 'user-9'] },
          datingProfile: { isNot: null },
        },
        include: { datingProfile: true },
        take: 10,
      });
    });

    it('defaults limit to 10', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        datingProfile: { id: 'dp-1' },
      });
      prisma.user.findMany.mockResolvedValue([]);

      await service.findMatches('user-1');

      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
    });
  });

  describe('recordSwipe', () => {
    it('creates a swipe and returns no match for LEFT', async () => {
      const result = await service.recordSwipe('user-1', 'user-2', 'LEFT');

      expect(result).toEqual({ matched: false });
      expect(prisma.swipe.upsert).toHaveBeenCalledWith({
        where: { swiperId_targetId: { swiperId: 'user-1', targetId: 'user-2' } },
        create: { swiperId: 'user-1', targetId: 'user-2', direction: 'LEFT' },
        update: { direction: 'LEFT' },
      });
    });

    it('creates a swipe and returns no match for RIGHT when no mutual interest', async () => {
      prisma.swipe.findFirst.mockResolvedValue(null);

      const result = await service.recordSwipe('user-1', 'user-2', 'RIGHT');

      expect(result).toEqual({ matched: false });
      expect(prisma.swipe.findFirst).toHaveBeenCalledWith({
        where: {
          swiperId: 'user-2',
          targetId: 'user-1',
          direction: { in: ['RIGHT', 'SUPER_LIKE'] },
        },
      });
    });

    it('creates a match when mutual RIGHT swipe exists', async () => {
      prisma.swipe.findFirst.mockResolvedValue({
        id: 'swipe-prev',
        swiperId: 'user-2',
        targetId: 'user-1',
        direction: 'RIGHT',
      });
      prisma.match.upsert.mockResolvedValue({
        id: 'match-1',
        user1Id: 'user-1',
        user2Id: 'user-2',
      });

      const result = await service.recordSwipe('user-1', 'user-2', 'RIGHT');

      expect(result).toEqual({
        matched: true,
        match: { id: 'match-1', user1Id: 'user-1', user2Id: 'user-2' },
      });
      expect(prisma.match.upsert).toHaveBeenCalledWith({
        where: { user1Id_user2Id: { user1Id: 'user-1', user2Id: 'user-2' } },
        create: { user1Id: 'user-1', user2Id: 'user-2' },
        update: {},
      });
    });

    it('creates a match when mutual SUPER_LIKE swipe exists', async () => {
      prisma.swipe.findFirst.mockResolvedValue({
        id: 'swipe-prev',
        swiperId: 'user-2',
        targetId: 'user-1',
        direction: 'SUPER_LIKE',
      });
      prisma.match.upsert.mockResolvedValue({
        id: 'match-1',
        user1Id: 'user-1',
        user2Id: 'user-2',
      });

      const result = await service.recordSwipe('user-1', 'user-2', 'SUPER_LIKE');

      expect(result).toEqual({
        matched: true,
        match: { id: 'match-1', user1Id: 'user-1', user2Id: 'user-2' },
      });
      expect(prisma.match.upsert).toHaveBeenCalled();
    });

    it('orders user1Id/user2Id deterministically when creating a match', async () => {
      prisma.swipe.findFirst.mockResolvedValue({
        id: 'swipe-prev',
        swiperId: 'user-2',
        targetId: 'user-1',
        direction: 'RIGHT',
      });
      prisma.match.upsert.mockResolvedValue({
        id: 'match-1',
        user1Id: 'user-1',
        user2Id: 'user-2',
      });

      const result = await service.recordSwipe('user-2', 'user-1', 'RIGHT');

      expect(result).toEqual({
        matched: true,
        match: { id: 'match-1', user1Id: 'user-1', user2Id: 'user-2' },
      });
      expect(prisma.match.upsert).toHaveBeenCalledWith({
        where: { user1Id_user2Id: { user1Id: 'user-1', user2Id: 'user-2' } },
        create: { user1Id: 'user-1', user2Id: 'user-2' },
        update: {},
      });
    });

    it('is idempotent: re-swiping the same target does not throw (upsert)', async () => {
      prisma.swipe.findFirst.mockResolvedValue(null);
      const first = await service.recordSwipe('user-1', 'user-2', 'LEFT');
      const second = await service.recordSwipe('user-1', 'user-2', 'RIGHT');
      expect(first).toEqual({ matched: false });
      expect(second).toEqual({ matched: false });
      expect(prisma.swipe.upsert).toHaveBeenCalledTimes(2);
    });
  });
});

describe('SwipeService', () => {
  let service: SwipeService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new SwipeService(prisma as never);
  });

  describe('swipe', () => {
    it('creates a swipe and returns no match for LEFT', async () => {
      prisma.swipe.findFirst.mockResolvedValue(null);
      prisma.swipe.create.mockResolvedValue({
        id: 'swipe-1',
        swiperId: 'user-1',
        targetId: 'user-2',
        direction: 'LEFT',
      });

      const result = await service.swipe('user-1', 'user-2', 'LEFT');

      expect(result.isMatch).toBe(false);
      expect(result.swipe.direction).toBe('LEFT');
    });

    it('creates a match on mutual RIGHT swipe', async () => {
      prisma.swipe.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'swipe-prev',
        swiperId: 'user-2',
        targetId: 'user-1',
        direction: 'RIGHT',
      });

      prisma.swipe.create.mockResolvedValue({
        id: 'swipe-1',
        swiperId: 'user-1',
        targetId: 'user-2',
        direction: 'RIGHT',
      });

      prisma.match.findFirst.mockResolvedValue(null);
      prisma.match.create.mockResolvedValue({
        id: 'match-1',
        user1Id: 'user-1',
        user2Id: 'user-2',
        matchedAt: new Date(),
        isActive: true,
      });

      const result = await service.swipe('user-1', 'user-2', 'RIGHT');

      expect(result.isMatch).toBe(true);
      expect(result.match).toBeDefined();
      expect(result.match!.user1Id).toBe('user-1');
      expect(result.match!.user2Id).toBe('user-2');
    });

    it('throws ALREADY_SWIPED for duplicate swipe', async () => {
      prisma.swipe.findFirst.mockResolvedValue({
        id: 'swipe-1',
        swiperId: 'user-1',
        targetId: 'user-2',
      });

      await expect(service.swipe('user-1', 'user-2', 'RIGHT')).rejects.toThrow(
        'Already swiped on this user',
      );
    });

    it('throws SELF_SWIPE when swiping on yourself', async () => {
      await expect(service.swipe('user-1', 'user-1', 'RIGHT')).rejects.toThrow(
        'Cannot swipe on yourself',
      );
    });
  });

  describe('checkMatch', () => {
    it('returns null if no reciprocal swipe', async () => {
      prisma.swipe.findFirst.mockResolvedValue(null);

      const result = await service.checkMatch('user-1', 'user-2');

      expect(result).toBeNull();
    });

    it('returns existing match if already matched', async () => {
      prisma.swipe.findFirst.mockResolvedValue({
        id: 'swipe-2',
        swiperId: 'user-2',
        targetId: 'user-1',
        direction: 'RIGHT',
      });
      prisma.match.findFirst.mockResolvedValue({
        id: 'match-existing',
        user1Id: 'user-1',
        user2Id: 'user-2',
      });

      const result = await service.checkMatch('user-1', 'user-2');

      expect(result!.id).toBe('match-existing');
    });
  });
});
