import { describe, it, expect, beforeEach } from 'vitest';
import { AIOutputSafetyService } from './ai-output-safety';

describe('AIOutputSafetyService', () => {
  let service: AIOutputSafetyService;

  beforeEach(() => {
    service = new AIOutputSafetyService({
      prohibitedTopics: ['bomb making', 'illegal drugs'],
    });
  });

  describe('PII detection', () => {
    it('should detect SSN patterns', () => {
      const result = service.checkOutput({
        content: 'The user SSN is 123-45-6789 and they live in NY',
      });
      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.type === 'pii_leak')).toBe(true);
    });

    it('should detect credit card patterns', () => {
      const result = service.checkOutput({
        content: 'Payment card: 4111-1111-1111-1111',
      });
      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.type === 'pii_leak')).toBe(true);
    });

    it('should detect credit card without dashes', () => {
      const result = service.checkOutput({
        content: 'Card number is 4111111111111111',
      });
      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.type === 'pii_leak')).toBe(true);
    });

    it('should detect email addresses', () => {
      const result = service.checkOutput({
        content: 'Contact them at user@example.com for more info',
      });
      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.type === 'pii_leak')).toBe(true);
    });

    it('should pass content without PII', () => {
      const result = service.checkOutput({
        content: 'This is a safe response about general knowledge',
      });
      expect(result.safe).toBe(true);
      expect(result.issues.length).toBe(0);
    });
  });

  describe('prohibited topics', () => {
    it('should detect prohibited topic keywords', () => {
      const result = service.checkOutput({
        content: 'Here are instructions for bomb making at home',
      });
      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.type === 'prohibited_topic')).toBe(true);
    });

    it('should be case insensitive for topics', () => {
      const result = service.checkOutput({
        content: 'Learn about ILLEGAL DRUGS manufacturing',
      });
      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.type === 'prohibited_topic')).toBe(true);
    });

    it('should pass content without prohibited topics', () => {
      const result = service.checkOutput({
        content: 'A helpful guide to cooking pasta',
      });
      expect(result.issues.some((i) => i.type === 'prohibited_topic')).toBe(false);
    });
  });

  describe('confidence threshold', () => {
    it('should flag low confidence output', () => {
      const result = service.checkOutput({
        content: 'The answer might be 42',
        confidence: 0.3,
      });
      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.type === 'low_confidence')).toBe(true);
    });

    it('should pass output meeting confidence threshold', () => {
      const result = service.checkOutput({
        content: 'The capital of France is Paris',
        confidence: 0.95,
      });
      expect(result.issues.some((i) => i.type === 'low_confidence')).toBe(false);
    });

    it('should not check confidence when not provided', () => {
      const result = service.checkOutput({
        content: 'A response without confidence score',
      });
      expect(result.issues.some((i) => i.type === 'low_confidence')).toBe(false);
    });
  });

  describe('AI label application', () => {
    it('should apply AI generated label to content', () => {
      const result = service.applyAILabel('Hello world');
      expect(result.content).toBe('[AI Generated] Hello world');
      expect(result.metadata.aiGenerated).toBe(true);
      expect(result.metadata.labeledAt).toBeDefined();
    });

    it('should detect labeled metadata', () => {
      const labeled = service.isLabeled({ aiGenerated: true, labeledAt: Date.now() });
      expect(labeled).toBe(true);
    });

    it('should detect unlabeled metadata', () => {
      const unlabeled = service.isLabeled({ source: 'ai' });
      expect(unlabeled).toBe(false);
    });

    it('should detect empty metadata as unlabeled', () => {
      expect(service.isLabeled({})).toBe(false);
    });
  });

  describe('multiple issues', () => {
    it('should report all issues found', () => {
      const result = service.checkOutput({
        content: 'Send to user@example.com about bomb making tips',
        confidence: 0.2,
      });
      expect(result.safe).toBe(false);
      expect(result.issues.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('custom config', () => {
    it('should use custom confidence threshold', () => {
      const strict = new AIOutputSafetyService({ minConfidenceThreshold: 0.9 });
      const result = strict.checkOutput({
        content: 'Safe content here',
        confidence: 0.85,
      });
      expect(result.issues.some((i) => i.type === 'low_confidence')).toBe(true);
    });
  });
});
