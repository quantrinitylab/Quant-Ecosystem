import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIGrammarService } from '../services/ai-grammar.service';

function createMockAI() {
  return {
    infer: vi.fn(),
  };
}

describe('AIGrammarService', () => {
  let service: AIGrammarService;
  let ai: ReturnType<typeof createMockAI>;

  beforeEach(() => {
    ai = createMockAI();
    service = new AIGrammarService(ai as never);
  });

  describe('checkGrammar', () => {
    it('detects errors in text and returns corrections', async () => {
      ai.infer.mockResolvedValue({
        id: 'resp-1',
        content: JSON.stringify({
          corrections: [
            {
              original: 'teh',
              corrected: 'the',
              explanation: 'Spelling error: "teh" should be "the"',
              position: { start: 0, end: 3 },
            },
            {
              original: 'their is',
              corrected: 'there is',
              explanation: 'Wrong homophone: "their" should be "there"',
              position: { start: 15, end: 23 },
            },
          ],
          overallScore: 60,
        }),
        model: 'gpt-4',
        finishReason: 'stop',
        usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120, estimatedCost: 0.008 },
        latencyMs: 400,
        cached: false,
      });

      const result = await service.checkGrammar('teh quick brown their is a fox', 'user-1');

      expect(result.corrections).toHaveLength(2);
      expect(result.corrections[0]!.original).toBe('teh');
      expect(result.corrections[0]!.corrected).toBe('the');
      expect(result.corrections[0]!.position.start).toBe(0);
      expect(result.corrections[0]!.position.end).toBe(3);
      expect(result.overallScore).toBe(60);
      expect(ai.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantdocs',
          feature: 'ai-grammar',
          userId: 'user-1',
        }),
      );
    });

    it('handles clean text with no errors', async () => {
      ai.infer.mockResolvedValue({
        id: 'resp-2',
        content: JSON.stringify({
          corrections: [],
          overallScore: 100,
        }),
        model: 'gpt-4',
        finishReason: 'stop',
        usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60, estimatedCost: 0.003 },
        latencyMs: 200,
        cached: false,
      });

      const result = await service.checkGrammar(
        'The quick brown fox jumps over the lazy dog.',
        'user-1',
      );

      expect(result.corrections).toHaveLength(0);
      expect(result.overallScore).toBe(100);
    });

    it('throws on invalid JSON response', async () => {
      ai.infer.mockResolvedValue({
        id: 'resp-3',
        content: 'invalid json',
        model: 'gpt-4',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, estimatedCost: 0.001 },
        latencyMs: 100,
        cached: false,
      });

      await expect(service.checkGrammar('text', 'user-1')).rejects.toThrow(
        'Failed to parse AI grammar response',
      );
    });
  });
});
