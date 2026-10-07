import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MatchService } from '../services/match.service';

function createMockPrisma() {
  return {
    match: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  };
}

describe('MatchService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: MatchService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new MatchService(prisma as never);
  });

  describe('listMatches', () => {
    it('returns the OTHER participant regardless of slot, newest-first query', async () => {
      prisma.match.findMany.mockResolvedValue([
        {
          id: 'm1',
          user1Id: 'me',
          user2Id: 'alice',
          matchedAt: new Date(),
          conversationId: 'c1',
          isActive: true,
        },
        {
          id: 'm2',
          user1Id: 'bob',
          user2Id: 'me',
          matchedAt: new Date(),
          conversationId: null,
          isActive: true,
        },
      ]);

      const out = await service.listMatches('me');

      expect(out.map((m) => [m.matchId, m.otherUserId])).toEqual([
        ['m1', 'alice'],
        ['m2', 'bob'],
      ]);
      expect(prisma.match.findMany).toHaveBeenCalledWith({
        where: { OR: [{ user1Id: 'me' }, { user2Id: 'me' }] },
        orderBy: { matchedAt: 'desc' },
      });
    });
  });

  describe('getMatch', () => {
    it('returns the match when the caller participates', async () => {
      prisma.match.findUnique.mockResolvedValue({
        id: 'm1',
        user1Id: 'me',
        user2Id: 'alice',
        matchedAt: null,
        conversationId: null,
        isActive: true,
      });
      const m = await service.getMatch('me', 'm1');
      expect(m.otherUserId).toBe('alice');
    });

    it('404 when the match is missing', async () => {
      prisma.match.findUnique.mockResolvedValue(null);
      await expect(service.getMatch('me', 'x')).rejects.toMatchObject({ code: 'MATCH_NOT_FOUND' });
    });

    it('404 (no leakage) when the caller is not a participant', async () => {
      prisma.match.findUnique.mockResolvedValue({ id: 'm1', user1Id: 'a', user2Id: 'b' });
      await expect(service.getMatch('me', 'm1')).rejects.toMatchObject({ code: 'MATCH_NOT_FOUND' });
    });

    it('404 on a blank id without querying', async () => {
      await expect(service.getMatch('me', '  ')).rejects.toMatchObject({ code: 'MATCH_NOT_FOUND' });
      expect(prisma.match.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('unmatch', () => {
    it('deletes the match when the caller participates', async () => {
      prisma.match.findUnique.mockResolvedValue({ id: 'm1', user1Id: 'me', user2Id: 'alice' });
      const res = await service.unmatch('me', 'm1');
      expect(res).toEqual({ unmatched: true });
      expect(prisma.match.deleteMany).toHaveBeenCalledWith({ where: { id: 'm1' } });
    });

    it('404 (no leakage) when the caller is not a participant; no delete', async () => {
      prisma.match.findUnique.mockResolvedValue({ id: 'm1', user1Id: 'a', user2Id: 'b' });
      await expect(service.unmatch('me', 'm1')).rejects.toMatchObject({ code: 'MATCH_NOT_FOUND' });
      expect(prisma.match.deleteMany).not.toHaveBeenCalled();
    });
  });
});
