import { describe, it, expect } from 'vitest';
import { UniversalLeaderboardService } from '../services/universal-leaderboard.service.js';

describe('UniversalLeaderboardService', () => {
  function createService() {
    return new UniversalLeaderboardService({
      maxScoreThreshold: 1000000,
      minScoreThreshold: -1000,
    });
  }

  describe('submitScore', () => {
    it('should submit a score and return an entry', () => {
      const service = createService();
      const entry = service.submitScore('trivia', 'player-1', 500, 'chat_embed');

      expect(entry.playerId).toBe('player-1');
      expect(entry.score).toBe(500);
      expect(entry.rank).toBe(1);
    });

    it('should rank scores in descending order', () => {
      const service = createService();
      service.submitScore('trivia', 'player-1', 300, 'chat_embed');
      service.submitScore('trivia', 'player-2', 500, 'chat_embed');
      service.submitScore('trivia', 'player-3', 100, 'chat_embed');

      const leaderboard = service.getLeaderboard('trivia', 'global');
      expect(leaderboard[0]!.playerId).toBe('player-2');
      expect(leaderboard[0]!.rank).toBe(1);
      expect(leaderboard[1]!.playerId).toBe('player-1');
      expect(leaderboard[1]!.rank).toBe(2);
      expect(leaderboard[2]!.playerId).toBe('player-3');
      expect(leaderboard[2]!.rank).toBe(3);
    });

    it('should store the region on a score entry', () => {
      const service = createService();
      const entry = service.submitScore('trivia', 'p1', 100, 'chat_embed', undefined, 'us-east');

      expect(entry.region).toBe('us-east');
    });
  });

  describe('getLeaderboard', () => {
    it('should return global leaderboard sorted by score', () => {
      const service = createService();
      service.submitScore('trivia', 'p1', 100, 'chat_embed');
      service.submitScore('trivia', 'p2', 200, 'fullscreen');
      service.submitScore('trivia', 'p3', 150, 'chat_embed');

      const lb = service.getLeaderboard('trivia', 'global');
      expect(lb).toHaveLength(3);
      expect(lb[0]!.score).toBe(200);
      expect(lb[1]!.score).toBe(150);
      expect(lb[2]!.score).toBe(100);
    });

    it('should filter by app_context scope', () => {
      const service = createService();
      service.submitScore('trivia', 'p1', 100, 'chat_embed');
      service.submitScore('trivia', 'p2', 200, 'fullscreen');
      service.submitScore('trivia', 'p3', 150, 'chat_embed');

      const lb = service.getLeaderboard('trivia', 'app_context', {
        appContext: 'chat_embed',
      });
      expect(lb).toHaveLength(2);
      expect(lb.every((e) => e.appContext === 'chat_embed')).toBe(true);
    });

    it('should filter by regional scope matching region', () => {
      const service = createService();
      service.submitScore('trivia', 'p1', 100, 'chat_embed', undefined, 'us-east');
      service.submitScore('trivia', 'p2', 200, 'chat_embed', undefined, 'eu-west');
      service.submitScore('trivia', 'p3', 150, 'chat_embed', undefined, 'us-east');
      service.submitScore('trivia', 'p4', 300, 'chat_embed', undefined, 'ap-south');

      const lb = service.getLeaderboard('trivia', 'regional', { region: 'us-east' });
      expect(lb).toHaveLength(2);
      expect(lb.every((e) => e.region === 'us-east')).toBe(true);
      expect(lb[0]!.playerId).toBe('p3');
      expect(lb[1]!.playerId).toBe('p1');
    });

    it('should return empty for regional scope with no matching region', () => {
      const service = createService();
      service.submitScore('trivia', 'p1', 100, 'chat_embed', undefined, 'us-east');

      const lb = service.getLeaderboard('trivia', 'regional', { region: 'ap-south' });
      expect(lb).toHaveLength(0);
    });

    it('should return entries without region when region option is undefined', () => {
      const service = createService();
      service.submitScore('trivia', 'p1', 100, 'chat_embed', undefined, 'us-east');
      service.submitScore('trivia', 'p2', 200, 'chat_embed');

      // When region is undefined, filter e.region === undefined matches entries without a region
      const lb = service.getLeaderboard('trivia', 'regional', { region: undefined });
      expect(lb).toHaveLength(1);
      expect(lb[0]!.playerId).toBe('p2');
    });

    it('should respect limit and offset', () => {
      const service = createService();
      for (let i = 0; i < 10; i++) {
        service.submitScore('trivia', `p${i}`, (i + 1) * 10, 'chat_embed');
      }

      const lb = service.getLeaderboard('trivia', 'global', { limit: 3, offset: 2 });
      expect(lb).toHaveLength(3);
      expect(lb[0]!.rank).toBe(3);
    });
  });

  describe('getPlayerRank', () => {
    it('should return correct rank', () => {
      const service = createService();
      service.submitScore('trivia', 'p1', 100, 'chat_embed');
      service.submitScore('trivia', 'p2', 300, 'chat_embed');
      service.submitScore('trivia', 'p3', 200, 'chat_embed');

      expect(service.getPlayerRank('trivia', 'p2')).toBe(1);
      expect(service.getPlayerRank('trivia', 'p3')).toBe(2);
      expect(service.getPlayerRank('trivia', 'p1')).toBe(3);
    });

    it('should return null for unknown player', () => {
      const service = createService();
      expect(service.getPlayerRank('trivia', 'unknown')).toBeNull();
    });
  });

  describe('achievements', () => {
    it('should unlock an achievement', () => {
      const service = createService();
      const achievement = service.unlockAchievement('p1', 'first_win', 'trivia');

      expect(achievement.id).toBe('first_win');
      expect(achievement.gameId).toBe('trivia');
    });

    it('should be idempotent - same achievement returned on duplicate unlock', () => {
      const service = createService();
      const first = service.unlockAchievement('p1', 'first_win', 'trivia');
      const second = service.unlockAchievement('p1', 'first_win', 'trivia');

      expect(first).toBe(second);
      expect(service.getAchievements('p1')).toHaveLength(1);
    });

    it('should return all achievements for a player', () => {
      const service = createService();
      service.unlockAchievement('p1', 'first_win', 'trivia');
      service.unlockAchievement('p1', 'streak_5', 'trivia');

      expect(service.getAchievements('p1')).toHaveLength(2);
    });

    it('should return empty array for player with no achievements', () => {
      const service = createService();
      expect(service.getAchievements('p1')).toEqual([]);
    });
  });

  describe('getFriendComparison', () => {
    it('should return scores for player and friends', () => {
      const service = createService();
      service.submitScore('trivia', 'p1', 100, 'chat_embed');
      service.submitScore('trivia', 'p2', 200, 'chat_embed');
      service.submitScore('trivia', 'p3', 300, 'chat_embed');
      service.submitScore('trivia', 'p4', 400, 'chat_embed');

      const comparison = service.getFriendComparison('trivia', 'p1', ['p2', 'p3']);
      expect(comparison).toHaveLength(3);
      expect(comparison[0]!.playerId).toBe('p3');
      expect(comparison[0]!.rank).toBe(1);
    });
  });

  describe('anti-cheat validation', () => {
    it('should reject scores exceeding max threshold', () => {
      const service = createService();

      expect(() => service.submitScore('trivia', 'cheater', 9999999, 'chat_embed')).toThrow(
        'Anti-cheat violation: score exceeds maximum threshold',
      );
    });

    it('should reject scores below min threshold', () => {
      const service = createService();

      expect(() => service.submitScore('trivia', 'cheater', -5000, 'chat_embed')).toThrow(
        'Anti-cheat violation: score below minimum threshold',
      );
    });

    it('should record violations', () => {
      const service = createService();

      try {
        service.submitScore('trivia', 'cheater', 9999999, 'chat_embed');
      } catch {
        // expected
      }

      const violations = service.getViolations('cheater');
      expect(violations).toHaveLength(1);
      expect(violations[0]!.reason).toContain('exceeds maximum threshold');
    });
  });
});
