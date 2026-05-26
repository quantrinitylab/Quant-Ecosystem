import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIWriteService } from '../services/ai-write.service';

function createMockAI() {
  return {
    infer: vi.fn(),
  };
}

describe('AIWriteService', () => {
  let service: AIWriteService;
  let ai: ReturnType<typeof createMockAI>;

  beforeEach(() => {
    ai = createMockAI();
    service = new AIWriteService(ai as never);
  });

  describe('writeFromOutline', () => {
    it('produces a document with title, content, and sections', async () => {
      const mockResponse = {
        id: 'resp-1',
        content: JSON.stringify({
          title: 'Project Overview',
          content: 'This document outlines the key features of our project.',
          sections: ['Introduction', 'Features', 'Conclusion'],
        }),
        model: 'gpt-4',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150, estimatedCost: 0.01 },
        latencyMs: 500,
        cached: false,
      };
      ai.infer.mockResolvedValue(mockResponse);

      const result = await service.writeFromOutline(
        ['Introduction to the project', 'Key features', 'Summary'],
        { tone: 'professional', style: 'formal' },
        'user-1',
      );

      expect(result.title).toBe('Project Overview');
      expect(result.content).toBe('This document outlines the key features of our project.');
      expect(result.sections).toEqual(['Introduction', 'Features', 'Conclusion']);
      expect(ai.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantdocs',
          feature: 'ai-write',
          userId: 'user-1',
        }),
      );
    });

    it('throws createAppError on invalid JSON response', async () => {
      ai.infer.mockResolvedValue({
        id: 'resp-1',
        content: 'not valid json',
        model: 'gpt-4',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, estimatedCost: 0.001 },
        latencyMs: 200,
        cached: false,
      });

      await expect(service.writeFromOutline(['bullet 1'], {}, 'user-1')).rejects.toThrow(
        'Failed to parse AI write response',
      );
    });

    it('throws createAppError on invalid schema', async () => {
      ai.infer.mockResolvedValue({
        id: 'resp-1',
        content: JSON.stringify({ title: 'Hello' }),
        model: 'gpt-4',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, estimatedCost: 0.001 },
        latencyMs: 200,
        cached: false,
      });

      await expect(service.writeFromOutline(['bullet 1'], {}, 'user-1')).rejects.toThrow(
        'AI returned invalid write result',
      );
    });
  });

  describe('expandSection', () => {
    it('adds detail to a paragraph', async () => {
      ai.infer.mockResolvedValue({
        id: 'resp-2',
        content: JSON.stringify({
          expanded:
            'The system architecture consists of three main layers: presentation, business logic, and data access. Each layer communicates through well-defined interfaces.',
          additions: ['Added layer descriptions', 'Added communication details'],
        }),
        model: 'gpt-4',
        finishReason: 'stop',
        usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80, estimatedCost: 0.005 },
        latencyMs: 300,
        cached: false,
      });

      const result = await service.expandSection(
        'The system has three layers.',
        'Add more detail about each layer',
        'user-1',
      );

      expect(result.expanded).toContain('three main layers');
      expect(result.additions).toHaveLength(2);
    });
  });

  describe('simplify', () => {
    it('reduces complexity for target audience', async () => {
      ai.infer.mockResolvedValue({
        id: 'resp-3',
        content: JSON.stringify({
          simplified: 'The computer saves your work so you can find it later.',
          readabilityScore: 90,
          changes: ['Replaced technical terms', 'Shortened sentences'],
        }),
        model: 'gpt-4',
        finishReason: 'stop',
        usage: { promptTokens: 40, completionTokens: 20, totalTokens: 60, estimatedCost: 0.003 },
        latencyMs: 250,
        cached: false,
      });

      const result = await service.simplify(
        'The persistent storage mechanism caches data for subsequent retrieval.',
        'child',
        'user-1',
      );

      expect(result.simplified).toContain('saves your work');
      expect(result.readabilityScore).toBe(90);
      expect(result.changes).toHaveLength(2);
    });
  });
});
