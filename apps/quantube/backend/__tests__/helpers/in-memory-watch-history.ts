// ============================================================================
// Test helper — in-memory WatchHistory Prisma double
//
// HistoryService (backend/services/history.service.ts) is Prisma-backed and
// talks to a `watchHistory` delegate (upsert / findMany / count / deleteMany).
// The history seam + pagination tests swap `app.prisma` for an in-memory double;
// this provides the watchHistory half with the exact semantics HistoryService
// relies on (upsert by userId+videoId, watchedAt-desc ordering, skip/take
// pagination, per-user count/clear). Kept in ONE place so both test files share
// identical, faithful behavior.
// ============================================================================

interface Row {
  id: string;
  userId: string;
  videoId: string;
  watchDuration: number;
  watchedAt: Date;
}

export interface WatchHistoryDouble {
  upsert(args: {
    where: { userId_videoId: { userId: string; videoId: string } };
    update: Record<string, unknown>;
    create: Record<string, unknown>;
  }): Promise<Row>;
  findMany(args: {
    where: Record<string, unknown>;
    orderBy?: Record<string, unknown>;
    skip?: number;
    take?: number;
  }): Promise<Row[]>;
  count(args: { where: Record<string, unknown> }): Promise<number>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
}

/** Build a fresh in-memory `watchHistory` delegate (one backing store per call). */
export function createWatchHistoryDouble(): WatchHistoryDouble {
  const rows = new Map<string, Row>(); // key: `${userId}::${videoId}` (insertion-ordered)
  let seq = 0;
  const key = (userId: string, videoId: string): string => `${userId}::${videoId}`;

  return {
    async upsert({ where, update, create }) {
      const { userId, videoId } = where.userId_videoId;
      const k = key(userId, videoId);
      const existing = rows.get(k);
      if (existing) {
        existing.watchDuration = (update['watchDuration'] as number) ?? existing.watchDuration;
        existing.watchedAt = (update['watchedAt'] as Date) ?? existing.watchedAt;
        return { ...existing };
      }
      const row: Row = {
        id: `wh_${++seq}`,
        userId: (create['userId'] as string) ?? userId,
        videoId: (create['videoId'] as string) ?? videoId,
        watchDuration: (create['watchDuration'] as number) ?? 0,
        watchedAt: (create['watchedAt'] as Date) ?? new Date(),
      };
      rows.set(k, row);
      return { ...row };
    },

    async findMany({ where, orderBy, skip = 0, take }) {
      let list = [...rows.values()].filter((r) => r.userId === where['userId']);
      if ((orderBy as { watchedAt?: string } | undefined)?.watchedAt === 'desc') {
        // Stable sort → equal timestamps keep insertion order (deterministic).
        list = list.sort((a, b) => b.watchedAt.getTime() - a.watchedAt.getTime());
      }
      const end = take === undefined ? undefined : skip + take;
      return list.slice(skip, end).map((r) => ({ ...r }));
    },

    async count({ where }) {
      return [...rows.values()].filter((r) => r.userId === where['userId']).length;
    },

    async deleteMany({ where }) {
      let count = 0;
      for (const [k, r] of rows) {
        const userMatch = r.userId === where['userId'];
        const videoMatch = where['videoId'] === undefined || r.videoId === where['videoId'];
        if (userMatch && videoMatch) {
          rows.delete(k);
          count++;
        }
      }
      return { count };
    },
  };
}
