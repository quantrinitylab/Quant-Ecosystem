import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIComposeService } from '../services/ai-compose.service';

function createMockAIEngine() {
  return {
    infer: vi.fn(),
  };
}

describe('AIComposeService', () => {
  let service: AIComposeService;
  let aiEngine: ReturnType<typeof createMockAIEngine>;

  beforeEach(() => {
    aiEngine = createMockAIEngine();
    service = new AIComposeService(aiEngine as never);
  });

  describe('composeFromBullets', () => {
    it('converts bullet points to a professional email', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          subject: 'Project Timeline Update',
          body: 'Dear Team,\n\nI wanted to provide an update on our project timeline. The deadline has been moved to March 15th, and we need all reports submitted by March 10th. Please let me know if you have any questions.\n\nBest regards',
          confidence: 0.88,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 120, completionTokens: 80, totalTokens: 200, estimatedCost: 0.002 },
        latencyMs: 300,
        cached: false,
      });

      const result = await service.composeFromBullets(
        ['Deadline moved to March 15', 'Need all reports by March 10', 'Ask if questions'],
        { recipient: 'team@company.com', tone: 'professional' },
        'user-1',
      );

      expect(result.subject).toBe('Project Timeline Update');
      expect(result.body).toContain('deadline');
      expect(result.confidence).toBe(0.88);
      expect(aiEngine.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantmail',
          feature: 'email-compose',
          userId: 'user-1',
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

      await expect(service.composeFromBullets(['bullet 1'], {}, 'user-1')).rejects.toThrow(
        'Failed to parse AI compose response',
      );
    });

    it('throws error when AI returns invalid schema', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({ subject: 'Test' }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await expect(service.composeFromBullets(['bullet 1'], {}, 'user-1')).rejects.toThrow(
        'AI returned invalid compose result',
      );
    });
  });

  describe('improveEmail', () => {
    it('improves a draft email based on instructions', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          body: 'Dear Mr. Johnson,\n\nI hope this message finds you well. I wanted to follow up on our earlier discussion regarding the quarterly review.\n\nBest regards',
          changes: ['Added formal greeting', 'Improved sentence structure', 'Added polite closing'],
          confidence: 0.9,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 150, completionTokens: 80, totalTokens: 230, estimatedCost: 0.002 },
        latencyMs: 300,
        cached: false,
      });

      const result = await service.improveEmail(
        'Hey, following up about the quarterly review.',
        'Make it more formal and professional',
        'user-1',
      );

      expect(result.body).toContain('Dear Mr. Johnson');
      expect(result.changes).toHaveLength(3);
      expect(result.confidence).toBe(0.9);
    });

    it('throws error when AI returns invalid JSON', async () => {
      aiEngine.infer.mockResolvedValue({
        content: 'invalid',
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await expect(service.improveEmail('draft', 'instructions', 'user-1')).rejects.toThrow(
        'Failed to parse AI improve response',
      );
    });
  });
});
