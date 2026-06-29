import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProfileService } from '../services/profile.service';

function createMockPrisma() {
  return {
    user: {
      findUnique: vi.fn(),
    },
    datingProfile: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    userRelationship: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe('ProfileService', () => {
  let service: ProfileService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ProfileService(prisma as never);
  });

  describe('createProfile', () => {
    const adultDob = new Date(Date.now() - 25 * 365.25 * 24 * 60 * 60 * 1000);

    it('creates a new profile for an adult (age derived from verified DOB)', async () => {
      prisma.datingProfile.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', dateOfBirth: adultDob });
      prisma.datingProfile.create.mockImplementation(async ({ data }: any) => ({
        id: 'profile-1',
        isActive: true,
        profileScore: 0,
        ...data,
      }));

      const result = await service.createProfile({
        userId: 'user-1',
        displayName: 'Jane',
        age: 25,
        gender: 'female',
      });

      expect(result.displayName).toBe('Jane');
      expect(result.isActive).toBe(true);
      // Age comes from the verified DOB, not the client-supplied value.
      expect((result as { age: number }).age).toBeGreaterThanOrEqual(24);
    });

    it('rejects an underage user (UNDERAGE) regardless of the supplied age', async () => {
      prisma.datingProfile.findUnique.mockResolvedValue(null);
      const childDob = new Date(Date.now() - 15 * 365.25 * 24 * 60 * 60 * 1000);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', dateOfBirth: childDob });

      await expect(
        service.createProfile({ userId: 'user-1', displayName: 'Kid', age: 25, gender: 'female' }),
      ).rejects.toMatchObject({ code: 'UNDERAGE' });
      expect(prisma.datingProfile.create).not.toHaveBeenCalled();
    });

    it('requires a verified DOB (AGE_VERIFICATION_REQUIRED) when none is set', async () => {
      prisma.datingProfile.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', dateOfBirth: null });

      await expect(
        service.createProfile({ userId: 'user-1', displayName: 'Jane', age: 25, gender: 'female' }),
      ).rejects.toMatchObject({ code: 'AGE_VERIFICATION_REQUIRED' });
    });

    it('throws PROFILE_EXISTS if profile already exists', async () => {
      prisma.datingProfile.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createProfile({
          userId: 'user-1',
          displayName: 'Jane',
          age: 25,
          gender: 'female',
        }),
      ).rejects.toThrow('Profile already exists for this user');
    });
  });

  describe('getProfile', () => {
    it('returns profile by userId', async () => {
      prisma.datingProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        displayName: 'Jane',
      });

      const result = await service.getProfile('user-1');

      expect(result.displayName).toBe('Jane');
    });

    it('throws PROFILE_NOT_FOUND for missing profile', async () => {
      prisma.datingProfile.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('user-missing')).rejects.toThrow('Profile not found');
    });
  });

  describe('updateProfile', () => {
    it('updates profile fields', async () => {
      prisma.datingProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
      });
      prisma.datingProfile.update.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        displayName: 'Jane Updated',
      });

      const result = await service.updateProfile('user-1', { displayName: 'Jane Updated' });

      expect(result.displayName).toBe('Jane Updated');
    });
  });

  describe('follow', () => {
    it('creates a follow relationship', async () => {
      prisma.userRelationship.findFirst.mockResolvedValue(null);
      prisma.userRelationship.create.mockResolvedValue({
        id: 'rel-1',
        followerId: 'user-1',
        followingId: 'user-2',
        type: 'FOLLOW',
      });

      const result = await service.follow('user-1', 'user-2');

      expect(result.followerId).toBe('user-1');
      expect(result.followingId).toBe('user-2');
    });

    it('throws SELF_FOLLOW when following self', async () => {
      await expect(service.follow('user-1', 'user-1')).rejects.toThrow('Cannot follow yourself');
    });

    it('throws ALREADY_FOLLOWING if already following', async () => {
      prisma.userRelationship.findFirst.mockResolvedValue({ id: 'rel-1' });

      await expect(service.follow('user-1', 'user-2')).rejects.toThrow(
        'Already following this user',
      );
    });
  });

  describe('unfollow', () => {
    it('removes a follow relationship', async () => {
      prisma.userRelationship.findFirst.mockResolvedValue({
        id: 'rel-1',
        followerId: 'user-1',
        followingId: 'user-2',
      });
      prisma.userRelationship.delete.mockResolvedValue({});

      await service.unfollow('user-1', 'user-2');

      expect(prisma.userRelationship.delete).toHaveBeenCalledWith({
        where: { id: 'rel-1' },
      });
    });

    it('throws NOT_FOLLOWING if not following', async () => {
      prisma.userRelationship.findFirst.mockResolvedValue(null);

      await expect(service.unfollow('user-1', 'user-2')).rejects.toThrow('Not following this user');
    });
  });

  describe('getFollowers', () => {
    it('returns list of followers', async () => {
      prisma.userRelationship.findMany.mockResolvedValue([
        { followerId: 'user-2', followingId: 'user-1' },
        { followerId: 'user-3', followingId: 'user-1' },
      ]);

      const result = await service.getFollowers('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].followerId).toBe('user-2');
    });
  });

  describe('getFollowing', () => {
    it('returns list of users being followed', async () => {
      prisma.userRelationship.findMany.mockResolvedValue([
        { followerId: 'user-1', followingId: 'user-2' },
      ]);

      const result = await service.getFollowing('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].followingId).toBe('user-2');
    });
  });
});
