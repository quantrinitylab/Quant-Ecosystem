import { describe, it, expect, beforeEach } from 'vitest';
import { SpamDetectionService } from './spam-detection';

describe('SpamDetectionService', () => {
  let service: SpamDetectionService;

  beforeEach(() => {
    service = new SpamDetectionService({
      rateWindowMs: 60_000,
      maxMessagesInWindow: 5,
      similarityThreshold: 0.8,
      maxLinksPerMessage: 3,
      newAccountWindowMs: 86_400_000,
      newAccountMaxMessages: 3,
    });
  });

  describe('rate limiting', () => {
    it('should detect rate limit violations', () => {
      const userId = 'user-1';
      const oldAccount = Date.now() - 100_000_000;

      // Record 5 messages to hit the limit
      for (let i = 0; i < 5; i++) {
        service.recordMessage(userId, `message ${i}`);
      }

      const result = service.checkContent({
        userId,
        content: 'another message',
        accountCreatedAt: oldAccount,
      });

      expect(result.verdict).not.toBe('clean');
      expect(result.signals.some((s) => s.type === 'rate_limit')).toBe(true);
    });

    it('should not flag below rate limit', () => {
      const userId = 'user-1';
      const oldAccount = Date.now() - 100_000_000;

      service.recordMessage(userId, 'hello');

      const result = service.checkContent({
        userId,
        content: 'a different message altogether',
        accountCreatedAt: oldAccount,
      });

      expect(result.signals.some((s) => s.type === 'rate_limit')).toBe(false);
    });
  });

  describe('duplicate content detection', () => {
    it('should detect duplicate/similar content', () => {
      const userId = 'user-1';
      const oldAccount = Date.now() - 100_000_000;

      service.recordMessage(userId, 'buy cheap products from our store now');

      const result = service.checkContent({
        userId,
        content: 'buy cheap products from our store now',
        accountCreatedAt: oldAccount,
      });

      expect(result.signals.some((s) => s.type === 'duplicate_content')).toBe(true);
    });

    it('should detect similar but not identical content', () => {
      const userId = 'user-1';
      const oldAccount = Date.now() - 100_000_000;

      service.recordMessage(userId, 'buy cheap products from our online store today please');

      const result = service.checkContent({
        userId,
        content: 'buy cheap products from our online store today now',
        accountCreatedAt: oldAccount,
      });

      expect(result.signals.some((s) => s.type === 'duplicate_content')).toBe(true);
    });

    it('should not flag genuinely different content', () => {
      const userId = 'user-1';
      const oldAccount = Date.now() - 100_000_000;

      service.recordMessage(userId, 'hello how are you doing');

      const result = service.checkContent({
        userId,
        content: 'the weather is great outside today',
        accountCreatedAt: oldAccount,
      });

      expect(result.signals.some((s) => s.type === 'duplicate_content')).toBe(false);
    });
  });

  describe('link spam detection', () => {
    it('should detect excessive links', () => {
      const oldAccount = Date.now() - 100_000_000;
      const content = 'Check http://a.com http://b.com http://c.com http://d.com these links';

      const result = service.checkContent({
        userId: 'user-1',
        content,
        accountCreatedAt: oldAccount,
      });

      expect(result.signals.some((s) => s.type === 'link_spam')).toBe(true);
    });

    it('should detect known bad domains', () => {
      const oldAccount = Date.now() - 100_000_000;
      service.addBadDomain('spam-site.com');

      const result = service.checkContent({
        userId: 'user-1',
        content: 'visit http://spam-site.com/free-stuff for deals',
        accountCreatedAt: oldAccount,
      });

      expect(result.signals.some((s) => s.type === 'link_spam')).toBe(true);
    });

    it('should not flag normal link usage', () => {
      const oldAccount = Date.now() - 100_000_000;

      const result = service.checkContent({
        userId: 'user-1',
        content: 'check out http://example.com for more info',
        accountCreatedAt: oldAccount,
      });

      expect(result.signals.some((s) => s.type === 'link_spam')).toBe(false);
    });
  });

  describe('new account burst', () => {
    it('should detect burst posting from new accounts', () => {
      const userId = 'user-new';
      const recentAccount = Date.now() - 3600_000; // 1 hour ago

      // Record messages to exceed threshold
      for (let i = 0; i < 3; i++) {
        service.recordMessage(userId, `message ${i} content`);
      }

      const result = service.checkContent({
        userId,
        content: 'yet another message from new account',
        accountCreatedAt: recentAccount,
      });

      expect(result.signals.some((s) => s.type === 'new_account_burst')).toBe(true);
    });

    it('should not flag established accounts', () => {
      const userId = 'user-old';
      const oldAccount = Date.now() - 100_000_000; // well past window

      for (let i = 0; i < 5; i++) {
        service.recordMessage(userId, `message ${i}`);
      }

      const result = service.checkContent({
        userId,
        content: 'normal message from established user',
        accountCreatedAt: oldAccount,
      });

      expect(result.signals.some((s) => s.type === 'new_account_burst')).toBe(false);
    });
  });

  describe('getUserSpamScore', () => {
    it('should accumulate spam score across checks', () => {
      const userId = 'spammer';
      const oldAccount = Date.now() - 100_000_000;
      service.addBadDomain('bad.com');

      service.checkContent({
        userId,
        content: 'visit http://bad.com now',
        accountCreatedAt: oldAccount,
      });

      expect(service.getUserSpamScore(userId)).toBeGreaterThan(0);
    });

    it('should return 0 for clean users', () => {
      expect(service.getUserSpamScore('clean-user')).toBe(0);
    });
  });

  describe('reset', () => {
    it('should clear user spam state', () => {
      const userId = 'user-1';
      service.recordMessage(userId, 'test');
      service.checkContent({
        userId,
        content: 'test',
        accountCreatedAt: Date.now() - 100_000_000,
      });

      service.reset(userId);
      expect(service.getUserSpamScore(userId)).toBe(0);
    });
  });

  describe('verdict determination', () => {
    it('should return clean when no signals', () => {
      const result = service.checkContent({
        userId: 'good-user',
        content: 'a perfectly normal message',
        accountCreatedAt: Date.now() - 100_000_000,
      });
      expect(result.verdict).toBe('clean');
      expect(result.signals.length).toBe(0);
    });

    it('should return spam for multiple signals', () => {
      const userId = 'spammer';
      const recentAccount = Date.now() - 3600_000;
      service.addBadDomain('evil.com');

      for (let i = 0; i < 3; i++) {
        service.recordMessage(userId, `buy from http://evil.com now ${i}`);
      }

      const result = service.checkContent({
        userId,
        content: 'buy from http://evil.com now deals',
        accountCreatedAt: recentAccount,
      });

      expect(result.verdict).toBe('spam');
    });
  });
});
