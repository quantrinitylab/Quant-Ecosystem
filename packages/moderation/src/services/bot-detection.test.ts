import { describe, it, expect, beforeEach } from 'vitest';
import { BotDetectionService } from './bot-detection';

describe('BotDetectionService', () => {
  let service: BotDetectionService;

  beforeEach(() => {
    service = new BotDetectionService({
      postingFrequencyThreshold: 30,
      repetitionThreshold: 0.7,
      followerRatioThreshold: 10,
      ageActivityThreshold: 50,
    });
  });

  describe('classification boundaries', () => {
    it('should classify normal users as human', () => {
      const result = service.checkAccount({
        userId: 'normal-user',
        postsPerHour: 5,
        uniqueContentRatio: 0.9,
        followerCount: 100,
        followingCount: 150,
        accountAgeDays: 365,
        totalPosts: 500,
      });
      expect(result.classification).toBe('human');
      expect(result.score).toBeLessThanOrEqual(20);
    });

    it('should classify obvious bots as bot', () => {
      const result = service.checkAccount({
        userId: 'bot-user',
        postsPerHour: 200,
        uniqueContentRatio: 0.05,
        followerCount: 1,
        followingCount: 5000,
        accountAgeDays: 2,
        totalPosts: 10000,
        likesWithoutReads: 90,
      });
      expect(result.classification).toBe('bot');
      expect(result.score).toBeGreaterThan(80);
    });

    it('should classify borderline accounts as suspicious', () => {
      const result = service.checkAccount({
        userId: 'sus-user',
        postsPerHour: 35,
        uniqueContentRatio: 0.5,
        followerCount: 50,
        followingCount: 200,
        accountAgeDays: 30,
        totalPosts: 300,
      });
      expect(['suspicious', 'likely_bot', 'likely_human']).toContain(result.classification);
    });
  });

  describe('superhuman posting rate signal', () => {
    it('should flag excessive posting', () => {
      const result = service.checkAccount({
        userId: 'fast-poster',
        postsPerHour: 100,
        uniqueContentRatio: 0.9,
        followerCount: 100,
        followingCount: 100,
        accountAgeDays: 365,
        totalPosts: 500,
      });
      expect(result.signals.some((s) => s.type === 'superhuman_posting')).toBe(true);
    });

    it('should not flag normal posting rate', () => {
      const result = service.checkAccount({
        userId: 'normal-poster',
        postsPerHour: 10,
        uniqueContentRatio: 0.9,
        followerCount: 100,
        followingCount: 100,
        accountAgeDays: 365,
        totalPosts: 500,
      });
      expect(result.signals.some((s) => s.type === 'superhuman_posting')).toBe(false);
    });
  });

  describe('content repetition signal', () => {
    it('should flag high content repetition', () => {
      const result = service.checkAccount({
        userId: 'repeater',
        postsPerHour: 5,
        uniqueContentRatio: 0.1, // 90% repetition
        followerCount: 100,
        followingCount: 100,
        accountAgeDays: 365,
        totalPosts: 500,
      });
      expect(result.signals.some((s) => s.type === 'content_repetition')).toBe(true);
    });

    it('should not flag diverse content', () => {
      const result = service.checkAccount({
        userId: 'diverse',
        postsPerHour: 5,
        uniqueContentRatio: 0.85,
        followerCount: 100,
        followingCount: 100,
        accountAgeDays: 365,
        totalPosts: 500,
      });
      expect(result.signals.some((s) => s.type === 'content_repetition')).toBe(false);
    });
  });

  describe('follower ratio signal', () => {
    it('should flag abnormal following/follower ratio', () => {
      const result = service.checkAccount({
        userId: 'mass-follower',
        postsPerHour: 5,
        uniqueContentRatio: 0.9,
        followerCount: 5,
        followingCount: 5000,
        accountAgeDays: 365,
        totalPosts: 100,
      });
      expect(result.signals.some((s) => s.type === 'abnormal_follower_ratio')).toBe(true);
    });

    it('should not flag balanced ratios', () => {
      const result = service.checkAccount({
        userId: 'balanced',
        postsPerHour: 5,
        uniqueContentRatio: 0.9,
        followerCount: 200,
        followingCount: 150,
        accountAgeDays: 365,
        totalPosts: 100,
      });
      expect(result.signals.some((s) => s.type === 'abnormal_follower_ratio')).toBe(false);
    });
  });

  describe('age vs activity signal', () => {
    it('should flag young accounts with very high activity', () => {
      const result = service.checkAccount({
        userId: 'young-active',
        postsPerHour: 10,
        uniqueContentRatio: 0.9,
        followerCount: 50,
        followingCount: 50,
        accountAgeDays: 3,
        totalPosts: 500,
      });
      expect(result.signals.some((s) => s.type === 'high_activity_young_account')).toBe(true);
    });

    it('should not flag established accounts with high activity', () => {
      const result = service.checkAccount({
        userId: 'veteran',
        postsPerHour: 10,
        uniqueContentRatio: 0.9,
        followerCount: 1000,
        followingCount: 500,
        accountAgeDays: 730,
        totalPosts: 5000,
      });
      expect(result.signals.some((s) => s.type === 'high_activity_young_account')).toBe(false);
    });
  });

  describe('likes without reads signal', () => {
    it('should flag likes without reads pattern', () => {
      const result = service.checkAccount({
        userId: 'blind-liker',
        postsPerHour: 5,
        uniqueContentRatio: 0.9,
        followerCount: 100,
        followingCount: 100,
        accountAgeDays: 365,
        totalPosts: 500,
        likesWithoutReads: 80,
      });
      expect(result.signals.some((s) => s.type === 'likes_without_reads')).toBe(true);
    });

    it('should not flag when likes without reads is low', () => {
      const result = service.checkAccount({
        userId: 'careful-liker',
        postsPerHour: 5,
        uniqueContentRatio: 0.9,
        followerCount: 100,
        followingCount: 100,
        accountAgeDays: 365,
        totalPosts: 500,
        likesWithoutReads: 10,
      });
      expect(result.signals.some((s) => s.type === 'likes_without_reads')).toBe(false);
    });
  });

  describe('score calculation', () => {
    it('should return 0 for accounts with no signals', () => {
      const result = service.checkAccount({
        userId: 'clean',
        postsPerHour: 1,
        uniqueContentRatio: 0.95,
        followerCount: 500,
        followingCount: 200,
        accountAgeDays: 1000,
        totalPosts: 2000,
      });
      expect(result.score).toBe(0);
      expect(result.signals.length).toBe(0);
    });

    it('should include checked timestamp', () => {
      const before = Date.now();
      const result = service.checkAccount({
        userId: 'user',
        postsPerHour: 1,
        uniqueContentRatio: 0.9,
        followerCount: 100,
        followingCount: 100,
        accountAgeDays: 365,
        totalPosts: 100,
      });
      expect(result.checkedAt).toBeGreaterThanOrEqual(before);
    });
  });
});
