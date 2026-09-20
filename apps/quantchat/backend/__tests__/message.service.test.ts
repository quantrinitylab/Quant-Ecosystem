import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageService } from '../services/message.service';

function createMockPrisma() {
  const prisma = {
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
      findMany: vi.fn().mockResolvedValue([]),
    },
    messageOutbox: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  // Interactive transaction runs the callback with the same mock client.
  prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma;
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
          type: 'TEXT',
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
          type: 'IMAGE',
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

  describe('reactToMessage', () => {
    it('adds a reaction to a message', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        metadata: {},
      });
      prisma.conversationMember.findFirst.mockResolvedValue({ id: 'member-1' });
      prisma.message.update.mockResolvedValue({
        id: 'msg-1',
        metadata: { reactions: { '👍': ['user-1'] } },
      });

      const result = await service.reactToMessage('msg-1', 'user-1', '👍');

      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { metadata: { reactions: { '👍': ['user-1'] } } },
      });
      expect(result.metadata).toEqual({ reactions: { '👍': ['user-1'] } });
    });

    it('removes reaction when user already reacted', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        metadata: { reactions: { '👍': ['user-1'] } },
      });
      prisma.conversationMember.findFirst.mockResolvedValue({ id: 'member-1' });
      prisma.message.update.mockResolvedValue({
        id: 'msg-1',
        metadata: { reactions: {} },
      });

      await service.reactToMessage('msg-1', 'user-1', '👍');

      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { metadata: { reactions: {} } },
      });
    });

    it('throws MESSAGE_NOT_FOUND for non-existent message', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(service.reactToMessage('missing', 'user-1', '👍')).rejects.toThrow(
        'Message not found',
      );
    });

    it('throws NOT_A_MEMBER if user is not in conversation', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        metadata: {},
      });
      prisma.conversationMember.findFirst.mockResolvedValue(null);

      await expect(service.reactToMessage('msg-1', 'user-outsider', '👍')).rejects.toThrow(
        'User is not a member of this conversation',
      );
    });
  });

  describe('searchMessages', () => {
    it('searches messages across user conversations', async () => {
      prisma.conversationMember.findMany.mockResolvedValue([
        { conversationId: 'conv-1' },
        { conversationId: 'conv-2' },
      ]);
      const messages = [{ id: 'msg-1', content: 'Hello world', conversationId: 'conv-1' }];
      prisma.message.findMany.mockResolvedValue(messages);
      prisma.message.count.mockResolvedValue(1);

      const result = await service.searchMessages('user-1', 'Hello');

      expect(result.data).toEqual(messages);
      expect(result.total).toBe(1);
      expect(prisma.conversationMember.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', leftAt: null },
        select: { conversationId: true },
      });
      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: {
          conversationId: { in: ['conv-1', 'conv-2'] },
          isDeleted: false,
          content: { contains: 'Hello', mode: 'insensitive' },
          NOT: { content: { startsWith: '{"ciphertext"' } },
        },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('returns paginated results', async () => {
      prisma.conversationMember.findMany.mockResolvedValue([{ conversationId: 'conv-1' }]);
      prisma.message.findMany.mockResolvedValue([]);
      prisma.message.count.mockResolvedValue(50);

      const result = await service.searchMessages('user-1', 'test', { page: 2, pageSize: 10 });

      expect(result.page).toBe(2);
      expect(result.totalPages).toBe(5);
      expect(result.hasNext).toBe(true);
      expect(result.hasPrev).toBe(true);
    });
  });

  describe('sendMessage — streak wiring', () => {
    function setupSend(memberIds: string[]) {
      prisma.conversationMember.findFirst.mockResolvedValue({ id: 'member-1', leftAt: null });
      prisma.conversationMember.findMany.mockResolvedValue(memberIds.map((userId) => ({ userId })));
      prisma.message.create.mockResolvedValue({ id: 'msg-1', createdAt: new Date() });
      prisma.conversation.update.mockResolvedValue({});
    }

    it('updates the streak for a 1:1 conversation (one recipient)', async () => {
      const streaks = { recordMessage: vi.fn().mockResolvedValue({ count: 1 }) };
      const svc = new MessageService(prisma as never, undefined, streaks as never);
      setupSend(['user-1', 'user-2']);

      await svc.sendMessage({ conversationId: 'conv-1', senderId: 'user-1', content: 'hi' });

      expect(streaks.recordMessage).toHaveBeenCalledWith('user-1', 'user-2');
    });

    it('does NOT update a streak for a group conversation (multiple recipients)', async () => {
      const streaks = { recordMessage: vi.fn().mockResolvedValue({ count: 0 }) };
      const svc = new MessageService(prisma as never, undefined, streaks as never);
      setupSend(['user-1', 'user-2', 'user-3']);

      await svc.sendMessage({ conversationId: 'conv-1', senderId: 'user-1', content: 'hi all' });

      expect(streaks.recordMessage).not.toHaveBeenCalled();
    });

    it('still delivers the message when the streak update throws (best-effort)', async () => {
      const streaks = { recordMessage: vi.fn().mockRejectedValue(new Error('streak db down')) };
      const svc = new MessageService(prisma as never, undefined, streaks as never);
      setupSend(['user-1', 'user-2']);

      const msg = await svc.sendMessage({
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'hi',
      });
      expect(msg).toMatchObject({ id: 'msg-1' });
    });
  });

  // These cover the seam that was broken end to end: the composer sends a snap type (and
  // `disappearMode: 'after_view'`) with NO metadata, the type is folded to the IMAGE enum
  // on insert, and nothing marked the row as ephemeral — so consumeSnap answered
  // 400 NOT_A_SNAP for every genuine snap. Each test below asserts against what is
  // actually PERSISTED, so a regression cannot hide behind hand-built metadata.
  describe('sendMessage — view-once persistence (CH-8)', () => {
    function setupEphemeralSend() {
      prisma.conversationMember.findFirst.mockResolvedValue({ id: 'member-1', leftAt: null });
      prisma.conversationMember.findMany.mockResolvedValue([
        { userId: 'user-1' },
        { userId: 'user-2' },
      ]);
      prisma.message.create.mockResolvedValue({ id: 'snap-1', createdAt: new Date() });
      prisma.conversation.update.mockResolvedValue({});
    }

    function persistedMetadata() {
      return prisma.message.create.mock.calls[0]?.[0]?.data?.metadata;
    }

    it('marks a snap_photo send as viewOnce even when the client sends no metadata', async () => {
      setupEphemeralSend();

      await service.sendMessage({
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Photo Snap',
        type: 'snap_photo',
        mediaUrl: 'https://cdn.example.com/snap.jpg',
      });

      expect(persistedMetadata()).toMatchObject({ viewOnce: true });
      // Still stored under the mapped Prisma enum member, which is why metadata is required.
      expect(prisma.message.create.mock.calls[0]?.[0]?.data?.type).toBe('IMAGE');
    });

    it('marks a snap_video send as viewOnce', async () => {
      setupEphemeralSend();

      await service.sendMessage({
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Video Snap',
        type: 'snap_video',
      });

      expect(persistedMetadata()).toMatchObject({ viewOnce: true });
      expect(prisma.message.create.mock.calls[0]?.[0]?.data?.type).toBe('VIDEO');
    });

    it("honours disappearMode 'after_view' on an ordinary image send", async () => {
      setupEphemeralSend();

      await service.sendMessage({
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'peek',
        type: 'image',
        disappearMode: 'after_view',
      });

      expect(persistedMetadata()).toMatchObject({
        viewOnce: true,
        disappearMode: 'after_view',
      });
    });

    it('does NOT mark ordinary sends as viewOnce', async () => {
      setupEphemeralSend();

      await service.sendMessage({
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'just a normal message',
        type: 'text',
      });

      expect(persistedMetadata()).not.toHaveProperty('viewOnce');
    });

    it("does NOT mark a send as viewOnce for disappearMode 'off'", async () => {
      setupEphemeralSend();

      await service.sendMessage({
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'normal',
        type: 'image',
        disappearMode: 'off',
      });

      expect(persistedMetadata()).not.toHaveProperty('viewOnce');
    });

    it('preserves caller-supplied metadata alongside the viewOnce marker', async () => {
      setupEphemeralSend();

      await service.sendMessage({
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Photo Snap',
        type: 'snap_photo',
        metadata: { duration: 7 },
      });

      expect(persistedMetadata()).toMatchObject({ viewOnce: true, duration: 7 });
    });

    it('round-trips: a snap sent with no metadata is consumable, then 410s', async () => {
      setupEphemeralSend();

      await service.sendMessage({
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Photo Snap',
        type: 'snap_photo',
        mediaUrl: 'https://cdn.example.com/snap.jpg',
        metadata: { duration: 5 },
      });

      // Feed exactly what was written back in as the stored row.
      const stored = persistedMetadata() as Record<string, unknown>;
      prisma.message.findUnique.mockResolvedValue({
        id: 'snap-1',
        type: 'IMAGE',
        mediaUrl: 'https://cdn.example.com/snap.jpg',
        metadata: stored,
      });
      prisma.message.update.mockResolvedValue({});

      await expect(service.consumeSnap('snap-1', 'viewer-1')).resolves.toEqual({
        mediaUrl: 'https://cdn.example.com/snap.jpg',
        duration: 5,
      });

      // Second access sees the consumed row and must be refused with 410.
      const consumed = prisma.message.update.mock.calls[0]?.[0]?.data?.metadata;
      prisma.message.findUnique.mockResolvedValue({
        id: 'snap-1',
        type: 'IMAGE',
        mediaUrl: 'https://cdn.example.com/snap.jpg',
        metadata: consumed,
      });

      await expect(service.consumeSnap('snap-1', 'viewer-2')).rejects.toMatchObject({
        statusCode: 410,
        code: 'SNAP_CONSUMED',
      });
    });
  });

  describe('consumeSnap (CH-8 Server-Side 410 Gone Enforcement)', () => {
    it('consumes a snap on first access and updates consumedAt in metadata', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'snap-1',
        type: 'IMAGE',
        mediaUrl: 'https://s3.example.com/snaps/photo-1.jpg',
        metadata: { viewOnce: true, duration: 10 },
      });
      prisma.message.update.mockResolvedValue({});

      const result = await service.consumeSnap('snap-1', 'viewer-1');

      expect(result).toEqual({
        mediaUrl: 'https://s3.example.com/snaps/photo-1.jpg',
        duration: 10,
      });

      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'snap-1' },
          data: {
            metadata: expect.objectContaining({
              viewOnce: true,
              consumedBy: 'viewer-1',
              consumedAt: expect.any(String),
            }),
          },
        }),
      );
    });

    it('throws 410 SNAP_CONSUMED when snap has already been consumed', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'snap-1',
        type: 'IMAGE',
        mediaUrl: 'https://s3.example.com/snaps/photo-1.jpg',
        metadata: {
          viewOnce: true,
          duration: 10,
          consumedAt: new Date(Date.now() - 5000).toISOString(),
          consumedBy: 'viewer-1',
        },
      });

      await expect(service.consumeSnap('snap-1', 'viewer-1')).rejects.toMatchObject({
        statusCode: 410,
        code: 'SNAP_CONSUMED',
        message: expect.stringContaining('already been viewed and destroyed'),
      });

      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('rejects regular non-snap messages with 400 NOT_A_SNAP', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-regular',
        type: 'TEXT',
        content: 'Hello',
        metadata: {},
      });

      await expect(service.consumeSnap('msg-regular', 'viewer-1')).rejects.toMatchObject({
        statusCode: 400,
        code: 'NOT_A_SNAP',
      });
    });

    it('throws 404 when snap is not found', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(service.consumeSnap('non-existent', 'viewer-1')).rejects.toMatchObject({
        statusCode: 404,
        code: 'MESSAGE_NOT_FOUND',
      });
    });
  });
});
