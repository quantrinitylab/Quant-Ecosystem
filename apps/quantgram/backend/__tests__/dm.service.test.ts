import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DmService } from '../services/dm.service';

function createMockPrisma() {
  return {
    conversation: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    conversationMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    message: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn(),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

describe('DmService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: DmService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new DmService(prisma as never);
  });

  describe('startDirect', () => {
    it('rejects self DM', async () => {
      await expect(service.startDirect('u1', 'u1')).rejects.toMatchObject({ code: 'SELF_DM' });
    });

    it('rejects empty target', async () => {
      await expect(service.startDirect('u1', '')).rejects.toMatchObject({ code: 'INVALID_TARGET' });
    });

    it('creates a new DIRECT conversation with both members', async () => {
      prisma.conversationMember.findMany.mockResolvedValueOnce([]); // caller has none
      prisma.conversation.create.mockResolvedValue({ id: 'c1', type: 'DIRECT' });
      prisma.conversationMember.create.mockResolvedValue({});

      const res = await service.startDirect('u1', 'u2');

      expect(res.id).toBe('c1');
      expect(res.isGroup).toBe(false);
      expect(res.memberIds).toEqual(['u1', 'u2']);
      expect(prisma.conversationMember.create).toHaveBeenCalledTimes(2);
    });

    it('returns the existing DIRECT conversation instead of duplicating', async () => {
      prisma.conversationMember.findMany
        .mockResolvedValueOnce([{ conversationId: 'c1' }]) // caller's memberships
        .mockResolvedValueOnce([{ conversationId: 'c1', userId: 'u2' }]); // other in caller's convs
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1',
        type: 'DIRECT',
        deletedAt: null,
      });

      const res = await service.startDirect('u1', 'u2');

      expect(res.id).toBe('c1');
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('rejects a non-member', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(service.sendMessage('u1', 'c1', 'hi')).rejects.toMatchObject({
        code: 'NOT_A_MEMBER',
      });
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects empty content', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ id: 'm1' });
      await expect(service.sendMessage('u1', 'c1', '   ')).rejects.toMatchObject({
        code: 'EMPTY_MESSAGE',
      });
    });

    it('creates a message and bumps lastMessageAt', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ id: 'm1' });
      prisma.message.create.mockResolvedValue({
        id: 'msg1',
        conversationId: 'c1',
        senderId: 'u1',
        type: 'TEXT',
        content: 'hello',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });

      const res = await service.sendMessage('u1', 'c1', 'hello');

      expect(res).toMatchObject({ id: 'msg1', senderId: 'u1', content: 'hello' });
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { lastMessageAt: expect.any(Date) },
      });
    });
  });

  describe('getMessages', () => {
    it('gates on membership', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(service.getMessages('u1', 'c1')).rejects.toMatchObject({ code: 'NOT_A_MEMBER' });
    });

    it('returns messages oldest-first', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ id: 'm1' });
      // service queries desc then reverses → oldest first
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'b',
          conversationId: 'c1',
          senderId: 'u2',
          type: 'TEXT',
          content: '2nd',
          createdAt: new Date(2),
        },
        {
          id: 'a',
          conversationId: 'c1',
          senderId: 'u1',
          type: 'TEXT',
          content: '1st',
          createdAt: new Date(1),
        },
      ]);

      const res = await service.getMessages('u1', 'c1');
      expect(res.map((m) => m.id)).toEqual(['a', 'b']);
    });
  });

  describe('markRead', () => {
    it('sets lastReadAt for the member', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ id: 'm1' });
      prisma.conversationMember.update.mockResolvedValue({});
      const res = await service.markRead('u1', 'c1');
      expect(res.lastReadAt).toBeDefined();
      expect(prisma.conversationMember.update).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId: 'c1', userId: 'u1' } },
        data: { lastReadAt: expect.any(Date) },
      });
    });
  });

  describe('listConversations', () => {
    it('summarizes memberships with unread counts, newest first', async () => {
      prisma.conversationMember.findMany
        .mockResolvedValueOnce([
          { conversationId: 'c1', lastReadAt: null },
          { conversationId: 'c2', lastReadAt: new Date(100) },
        ]) // caller memberships
        .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }]) // c1 members
        .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u3' }]); // c2 members
      prisma.conversation.findUnique
        .mockResolvedValueOnce({
          id: 'c1',
          type: 'DIRECT',
          lastMessageAt: new Date('2026-01-02T00:00:00Z'),
        })
        .mockResolvedValueOnce({
          id: 'c2',
          type: 'GROUP',
          name: 'Squad',
          lastMessageAt: new Date('2026-01-03T00:00:00Z'),
        });
      prisma.message.count.mockResolvedValueOnce(3).mockResolvedValueOnce(0);

      const res = await service.listConversations('u1');

      expect(res.map((c) => c.id)).toEqual(['c2', 'c1']); // newest activity first
      const c1 = res.find((c) => c.id === 'c1');
      expect(c1?.unreadCount).toBe(3);
      const c2 = res.find((c) => c.id === 'c2');
      expect(c2?.isGroup).toBe(true);
      expect(c2?.name).toBe('Squad');
    });
  });
});
