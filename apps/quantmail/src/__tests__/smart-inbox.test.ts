import { describe, it, expect, beforeEach } from 'vitest';
import { SmartInboxService } from '../services/smart-inbox.service';

describe('SmartInboxService', () => {
  let service: SmartInboxService;

  beforeEach(() => {
    service = new SmartInboxService();
  });

  describe('categorize', () => {
    it('should categorize social network emails as social', () => {
      const result = service.categorize({
        from: 'notifications@facebook.com',
        subject: 'You have a new friend request',
        to: 'user@example.com',
        body: 'Someone wants to be your friend',
      });

      expect(result.category).toBe('social');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.matchedRule).toBeDefined();
    });

    it('should categorize newsletters as promotions', () => {
      const result = service.categorize({
        from: 'news@store.com',
        subject: 'Weekly Newsletter - Best deals inside!',
        to: 'user@example.com',
        body: 'Check out our latest products',
      });

      expect(result.category).toBe('promotions');
    });

    it('should categorize shipping updates as updates', () => {
      const result = service.categorize({
        from: 'orders@amazon.com',
        subject: 'Shipping confirmation for your order',
        to: 'user@example.com',
        body: 'Track your package',
      });

      expect(result.category).toBe('updates');
    });

    it('should categorize mailing list emails as forums', () => {
      const result = service.categorize({
        from: 'noreply@groups.google.com',
        subject: 'New discussion in your group',
        to: 'mylist@groups.google.com',
        body: 'A new topic was posted',
      });

      expect(result.category).toBe('forums');
    });

    it('should categorize unmatched emails as primary', () => {
      const result = service.categorize({
        from: 'friend@personal.com',
        subject: 'Hey, how are you?',
        to: 'user@example.com',
        body: 'Just checking in!',
      });

      expect(result.category).toBe('primary');
      expect(result.confidence).toBe(0.5);
    });

    it('should be case-insensitive', () => {
      const result = service.categorize({
        from: 'notifications@LINKEDIN.COM',
        subject: 'New connection request',
        to: 'user@example.com',
        body: '',
      });

      expect(result.category).toBe('social');
    });
  });

  describe('addRule', () => {
    it('should add a custom rule and use it for categorization', () => {
      service.addRule({
        field: 'from',
        pattern: 'boss@company.com',
        category: 'primary',
        priority: 100,
      });

      const result = service.categorize({
        from: 'boss@company.com',
        subject: 'Important meeting',
        to: 'user@company.com',
        body: 'Please join',
      });

      expect(result.category).toBe('primary');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should return the rule with an id', () => {
      const rule = service.addRule({
        field: 'subject',
        pattern: 'urgent',
        category: 'primary',
        priority: 50,
      });

      expect(rule.id).toBeDefined();
      expect(rule.field).toBe('subject');
    });
  });

  describe('removeRule', () => {
    it('should remove an existing rule', () => {
      const rule = service.addRule({
        field: 'from',
        pattern: 'test@test.com',
        category: 'social',
        priority: 10,
      });

      const result = service.removeRule(rule.id);
      expect(result).toBe(true);
    });

    it('should return false for non-existent rule', () => {
      const result = service.removeRule('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getRules', () => {
    it('should return all rules including built-in ones', () => {
      const rules = service.getRules();
      expect(rules.length).toBeGreaterThan(0);
    });
  });

  describe('getCategoryCounts', () => {
    it('should track categorization counts', () => {
      service.categorize({ from: 'a@facebook.com', subject: 'hi', to: 'me@x.com', body: '' });
      service.categorize({ from: 'b@facebook.com', subject: 'hi', to: 'me@x.com', body: '' });
      service.categorize({ from: 'c@personal.com', subject: 'hello', to: 'me@x.com', body: '' });

      const counts = service.getCategoryCounts();
      expect(counts.social).toBe(2);
      expect(counts.primary).toBe(1);
    });
  });

  describe('trainFromUserAction', () => {
    it('should store user corrections', () => {
      service.trainFromUserAction('email-123', 'forums');
      // The correction is stored for future use
      // This verifies it doesn't throw
    });
  });
});
