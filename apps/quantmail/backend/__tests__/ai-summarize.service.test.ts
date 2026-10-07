import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AISummarizeService } from '../services/ai-summarize.service';

function createMockAIEngine() {
  return {
    infer: vi.fn(),
  };
}

describe('AISummarizeService', () => {
  let service: AISummarizeService;
  let aiEngine: ReturnType<typeof createMockAIEngine>;

  beforeEach(() => {
    aiEngine = createMockAIEngine();
    service = new AISummarizeService(aiEngine as never);
  });

  describe('summarizeThread', () => {
    it('summarizes a multi-message thread', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          summary:
            'Team discussed Q4 budget. Marketing wants 20% increase. Finance suggested 10% compromise.',
          keyPoints: ['Budget increase requested', 'Compromise reached at 10%'],
          actionItems: ['Finance to prepare revised budget', 'Marketing to submit updated plan'],
          messageCount: 3,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 500, completionTokens: 100, totalTokens: 600, estimatedCost: 0.005 },
        latencyMs: 400,
        cached: false,
      });

      const result = await service.summarizeThread(
        [
          { from: 'marketing@co.com', subject: 'Q4 Budget', body: 'We need 20% more budget.' },
          {
            from: 'finance@co.com',
            subject: 'Re: Q4 Budget',
            body: 'That seems high. How about 10%?',
          },
          { from: 'marketing@co.com', subject: 'Re: Q4 Budget', body: 'Ok, 10% works.' },
        ],
        'user-1',
      );

      expect(result.summary).toContain('Q4 budget');
      expect(result.keyPoints).toHaveLength(2);
      expect(result.actionItems).toHaveLength(2);
      expect(result.messageCount).toBe(3);
      expect(aiEngine.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantmail',
          feature: 'email-summarize',
          userId: 'user-1',
          temperature: 0.3,
        }),
      );
    });

    it('throws error when AI returns invalid JSON', async () => {
      aiEngine.infer.mockResolvedValue({
        content: 'invalid json',
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await expect(
        service.summarizeThread([{ from: 'a@b.com', subject: 'Test', body: 'Body' }], 'user-1'),
      ).rejects.toThrow('Failed to parse AI summary response');
    });

    it('throws error when AI returns invalid schema', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({ summary: 'test', keyPoints: 'not an array' }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await expect(
        service.summarizeThread([{ from: 'a@b.com', subject: 'Test', body: 'Body' }], 'user-1'),
      ).rejects.toThrow('AI returned invalid summary result');
    });
  });

  describe('summarizeSingle', () => {
    it('summarizes a single email', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          summary: 'John is requesting project status update by Friday.',
          keyPoints: ['Status update needed', 'Deadline is Friday'],
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150, estimatedCost: 0.001 },
        latencyMs: 200,
        cached: false,
      });

      const result = await service.summarizeSingle(
        {
          from: 'john@company.com',
          subject: 'Project Status',
          body: 'Can you send me the project status update by Friday? I need it for the board meeting.',
        },
        'user-1',
      );

      expect(result.summary).toContain('status update');
      expect(result.keyPoints).toHaveLength(2);
    });
  });
});
