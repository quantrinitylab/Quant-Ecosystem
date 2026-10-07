import { describe, it, expect } from 'vitest';
import {
  determineAction,
  DEFAULT_CLASSIFIER_THRESHOLDS,
  type ClassifierThresholds,
} from './classifier-thresholds';
import type { CategoryScore } from '../types';

function makeCategory(score: number, detected: boolean): CategoryScore {
  return { category: 'hate_speech', score, confidence: 0.9, detected };
}

describe('classifier-thresholds', () => {
  describe('DEFAULT_CLASSIFIER_THRESHOLDS', () => {
    it('has expected default values', () => {
      expect(DEFAULT_CLASSIFIER_THRESHOLDS.removeThreshold).toBe(0.9);
      expect(DEFAULT_CLASSIFIER_THRESHOLDS.flagThreshold).toBe(0.7);
      expect(DEFAULT_CLASSIFIER_THRESHOLDS.restrictThreshold).toBe(0.5);
    });
  });

  describe('determineAction', () => {
    it('returns approve when no categories are detected', () => {
      const categories = [makeCategory(0.1, false)];
      expect(determineAction(categories)).toBe('approve');
    });

    it('returns remove for scores >= 0.9', () => {
      const categories = [makeCategory(0.95, true)];
      expect(determineAction(categories)).toBe('remove');
    });

    it('returns flag for scores >= 0.7 and < 0.9', () => {
      const categories = [makeCategory(0.75, true)];
      expect(determineAction(categories)).toBe('flag');
    });

    it('returns restrict for scores >= 0.5 and < 0.7', () => {
      const categories = [makeCategory(0.55, true)];
      expect(determineAction(categories)).toBe('restrict');
    });

    it('returns warn for detected scores < 0.5', () => {
      const categories = [makeCategory(0.4, true)];
      expect(determineAction(categories)).toBe('warn');
    });

    it('uses custom thresholds when provided', () => {
      const custom: ClassifierThresholds = {
        removeThreshold: 0.95,
        flagThreshold: 0.8,
        restrictThreshold: 0.6,
      };
      // A score of 0.75 would be 'flag' with defaults (>= 0.7) but 'restrict' with custom (>= 0.6, < 0.8)
      const categories = [makeCategory(0.75, true)];
      expect(determineAction(categories, custom)).toBe('restrict');
    });

    it('uses highest score among detected categories', () => {
      const categories = [
        makeCategory(0.6, true),
        makeCategory(0.92, true),
        makeCategory(0.3, true),
      ];
      expect(determineAction(categories)).toBe('remove');
    });
  });
});
