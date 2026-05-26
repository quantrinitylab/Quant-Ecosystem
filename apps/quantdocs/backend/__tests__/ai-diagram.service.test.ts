import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIDiagramService } from '../services/ai-diagram.service';

function createMockAI() {
  return {
    infer: vi.fn(),
  };
}

describe('AIDiagramService', () => {
  let service: AIDiagramService;
  let ai: ReturnType<typeof createMockAI>;

  beforeEach(() => {
    ai = createMockAI();
    service = new AIDiagramService(ai as never);
  });

  describe('textToDiagram', () => {
    it('returns valid mermaid string and title', async () => {
      const mermaidCode = `flowchart TD
    A[Start] --> B[Process]
    B --> C[End]`;

      ai.infer.mockResolvedValue({
        id: 'resp-1',
        content: JSON.stringify({
          mermaid: mermaidCode,
          title: 'Simple Process Flow',
        }),
        model: 'gpt-4',
        finishReason: 'stop',
        usage: { promptTokens: 60, completionTokens: 30, totalTokens: 90, estimatedCost: 0.005 },
        latencyMs: 350,
        cached: false,
      });

      const result = await service.textToDiagram(
        'A simple process that starts, processes data, then ends',
        'flowchart',
        'user-1',
      );

      expect(result.mermaid).toBe(mermaidCode);
      expect(result.title).toBe('Simple Process Flow');
      expect(ai.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantdocs',
          feature: 'ai-diagram',
          userId: 'user-1',
        }),
      );
    });

    it('handles sequence diagram type', async () => {
      ai.infer.mockResolvedValue({
        id: 'resp-2',
        content: JSON.stringify({
          mermaid: 'sequenceDiagram\n    Alice->>Bob: Hello',
          title: 'Communication Flow',
        }),
        model: 'gpt-4',
        finishReason: 'stop',
        usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70, estimatedCost: 0.004 },
        latencyMs: 300,
        cached: false,
      });

      const result = await service.textToDiagram(
        'Alice sends a message to Bob',
        'sequence',
        'user-1',
      );

      expect(result.mermaid).toContain('sequenceDiagram');
      expect(result.title).toBe('Communication Flow');
    });

    it('throws on invalid JSON response', async () => {
      ai.infer.mockResolvedValue({
        id: 'resp-3',
        content: 'invalid',
        model: 'gpt-4',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, estimatedCost: 0.001 },
        latencyMs: 100,
        cached: false,
      });

      await expect(service.textToDiagram('description', 'flowchart', 'user-1')).rejects.toThrow(
        'Failed to parse AI diagram response',
      );
    });
  });

  describe('textToTable', () => {
    it('returns proper headers and rows', async () => {
      ai.infer.mockResolvedValue({
        id: 'resp-4',
        content: JSON.stringify({
          headers: ['Name', 'Age', 'City'],
          rows: [
            ['Alice', '30', 'New York'],
            ['Bob', '25', 'London'],
            ['Carol', '35', 'Tokyo'],
          ],
        }),
        model: 'gpt-4',
        finishReason: 'stop',
        usage: { promptTokens: 70, completionTokens: 30, totalTokens: 100, estimatedCost: 0.006 },
        latencyMs: 350,
        cached: false,
      });

      const result = await service.textToTable(
        'Alice is 30 from New York. Bob is 25 from London. Carol is 35 from Tokyo.',
        'user-1',
      );

      expect(result.headers).toEqual(['Name', 'Age', 'City']);
      expect(result.rows).toHaveLength(3);
      expect(result.rows[0]).toEqual(['Alice', '30', 'New York']);
      expect(result.rows[1]).toEqual(['Bob', '25', 'London']);
      expect(result.rows[2]).toEqual(['Carol', '35', 'Tokyo']);
    });

    it('throws on invalid schema response', async () => {
      ai.infer.mockResolvedValue({
        id: 'resp-5',
        content: JSON.stringify({ headers: 'not an array' }),
        model: 'gpt-4',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, estimatedCost: 0.001 },
        latencyMs: 100,
        cached: false,
      });

      await expect(service.textToTable('some text', 'user-1')).rejects.toThrow(
        'AI returned invalid table result',
      );
    });
  });
});
