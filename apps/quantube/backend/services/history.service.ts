// ============================================================================
// QuantTube - HistoryService (Prisma-backed, durable)
// ============================================================================
//
// Watch history was previously an in-memory array (lost on restart / not shared
// across instances). It is now persisted to Postgres via the `WatchHistory`
// model: one row per (user, video), re-watching upserts the same row's duration
// and timestamp. Depends on a narrow structural prisma slice so it stays unit-
// testable with a fake.

export interface WatchHistoryEntry {
  id: string;
  userId: string;
  videoId: string;
  watchDuration: number;
  watchedAt: Date;
}

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

interface WatchHistoryRow {
  id: string;
  userId: string;
  videoId: string;
  watchDuration: number;
  watchedAt: Date | string;
}

/** Structural Prisma slice (the real PrismaClient satisfies it at runtime). */
export interface HistoryPrisma {
  watchHistory: {
    upsert(args: {
      where: { userId_videoId: { userId: string; videoId: string } };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }): Promise<WatchHistoryRow>;
    findMany(args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
      skip?: number;
      take?: number;
    }): Promise<WatchHistoryRow[]>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  };
}

export class HistoryService {
  constructor(private readonly prisma: HistoryPrisma) {}

  private toEntry(row: WatchHistoryRow): WatchHistoryEntry {
    return {
      id: row.id,
      userId: row.userId,
      videoId: row.videoId,
      watchDuration: row.watchDuration,
      watchedAt: new Date(row.watchedAt),
    };
  }

  /** Record a watch (upsert by user+video): updates duration + timestamp. */
  async addToHistory(
    userId: string,
    videoId: string,
    watchDuration: number,
  ): Promise<WatchHistoryEntry> {
    const now = new Date();
    const row = await this.prisma.watchHistory.upsert({
      where: { userId_videoId: { userId, videoId } },
      update: { watchDuration, watchedAt: now },
      create: { userId, videoId, watchDuration, watchedAt: now },
    });
    return this.toEntry(row);
  }

  /** The user's watch history, newest-first, paginated. */
  async getHistory(
    userId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<WatchHistoryEntry>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [rows, total] = await Promise.all([
      this.prisma.watchHistory.findMany({
        where: { userId },
        orderBy: { watchedAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.watchHistory.count({ where: { userId } }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return {
      data: rows.map((r) => this.toEntry(r)),
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async clearHistory(userId: string): Promise<void> {
    await this.prisma.watchHistory.deleteMany({ where: { userId } });
  }

  async removeFromHistory(userId: string, videoId: string): Promise<void> {
    await this.prisma.watchHistory.deleteMany({ where: { userId, videoId } });
  }
}
