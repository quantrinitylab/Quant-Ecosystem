import type { PrismaClient, Email, EmailThread } from '@prisma/client';
import { createAppError } from '@quant/server-core';

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ThreadWithEmails extends EmailThread {
  emails: Email[];
  unreadCount: number;
}

/**
 * Durable thread preferences (mute/snooze) persisted on the EmailThread row
 * (the `isMuted` / `snoozedUntil` columns). Previously this lived in a
 * per-request in-memory Map, which lost all state because ThreadService is
 * constructed per request.
 */
export interface ThreadPreferences {
  isMuted?: boolean;
  snoozedUntil?: string;
}

export class ThreadService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Project the persisted mute/snooze columns into a ThreadPreferences view. */
  private static toPreferences(thread: {
    isMuted?: boolean | null;
    snoozedUntil?: Date | null;
  }): ThreadPreferences {
    const preferences: ThreadPreferences = {};
    if (thread.isMuted) {
      preferences.isMuted = true;
    }
    if (thread.snoozedUntil) {
      preferences.snoozedUntil = thread.snoozedUntil.toISOString();
    }
    return preferences;
  }

  async getThread(threadId: string, userId: string): Promise<ThreadWithEmails> {
    const thread = await this.prisma.emailThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw createAppError('Thread not found', 404, 'THREAD_NOT_FOUND');
    }

    if (thread.userId !== userId) {
      throw createAppError('Not authorized to access this thread', 403, 'FORBIDDEN');
    }

    let emails = await this.prisma.email.findMany({
      where: {
        OR: [
          { threadId, deletedAt: null },
          { id: threadId, deletedAt: null },
        ],
      },
      orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
    });

    if (emails.length === 0 && thread.subject) {
      emails = await this.prisma.email.findMany({
        where: {
          userId,
          subject: thread.subject,
          deletedAt: null,
        },
        orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
      });
    }

    const unreadCount = emails.filter((e: Email) => !e.isRead).length;

    return {
      ...thread,
      emails,
      unreadCount,
    };
  }

  async listThreads(
    userId: string,
    folderId?: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<EmailThread>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { userId };
    if (folderId) {
      where['id'] = {
        in: await this.getThreadIdsForFolder(userId, folderId),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.emailThread.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { lastEmailAt: 'desc' },
      }),
      this.prisma.emailThread.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async getThreadParticipants(threadId: string, userId: string): Promise<string[]> {
    const thread = await this.prisma.emailThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw createAppError('Thread not found', 404, 'THREAD_NOT_FOUND');
    }

    if (thread.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    return (thread.participantAddresses as string[]) ?? [];
  }

  private async getThreadIdsForFolder(userId: string, folderId: string): Promise<string[]> {
    const emails = await this.prisma.email.findMany({
      where: { userId, folderId, deletedAt: null, threadId: { not: null } },
      select: { threadId: true },
      distinct: ['threadId'],
    });

    return emails
      .map((e: { threadId: string | null }) => e.threadId)
      .filter((id: string | null): id is string => id !== null);
  }

  /**
   * Mute a thread for the user. Persisted on the EmailThread `isMuted` column.
   */
  async muteThread(
    threadId: string,
    userId: string,
  ): Promise<EmailThread & { preferences: ThreadPreferences }> {
    const thread = await this.prisma.emailThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw createAppError('Thread not found', 404, 'THREAD_NOT_FOUND');
    }

    if (thread.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    const updated = await this.prisma.emailThread.update({
      where: { id: threadId },
      data: { isMuted: true },
    });

    return { ...updated, preferences: ThreadService.toPreferences(updated) };
  }

  /**
   * Snooze a thread until a specified date. Persisted on the EmailThread
   * `snoozedUntil` column.
   */
  async snoozeThread(
    threadId: string,
    userId: string,
    until: Date,
  ): Promise<EmailThread & { preferences: ThreadPreferences }> {
    const thread = await this.prisma.emailThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw createAppError('Thread not found', 404, 'THREAD_NOT_FOUND');
    }

    if (thread.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    const updated = await this.prisma.emailThread.update({
      where: { id: threadId },
      data: { snoozedUntil: until },
    });

    return { ...updated, preferences: ThreadService.toPreferences(updated) };
  }

  /**
   * Stitch an inbound message into the correct thread for a user and return the
   * thread id (QuantMail SuperHub Pillar 1, Requirement 5.2). Resolution order:
   *   1. If `inReplyTo` references a known message-id we already store, reuse that
   *      email's thread.
   *   2. Otherwise reuse the user's most-recent thread with a matching normalized
   *      subject (Re:/Fwd: prefixes stripped).
   *   3. Otherwise create a new thread.
   * The chosen thread's `messageCount`, `lastEmailAt`, and participant set are
   * updated. Idempotent fields are advanced, never regressed.
   */
  async stitchInbound(input: {
    userId: string;
    subject: string;
    inReplyTo?: string | null;
    participants?: string[];
    at?: Date;
  }): Promise<string> {
    const at = input.at ?? new Date();
    const normalizedSubject = normalizeSubject(input.subject);

    let thread: EmailThread | null = null;

    if (input.inReplyTo) {
      const parent = await this.prisma.email.findFirst({
        where: { userId: input.userId, messageId: input.inReplyTo, threadId: { not: null } },
        orderBy: { receivedAt: 'desc' },
      });
      if (parent?.threadId) {
        thread = await this.prisma.emailThread.findUnique({ where: { id: parent.threadId } });
      }
    }

    if (!thread && normalizedSubject.length > 0) {
      const candidates = await this.prisma.emailThread.findMany({
        where: { userId: input.userId },
        orderBy: { lastEmailAt: 'desc' },
        take: 50,
      });
      thread = candidates.find((t) => normalizeSubject(t.subject) === normalizedSubject) ?? null;
    }

    if (!thread) {
      const created = await this.prisma.emailThread.create({
        data: {
          userId: input.userId,
          subject: input.subject,
          participantAddresses: input.participants ?? [],
          messageCount: 1,
          lastEmailAt: at,
          isRead: false,
        },
      });
      return created.id;
    }

    const existingParticipants = ((thread.participantAddresses as string[]) ?? []).map((p) => p);
    const mergedParticipants = Array.from(
      new Set([...existingParticipants, ...(input.participants ?? [])].map((p) => p.toLowerCase())),
    );
    const nextLastEmailAt =
      !thread.lastEmailAt || at > thread.lastEmailAt ? at : thread.lastEmailAt;

    await this.prisma.emailThread.update({
      where: { id: thread.id },
      data: {
        messageCount: { increment: 1 },
        lastEmailAt: nextLastEmailAt,
        participantAddresses: mergedParticipants,
        isRead: false,
      },
    });

    return thread.id;
  }

  /**
   * Get thread preferences (mute/snooze state) from the persisted thread row.
   */
  async getThreadPreferences(threadId: string): Promise<ThreadPreferences | undefined> {
    const thread = await this.prisma.emailThread.findUnique({ where: { id: threadId } });
    if (!thread) {
      return undefined;
    }
    return ThreadService.toPreferences(thread);
  }
}

/**
 * Strip reply/forward prefixes and trim for subject-based threading.
 *
 * `Re[2]:` is Outlook's counter form and has to go too, or a reply from an
 * Outlook client lands in a new thread. Kept in step with the client-side twin in
 * `src/lib/threading.ts`, which has the tests: if the two disagree, the inbox
 * regroups messages the server had already stitched together.
 */
function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(\s*(re|fwd|fw)(\[\d+\])?\s*:\s*)+/i, '')
    .trim()
    .toLowerCase();
}
