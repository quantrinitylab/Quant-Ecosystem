import { describe, it, expect, beforeEach } from 'vitest';
import { ArcadeMatchmakingService } from '../services/arcade-matchmaking.service';

describe('ArcadeMatchmakingService', () => {
  let service: ArcadeMatchmakingService;

  beforeEach(() => {
    service = new ArcadeMatchmakingService();
  });

  describe('Wager Matches', () => {
    it('creates wager match and checks escrow', () => {
      const match = service.createWagerMatch('p1', 'p2', 'game1', 50, 100, 100);
      expect(match.totalEscrow).toBe(100);
      expect(match.status).toBe('STAKED');
    });

    it('throws on insufficient balance', () => {
      expect(() => {
        service.createWagerMatch('p1', 'p2', 'game1', 50, 40, 100);
      }).toThrow('Insufficient balance');
    });

    it('resolves match with winner taking 90% and 10% fee', () => {
      const match = service.createWagerMatch('p1', 'p2', 'game1', 50, 100, 100);
      const resolved = service.resolveWagerMatch(match.id, 'p1');
      expect(resolved.status).toBe('COMPLETED');
      expect(resolved.platformFee).toBe(10);
      expect(resolved.winnerPayout).toBe(90);
      expect(resolved.winnerPlayerId).toBe('p1');
    });

    it('resolves match as draw, 100% refund', () => {
      const match = service.createWagerMatch('p1', 'p2', 'game1', 50, 100, 100);
      const resolved = service.resolveWagerMatch(match.id, 'DRAW');
      expect(resolved.status).toBe('REFUNDED');
      expect(resolved.platformFee).toBe(0);
      expect(resolved.winnerPayout).toBe(50);
      expect(resolved.winnerPlayerId).toBe('DRAW');
    });
  });

  describe('Tournament Brackets', () => {
    it('creates bracket for 4 players', () => {
      const players = ['p1', 'p2', 'p3', 'p4'];
      const bracket = service.createTournamentBracket('Tourney', 'game1', players);
      expect(bracket.totalRounds).toBe(2);
      expect(bracket.matches).toHaveLength(3);
      expect(bracket.matches[0].player1Id).toBe('p1');
      expect(bracket.matches[0].player2Id).toBe('p2');
    });

    it('creates bracket for 8 players', () => {
      const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
      const bracket = service.createTournamentBracket('Tourney', 'game1', players);
      expect(bracket.totalRounds).toBe(3);
      expect(bracket.matches).toHaveLength(7);
      expect(bracket.matches[0].round).toBe('QUARTER_FINALS');
    });

    it('advances winner through rounds to champion', () => {
      const players = ['p1', 'p2', 'p3', 'p4'];
      const bracket = service.createTournamentBracket('Tourney', 'game1', players);

      const m1 = bracket.matches.find((m) => m.player1Id === 'p1' && m.player2Id === 'p2')!;
      const m2 = bracket.matches.find((m) => m.player1Id === 'p3' && m.player2Id === 'p4')!;

      service.advanceTournamentMatch(bracket.id, m1.matchId, 'p1');
      service.advanceTournamentMatch(bracket.id, m2.matchId, 'p3');

      const finals = bracket.matches.find((m) => m.round === 'FINALS')!;
      expect(finals.player1Id).toBe('p1');
      expect(finals.player2Id).toBe('p3');

      service.advanceTournamentMatch(bracket.id, finals.matchId, 'p1');
      expect(bracket.status).toBe('COMPLETED');
      expect(bracket.championUserId).toBe('p1');
    });
  });

  describe('Leaderboards', () => {
    it('sorts descending and ranks properly', () => {
      service.recordGameScore('u1', 'g1', 100);
      service.recordGameScore('u2', 'g1', 300);
      service.recordGameScore('u3', 'g1', 200);

      const board = service.getLeaderboard('g1', 'all_time');
      expect(board).toHaveLength(3);
      expect(board[0].userId).toBe('u2');
      expect(board[0].rank).toBe(1);
      expect(board[1].userId).toBe('u3');
      expect(board[1].rank).toBe(2);
      expect(board[2].userId).toBe('u1');
      expect(board[2].rank).toBe(3);
    });
  });
});
