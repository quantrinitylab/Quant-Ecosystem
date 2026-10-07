import { describe, it, expect, beforeEach } from 'vitest';
import { ContentLabelService } from './content-labels';

describe('ContentLabelService', () => {
  let service: ContentLabelService;

  beforeEach(() => {
    service = new ContentLabelService();
  });

  describe('applyLabel', () => {
    it('should apply a label to content', () => {
      const record = service.applyLabel({
        contentId: 'post-1',
        label: 'ai_generated',
        appliedBy: 'system',
      });
      expect(record.id).toMatch(/^lbl_/);
      expect(record.contentId).toBe('post-1');
      expect(record.label).toBe('ai_generated');
      expect(record.appliedBy).toBe('system');
      expect(record.appliedAt).toBeDefined();
    });

    it('should not duplicate labels', () => {
      service.applyLabel({
        contentId: 'post-1',
        label: 'sponsored',
        appliedBy: 'admin',
      });
      service.applyLabel({
        contentId: 'post-1',
        label: 'sponsored',
        appliedBy: 'admin',
      });

      const labels = service.getLabels('post-1');
      expect(labels.length).toBe(1);
    });

    it('should allow multiple different labels on same content', () => {
      service.applyLabel({
        contentId: 'post-1',
        label: 'ai_generated',
        appliedBy: 'system',
      });
      service.applyLabel({
        contentId: 'post-1',
        label: 'sponsored',
        appliedBy: 'admin',
      });

      const labels = service.getLabels('post-1');
      expect(labels.length).toBe(2);
    });
  });

  describe('removeLabel', () => {
    it('should remove a specific label', () => {
      service.applyLabel({
        contentId: 'post-1',
        label: 'mature_content',
        appliedBy: 'mod',
      });

      const removed = service.removeLabel('post-1', 'mature_content');
      expect(removed).toBe(true);
      expect(service.getLabels('post-1').length).toBe(0);
    });

    it('should return false for non-existent label', () => {
      expect(service.removeLabel('post-1', 'political')).toBe(false);
    });

    it('should only remove the specified label', () => {
      service.applyLabel({
        contentId: 'post-1',
        label: 'ai_generated',
        appliedBy: 'system',
      });
      service.applyLabel({
        contentId: 'post-1',
        label: 'sponsored',
        appliedBy: 'admin',
      });

      service.removeLabel('post-1', 'ai_generated');
      const labels = service.getLabels('post-1');
      expect(labels.length).toBe(1);
      expect(labels[0]!.label).toBe('sponsored');
    });
  });

  describe('getLabels', () => {
    it('should return empty array for unlabeled content', () => {
      expect(service.getLabels('unknown')).toEqual([]);
    });

    it('should return all labels for content', () => {
      service.applyLabel({
        contentId: 'post-1',
        label: 'political',
        appliedBy: 'system',
      });
      service.applyLabel({
        contentId: 'post-1',
        label: 'sensitive_topic',
        appliedBy: 'mod',
      });

      const labels = service.getLabels('post-1');
      expect(labels.length).toBe(2);
      expect(labels.map((l) => l.label)).toContain('political');
      expect(labels.map((l) => l.label)).toContain('sensitive_topic');
    });
  });

  describe('shouldWarn', () => {
    it('should warn for mature content', () => {
      service.applyLabel({
        contentId: 'post-1',
        label: 'mature_content',
        appliedBy: 'mod',
      });

      const result = service.shouldWarn('post-1');
      expect(result.warn).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]!.requiresInterstitial).toBe(true);
    });

    it('should warn for graphic violence', () => {
      service.applyLabel({
        contentId: 'post-1',
        label: 'graphic_violence',
        appliedBy: 'mod',
      });

      const result = service.shouldWarn('post-1');
      expect(result.warn).toBe(true);
    });

    it('should not warn for non-interstitial labels', () => {
      service.applyLabel({
        contentId: 'post-1',
        label: 'ai_generated',
        appliedBy: 'system',
      });

      const result = service.shouldWarn('post-1');
      expect(result.warn).toBe(false);
      expect(result.warnings.length).toBe(0);
    });

    it('should not warn for unlabeled content', () => {
      const result = service.shouldWarn('unknown');
      expect(result.warn).toBe(false);
    });

    it('should return multiple warnings when applicable', () => {
      service.applyLabel({
        contentId: 'post-1',
        label: 'mature_content',
        appliedBy: 'mod',
      });
      service.applyLabel({
        contentId: 'post-1',
        label: 'graphic_violence',
        appliedBy: 'mod',
      });

      const result = service.shouldWarn('post-1');
      expect(result.warn).toBe(true);
      expect(result.warnings.length).toBe(2);
    });
  });

  describe('hasLabel', () => {
    it('should return true when label exists', () => {
      service.applyLabel({
        contentId: 'post-1',
        label: 'sponsored',
        appliedBy: 'admin',
      });
      expect(service.hasLabel('post-1', 'sponsored')).toBe(true);
    });

    it('should return false when label does not exist', () => {
      expect(service.hasLabel('post-1', 'political')).toBe(false);
    });

    it('should return false for wrong content ID', () => {
      service.applyLabel({
        contentId: 'post-1',
        label: 'sponsored',
        appliedBy: 'admin',
      });
      expect(service.hasLabel('post-2', 'sponsored')).toBe(false);
    });
  });

  describe('custom warning configs', () => {
    it('should use custom warning configurations', () => {
      const custom = new ContentLabelService({
        warningConfigs: [
          {
            label: 'political',
            requiresInterstitial: true,
            warningMessage: 'This content is political.',
          },
        ],
      });

      custom.applyLabel({
        contentId: 'post-1',
        label: 'political',
        appliedBy: 'system',
      });

      const result = custom.shouldWarn('post-1');
      expect(result.warn).toBe(true);
      expect(result.warnings[0]!.warningMessage).toBe('This content is political.');
    });
  });
});
