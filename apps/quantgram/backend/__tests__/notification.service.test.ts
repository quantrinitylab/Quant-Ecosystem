import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationService } from '../services/notification.service';

function createMockPrisma() {
  return {
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    user: { findMany: vi.fn() },
  };
}

describe('NotificationService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: NotificationService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new NotificationService(prisma as never);
  });

  describe('list', () => {
    it('resolves actor username/avatar via batch user lookup', async () => {
      prisma.notification.findMany.mockResolvedValue([
        {
          id: 'n1',
          type: 'like',
          title: 'New like',
          body: 'liked your post',
          sourceUserId: 'actor1',
          sourceEntityId: 'p1',
          isRead: false,
          createdAt: new Date(),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'actor1', username: 'liker', avatarUrl: 'a.jpg' },
      ]);

      const notifications = await service.list('me', {});

      expect(notifications[0].fromUser).toBe('liker');
      expect(notifications[0].fromAvatar).toBe('a.jpg');
      expect(notifications[0].read).toBe(false);
      expect(prisma.user.findMany).toHaveBeenCalledWith({ where: { id: { in: ['actor1'] } } });
    });

    it('handles notifications with no actor', async () => {
      prisma.notification.findMany.mockResolvedValue([
        {
          id: 'n1',
          type: 'system',
          title: 'Welcome',
          body: null,
          sourceUserId: null,
          isRead: true,
          createdAt: new Date(),
        },
      ]);

      const notifications = await service.list('me', {});

      expect(notifications[0].fromUser).toBe('someone');
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('unreadCount', () => {
    it('counts unread notifications', async () => {
      prisma.notification.count.mockResolvedValue(3);
      expect(await service.unreadCount('me')).toBe(3);
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'me', isRead: false },
      });
    });
  });

  describe('markAllRead', () => {
    it('marks all unread as read for the user', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllRead('me');

      expect(result).toEqual({ count: 5 });
      const arg = prisma.notification.updateMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      };
      expect(arg.where).toMatchObject({ userId: 'me', isRead: false });
      expect(arg.data.isRead).toBe(true);
    });
  });

  describe('markRead', () => {
    it('scopes the update to the owning user', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });

      await service.markRead('n1', 'me');

      const arg = prisma.notification.updateMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(arg.where).toMatchObject({ id: 'n1', userId: 'me' });
    });
  });
});
