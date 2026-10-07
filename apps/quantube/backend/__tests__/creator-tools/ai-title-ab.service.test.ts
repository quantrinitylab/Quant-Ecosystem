import { describe, it, expect, beforeEach } from 'vitest';
import { AITitleABService } from '../../services/creator-tools/ai-title-ab.service';

describe('AITitleABService', () => {
  let service: AITitleABService;

  beforeEach(() => {
    service = new AITitleABService();
  });

  describe('generateTitles', () => {
    it('generates exactly 10 titles by default', async () => {
      const titles = await service.generateTitles({
        videoId: 'video-1',
        description: 'Machine Learning',
      });

      expect(titles).toHaveLength(10);
    });

    it('all titles are non-empty strings', async () => {
      const titles = await service.generateTitles({
        videoId: 'video-1',
        description: 'TypeScript',
      });

      for (const title of titles) {
        expect(title.length).toBeGreaterThan(0);
      }
    });

    it('incorporates keywords when provided', async () => {
      const titles = await service.generateTitles({
        videoId: 'video-1',
        description: 'Programming',
        keywords: ['React', 'TypeScript'],
      });

      const hasKeywords = titles.some((t) => t.includes('React') || t.includes('TypeScript'));
      expect(hasKeywords).toBe(true);
    });

    it('rejects empty videoId', async () => {
      await expect(service.generateTitles({ videoId: '', description: 'Test' })).rejects.toThrow();
    });

    it('rejects empty description', async () => {
      await expect(
        service.generateTitles({ videoId: 'video-1', description: '' }),
      ).rejects.toThrow();
    });
  });

  describe('A/B testing flow', () => {
    it('starts a test and tracks impressions and clicks', async () => {
      const test = await service.startABTest({
        videoId: 'video-1',
        titles: ['Title A', 'Title B'],
      });

      expect(test.id).toBeDefined();
      expect(test.variants).toHaveLength(2);
      expect(test.status).toBe('running');

      await service.recordImpression(test.id, 0);
      await service.recordImpression(test.id, 0);
      await service.recordClick(test.id, 0);

      const results = await service.getABTestResults(test.id);
      expect(results[0]!.impressions).toBe(2);
      expect(results[0]!.clicks).toBe(1);
      expect(results[0]!.ctr).toBe(0.5);
    });

    it('recordImpression throws for invalid testId', async () => {
      await expect(service.recordImpression('nonexistent', 0)).rejects.toThrow(
        'A/B test not found',
      );
    });

    it('recordClick throws for invalid testId', async () => {
      await expect(service.recordClick('nonexistent', 0)).rejects.toThrow('A/B test not found');
    });

    it('throws for out-of-range title index on impression', async () => {
      const test = await service.startABTest({
        videoId: 'video-1',
        titles: ['Title A', 'Title B'],
      });

      await expect(service.recordImpression(test.id, 5)).rejects.toThrow('out of range');
    });

    it('throws for out-of-range title index on click', async () => {
      const test = await service.startABTest({
        videoId: 'video-1',
        titles: ['Title A', 'Title B'],
      });

      await expect(service.recordClick(test.id, 5)).rejects.toThrow('out of range');
    });
  });

  describe('pickWinner', () => {
    it('returns title with highest CTR', async () => {
      const test = await service.startABTest({
        videoId: 'video-1',
        titles: ['Low CTR', 'High CTR', 'Medium CTR'],
      });

      // Give all variants minimum impressions
      for (let i = 0; i < 20; i++) {
        await service.recordImpression(test.id, 0);
        await service.recordImpression(test.id, 1);
        await service.recordImpression(test.id, 2);
      }

      // Title B gets the most clicks relative to impressions
      await service.recordClick(test.id, 0); // 1/20 = 5%
      for (let i = 0; i < 10; i++) {
        await service.recordClick(test.id, 1); // 10/20 = 50%
      }
      for (let i = 0; i < 5; i++) {
        await service.recordClick(test.id, 2); // 5/20 = 25%
      }

      const winner = await service.pickWinner(test.id);
      expect(winner).toBe('High CTR');
    });

    it('rejects when no variants have enough impressions', async () => {
      const test = await service.startABTest({
        videoId: 'video-1',
        titles: ['Title A', 'Title B'],
      });

      // Only a few impressions (below minimum threshold of 10)
      await service.recordImpression(test.id, 0);
      await service.recordClick(test.id, 0);

      await expect(service.pickWinner(test.id)).rejects.toThrow(
        'No variants have enough impressions',
      );
    });

    it('throws for non-existent test', async () => {
      await expect(service.pickWinner('nonexistent')).rejects.toThrow('A/B test not found');
    });
  });

  describe('getABTestResults', () => {
    it('returns results for all variants', async () => {
      const test = await service.startABTest({
        videoId: 'video-1',
        titles: ['A', 'B', 'C'],
      });

      const results = await service.getABTestResults(test.id);

      expect(results).toHaveLength(3);
      for (const r of results) {
        expect(r).toHaveProperty('title');
        expect(r).toHaveProperty('impressions');
        expect(r).toHaveProperty('clicks');
        expect(r).toHaveProperty('ctr');
      }
    });
  });
});
