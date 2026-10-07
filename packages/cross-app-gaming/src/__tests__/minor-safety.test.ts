import { describe, it, expect } from 'vitest';
import { MinorSafetyService } from '../services/minor-safety.service.js';
import type { MinorSafetyServiceConfig } from '../types.js';

describe('MinorSafetyService', () => {
  function createService(): MinorSafetyService {
    const config: MinorSafetyServiceConfig = {
      safetyConfigs: {
        under13: {
          blockRealMoney: true,
          restrictVoiceChat: true,
          restrictVideoChat: true,
          textFilteringEnabled: true,
          parentalVisibility: true,
          maxPlayTimeMinutes: 60,
        },
        teen: {
          blockRealMoney: true,
          restrictVoiceChat: false,
          restrictVideoChat: true,
          textFilteringEnabled: true,
          parentalVisibility: true,
        },
        adult: {
          blockRealMoney: false,
          restrictVoiceChat: false,
          restrictVideoChat: false,
          textFilteringEnabled: false,
          parentalVisibility: false,
        },
      },
    };
    return new MinorSafetyService(config);
  }

  describe('checkGameAccess', () => {
    it('should allow access to everyone-rated games for all age groups', () => {
      const service = createService();
      service.registerGame({
        gameId: 'trivia',
        contentRating: 'everyone',
        supportedContexts: ['chat_embed', 'fullscreen'],
      });

      expect(service.checkGameAccess('player-1', 'trivia', 'under13')).toBe(true);
      expect(service.checkGameAccess('player-2', 'trivia', 'teen')).toBe(true);
      expect(service.checkGameAccess('player-3', 'trivia', 'adult')).toBe(true);
    });

    it('should block teen-rated games for under13', () => {
      const service = createService();
      service.registerGame({
        gameId: 'battle-royale',
        contentRating: 'teen',
        supportedContexts: ['fullscreen'],
      });

      expect(service.checkGameAccess('child-1', 'battle-royale', 'under13')).toBe(false);
      expect(service.checkGameAccess('teen-1', 'battle-royale', 'teen')).toBe(true);
      expect(service.checkGameAccess('adult-1', 'battle-royale', 'adult')).toBe(true);
    });

    it('should block mature-rated games for under13 and teens', () => {
      const service = createService();
      service.registerGame({
        gameId: 'poker',
        contentRating: 'mature',
        supportedContexts: ['fullscreen'],
      });

      expect(service.checkGameAccess('child-1', 'poker', 'under13')).toBe(false);
      expect(service.checkGameAccess('teen-1', 'poker', 'teen')).toBe(false);
      expect(service.checkGameAccess('adult-1', 'poker', 'adult')).toBe(true);
    });

    it('should allow access to unregistered games (no rating info)', () => {
      const service = createService();

      expect(service.checkGameAccess('player-1', 'unknown-game', 'under13')).toBe(true);
      expect(service.checkGameAccess('player-2', 'unknown-game', 'teen')).toBe(true);
      expect(service.checkGameAccess('player-3', 'unknown-game', 'adult')).toBe(true);
    });
  });

  describe('getCommunicationLimits', () => {
    it('should block voice and video for under13', () => {
      const service = createService();
      const limits = service.getCommunicationLimits('under13');

      expect(limits.voiceChat).toBe(false);
      expect(limits.videoChat).toBe(false);
      expect(limits.textChat).toBe(true);
      expect(limits.textFiltering).toBe(true);
      expect(limits.canChatWithStrangers).toBe(false);
    });

    it('should restrict video but allow voice for teens', () => {
      const service = createService();
      const limits = service.getCommunicationLimits('teen');

      expect(limits.voiceChat).toBe(true);
      expect(limits.videoChat).toBe(false);
      expect(limits.textChat).toBe(true);
      expect(limits.textFiltering).toBe(true);
      expect(limits.canChatWithStrangers).toBe(true);
    });

    it('should have no restrictions for adults', () => {
      const service = createService();
      const limits = service.getCommunicationLimits('adult');

      expect(limits.voiceChat).toBe(true);
      expect(limits.videoChat).toBe(true);
      expect(limits.textChat).toBe(true);
      expect(limits.textFiltering).toBe(false);
      expect(limits.canChatWithStrangers).toBe(true);
    });
  });

  describe('validatePurchase', () => {
    it('should block real-money purchases for under13', () => {
      const service = createService();

      expect(() => service.validatePurchase('child-1', 'under13', 9.99)).toThrow(
        'Real-money purchases are blocked for this age group',
      );
    });

    it('should block real-money purchases for teens', () => {
      const service = createService();

      expect(() => service.validatePurchase('teen-1', 'teen', 4.99)).toThrow(
        'Real-money purchases are blocked for this age group',
      );
    });

    it('should allow purchases for adults', () => {
      const service = createService();
      const result = service.validatePurchase('adult-1', 'adult', 19.99);

      expect(result).toBe(true);
    });
  });

  describe('getParentalVisibility', () => {
    it('should return gaming activity for a child', () => {
      const service = createService();
      service.recordActivity('child-1', {
        gameId: 'trivia',
        sessionId: 'session-1',
        startedAt: new Date(),
        duration: 30,
        appContext: 'chat_embed',
      });

      const activity = service.getParentalVisibility('parent-1', 'child-1');
      expect(activity).toHaveLength(1);
      expect(activity[0]!.gameId).toBe('trivia');
      expect(activity[0]!.duration).toBe(30);
    });

    it('should return empty array for child with no activity', () => {
      const service = createService();
      const activity = service.getParentalVisibility('parent-1', 'child-no-activity');
      expect(activity).toEqual([]);
    });
  });

  describe('flagInappropriateContent', () => {
    it('should record content flags', () => {
      const service = createService();
      service.flagInappropriateContent('session-1', 'reporter-1', 'offensive_language');

      const flags = service.getContentFlags('session-1');
      expect(flags).toHaveLength(1);
      expect(flags[0]!.contentType).toBe('offensive_language');
      expect(flags[0]!.reporterId).toBe('reporter-1');
    });

    it('should support multiple flags for different sessions', () => {
      const service = createService();
      service.flagInappropriateContent('session-1', 'reporter-1', 'offensive_language');
      service.flagInappropriateContent('session-2', 'reporter-2', 'harassment');

      const allFlags = service.getContentFlags();
      expect(allFlags).toHaveLength(2);
    });
  });
});
