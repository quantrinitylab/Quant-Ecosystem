import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageService } from '../services/message.service';

function createMockPrisma() {
  return {
    message: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    conversation: {
      update: vi.fn(),
    },
    conversationMember: {
      findFirst: vi.fn(),
    },
  };
}

describe('MessageService', () => {
  let service: MessageService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new MessageService(prisma as never);
  });

  describe('sendMessage', () => {
    it('creates a message when user is a conversation member', async () => {
      prisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        role: 'MEMBER',
        leftAt: null,
      });

      const mockMessage = {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hello world',
        type: 'text',
        mediaUrl: null,
        replyToId: null,
        metadata: {},
        isEdited: false,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.message.create.mockResolvedValue(mockMessage);
      prisma.conversation.update.mockResolvedValue({});

      const result = await service.sendMessage({
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hello world',
      });

      expect(result).toEqual(mockMessage);
      expect(prisma.conversationMember.findFirst).toHaveBeenCalledWith({
        where: { conversationId: 'conv-1', userId: 'user-1', leftAt: null },
      });
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'conv-1',
          senderId: 'user-1',
          content: 'Hello world',
          type: 'text',
          mediaUrl: null,
          replyToId: null,
          metadata: {},
        },
      });
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { lastMessageAt: expect.any(Date) },
      });
    });

    it('throws NOT_A_MEMBER when user is not in the conversation', async () => {
      prisma.conversationMember.findFirst.mockResolvedValue(null);

      await expect(
        service.sendMessage({
          conversationId: 'conv-1',
          senderId: 'user-outsider',
          content: 'Should fail',
        }),
      ).rejects.toThrow('User is not a member of this conversation');
    });

    it('passes mediaUrl and replyToId when provided', async () => {
      prisma.conversationMember.findFirst.mockResolvedValue({ id: 'member-1' });
      prisma.message.create.mockResolvedValue({ id: 'msg-2' });
      prisma.conversation.update.mockResolvedValue({});

      await service.sendMessage({
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Check this out',
        type: 'image',
        mediaUrl: 'https://cdn.example.com/photo.jpg',
        replyToId: 'msg-original',
        metadata: { caption: 'My photo' },
      });

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'conv-1',
          senderId: 'user-1',
          content: 'Check this out',
          type: 'image',
          mediaUrl: 'https://cdn.example.com/photo.jpg',
          replyToId: 'msg-original',
          metadata: { caption: 'My photo' },
        },
      });
    });
  });

  describe('getMessages', () => {
    it('returns paginated messages', async () => {
      const messages = [
        { id: 'msg-1', content: 'Hello', createdAt: new Date() },
        { id: 'msg-2', content: 'World', createdAt: new Date() },
      ];
      prisma.message.findMany.mockResolvedValue(messages);
      prisma.message.count.mockResolvedValue(25);

      const result = await service.getMessages('conv-1', { page: 1, pageSize: 10 });

      expect(result.data).toEqual(messages);
      expect(result.total).toBe(25);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBe(3);
      expect(result.hasNext).toBe(true);
      expect(result.hasPrev).toBe(false);
    });

    it('returns last page with hasPrev true and hasNext false', async () => {
      prisma.message.findMany.mockResolvedValue([{ id: 'msg-5' }]);
      prisma.message.count.mockResolvedValue(25);

      const result = await service.getMessages('conv-1', { page: 3, pageSize: 10 });

      expect(result.hasNext).toBe(false);
      expect(result.hasPrev).toBe(true);
    });

    it('uses default pagination when not specified', async () => {
      prisma.message.findMany.mockResolvedValue([]);
      prisma.message.count.mockResolvedValue(0);

      await service.getMessages('conv-1');

      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { conversationId: 'conv-1', isDeleted: false },
        skip: 0,
        take: 50,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('editMessage', () => {
    it('allows sender to edit their message within 15 minutes', async () => {
      const recentDate = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        senderId: 'user-1',
        content: 'Old text',
        createdAt: recentDate,
      });
      prisma.message.update.mockResolvedValue({
        id: 'msg-1',
        senderId: 'user-1',
        content: 'New text',
        isEdited: true,
      });

      const result = await service.editMessage('msg-1', 'user-1', 'New text');

      expect(result.content).toBe('New text');
      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { content: 'New text', isEdited: true, updatedAt: expect.any(Date) },
      });
    });

    it('throws NOT_MESSAGE_OWNER if different user tries to edit', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        senderId: 'user-1',
        createdAt: new Date(),
      });

      await expect(service.editMessage('msg-1', 'user-2', 'Hacked!')).rejects.toThrow(
        'Only the sender can edit this message',
      );
    });

    it('throws EDIT_WINDOW_EXPIRED after 15 minutes', async () => {
      const oldDate = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        senderId: 'user-1',
        createdAt: oldDate,
      });

      await expect(service.editMessage('msg-1', 'user-1', 'Too late')).rejects.toThrow(
        'Message can only be edited within 15 minutes',
      );
    });

    it('throws MESSAGE_NOT_FOUND for non-existent message', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(service.editMessage('missing', 'user-1', 'Content')).rejects.toThrow(
        'Message not found',
      );
    });
  });

  describe('deleteMessage', () => {
    it('soft deletes message when called by sender', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        senderId: 'user-1',
      });
      prisma.message.update.mockResolvedValue({
        id: 'msg-1',
        isDeleted: true,
      });

      const result = await service.deleteMessage('msg-1', 'user-1');

      expect(result.isDeleted).toBe(true);
      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { isDeleted: true, updatedAt: expect.any(Date) },
      });
    });

    it('throws NOT_MESSAGE_OWNER if different user tries to delete', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        senderId: 'user-1',
      });

      await expect(service.deleteMessage('msg-1', 'user-2')).rejects.toThrow(
        'Only the sender can delete this message',
      );
    });

    it('throws MESSAGE_NOT_FOUND for non-existent message', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(service.deleteMessage('missing', 'user-1')).rejects.toThrow('Message not found');
    });
  });

  describe('pinMessage', () => {
    it('pins a message when user is a member', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        metadata: {},
      });
      prisma.conversationMember.findFirst.mockResolvedValue({ id: 'member-1' });
      prisma.message.update.mockResolvedValue({
        id: 'msg-1',
        metadata: { pinned: true, pinnedBy: 'user-1' },
      });

      const result = await service.pinMessage('msg-1', 'user-1');

      expect((result.metadata as Record<string, unknown>)['pinned']).toBe(true);
    });

    it('throws NOT_A_MEMBER if user is not in conversation', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        metadata: {},
      });
      prisma.conversationMember.findFirst.mockResolvedValue(null);

      await expect(service.pinMessage('msg-1', 'user-outsider')).rejects.toThrow(
        'User is not a member of this conversation',
      );
    });
  });
});
