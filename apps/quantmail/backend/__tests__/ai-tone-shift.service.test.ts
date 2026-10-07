import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIToneShiftService } from '../services/ai-tone-shift.service';

function createMockAIEngine() {
  return {
    infer: vi.fn(),
  };
}

describe('AIToneShiftService', () => {
  let service: AIToneShiftService;
  let aiEngine: ReturnType<typeof createMockAIEngine>;

  beforeEach(() => {
    aiEngine = createMockAIEngine();
    service = new AIToneShiftService(aiEngine as never);
  });

  describe('shiftTone', () => {
    it('rewrites email from casual to formal', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          rewrittenText:
            'Dear Mr. Smith,\n\nI would like to request your input on the project proposal at your earliest convenience.\n\nKind regards',
          originalTone: 'casual',
          targetTone: 'formal',
          confidence: 0.9,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 120, completionTokens: 60, totalTokens: 180, estimatedCost: 0.002 },
        latencyMs: 250,
        cached: false,
      });

      const result = await service.shiftTone(
        'Hey, can you look at this proposal when you get a chance?',
        'formal',
        'user-1',
      );

      expect(result.rewrittenText).toContain('Dear Mr. Smith');
      expect(result.targetTone).toBe('formal');
      expect(result.confidence).toBe(0.9);
      expect(aiEngine.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantmail',
          feature: 'email-tone-shift',
          temperature: 0.6,
        }),
      );
    });

    it('throws error when AI returns invalid JSON', async () => {
      aiEngine.infer.mockResolvedValue({
        content: 'not json',
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await expect(service.shiftTone('hello', 'formal', 'user-1')).rejects.toThrow(
        'Failed to parse AI tone shift response',
      );
    });

    it('throws error when AI returns invalid schema', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({ rewrittenText: 'test' }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await expect(service.shiftTone('hello', 'formal', 'user-1')).rejects.toThrow(
        'AI returned invalid tone shift result',
      );
    });
  });

  describe('detectCurrentTone', () => {
    it('detects the current tone of email text', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          tone: 'casual',
          confidence: 0.85,
          indicators: ['informal greeting', 'contractions', 'short sentences'],
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120, estimatedCost: 0.001 },
        latencyMs: 200,
        cached: false,
      });

      const result = await service.detectCurrentTone(
        'Hey! Just wanted to check in. How is everything going?',
        'user-1',
      );

      expect(result.tone).toBe('casual');
      expect(result.confidence).toBe(0.85);
      expect(result.indicators).toContain('informal greeting');
    });

    it('throws error when AI returns invalid JSON', async () => {
      aiEngine.infer.mockResolvedValue({
        content: 'invalid',
        model: 'gpt-4o',
        usage: { promptTokens: 80, completionTokens: 10, totalTokens: 90, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await expect(service.detectCurrentTone('text', 'user-1')).rejects.toThrow(
        'Failed to parse AI tone detection response',
      );
    });
  });
});
