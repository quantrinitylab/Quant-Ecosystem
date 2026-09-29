import type { PrismaClient } from '../types';

export interface ShapedNotification {
  id: string;
  type: string;
  fromUser: string;
  fromAvatar: string | null;
  title: string;
  content: string;
  read: boolean;
  sourceEntityId: string | null;
  createdAt: Date;
}

export interface NotificationListOptions {
  page?: number;
  pageSize?: number;
}

export class NotificationService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string, options: NotificationListOptions = {}): Promise<ShapedNotification[]> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 30;
    const skip = (page - 1) * pageSize;

    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    });

    // Resolve actor (sourceUserId) username/avatar via a batch lookup.
    const actorIds = [
      ...new Set(
        rows.map((n: any) => n.sourceUserId).filter((id: unknown): id is string => Boolean(id)),
      ),
    ];
    let byId = new Map<string, any>();
    if (actorIds.length > 0) {
      const users = await this.prisma.user.findMany({ where: { id: { in: actorIds } } });
      byId = new Map(users.map((u: any) => [u.id, u]));
    }

    return rows.map((n: any) => {
      const actor = n.sourceUserId ? byId.get(n.sourceUserId) : undefined;
      return {
        id: n.id,
        type: n.type,
        fromUser: actor?.username ?? 'someone',
        fromAvatar: actor?.avatarUrl ?? null,
        title: n.title ?? '',
        content: n.body ?? '',
        read: n.isRead ?? false,
        sourceEntityId: n.sourceEntityId ?? null,
        createdAt: n.createdAt,
      };
    });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  async markAllRead(userId: string): Promise<{ count: number }> {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markRead(notificationId: string, userId: string): Promise<{ count: number }> {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }
}
