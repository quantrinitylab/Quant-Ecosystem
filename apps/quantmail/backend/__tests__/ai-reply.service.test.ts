import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIReplyService } from '../services/ai-reply.service';

function createMockAIEngine() {
  return {
    infer: vi.fn(),
  };
}

describe('AIReplyService', () => {
  let service: AIReplyService;
  let aiEngine: ReturnType<typeof createMockAIEngine>;

  beforeEach(() => {
    aiEngine = createMockAIEngine();
    service = new AIReplyService(aiEngine as never);
  });

  describe('draftReply', () => {
    it('drafts a reply to an email', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          subject: 'Re: Project Update',
          body: 'Hi John,\n\nThank you for the update. I will review the documents and get back to you by end of day.\n\nBest regards',
          confidence: 0.85,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 150, completionTokens: 80, totalTokens: 230, estimatedCost: 0.002 },
        latencyMs: 300,
        cached: false,
      });

      const result = await service.draftReply(
        {
          subject: 'Project Update',
          body: 'Please review the attached documents and let me know your thoughts.',
          from: 'john@company.com',
        },
        'user-1',
      );

      expect(result.subject).toBe('Re: Project Update');
      expect(result.body).toContain('Thank you');
      expect(result.confidence).toBe(0.85);
      expect(aiEngine.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantmail',
          feature: 'email-reply',
          userId: 'user-1',
          temperature: 0.6,
        }),
      );
    });

    it('respects tone option', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          subject: 'Re: Lunch?',
          body: 'Hey! Sounds great, see you there!',
          confidence: 0.9,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 40, totalTokens: 140, estimatedCost: 0.001 },
        latencyMs: 200,
        cached: false,
      });

      const result = await service.draftReply(
        {
          subject: 'Lunch?',
          body: 'Want to grab lunch?',
          from: 'friend@example.com',
        },
        'user-1',
        { tone: 'casual' },
      );

      expect(result.subject).toBe('Re: Lunch?');
      expect(result.confidence).toBe(0.9);
      expect(aiEngine.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('casual'),
        }),
      );
    });

    it('throws error when AI returns invalid JSON', async () => {
      aiEngine.infer.mockResolvedValue({
        content: 'this is not json',
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await expect(
        service.draftReply({ subject: 'Test', body: 'Test body', from: 'test@test.com' }, 'user-1'),
      ).rejects.toThrow('Failed to parse AI reply response');
    });

    it('throws error when AI returns invalid schema', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({ subject: 'Re: Test', body: 123 }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await expect(
        service.draftReply({ subject: 'Test', body: 'Test body', from: 'test@test.com' }, 'user-1'),
      ).rejects.toThrow('AI returned invalid reply result');
    });
  });
});
