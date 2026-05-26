import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AICodeReviewService } from '../services/ai-code-review.service';

function createMockAIEngine() {
  return {
    infer: vi.fn(),
  };
}

describe('AICodeReviewService', () => {
  let service: AICodeReviewService;
  let aiEngine: ReturnType<typeof createMockAIEngine>;

  beforeEach(() => {
    aiEngine = createMockAIEngine();
    service = new AICodeReviewService(aiEngine as never);
  });

  describe('reviewDiff', () => {
    it('generates review findings from a diff', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          findings: [
            {
              filePath: 'src/auth.ts',
              line: 42,
              severity: 'critical',
              message: 'Password stored in plain text',
              suggestedFix: 'Use bcrypt to hash the password before storing',
            },
            {
              filePath: 'src/utils.ts',
              line: 10,
              severity: 'suggestion',
              message: 'Consider using a constant for the magic number',
            },
          ],
          summary: 'Found a critical security issue and a minor suggestion',
          score: 45,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350, estimatedCost: 0.005 },
        latencyMs: 500,
        cached: false,
      });

      const result = await service.reviewDiff(
        {
          diff: '+const password = input;\n+db.store(password);',
          prTitle: 'Add user auth',
          language: 'typescript',
        },
        'user-1',
      );

      expect(result.findings).toHaveLength(2);
      expect(result.findings[0]!.severity).toBe('critical');
      expect(result.findings[0]!.filePath).toBe('src/auth.ts');
      expect(result.findings[0]!.line).toBe(42);
      expect(result.findings[0]!.suggestedFix).toContain('bcrypt');
      expect(result.summary).toContain('critical security issue');
      expect(result.score).toBe(45);
    });

    it('calls AIEngine.infer with correct parameters', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          findings: [],
          summary: 'Clean code',
          score: 95,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150, estimatedCost: 0.001 },
        latencyMs: 200,
        cached: false,
      });

      await service.reviewDiff({ diff: '+console.log("test")' }, 'user-2');

      expect(aiEngine.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantmail',
          feature: 'code-review',
          userId: 'user-2',
          temperature: 0.3,
        }),
      );
    });

    it('throws on invalid JSON from AI', async () => {
      aiEngine.infer.mockResolvedValue({
        content: 'not json',
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 100,
        cached: false,
      });

      await expect(service.reviewDiff({ diff: '+test' }, 'user-1')).rejects.toThrow(
        'Failed to parse AI code review response',
      );
    });

    it('throws on invalid schema from AI', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({ findings: 'not an array', summary: 123 }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 100,
        cached: false,
      });

      await expect(service.reviewDiff({ diff: '+test' }, 'user-1')).rejects.toThrow(
        'AI returned invalid code review result',
      );
    });
  });
});
