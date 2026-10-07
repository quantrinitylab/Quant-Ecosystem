import { describe, it, expect, beforeEach } from 'vitest';
import { AntiSpamFilter } from './anti-spam';
import type { SpamInput, TrainingSample } from './anti-spam';

describe('AntiSpamFilter', () => {
  let filter: AntiSpamFilter;

  beforeEach(() => {
    filter = new AntiSpamFilter();
  });

  describe('classify', () => {
    it('should classify known spam content as spam', () => {
      // Train with some spam samples first
      const spamSamples: TrainingSample[] = [
        { content: 'Buy now click here free money guaranteed winner', isSpam: true },
        { content: 'Limited time offer act now discount order now', isSpam: true },
        { content: 'Congratulations you have won click here to claim', isSpam: true },
        { content: 'Free free free buy now no obligation guaranteed', isSpam: true },
        { content: 'Urgent act now limited time winner no risk', isSpam: true },
      ];
      const hamSamples: TrainingSample[] = [
        { content: 'Hi team please review the pull request when you have time', isSpam: false },
        { content: 'The meeting is scheduled for tomorrow at three pm', isSpam: false },
        { content: 'Thanks for your help with the project documentation', isSpam: false },
        { content: 'Can we discuss the architecture decision this afternoon', isSpam: false },
        { content: 'Here are the meeting notes from yesterday session', isSpam: false },
      ];
      filter.train([...spamSamples, ...hamSamples]);

      const spamInput: SpamInput = {
        content:
          'BUY NOW!!! CLICK HERE for FREE MONEY! Act now, limited time offer! GUARANTEED WINNER!',
        metadata: {
          linkCount: 5,
          capsRatio: 0.7,
          senderReputation: 0.1,
          recipientCount: 100,
          hasAttachments: false,
        },
      };

      const result = filter.classify(spamInput);
      expect(result.isSpam).toBe(true);
      expect(result.score).toBeGreaterThan(0.5);
      expect(result.features.length).toBeGreaterThan(0);
    });

    it('should classify normal message as ham', () => {
      const hamSamples: TrainingSample[] = [
        { content: 'Meeting notes from the team sync discussion today', isSpam: false },
        { content: 'Please review the documentation changes I made', isSpam: false },
        { content: 'The quarterly report is ready for your review', isSpam: false },
      ];
      const spamSamples: TrainingSample[] = [
        { content: 'Buy now free money click here winner guaranteed', isSpam: true },
        { content: 'Act now limited time discount no obligation', isSpam: true },
      ];
      filter.train([...hamSamples, ...spamSamples]);

      const normalInput: SpamInput = {
        content: 'Hi, can we schedule a meeting to discuss the project timeline?',
        metadata: {
          linkCount: 0,
          capsRatio: 0.02,
          senderReputation: 0.9,
          recipientCount: 1,
          hasAttachments: false,
        },
      };

      const result = filter.classify(normalInput);
      expect(result.isSpam).toBe(false);
      expect(result.score).toBeLessThan(0.5);
    });

    it('should return features with the result', () => {
      const input: SpamInput = {
        content: 'Hello world',
        metadata: {
          linkCount: 0,
          capsRatio: 0,
          senderReputation: 0.8,
          recipientCount: 1,
          hasAttachments: false,
        },
      };

      const result = filter.classify(input);
      expect(result.features).toBeDefined();
      expect(result.features.length).toBeGreaterThan(0);
      expect(result.features[0]).toHaveProperty('name');
      expect(result.features[0]).toHaveProperty('value');
      expect(result.features[0]).toHaveProperty('weight');
    });
  });

  describe('train', () => {
    it('should improve classification after training', () => {
      // Before training, classify with no prior data
      const input: SpamInput = {
        content: 'buy now free money click here winner',
        metadata: {
          linkCount: 3,
          capsRatio: 0.5,
          senderReputation: 0.2,
          recipientCount: 50,
          hasAttachments: false,
        },
      };

      // After training with spam samples
      const samples: TrainingSample[] = [
        { content: 'buy now free money click here', isSpam: true },
        { content: 'winner guaranteed no obligation free', isSpam: true },
        { content: 'act now limited time offer discount', isSpam: true },
        { content: 'hello how are you doing today', isSpam: false },
        { content: 'meeting tomorrow at the office', isSpam: false },
        { content: 'project status update for this week', isSpam: false },
      ];

      const trainResult = filter.train(samples);
      expect(trainResult.totalTrained).toBe(6);

      const result = filter.classify(input);
      expect(result.isSpam).toBe(true);
    });

    it('should return training count', () => {
      const result = filter.train([
        { content: 'test', isSpam: true },
        { content: 'test2', isSpam: false },
      ]);
      expect(result.totalTrained).toBe(2);
    });
  });

  describe('getStats', () => {
    it('should track classification statistics', () => {
      filter.train([
        { content: 'spam words buy now free click', isSpam: true },
        { content: 'normal meeting project', isSpam: false },
      ]);

      filter.classify({
        content: 'buy now free',
        metadata: {
          linkCount: 5,
          capsRatio: 0.8,
          senderReputation: 0.1,
          recipientCount: 100,
          hasAttachments: false,
        },
      });
      filter.classify({
        content: 'hello friend meeting',
        metadata: {
          linkCount: 0,
          capsRatio: 0,
          senderReputation: 0.9,
          recipientCount: 1,
          hasAttachments: false,
        },
      });

      const stats = filter.getStats();
      expect(stats.totalClassified).toBe(2);
      expect(stats.spamCount + stats.hamCount).toBe(2);
    });
  });

  describe('whitelist/blacklist', () => {
    it('should add sender to whitelist', () => {
      filter.addToWhitelist('trusted@example.com');
      expect(filter.isWhitelisted('trusted@example.com')).toBe(true);
      expect(filter.isBlacklisted('trusted@example.com')).toBe(false);
    });

    it('should add sender to blacklist', () => {
      filter.addToBlacklist('spammer@evil.com');
      expect(filter.isBlacklisted('spammer@evil.com')).toBe(true);
      expect(filter.isWhitelisted('spammer@evil.com')).toBe(false);
    });

    it('should remove from blacklist when added to whitelist', () => {
      filter.addToBlacklist('user@example.com');
      filter.addToWhitelist('user@example.com');
      expect(filter.isWhitelisted('user@example.com')).toBe(true);
      expect(filter.isBlacklisted('user@example.com')).toBe(false);
    });

    it('whitelisted sender should immediately return isSpam: false', () => {
      filter.addToWhitelist('trusted@example.com');
      // Train with spam to ensure it would normally be detected as spam
      filter.train([
        { content: 'buy now free money click here', isSpam: true },
        { content: 'normal hello meeting', isSpam: false },
      ]);
      const result = filter.classify({
        content: 'BUY NOW FREE MONEY CLICK HERE!!!',
        sender: 'trusted@example.com',
        metadata: {
          linkCount: 10,
          capsRatio: 0.9,
          senderReputation: 0.0,
          recipientCount: 100,
          hasAttachments: false,
        },
      });
      expect(result.isSpam).toBe(false);
      expect(result.confidence).toBe(1);
      expect(result.score).toBe(0);
    });

    it('blacklisted sender should immediately return isSpam: true', () => {
      filter.addToBlacklist('spammer@evil.com');
      const result = filter.classify({
        content: 'Hi, can we meet tomorrow?',
        sender: 'spammer@evil.com',
        metadata: {
          linkCount: 0,
          capsRatio: 0,
          senderReputation: 0.99,
          recipientCount: 1,
          hasAttachments: false,
        },
      });
      expect(result.isSpam).toBe(true);
      expect(result.confidence).toBe(1);
      expect(result.score).toBe(1);
    });

    it('should still classify normally if sender is not in whitelist or blacklist', () => {
      filter.addToWhitelist('other@example.com');
      filter.addToBlacklist('otherspam@evil.com');
      const result = filter.classify({
        content: 'Hello world',
        sender: 'unknown@example.com',
        metadata: {
          linkCount: 0,
          capsRatio: 0,
          senderReputation: 0.8,
          recipientCount: 1,
          hasAttachments: false,
        },
      });
      // Should go through normal classification pipeline
      expect(result.features.length).toBeGreaterThan(1);
    });
  });
});
