import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LeaderboardService } from '../services/leaderboard.service';

function createMockPrisma() {
  return {
    gameScore: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  };
}

describe('LeaderboardService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: LeaderboardService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new LeaderboardService(prisma as never);
  });

  describe('submitScore', () => {
    it('persists a score event tagged with the app', async () => {
      prisma.gameScore.create.mockResolvedValue({ id: 's1' });
      const res = await service.submitScore({
        gameId: 'tic-tac-toe',
        userId: 'u1',
        app: 'quantneon',
        score: 42,
      });
      expect(res).toEqual({ id: 's1' });
      expect(prisma.gameScore.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          gameId: 'tic-tac-toe',
          userId: 'u1',
          app: 'quantneon',
          score: 42,
        }),
      });
    });

    it('rejects a non-integer score', async () => {
      await expect(
        service.submitScore({ gameId: 'g', userId: 'u', app: 'quantneon', score: 1.5 }),
      ).rejects.toMatchObject({ code: 'INVALID_SCORE' });
      expect(prisma.gameScore.create).not.toHaveBeenCalled();
    });
  });

  describe('getLeaderboard', () => {
    it('reduces to each user best score, ranks desc, cross-app', async () => {
      // score-desc rows spanning multiple apps + repeated users
      prisma.gameScore.findMany.mockResolvedValue([
        { userId: 'u2', score: 90, app: 'quantchat', displayName: 'Bob', region: null },
        { userId: 'u1', score: 80, app: 'quantneon', displayName: 'Alice', region: 'IN' },
        { userId: 'u1', score: 50, app: 'quantneon', displayName: 'Alice', region: 'IN' }, // older/lower, ignored
        { userId: 'u3', score: 30, app: 'quantmax', displayName: 'Cara', region: null },
      ]);

      const board = await service.getLeaderboard('tic-tac-toe', { limit: 10 });

      expect(board.map((e) => [e.rank, e.userId, e.bestScore])).toEqual([
        [1, 'u2', 90],
        [2, 'u1', 80],
        [3, 'u3', 30],
      ]);
      // cross-app query: no app filter in where
      expect(prisma.gameScore.findMany).toHaveBeenCalledWith({
        where: { gameId: 'tic-tac-toe' },
        orderBy: { score: 'desc' },
      });
    });

    it('scopes to a single app when given', async () => {
      prisma.gameScore.findMany.mockResolvedValue([]);
      await service.getLeaderboard('uno', { app: 'quantneon' });
      expect(prisma.gameScore.findMany).toHaveBeenCalledWith({
        where: { gameId: 'uno', app: 'quantneon' },
        orderBy: { score: 'desc' },
      });
    });

    it('honors the limit', async () => {
      prisma.gameScore.findMany.mockResolvedValue([
        { userId: 'a', score: 5, app: 'x' },
        { userId: 'b', score: 4, app: 'x' },
        { userId: 'c', score: 3, app: 'x' },
      ]);
      const board = await service.getLeaderboard('g', { limit: 2 });
      expect(board.map((e) => e.userId)).toEqual(['a', 'b']);
    });
  });

  describe('getUserRank', () => {
    it('returns the caller rank + best score', async () => {
      prisma.gameScore.findMany.mockResolvedValue([
        { userId: 'u2', score: 90, app: 'x' },
        { userId: 'u1', score: 80, app: 'x' },
      ]);
      expect(await service.getUserRank('g', 'u1')).toEqual({ rank: 2, bestScore: 80 });
    });

    it('returns null when the user has no score', async () => {
      prisma.gameScore.findMany.mockResolvedValue([{ userId: 'u2', score: 90, app: 'x' }]);
      expect(await service.getUserRank('g', 'nobody')).toBeNull();
    });
  });
});
