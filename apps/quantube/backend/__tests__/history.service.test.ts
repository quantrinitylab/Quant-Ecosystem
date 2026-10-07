import { describe, it, expect, beforeEach } from 'vitest';
import { HistoryService, type HistoryPrisma } from '../services/history.service';

interface Row {
  id: string;
  userId: string;
  videoId: string;
  watchDuration: number;
  watchedAt: Date;
}

function createFakePrisma() {
  const rows: Row[] = [];
  let n = 0;
  const prisma: HistoryPrisma & { rows: Row[] } = {
    rows,
    watchHistory: {
      async upsert({ where, update, create }) {
        const { userId, videoId } = where.userId_videoId;
        const existing = rows.find((r) => r.userId === userId && r.videoId === videoId);
        if (existing) {
          existing.watchDuration = Number(update['watchDuration']);
          existing.watchedAt = update['watchedAt'] as Date;
          return existing;
        }
        n += 1;
        const row: Row = {
          id: `h-${n}`,
          userId: String(create['userId']),
          videoId: String(create['videoId']),
          watchDuration: Number(create['watchDuration']),
          watchedAt: create['watchedAt'] as Date,
        };
        rows.push(row);
        return row;
      },
      async findMany({ where, skip = 0, take = 20 }) {
        const filtered = rows
          .filter((r) => r.userId === where['userId'])
          .sort((a, b) => b.watchedAt.getTime() - a.watchedAt.getTime());
        return filtered.slice(skip, skip + take);
      },
      async count({ where }) {
        return rows.filter((r) => r.userId === where['userId']).length;
      },
      async deleteMany({ where }) {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          const r = rows[i]!;
          if (
            r.userId === where['userId'] &&
            (where['videoId'] === undefined || r.videoId === where['videoId'])
          ) {
            rows.splice(i, 1);
          }
        }
        return { count: before - rows.length };
      },
    },
  };
  return prisma;
}

describe('HistoryService (Prisma-backed)', () => {
  let prisma: ReturnType<typeof createFakePrisma>;
  let service: HistoryService;

  beforeEach(() => {
    prisma = createFakePrisma();
    service = new HistoryService(prisma as never);
  });

  it('adds a watch entry', async () => {
    const entry = await service.addToHistory('u1', 'v1', 120);
    expect(entry.userId).toBe('u1');
    expect(entry.videoId).toBe('v1');
    expect(entry.watchDuration).toBe(120);
    expect(prisma.rows).toHaveLength(1);
  });

  it('upserts (updates duration) on re-watch of the same video', async () => {
    await service.addToHistory('u1', 'v1', 60);
    await service.addToHistory('u1', 'v1', 200);
    expect(prisma.rows).toHaveLength(1);
    expect(prisma.rows[0]!.watchDuration).toBe(200);
  });

  it('returns paginated history newest-first', async () => {
    await service.addToHistory('u1', 'v1', 10);
    await new Promise((r) => setTimeout(r, 2));
    await service.addToHistory('u1', 'v2', 20);
    const result = await service.getHistory('u1', { page: 1, pageSize: 10 });
    expect(result.total).toBe(2);
    expect(result.data[0]!.videoId).toBe('v2'); // newest first
  });

  it('scopes history to the requesting user', async () => {
    await service.addToHistory('u1', 'v1', 10);
    await service.addToHistory('u2', 'v2', 10);
    const result = await service.getHistory('u1');
    expect(result.total).toBe(1);
    expect(result.data[0]!.videoId).toBe('v1');
  });

  it('clears a user history', async () => {
    await service.addToHistory('u1', 'v1', 10);
    await service.addToHistory('u1', 'v2', 10);
    await service.clearHistory('u1');
    expect((await service.getHistory('u1')).total).toBe(0);
  });

  it('removes a single video from history', async () => {
    await service.addToHistory('u1', 'v1', 10);
    await service.addToHistory('u1', 'v2', 10);
    await service.removeFromHistory('u1', 'v1');
    const result = await service.getHistory('u1');
    expect(result.total).toBe(1);
    expect(result.data[0]!.videoId).toBe('v2');
  });
});
