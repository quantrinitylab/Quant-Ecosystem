import { describe, it, expect, beforeEach } from 'vitest';
import { TokenCounter } from '../core/token-counter';
import type { AIModelConfig, ConversationMessage } from '../types';

const mockModel: AIModelConfig = {
  id: 'gpt-4o',
  name: 'GPT-4o',
  provider: 'openai',
  capabilities: ['text_generation'],
  maxContextLength: 128000,
  maxOutputTokens: 4096,
  costPerInputToken: 0.000005,
  costPerOutputToken: 0.000015,
  latencyMs: 400,
  qualityScore: 0.95,
};

describe('TokenCounter', () => {
  let counter: TokenCounter;

  beforeEach(() => {
    counter = new TokenCounter();
  });

  describe('countText', () => {
    it('returns 0 for empty text', () => {
      expect(counter.countText('')).toBe(0);
    });

    it('counts tokens for simple text', () => {
      const count = counter.countText('Hello world');
      expect(count).toBeGreaterThan(0);
    });

    it('returns higher count for longer text', () => {
      const short = counter.countText('Hello');
      const long = counter.countText('This is a much longer sentence with many more words in it');
      expect(long).toBeGreaterThan(short);
    });
  });

  describe('countMessages', () => {
    it('returns 0 for empty messages', () => {
      expect(counter.countMessages([])).toBe(0);
    });

    it('counts tokens across messages with overhead', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ];
      const count = counter.countMessages(messages);
      expect(count).toBeGreaterThan(counter.countText('Hello') + counter.countText('Hi there'));
    });
  });

  describe('countWithContext', () => {
    it('includes system prompt overhead', () => {
      const withSystem = counter.countWithContext('You are helpful', [], 'Hello');
      const withoutSystem = counter.countWithContext(undefined, [], 'Hello');
      expect(withSystem).toBeGreaterThan(withoutSystem);
    });

    it('counts full context window', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' },
      ];
      const count = counter.countWithContext('System prompt', messages, 'New question');
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('estimateCost', () => {
    it('calculates cost based on token counts', () => {
      const cost = counter.estimateCost(1000, 500, mockModel);
      expect(cost).toBe(1000 * 0.000005 + 500 * 0.000015);
    });

    it('returns 0 for 0 tokens', () => {
      expect(counter.estimateCost(0, 0, mockModel)).toBe(0);
    });
  });

  describe('checkWithinLimit', () => {
    it('returns true when within limit', () => {
      expect(counter.checkWithinLimit(1000, mockModel)).toBe(true);
    });

    it('returns false when exceeding limit', () => {
      expect(counter.checkWithinLimit(200000, mockModel)).toBe(false);
    });

    it('accounts for reserved output tokens', () => {
      const smallModel: AIModelConfig = {
        ...mockModel,
        maxContextLength: 1000,
      };
      expect(counter.checkWithinLimit(500, smallModel, 600)).toBe(false);
      expect(counter.checkWithinLimit(300, smallModel, 600)).toBe(true);
    });
  });

  describe('calculateUsage', () => {
    it('returns complete usage result', () => {
      const result = counter.calculateUsage('Hello world prompt', 'Response text', mockModel);
      expect(result.promptTokens).toBeGreaterThan(0);
      expect(result.completionTokens).toBeGreaterThan(0);
      expect(result.totalTokens).toBe(result.promptTokens + result.completionTokens);
      expect(result.estimatedCost).toBeGreaterThan(0);
      expect(result.withinLimit).toBe(true);
    });
  });

  describe('truncateToContext', () => {
    it('returns all messages when within limit', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ];
      const result = counter.truncateToContext(messages, 10000);
      expect(result).toHaveLength(2);
    });

    it('truncates from the beginning when exceeding limit', () => {
      const messages: ConversationMessage[] = [];
      for (let i = 0; i < 100; i++) {
        messages.push({
          role: 'user',
          content: `Message ${i} with some content that takes up tokens`,
        });
      }
      const result = counter.truncateToContext(messages, 100);
      expect(result.length).toBeLessThan(messages.length);
      expect(result.length).toBeGreaterThan(0);
    });

    it('preserves most recent messages', () => {
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'First very long message with lots of content' },
        { role: 'assistant', content: 'First long response with lots of content too' },
        { role: 'user', content: 'Last short msg' },
      ];
      const result = counter.truncateToContext(messages, 20);
      expect(result[result.length - 1]?.content).toBe('Last short msg');
    });
  });
});
