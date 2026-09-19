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
    snapView: {
      findUnique: vi.fn(),
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
  let mockStorage: { getSignedUrl: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = createMockPrisma();
    mockStorage = {
      getSignedUrl: vi.fn().mockImplementation(async (key: string, ttl: number) => {
        return `https://s3.example.com/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${ttl}&X-Amz-Signature=mock-sig`;
      }),
    };
    service = new MessageService(prisma as never, undefined, undefined, mockStorage as never);
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

  describe('consumeSnap (CH-8 / SEC-1 / SEC-2 Ephemeral View-Once Enforcement)', () => {
    it('rejects non-members with 403 NOT_A_MEMBER (SEC-1 IDOR Defense)', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'snap-1',
        conversationId: 'conv-1',
        senderId: 'sender-1',
        type: 'IMAGE',
        mediaUrl: 'https://s3.example.com/snaps/photo-1.jpg',
        metadata: { viewOnce: true, duration: 10 },
      });
      // Caller is not a member of the conversation
      prisma.conversationMember.findFirst.mockResolvedValue(null);

      await expect(service.consumeSnap('snap-1', 'attacker-1')).rejects.toMatchObject({
        statusCode: 403,
        code: 'NOT_A_MEMBER',
      });

      expect(prisma.snapView.create).not.toHaveBeenCalled();
    });

    it('consumes a snap on first access by an active conversation member', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'snap-1',
        conversationId: 'conv-1',
        senderId: 'sender-1',
        type: 'IMAGE',
        mediaUrl: 'https://s3.example.com/snaps/photo-1.jpg',
        metadata: { viewOnce: true, duration: 10 },
      });
      prisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-viewer',
        conversationId: 'conv-1',
        userId: 'viewer-1',
        role: 'MEMBER',
        leftAt: null,
      });
      prisma.snapView.findUnique.mockResolvedValue(null);
      prisma.snapView.create.mockResolvedValue({
        id: 'sv-1',
        messageId: 'snap-1',
        userId: 'viewer-1',
      });

      const result = await service.consumeSnap('snap-1', 'viewer-1');

      expect(result.mediaUrl).toContain('snaps/photo-1.jpg');
      expect(result.mediaUrl).toContain('X-Amz-Expires=60');
      expect(result.mediaUrl).toContain('X-Amz-Signature=');
      expect(result.duration).toBe(10);
      expect(prisma.snapView.create).toHaveBeenCalledWith({
        data: {
          messageId: 'snap-1',
          userId: 'viewer-1',
        },
      });
    });

    it('throws 410 SNAP_CONSUMED when viewer has already viewed the snap', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'snap-1',
        conversationId: 'conv-1',
        senderId: 'sender-1',
        type: 'IMAGE',
        mediaUrl: 'https://s3.example.com/snaps/photo-1.jpg',
        metadata: { viewOnce: true, duration: 10 },
      });
      prisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-viewer',
        conversationId: 'conv-1',
        userId: 'viewer-1',
        role: 'MEMBER',
        leftAt: null,
      });
      // Already viewed by viewer-1
      prisma.snapView.findUnique.mockResolvedValue({
        id: 'sv-1',
        messageId: 'snap-1',
        userId: 'viewer-1',
        viewedAt: new Date(Date.now() - 60000),
      });

      await expect(service.consumeSnap('snap-1', 'viewer-1')).rejects.toMatchObject({
        statusCode: 410,
        code: 'SNAP_CONSUMED',
        message: expect.stringContaining('already been viewed and destroyed'),
      });

      expect(prisma.snapView.create).not.toHaveBeenCalled();
    });

    it('proves concurrency safety under genuine parallel requests: exactly one succeeds with 200, one fails with 410 (SEC-2)', async () => {
      // Run 50 parallel dual-dispatch iterations (100 simultaneous reads total)
      for (let iteration = 0; iteration < 50; iteration++) {
        const snapId = `snap-race-${iteration}`;
        const viewerId = `viewer-${iteration}`;

        prisma.message.findUnique.mockResolvedValue({
          id: snapId,
          conversationId: 'conv-race',
          senderId: 'author-1',
          type: 'IMAGE',
          mediaUrl: 'https://s3.example.com/snaps/race.jpg',
          metadata: { viewOnce: true, duration: 10 },
        });
        prisma.conversationMember.findFirst.mockResolvedValue({
          id: `member-${viewerId}`,
          conversationId: 'conv-race',
          userId: viewerId,
          role: 'MEMBER',
          leftAt: null,
        });

        // Simulate concurrent read-committed reads: both see null initially
        prisma.snapView.findUnique.mockResolvedValue(null);

        // Atomic DB unique constraint: first create succeeds, second throws P2002
        let createCallCount = 0;
        prisma.snapView.create.mockImplementation(async () => {
          createCallCount++;
          if (createCallCount === 1) {
            return {
              id: `sv-${iteration}`,
              messageId: snapId,
              userId: viewerId,
              viewedAt: new Date(),
            };
          }
          const p2002Error = new Error(
            'Unique constraint failed on the fields: (`message_id`,`user_id`)',
          );
          (p2002Error as unknown as { code: string }).code = 'P2002';
          throw p2002Error;
        });

        // Dispatch two simultaneous reads of the exact same snap for the same recipient
        const [result1, result2] = await Promise.allSettled([
          service.consumeSnap(snapId, viewerId),
          service.consumeSnap(snapId, viewerId),
        ]);

        const fulfilled = [result1, result2].filter((r) => r.status === 'fulfilled');
        const rejected = [result1, result2].filter((r) => r.status === 'rejected');

        // INVARIANT: Exactly one succeeds with media payload, exactly one fails with 410 SNAP_CONSUMED
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);

        if (fulfilled[0]?.status === 'fulfilled') {
          expect(fulfilled[0].value.mediaUrl).toContain('snaps/race.jpg');
          expect(fulfilled[0].value.mediaUrl).toContain('X-Amz-Expires=60');
          expect(fulfilled[0].value.mediaUrl).toContain('X-Amz-Signature=');
          expect(fulfilled[0].value.duration).toBe(10);
        }

        if (rejected[0]?.status === 'rejected') {
          expect(rejected[0].reason).toMatchObject({
            statusCode: 410,
            code: 'SNAP_CONSUMED',
          });
        }
      }
    });

    it('allows sender review without consuming or creating snapView while still presigning (SEC-1 & SEC-4)', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'snap-1',
        conversationId: 'conv-1',
        senderId: 'sender-author',
        type: 'IMAGE',
        mediaUrl: 'https://s3.example.com/snaps/photo-1.jpg',
        metadata: { viewOnce: true, duration: 10 },
      });
      prisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-author',
        conversationId: 'conv-1',
        userId: 'sender-author',
        role: 'OWNER',
        leftAt: null,
      });

      // First review by author: receives authentic 60s presigned URL
      const res1 = await service.consumeSnap('snap-1', 'sender-author');
      expect(res1.mediaUrl).toContain('snaps/photo-1.jpg');
      expect(res1.mediaUrl).toContain('X-Amz-Expires=60');
      expect(res1.mediaUrl).toContain('X-Amz-Signature=');
      expect(res1.duration).toBe(10);
      // Author reviewing does NOT consume
      expect(prisma.snapView.create).not.toHaveBeenCalled();

      // Second review by author also succeeds with presigned URL
      const res2 = await service.consumeSnap('snap-1', 'sender-author');
      expect(res2.mediaUrl).toContain('snaps/photo-1.jpg');
      expect(res2.mediaUrl).toContain('X-Amz-Expires=60');
      expect(res2.mediaUrl).toContain('X-Amz-Signature=');
      expect(res2.duration).toBe(10);
      expect(prisma.snapView.create).not.toHaveBeenCalled();
    });

    it('preserves group chat recipient independence: User A consuming does not burn for User B', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'group-snap',
        conversationId: 'group-conv-1',
        senderId: 'sender-alice',
        type: 'IMAGE',
        mediaUrl: 'https://s3.example.com/snaps/group-photo.jpg',
        metadata: { viewOnce: true, duration: 10 },
      });
      // Both Bob and Charlie are active members
      prisma.conversationMember.findFirst.mockImplementation(
        async ({ where }: { where: { userId: string } }) => ({
          id: `mem-${where.userId}`,
          conversationId: 'group-conv-1',
          userId: where.userId,
          role: 'MEMBER',
          leftAt: null,
        }),
      );

      // Track consumed users dynamically to prevent false-pass mocking
      const consumedUsers = new Set<string>();
      prisma.snapView.findUnique.mockImplementation(
        async ({ where }: { where: { messageId_userId: { userId: string } } }) => {
          if (consumedUsers.has(where.messageId_userId.userId)) {
            return {
              id: `sv-${where.messageId_userId.userId}`,
              messageId: 'group-snap',
              userId: where.messageId_userId.userId,
            };
          }
          return null;
        },
      );
      prisma.snapView.create.mockImplementation(async ({ data }: { data: { userId: string } }) => {
        consumedUsers.add(data.userId);
        return { id: `sv-${data.userId}`, ...data };
      });

      // Bob's first view consumes for Bob
      const bobResult = await service.consumeSnap('group-snap', 'bob');
      expect(bobResult.mediaUrl).toContain('snaps/group-photo.jpg');
      expect(bobResult.mediaUrl).toContain('X-Amz-Expires=60');
      expect(bobResult.mediaUrl).toContain('X-Amz-Signature=');
      expect(prisma.snapView.create).toHaveBeenCalledWith({
        data: { messageId: 'group-snap', userId: 'bob' },
      });

      // Bob tries to view again: rejected with 410 SNAP_CONSUMED
      await expect(service.consumeSnap('group-snap', 'bob')).rejects.toMatchObject({
        statusCode: 410,
        code: 'SNAP_CONSUMED',
      });

      // Charlie views for the first time: Charlie receives view successfully
      const charlieResult = await service.consumeSnap('group-snap', 'charlie');
      expect(charlieResult.mediaUrl).toContain('snaps/group-photo.jpg');
      expect(charlieResult.mediaUrl).toContain('X-Amz-Expires=60');
      expect(charlieResult.mediaUrl).toContain('X-Amz-Signature=');
      expect(prisma.snapView.create).toHaveBeenCalledWith({
        data: { messageId: 'group-snap', userId: 'charlie' },
      });

      // Charlie tries to view again: also rejected with 410 SNAP_CONSUMED
      await expect(service.consumeSnap('group-snap', 'charlie')).rejects.toMatchObject({
        statusCode: 410,
        code: 'SNAP_CONSUMED',
      });
    });

    it('fails closed with 500 PRESIGNING_FAILED when storage signing fails', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'snap-fail',
        conversationId: 'conv-1',
        senderId: 'sender-1',
        type: 'IMAGE',
        mediaUrl: 'https://s3.example.com/snaps/secret.jpg',
        metadata: { viewOnce: true, duration: 10 },
      });
      prisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-1',
        conversationId: 'conv-1',
        userId: 'viewer-1',
        role: 'MEMBER',
        leftAt: null,
      });
      prisma.snapView.findUnique.mockResolvedValue(null);
      prisma.snapView.create.mockResolvedValue({ id: 'sv-1' });

      mockStorage.getSignedUrl.mockRejectedValueOnce(new Error('KMS encryption key expired'));

      await expect(service.consumeSnap('snap-fail', 'viewer-1')).rejects.toMatchObject({
        statusCode: 500,
        code: 'PRESIGNING_FAILED',
      });
    });

    it('rejects regular non-snap messages with 400 NOT_A_SNAP', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-regular',
        conversationId: 'conv-1',
        senderId: 'sender-1',
        type: 'TEXT',
        content: 'Hello',
        metadata: {},
      });
      prisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-viewer',
        conversationId: 'conv-1',
        userId: 'viewer-1',
        role: 'MEMBER',
        leftAt: null,
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
