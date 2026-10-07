import { describe, it, expect } from 'vitest';
import { CrossAppHostService } from '../services/cross-app-host.service.js';
import type { AppContext, ContextAdapter, HostingConfig } from '../types.js';

describe('CrossAppHostService', () => {
  function createService() {
    return new CrossAppHostService({
      defaultContext: 'fullscreen',
    });
  }

  describe('getHostingConfig', () => {
    it('should return chat_embed constraints', () => {
      const service = createService();
      const config = service.getHostingConfig('chat_embed');

      expect(config.maxWidth).toBe(320);
      expect(config.maxHeight).toBe(240);
      expect(config.interactionModel).toBe('tap');
      expect(config.audioEnabled).toBe(false);
      expect(config.overlayMode).toBe(true);
    });

    it('should return feed_embed constraints', () => {
      const service = createService();
      const config = service.getHostingConfig('feed_embed');

      expect(config.maxWidth).toBe(480);
      expect(config.maxHeight).toBe(360);
      expect(config.interactionModel).toBe('swipe');
      expect(config.autoplay).toBe(true);
    });

    it('should return fullscreen constraints', () => {
      const service = createService();
      const config = service.getHostingConfig('fullscreen');

      expect(config.maxWidth).toBe(1920);
      expect(config.maxHeight).toBe(1080);
      expect(config.interactionModel).toBe('full');
      expect(config.audioEnabled).toBe(true);
      expect(config.videoEnabled).toBe(true);
    });

    it('should return meeting_icebreaker constraints', () => {
      const service = createService();
      const config = service.getHostingConfig('meeting_icebreaker');

      expect(config.interactionModel).toBe('turn_based');
      expect(config.audioEnabled).toBe(true);
      expect(config.overlayMode).toBe(true);
    });

    it('should return random_match constraints', () => {
      const service = createService();
      const config = service.getHostingConfig('random_match');

      expect(config.interactionModel).toBe('split_screen');
      expect(config.autoplay).toBe(true);
    });

    it('should throw for unknown context', () => {
      const service = createService();

      expect(() => service.getHostingConfig('unknown' as AppContext)).toThrow(
        'Unknown app context',
      );
    });
  });

  describe('adaptGame', () => {
    it('should use default config when no adapter registered', () => {
      const service = createService();
      const config = service.adaptGame('trivia', 'chat_embed');

      expect(config.appContext).toBe('chat_embed');
      expect(config.maxWidth).toBe(320);
    });

    it('should use custom adapter when registered', () => {
      const service = createService();
      const customAdapter: ContextAdapter = {
        appContext: 'chat_embed',
        adapt(_gameId: string): HostingConfig {
          return {
            appContext: 'chat_embed',
            maxWidth: 200,
            maxHeight: 150,
            interactionModel: 'tap',
            audioEnabled: false,
            videoEnabled: false,
            overlayMode: true,
            autoplay: false,
          };
        },
      };

      service.registerContextAdapter('chat_embed', customAdapter);
      const config = service.adaptGame('trivia', 'chat_embed');

      expect(config.maxWidth).toBe(200);
      expect(config.maxHeight).toBe(150);
    });
  });

  describe('getAvailableContexts', () => {
    it('should return all contexts when no capabilities registered', () => {
      const service = createService();
      const contexts = service.getAvailableContexts('trivia');

      expect(contexts).toContain('chat_embed');
      expect(contexts).toContain('feed_embed');
      expect(contexts).toContain('fullscreen');
      expect(contexts).toContain('meeting_icebreaker');
      expect(contexts).toContain('random_match');
      expect(contexts).toHaveLength(5);
    });

    it('should return only supported contexts when game capabilities are registered', () => {
      const service = createService();
      service.registerGameContexts('chess', ['fullscreen', 'meeting_icebreaker']);

      const contexts = service.getAvailableContexts('chess');
      expect(contexts).toHaveLength(2);
      expect(contexts).toContain('fullscreen');
      expect(contexts).toContain('meeting_icebreaker');
      expect(contexts).not.toContain('chat_embed');
    });

    it('should return different contexts for different games', () => {
      const service = createService();
      service.registerGameContexts('chess', ['fullscreen', 'meeting_icebreaker']);
      service.registerGameContexts('trivia', ['chat_embed', 'feed_embed', 'fullscreen']);

      const chessContexts = service.getAvailableContexts('chess');
      const triviaContexts = service.getAvailableContexts('trivia');

      expect(chessContexts).toHaveLength(2);
      expect(triviaContexts).toHaveLength(3);
      expect(triviaContexts).toContain('chat_embed');
    });
  });
});
