import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommunityService } from '../services/community.service';

function createMockPrisma() {
  return {
    community: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    communityMember: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe('CommunityService', () => {
  let service: CommunityService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new CommunityService(prisma as never);
  });

  describe('createCommunity', () => {
    it('creates a community with slug and auto-joins creator as OWNER', async () => {
      prisma.community.findUnique.mockResolvedValue(null);
      prisma.community.create.mockResolvedValue({
        id: 'community-1',
        name: 'Test Community',
        slug: 'test-community',
        description: 'A test community',
        isPrivate: false,
        memberCount: 1,
      });
      prisma.communityMember.create.mockResolvedValue({
        id: 'member-1',
        communityId: 'community-1',
        userId: 'user-1',
        role: 'OWNER',
      });

      const result = await service.createCommunity('user-1', {
        name: 'Test Community',
        slug: 'test-community',
        description: 'A test community',
      });

      expect(result.name).toBe('Test Community');
      expect(result.slug).toBe('test-community');
      expect(result.memberCount).toBe(1);
      expect(prisma.community.findUnique).toHaveBeenCalledWith({
        where: { slug: 'test-community' },
      });
      expect(prisma.communityMember.create).toHaveBeenCalledWith({
        data: {
          communityId: 'community-1',
          userId: 'user-1',
          role: 'OWNER',
        },
      });
    });

    it('throws when slug already exists', async () => {
      prisma.community.findUnique.mockResolvedValue({
        id: 'existing-id',
        name: 'Existing',
        slug: 'taken-slug',
      });

      await expect(
        service.createCommunity('user-1', {
          name: 'Another',
          slug: 'taken-slug',
        }),
      ).rejects.toThrow('Community slug already exists');

      expect(prisma.community.create).not.toHaveBeenCalled();
    });

    it('respects the isPrivate flag', async () => {
      prisma.community.findUnique.mockResolvedValue(null);
      prisma.community.create.mockResolvedValue({
        id: 'community-2',
        name: 'Private',
        slug: 'private-comm',
        description: '',
        isPrivate: true,
        memberCount: 1,
      });
      prisma.communityMember.create.mockResolvedValue({});

      const result = await service.createCommunity('user-1', {
        name: 'Private',
        slug: 'private-comm',
        isPrivate: true,
      });

      expect(result.isPrivate).toBe(true);
    });
  });

  describe('joinCommunity', () => {
    it('adds user as MEMBER, increments count, and returns success', async () => {
      prisma.communityMember.findUnique.mockResolvedValue(null);
      prisma.communityMember.create.mockResolvedValue({
        id: 'member-2',
        communityId: 'community-1',
        userId: 'user-2',
        role: 'MEMBER',
      });
      prisma.community.update.mockResolvedValue({
        id: 'community-1',
        memberCount: 6,
      });

      const result = await service.joinCommunity('user-2', 'community-1');

      expect(result.success).toBe(true);
      expect(prisma.communityMember.create).toHaveBeenCalledWith({
        data: {
          communityId: 'community-1',
          userId: 'user-2',
          role: 'MEMBER',
        },
      });
      expect(prisma.community.update).toHaveBeenCalledWith({
        where: { id: 'community-1' },
        data: { memberCount: { increment: 1 } },
      });
    });

    it('returns success:false when user is already a member', async () => {
      prisma.communityMember.findUnique.mockResolvedValue({
        id: 'member-1',
        communityId: 'community-1',
        userId: 'user-1',
        role: 'MEMBER',
      });

      const result = await service.joinCommunity('user-1', 'community-1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Already a member');
      expect(prisma.communityMember.create).not.toHaveBeenCalled();
    });
  });

  describe('getCommunity', () => {
    it('returns community with member and post counts', async () => {
      prisma.community.findUnique.mockResolvedValue({
        id: 'community-1',
        name: 'Test',
        description: 'A community',
        _count: { members: 5, posts: 3 },
      });

      const result = await service.getCommunity('community-1');

      expect(result).toBeDefined();
      expect(result!.id).toBe('community-1');
    });
  });

  describe('getTrendingCommunities', () => {
    it('returns communities ordered by memberCount desc', async () => {
      prisma.community.findMany.mockResolvedValue([
        { id: 'community-a', name: 'Big', memberCount: 100 },
        { id: 'community-b', name: 'Small', memberCount: 10 },
      ]);

      const result = await service.getTrendingCommunities(5);

      expect(result).toHaveLength(2);
      expect(result[0].memberCount).toBe(100);
      expect(prisma.community.findMany).toHaveBeenCalledWith({
        orderBy: { memberCount: 'desc' },
        take: 5,
      });
    });
  });

  describe('moderator tools', () => {
    const member = (role: string, userId: string) => ({ communityId: 'c1', userId, role });

    describe('leaveCommunity', () => {
      it('lets a member leave and decrements the count', async () => {
        prisma.communityMember.findUnique.mockResolvedValue(member('MEMBER', 'u2'));
        prisma.communityMember.delete.mockResolvedValue({});
        prisma.community.update.mockResolvedValue({});
        const res = await service.leaveCommunity('u2', 'c1');
        expect(res.success).toBe(true);
        expect(prisma.community.update).toHaveBeenCalledWith({
          where: { id: 'c1' },
          data: { memberCount: { decrement: 1 } },
        });
      });

      it('blocks the owner from leaving', async () => {
        prisma.communityMember.findUnique.mockResolvedValue(member('OWNER', 'u1'));
        await expect(service.leaveCommunity('u1', 'c1')).rejects.toMatchObject({
          code: 'OWNER_CANNOT_LEAVE',
        });
      });

      it('rejects a non-member', async () => {
        prisma.communityMember.findUnique.mockResolvedValue(null);
        await expect(service.leaveCommunity('ghost', 'c1')).rejects.toMatchObject({
          code: 'NOT_A_MEMBER',
        });
      });
    });

    describe('setMemberRole', () => {
      it('lets the owner promote a member to moderator', async () => {
        prisma.communityMember.findUnique
          .mockResolvedValueOnce(member('OWNER', 'owner')) // actor
          .mockResolvedValueOnce(member('MEMBER', 'u2')); // target
        prisma.communityMember.update.mockResolvedValue({ ...member('MODERATOR', 'u2') });
        const res = await service.setMemberRole('owner', 'c1', 'u2', 'MODERATOR');
        expect(res.role).toBe('MODERATOR');
      });

      it('forbids an admin from minting another admin (role at/above own)', async () => {
        prisma.communityMember.findUnique
          .mockResolvedValueOnce(member('ADMIN', 'admin'))
          .mockResolvedValueOnce(member('MEMBER', 'u2'));
        await expect(service.setMemberRole('admin', 'c1', 'u2', 'ADMIN')).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      });

      it('forbids a moderator from managing roles', async () => {
        prisma.communityMember.findUnique.mockResolvedValueOnce(member('MODERATOR', 'mod'));
        await expect(service.setMemberRole('mod', 'c1', 'u2', 'MEMBER')).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      });

      it("refuses to change the owner's role", async () => {
        prisma.communityMember.findUnique
          .mockResolvedValueOnce(member('ADMIN', 'admin'))
          .mockResolvedValueOnce(member('OWNER', 'owner'));
        await expect(service.setMemberRole('admin', 'c1', 'owner', 'MEMBER')).rejects.toMatchObject(
          {
            code: 'FORBIDDEN',
          },
        );
      });

      it('rejects granting OWNER', async () => {
        await expect(
          service.setMemberRole('owner', 'c1', 'u2', 'OWNER' as never),
        ).rejects.toMatchObject({
          code: 'INVALID_ROLE',
        });
      });
    });

    describe('removeMember', () => {
      it('lets a moderator kick a member and decrements the count', async () => {
        prisma.communityMember.findUnique
          .mockResolvedValueOnce(member('MODERATOR', 'mod'))
          .mockResolvedValueOnce(member('MEMBER', 'u2'));
        prisma.communityMember.delete.mockResolvedValue({});
        prisma.community.update.mockResolvedValue({});
        const res = await service.removeMember('mod', 'c1', 'u2');
        expect(res.success).toBe(true);
        expect(prisma.community.update).toHaveBeenCalledWith({
          where: { id: 'c1' },
          data: { memberCount: { decrement: 1 } },
        });
      });

      it('never removes the owner', async () => {
        prisma.communityMember.findUnique
          .mockResolvedValueOnce(member('ADMIN', 'admin'))
          .mockResolvedValueOnce(member('OWNER', 'owner'));
        await expect(service.removeMember('admin', 'c1', 'owner')).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      });

      it('forbids kicking an equal/higher rank', async () => {
        prisma.communityMember.findUnique
          .mockResolvedValueOnce(member('MODERATOR', 'mod1'))
          .mockResolvedValueOnce(member('MODERATOR', 'mod2'));
        await expect(service.removeMember('mod1', 'c1', 'mod2')).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      });
    });

    describe('listMembers', () => {
      it('returns a paginated member list', async () => {
        prisma.communityMember.findMany.mockResolvedValue([member('OWNER', 'u1')]);
        prisma.communityMember.count.mockResolvedValue(1);
        const res = await service.listMembers('c1', { page: 1, pageSize: 50 });
        expect(res.total).toBe(1);
        expect(res.data).toHaveLength(1);
      });
    });
  });
});
