import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MatchingService } from '../services/matching.service';
import { SwipeService } from '../services/swipe.service';

function createMockPrisma() {
  return {
    datingProfile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    swipe: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    match: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };
}

describe('MatchingService', () => {
  let service: MatchingService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new MatchingService(prisma as never);
  });

  describe('getPotentialMatches', () => {
    it('returns active profiles excluding already swiped', async () => {
      prisma.datingProfile.findUnique.mockResolvedValue({
        userId: 'user-1',
        gender: 'male',
        genderPreference: ['female'],
        isActive: true,
      });
      prisma.swipe.findMany.mockResolvedValue([{ targetId: 'user-2' }]);
      prisma.datingProfile.findMany.mockResolvedValue([
        { userId: 'user-3', displayName: 'Jane' },
        { userId: 'user-4', displayName: 'Alice' },
      ]);

      const result = await service.getPotentialMatches('user-1', 10);

      expect(result).toHaveLength(2);
      expect(prisma.datingProfile.findMany).toHaveBeenCalledWith({
        where: {
          userId: { notIn: ['user-1', 'user-2'] },
          isActive: true,
        },
        take: 10,
        orderBy: { profileScore: 'desc' },
      });
    });

    it('throws PROFILE_NOT_FOUND when user has no profile', async () => {
      prisma.datingProfile.findUnique.mockResolvedValue(null);

      await expect(service.getPotentialMatches('user-1')).rejects.toThrow('Profile not found');
    });
  });

  describe('calculateCompatibility', () => {
    it('scores based on shared interests', async () => {
      prisma.datingProfile.findUnique
        .mockResolvedValueOnce({
          userId: 'user-1',
          age: 25,
          interests: ['music', 'hiking', 'cooking', 'travel'],
          verificationStatus: 'VERIFIED',
        })
        .mockResolvedValueOnce({
          userId: 'user-2',
          age: 27,
          interests: ['music', 'hiking', 'reading', 'gaming'],
          verificationStatus: 'VERIFIED',
        });

      const result = await service.calculateCompatibility('user-1', 'user-2');

      expect(result.sharedInterests).toEqual(['music', 'hiking']);
      expect(result.score).toBeGreaterThan(0);
      // 2 shared interests * 10 = 20, age diff 2 * 5 = 10 from 30 = 20, verified = 20
      // Total = 20 + 20 + 20 = 60
      expect(result.score).toBe(60);
    });

    it('gives higher score for same age', async () => {
      prisma.datingProfile.findUnique
        .mockResolvedValueOnce({
          userId: 'user-1',
          age: 25,
          interests: [],
          verificationStatus: 'UNVERIFIED',
        })
        .mockResolvedValueOnce({
          userId: 'user-2',
          age: 25,
          interests: [],
          verificationStatus: 'UNVERIFIED',
        });

      const result = await service.calculateCompatibility('user-1', 'user-2');

      // 0 shared + 30 (age diff 0) + 0 (not verified) = 30
      expect(result.score).toBe(30);
    });

    it('throws when a profile is not found', async () => {
      prisma.datingProfile.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      await expect(service.calculateCompatibility('user-1', 'user-2')).rejects.toThrow(
        'One or both profiles not found',
      );
    });
  });

  describe('getMatches', () => {
    it('returns active matches for the user', async () => {
      prisma.match.findMany.mockResolvedValue([
        { id: 'match-1', user1Id: 'user-1', user2Id: 'user-2', isActive: true },
        { id: 'match-2', user1Id: 'user-3', user2Id: 'user-1', isActive: true },
      ]);

      const matches = await service.getMatches('user-1');

      expect(matches).toHaveLength(2);
      expect(prisma.match.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          OR: [{ user1Id: 'user-1' }, { user2Id: 'user-1' }],
        },
        orderBy: { matchedAt: 'desc' },
      });
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
      // No existing swipe from user-1 to user-2
      prisma.swipe.findFirst
        .mockResolvedValueOnce(null) // check existing swipe
        .mockResolvedValueOnce({
          // reciprocal swipe exists
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

      prisma.match.findFirst.mockResolvedValue(null); // no existing match
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
