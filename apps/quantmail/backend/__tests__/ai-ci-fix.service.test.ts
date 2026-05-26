import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AICIFixService } from '../services/ai-ci-fix.service';

function createMockAIEngine() {
  return {
    infer: vi.fn(),
  };
}

describe('AICIFixService', () => {
  let service: AICIFixService;
  let aiEngine: ReturnType<typeof createMockAIEngine>;

  beforeEach(() => {
    aiEngine = createMockAIEngine();
    service = new AICIFixService(aiEngine as never);
  });

  describe('suggestFix', () => {
    it('diagnoses a CI failure and suggests a fix', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          diagnosis: 'TypeScript compilation failed due to type mismatch',
          rootCause: 'type mismatch: function expects string but receives number at line 42',
          suggestedFix: 'Change the argument type to string: `getValue(String(count))`',
          confidence: 0.9,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 250, completionTokens: 100, totalTokens: 350, estimatedCost: 0.005 },
        latencyMs: 400,
        cached: false,
      });

      const result = await service.suggestFix(
        {
          logs: 'error TS2345: Argument of type "number" is not assignable to parameter of type "string"',
          sourceCode: 'function getValue(s: string) { return s; }\ngetValue(42);',
          jobName: 'typecheck',
        },
        'user-1',
      );

      expect(result.diagnosis).toContain('TypeScript');
      expect(result.rootCause).toContain('type mismatch');
      expect(result.suggestedFix).toContain('String');
      expect(result.confidence).toBe(0.9);
    });

    it('handles failures without source code context', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          diagnosis: 'npm install failed due to network timeout',
          rootCause: 'Registry unreachable during CI run',
          suggestedFix: 'Add retry logic to npm install step or use a local cache',
          confidence: 0.7,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 150, completionTokens: 80, totalTokens: 230, estimatedCost: 0.003 },
        latencyMs: 300,
        cached: false,
      });

      const result = await service.suggestFix(
        { logs: 'npm ERR! network timeout at: https://registry.npmjs.org/express' },
        'user-2',
      );

      expect(result.diagnosis).toContain('network');
      expect(result.confidence).toBe(0.7);
    });

    it('calls AIEngine.infer with correct parameters', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          diagnosis: 'test',
          rootCause: 'test',
          suggestedFix: 'test',
          confidence: 0.5,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150, estimatedCost: 0.001 },
        latencyMs: 200,
        cached: false,
      });

      await service.suggestFix({ logs: 'error' }, 'user-3');

      expect(aiEngine.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantmail',
          feature: 'ci-fix',
          userId: 'user-3',
          temperature: 0.2,
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

      await expect(service.suggestFix({ logs: 'error' }, 'user-1')).rejects.toThrow(
        'Failed to parse AI CI fix response',
      );
    });

    it('throws on invalid schema from AI', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({ diagnosis: 123, confidence: 'high' }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 100,
        cached: false,
      });

      await expect(service.suggestFix({ logs: 'error' }, 'user-1')).rejects.toThrow(
        'AI returned invalid CI fix result',
      );
    });
  });
});
