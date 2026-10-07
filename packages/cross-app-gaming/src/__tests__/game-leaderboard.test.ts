import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GameLeaderboardService,
  LeaderboardValidationError,
  type GameScoreRow,
} from '../services/game-leaderboard.service.js';

function createMockPrisma() {
  const rows: GameScoreRow[] = [];
  let n = 0;
  return {
    _rows: rows,
    gameScore: {
      create: vi.fn(async ({ data }: any) => {
        const row: GameScoreRow = {
          id: `gs-${++n}`,
          gameId: data.gameId,
          userId: data.userId,
          app: data.app,
          score: data.score,
          displayName: data.displayName ?? null,
          region: data.region ?? null,
        };
        rows.push(row);
        return { ...row };
      }),
      findMany: vi.fn(async ({ where }: any) => {
        let out = rows.filter((r) => r.gameId === where.gameId);
        if (where.app) out = out.filter((r) => r.app === where.app);
        // emulate orderBy score desc
        return [...out].sort((a, b) => b.score - a.score);
      }),
    },
  };
}

describe('GameLeaderboardService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: GameLeaderboardService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new GameLeaderboardService(prisma as never);
  });

  describe('submitScore', () => {
    it('appends an app-tagged score row', async () => {
      const res = await service.submitScore({
        gameId: 'uno',
        userId: 'u1',
        app: 'quantchat',
        score: 42,
      });
      expect(res.id).toBe('gs-1');
      expect(prisma.gameScore.create).toHaveBeenCalledWith({
        data: {
          gameId: 'uno',
          userId: 'u1',
          app: 'quantchat',
          score: 42,
          displayName: null,
          region: null,
        },
      });
    });

    it('rejects a non-integer score', async () => {
      await expect(
        service.submitScore({ gameId: 'uno', userId: 'u1', app: 'quantchat', score: 1.5 }),
      ).rejects.toBeInstanceOf(LeaderboardValidationError);
    });

    it('rejects missing gameId/app/userId', async () => {
      await expect(
        service.submitScore({ gameId: '', userId: 'u1', app: 'quantchat', score: 1 }),
      ).rejects.toMatchObject({ code: 'INVALID_GAME' });
      await expect(
        service.submitScore({ gameId: 'uno', userId: 'u1', app: '', score: 1 }),
      ).rejects.toMatchObject({ code: 'INVALID_APP' });
      await expect(
        service.submitScore({ gameId: 'uno', userId: '', app: 'quantchat', score: 1 }),
      ).rejects.toMatchObject({ code: 'INVALID_USER' });
    });
  });

  describe('getLeaderboard', () => {
    it('ranks players by their best score ACROSS apps by default', async () => {
      await service.submitScore({ gameId: 'uno', userId: 'u1', app: 'quantchat', score: 10 });
      await service.submitScore({ gameId: 'uno', userId: 'u1', app: 'quantneon', score: 30 }); // u1 best=30 (cross-app)
      await service.submitScore({ gameId: 'uno', userId: 'u2', app: 'quantchat', score: 20 });

      const board = await service.getLeaderboard('uno');

      expect(board.map((e) => [e.userId, e.bestScore, e.rank])).toEqual([
        ['u1', 30, 1],
        ['u2', 20, 2],
      ]);
    });

    it('can scope to a single app', async () => {
      await service.submitScore({ gameId: 'uno', userId: 'u1', app: 'quantneon', score: 30 });
      await service.submitScore({ gameId: 'uno', userId: 'u2', app: 'quantchat', score: 20 });

      const board = await service.getLeaderboard('uno', { app: 'quantchat' });

      expect(board.map((e) => e.userId)).toEqual(['u2']);
    });

    it('respects the limit (clamped)', async () => {
      await service.submitScore({ gameId: 'g', userId: 'a', app: 'quantchat', score: 5 });
      await service.submitScore({ gameId: 'g', userId: 'b', app: 'quantchat', score: 9 });
      await service.submitScore({ gameId: 'g', userId: 'c', app: 'quantchat', score: 7 });

      const board = await service.getLeaderboard('g', { limit: 2 });
      expect(board.map((e) => e.userId)).toEqual(['b', 'c']);
    });
  });

  describe('getUserRank', () => {
    it('returns the user best score + cross-app rank, or null', async () => {
      await service.submitScore({ gameId: 'g', userId: 'a', app: 'quantchat', score: 5 });
      await service.submitScore({ gameId: 'g', userId: 'b', app: 'quantneon', score: 9 });

      expect(await service.getUserRank('g', 'a')).toEqual({ rank: 2, bestScore: 5 });
      expect(await service.getUserRank('g', 'ghost')).toBeNull();
    });
  });
});
