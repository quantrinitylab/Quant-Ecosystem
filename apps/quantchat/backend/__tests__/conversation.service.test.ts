import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationService } from '../services/conversation.service';

function createMockPrisma() {
  const txConversation = {
    create: vi.fn(),
  };
  const txConversationMember = {
    createMany: vi.fn(),
  };

  return {
    conversation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    conversationMember: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        conversation: txConversation,
        conversationMember: txConversationMember,
      });
    }),
    _tx: { conversation: txConversation, conversationMember: txConversationMember },
  };
}

describe('ConversationService', () => {
  let service: ConversationService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ConversationService(prisma as never);
  });

  describe('createConversation', () => {
    it('creates a group conversation with members in a transaction', async () => {
      const mockConv = {
        id: 'conv-1',
        type: 'group',
        name: 'Team Chat',
        description: null,
        createdBy: 'user-1',
        lastMessageAt: expect.any(Date),
        metadata: {},
      };
      prisma._tx.conversation.create.mockResolvedValue(mockConv);
      prisma._tx.conversationMember.createMany.mockResolvedValue({ count: 3 });

      const result = await service.createConversation({
        creatorId: 'user-1',
        participantIds: ['user-2', 'user-3'],
        type: 'group',
        name: 'Team Chat',
      });

      expect(result).toEqual(mockConv);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma._tx.conversation.create).toHaveBeenCalledWith({
        data: {
          type: 'group',
          name: 'Team Chat',
          description: null,
          createdBy: 'user-1',
          lastMessageAt: expect.any(Date),
          metadata: {},
        },
      });
      expect(prisma._tx.conversationMember.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 'user-1', role: 'OWNER' }),
          expect.objectContaining({ userId: 'user-2', role: 'MEMBER' }),
          expect.objectContaining({ userId: 'user-3', role: 'MEMBER' }),
        ]),
      });
    });

    it('creates a direct conversation with exactly 2 members', async () => {
      const mockConv = { id: 'conv-2', type: 'direct' };
      prisma._tx.conversation.create.mockResolvedValue(mockConv);
      prisma._tx.conversationMember.createMany.mockResolvedValue({ count: 2 });

      const result = await service.createConversation({
        creatorId: 'user-1',
        participantIds: ['user-2'],
        type: 'direct',
      });

      expect(result).toEqual(mockConv);
      expect(prisma._tx.conversationMember.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 'user-1' }),
          expect.objectContaining({ userId: 'user-2' }),
        ]),
      });
    });

    it('throws INVALID_PARTICIPANT_COUNT for direct with multiple participants', async () => {
      await expect(
        service.createConversation({
          creatorId: 'user-1',
          participantIds: ['user-2', 'user-3'],
          type: 'direct',
        }),
      ).rejects.toThrow('Direct conversations must have exactly one other participant');
    });

    it('deduplicates creator from participant list', async () => {
      const mockConv = { id: 'conv-3', type: 'group' };
      prisma._tx.conversation.create.mockResolvedValue(mockConv);
      prisma._tx.conversationMember.createMany.mockResolvedValue({ count: 2 });

      await service.createConversation({
        creatorId: 'user-1',
        participantIds: ['user-1', 'user-2'],
        type: 'group',
      });

      // Should have 2 unique members, not 3
      const memberData = prisma._tx.conversationMember.createMany.mock.calls[0]![0].data;
      const userIds = memberData.map((m: { userId: string }) => m.userId);
      expect(userIds).toEqual(['user-1', 'user-2']);
    });
  });

  describe('addMember', () => {
    it('adds a new member to a group conversation', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', type: 'group' });
      prisma.conversationMember.findFirst.mockResolvedValue(null);
      prisma.conversationMember.create.mockResolvedValue({
        id: 'member-new',
        conversationId: 'conv-1',
        userId: 'user-3',
        role: 'MEMBER',
      });

      const result = await service.addMember('conv-1', 'user-3');

      expect(result.userId).toBe('user-3');
      expect(result.role).toBe('MEMBER');
    });

    it('throws DIRECT_CONVERSATION when adding to direct chat', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', type: 'direct' });

      await expect(service.addMember('conv-1', 'user-3')).rejects.toThrow(
        'Cannot add members to direct conversations',
      );
    });

    it('throws ALREADY_MEMBER when user is already in conversation', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', type: 'group' });
      prisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-existing',
        userId: 'user-3',
      });

      await expect(service.addMember('conv-1', 'user-3')).rejects.toThrow(
        'User is already a member',
      );
    });

    it('allows specifying a role', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', type: 'group' });
      prisma.conversationMember.findFirst.mockResolvedValue(null);
      prisma.conversationMember.create.mockResolvedValue({
        id: 'member-admin',
        conversationId: 'conv-1',
        userId: 'user-3',
        role: 'ADMIN',
      });

      const result = await service.addMember('conv-1', 'user-3', 'ADMIN');

      expect(prisma.conversationMember.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ role: 'ADMIN' }),
      });
      expect(result.role).toBe('ADMIN');
    });

    it('throws CONVERSATION_NOT_FOUND for missing conversation', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.addMember('missing', 'user-1')).rejects.toThrow(
        'Conversation not found',
      );
    });
  });

  describe('removeMember', () => {
    it('sets leftAt timestamp to remove member', async () => {
      prisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-1',
        conversationId: 'conv-1',
        userId: 'user-2',
      });
      prisma.conversationMember.update.mockResolvedValue({});

      await service.removeMember('conv-1', 'user-2');

      expect(prisma.conversationMember.update).toHaveBeenCalledWith({
        where: { id: 'member-1' },
        data: { leftAt: expect.any(Date) },
      });
    });

    it('throws NOT_A_MEMBER when user is not in conversation', async () => {
      prisma.conversationMember.findFirst.mockResolvedValue(null);

      await expect(service.removeMember('conv-1', 'user-unknown')).rejects.toThrow(
        'User is not a member of this conversation',
      );
    });
  });

  describe('getUserConversations', () => {
    it('returns paginated conversations sorted by lastMessageAt', async () => {
      const mockMembers = [
        { conversation: { id: 'conv-1', lastMessageAt: new Date() } },
        { conversation: { id: 'conv-2', lastMessageAt: new Date() } },
      ];
      prisma.conversationMember.findMany.mockResolvedValue(mockMembers);
      prisma.conversationMember.count.mockResolvedValue(5);

      const result = await service.getUserConversations('user-1', { page: 1, pageSize: 10 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(prisma.conversationMember.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', leftAt: null },
        include: { conversation: true },
        orderBy: { conversation: { lastMessageAt: 'desc' } },
        skip: 0,
        take: 10,
      });
    });
  });

  describe('updateConversation', () => {
    it('updates conversation fields', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', name: 'Old Name' });
      prisma.conversation.update.mockResolvedValue({ id: 'conv-1', name: 'New Name' });

      const result = await service.updateConversation('conv-1', { name: 'New Name' });

      expect(result.name).toBe('New Name');
    });

    it('throws CONVERSATION_NOT_FOUND for missing conversation', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.updateConversation('missing', { name: 'Test' })).rejects.toThrow(
        'Conversation not found',
      );
    });
  });
});
