// ============================================================================
// RAG Answer Synthesizer - Tests
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { RagAnswerSynthesizer, type RagContext } from './rag-answer-synthesizer';

// Mock AI engine
function createMockAIEngine(responseContent: string) {
  return {
    infer: vi.fn().mockResolvedValue({
      id: 'test-id',
      content: responseContent,
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150, estimatedCost: 0.01 },
      latencyMs: 200,
      cached: false,
    }),
  } as unknown as import('@quant/ai').AIEngine;
}

describe('RagAnswerSynthesizer', () => {
  const sampleResults: RagContext[] = [
    {
      id: 'doc-1',
      content: 'TypeScript is a typed superset of JavaScript.',
      title: 'TS Guide',
      score: 0.95,
    },
    {
      id: 'doc-2',
      content: 'Vitest is a fast unit testing framework for Vite.',
      title: 'Testing',
      score: 0.85,
    },
    {
      id: 'doc-3',
      content: 'pnpm is a fast, disk-efficient package manager.',
      title: 'pnpm Docs',
      score: 0.75,
    },
  ];

  describe('synthesize', () => {
    it('should format context passages and call AI engine', async () => {
      const response = `TypeScript adds type safety [1]. Vitest is great for testing [2].

CITATIONS:
[1] resultId="doc-1" excerpt="typed superset of JavaScript" confidence=0.9
[2] resultId="doc-2" excerpt="fast unit testing framework" confidence=0.8`;

      const mockEngine = createMockAIEngine(response);
      const synthesizer = new RagAnswerSynthesizer(mockEngine);

      await synthesizer.synthesize('What is TypeScript?', sampleResults);

      expect(mockEngine.infer).toHaveBeenCalledTimes(1);
      const callArg = vi.mocked(mockEngine.infer).mock.calls[0]![0]!;
      // Verify prompt includes context passages
      expect(callArg.prompt).toContain('[1]');
      expect(callArg.prompt).toContain('doc-1');
      expect(callArg.prompt).toContain('TypeScript is a typed superset');
      expect(callArg.prompt).toContain('[2]');
      expect(callArg.prompt).toContain('doc-2');
    });

    it('should extract citations from the response', async () => {
      const response = `TypeScript adds type safety [1].

CITATIONS:
[1] resultId="doc-1" excerpt="typed superset of JavaScript" confidence=0.9
[2] resultId="doc-2" excerpt="fast unit testing framework" confidence=0.8`;

      const mockEngine = createMockAIEngine(response);
      const synthesizer = new RagAnswerSynthesizer(mockEngine);

      const result = await synthesizer.synthesize('What is TypeScript?', sampleResults);

      expect(result.answer).toContain('TypeScript adds type safety');
      expect(result.citations).toHaveLength(2);
      expect(result.citations[0]).toEqual({
        resultId: 'doc-1',
        excerpt: 'typed superset of JavaScript',
        confidence: 0.9,
      });
      expect(result.citations[1]).toEqual({
        resultId: 'doc-2',
        excerpt: 'fast unit testing framework',
        confidence: 0.8,
      });
    });

    it('should return empty answer and citations for empty results', async () => {
      const mockEngine = createMockAIEngine('');
      const synthesizer = new RagAnswerSynthesizer(mockEngine);

      const result = await synthesizer.synthesize('What is TypeScript?', []);

      expect(result.answer).toBe('');
      expect(result.citations).toEqual([]);
      expect(mockEngine.infer).not.toHaveBeenCalled();
    });

    it('should reject hallucinated citations not in context', async () => {
      const response = `Answer here.

CITATIONS:
[1] resultId="doc-1" excerpt="some text" confidence=0.9
[2] resultId="hallucinated-id" excerpt="made up" confidence=0.8`;

      const mockEngine = createMockAIEngine(response);
      const synthesizer = new RagAnswerSynthesizer(mockEngine);

      const result = await synthesizer.synthesize('query', sampleResults);

      // Only doc-1 is valid, hallucinated-id should be rejected
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]!.resultId).toBe('doc-1');
    });

    it('should handle response without CITATIONS section', async () => {
      const response = 'Just a plain answer without citations.';

      const mockEngine = createMockAIEngine(response);
      const synthesizer = new RagAnswerSynthesizer(mockEngine);

      const result = await synthesizer.synthesize('query', sampleResults);

      expect(result.answer).toBe('Just a plain answer without citations.');
      expect(result.citations).toEqual([]);
    });

    it('should clamp confidence between 0 and 1', async () => {
      const response = `Answer.

CITATIONS:
[1] resultId="doc-1" excerpt="text" confidence=1.5`;

      const mockEngine = createMockAIEngine(response);
      const synthesizer = new RagAnswerSynthesizer(mockEngine);

      const result = await synthesizer.synthesize('query', sampleResults);

      expect(result.citations[0]!.confidence).toBe(1);
    });

    it('should include system prompt instructing grounded citations', async () => {
      const mockEngine = createMockAIEngine('Answer.\n\nCITATIONS:');
      const synthesizer = new RagAnswerSynthesizer(mockEngine);

      await synthesizer.synthesize('query', sampleResults);

      const callArg = vi.mocked(mockEngine.infer).mock.calls[0]![0]!;
      expect(callArg.systemPrompt).toContain('ONLY use information');
      expect(callArg.systemPrompt).toContain('Do NOT make up');
    });
  });
});
