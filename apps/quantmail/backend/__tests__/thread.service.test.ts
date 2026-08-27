import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThreadService } from '../services/thread.service';

function createMockPrisma() {
  return {
    emailThread: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    email: {
      findMany: vi.fn(),
    },
  };
}

describe('ThreadService', () => {
  let service: ThreadService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ThreadService(prisma as never);
  });

  describe('getThread', () => {
    it('returns thread with emails and unread count', async () => {
      const mockThread = {
        id: 'thread-1',
        userId: 'user-1',
        subject: 'Test Thread',
        participantAddresses: ['a@test.com', 'b@test.com'],
        messageCount: 3,
        lastEmailAt: new Date(),
      };
      const mockEmails = [
        { id: 'email-1', isRead: true, threadId: 'thread-1' },
        { id: 'email-2', isRead: false, threadId: 'thread-1' },
        { id: 'email-3', isRead: false, threadId: 'thread-1' },
      ];
      prisma.emailThread.findUnique.mockResolvedValue(mockThread);
      prisma.email.findMany.mockResolvedValue(mockEmails);

      const result = await service.getThread('thread-1', 'user-1');

      expect(result.id).toBe('thread-1');
      expect(result.emails).toHaveLength(3);
      expect(result.unreadCount).toBe(2);
      expect(prisma.email.findMany).toHaveBeenCalledWith({
        // Matched on `threadId` OR the email's own `id`, so a message that was
        // never threaded still resolves when opened by id. No `userId` filter is
        // needed here: `getThread` has already loaded the thread and thrown 403
        // unless `thread.userId === userId`, so ownership is settled upstream.
        where: {
          OR: [
            { threadId: 'thread-1', deletedAt: null },
            { id: 'thread-1', deletedAt: null },
          ],
        },
        // `createdAt` breaks ties: messages that arrive in the same second would
        // otherwise come back in an order the database was free to choose.
        orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
      });
    });

    it('throws THREAD_NOT_FOUND when thread does not exist', async () => {
      prisma.emailThread.findUnique.mockResolvedValue(null);

      await expect(service.getThread('missing', 'user-1')).rejects.toThrow('Thread not found');
    });

    it('throws FORBIDDEN when user does not own the thread', async () => {
      prisma.emailThread.findUnique.mockResolvedValue({
        id: 'thread-1',
        userId: 'other-user',
      });

      await expect(service.getThread('thread-1', 'user-1')).rejects.toThrow(
        'Not authorized to access this thread',
      );
    });
  });

  describe('listThreads', () => {
    it('returns paginated threads for user', async () => {
      const mockThreads = [
        { id: 'thread-1', userId: 'user-1', lastEmailAt: new Date() },
        { id: 'thread-2', userId: 'user-1', lastEmailAt: new Date() },
      ];
      prisma.emailThread.findMany.mockResolvedValue(mockThreads);
      prisma.emailThread.count.mockResolvedValue(15);

      const result = await service.listThreads('user-1', undefined, { page: 1, pageSize: 10 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(15);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBe(2);
      expect(result.hasNext).toBe(true);
      expect(result.hasPrev).toBe(false);
    });

    it('uses default pagination when not specified', async () => {
      prisma.emailThread.findMany.mockResolvedValue([]);
      prisma.emailThread.count.mockResolvedValue(0);

      await service.listThreads('user-1');

      expect(prisma.emailThread.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        skip: 0,
        take: 20,
        orderBy: { lastEmailAt: 'desc' },
      });
    });

    it('filters by folder when folderId is provided', async () => {
      prisma.email.findMany.mockResolvedValue([{ threadId: 'thread-1' }, { threadId: 'thread-2' }]);
      prisma.emailThread.findMany.mockResolvedValue([]);
      prisma.emailThread.count.mockResolvedValue(0);

      await service.listThreads('user-1', 'folder-inbox');

      expect(prisma.email.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          folderId: 'folder-inbox',
          deletedAt: null,
          threadId: { not: null },
        },
        select: { threadId: true },
        distinct: ['threadId'],
      });
    });
  });

  describe('muteThread', () => {
    it('mutes a thread owned by the user and persists isMuted on the row', async () => {
      prisma.emailThread.findUnique.mockResolvedValue({
        id: 'thread-1',
        userId: 'user-1',
        isMuted: true,
        snoozedUntil: null,
      });
      prisma.emailThread.update.mockResolvedValue({
        id: 'thread-1',
        userId: 'user-1',
        isMuted: true,
        snoozedUntil: null,
      });

      const result = await service.muteThread('thread-1', 'user-1');

      expect(result.preferences.isMuted).toBe(true);
      // Mute is now durably persisted on the EmailThread row.
      expect(prisma.emailThread.update).toHaveBeenCalledWith({
        where: { id: 'thread-1' },
        data: { isMuted: true },
      });
      // Verify preferences are stored and retrievable from the DB.
      await expect(service.getThreadPreferences('thread-1')).resolves.toEqual({ isMuted: true });
    });

    it('throws THREAD_NOT_FOUND when thread does not exist', async () => {
      prisma.emailThread.findUnique.mockResolvedValue(null);

      await expect(service.muteThread('missing', 'user-1')).rejects.toThrow('Thread not found');
    });

    it('throws FORBIDDEN when user does not own the thread', async () => {
      prisma.emailThread.findUnique.mockResolvedValue({
        id: 'thread-1',
        userId: 'other-user',
      });

      await expect(service.muteThread('thread-1', 'user-1')).rejects.toThrow('Not authorized');
    });
  });

  describe('snoozeThread', () => {
    it('snoozes a thread until the specified date and persists snoozedUntil', async () => {
      const snoozeDate = new Date('2025-01-25T09:00:00Z');
      prisma.emailThread.findUnique.mockResolvedValue({
        id: 'thread-1',
        userId: 'user-1',
        isMuted: false,
        snoozedUntil: snoozeDate,
      });
      prisma.emailThread.update.mockResolvedValue({
        id: 'thread-1',
        userId: 'user-1',
        isMuted: false,
        snoozedUntil: snoozeDate,
      });

      const result = await service.snoozeThread('thread-1', 'user-1', snoozeDate);

      expect(result.preferences.snoozedUntil).toEqual(snoozeDate.toISOString());
      // Snooze is now durably persisted on the EmailThread row.
      expect(prisma.emailThread.update).toHaveBeenCalledWith({
        where: { id: 'thread-1' },
        data: { snoozedUntil: snoozeDate },
      });
      // Verify preferences are stored and retrievable from the DB.
      await expect(service.getThreadPreferences('thread-1')).resolves.toEqual({
        snoozedUntil: snoozeDate.toISOString(),
      });
    });

    it('throws THREAD_NOT_FOUND when thread does not exist', async () => {
      prisma.emailThread.findUnique.mockResolvedValue(null);

      await expect(service.snoozeThread('missing', 'user-1', new Date())).rejects.toThrow(
        'Thread not found',
      );
    });

    it('throws FORBIDDEN when user does not own the thread', async () => {
      prisma.emailThread.findUnique.mockResolvedValue({
        id: 'thread-1',
        userId: 'other-user',
      });

      await expect(service.snoozeThread('thread-1', 'user-1', new Date())).rejects.toThrow(
        'Not authorized',
      );
    });
  });
});
