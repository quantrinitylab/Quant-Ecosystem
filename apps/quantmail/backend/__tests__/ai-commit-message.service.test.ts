import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AICommitMessageService } from '../services/ai-commit-message.service';

function createMockAIEngine() {
  return {
    infer: vi.fn(),
  };
}

describe('AICommitMessageService', () => {
  let service: AICommitMessageService;
  let aiEngine: ReturnType<typeof createMockAIEngine>;

  beforeEach(() => {
    aiEngine = createMockAIEngine();
    service = new AICommitMessageService(aiEngine as never);
  });

  describe('generateMessage', () => {
    it('generates a valid conventional commit message', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          message: 'feat(auth): add password hashing for user registration',
          type: 'feat',
          scope: 'auth',
          description: 'add password hashing for user registration',
          body: 'Implements bcrypt-based password hashing to securely store user credentials.',
          breaking: false,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 150, completionTokens: 80, totalTokens: 230, estimatedCost: 0.002 },
        latencyMs: 300,
        cached: false,
      });

      const result = await service.generateMessage(
        {
          diff: '+import bcrypt from "bcrypt";\n+const hash = await bcrypt.hash(password, 10);',
          context: 'Adding authentication to the user service',
        },
        'user-1',
      );

      expect(result.message).toBe('feat(auth): add password hashing for user registration');
      expect(result.type).toBe('feat');
      expect(result.scope).toBe('auth');
      expect(result.description).toBe('add password hashing for user registration');
      expect(result.body).toContain('bcrypt');
      expect(result.breaking).toBe(false);
    });

    it('handles commit messages without scope', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          message: 'fix: resolve null pointer in error handler',
          type: 'fix',
          scope: null,
          description: 'resolve null pointer in error handler',
          body: null,
          breaking: false,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 60, totalTokens: 160, estimatedCost: 0.001 },
        latencyMs: 200,
        cached: false,
      });

      const result = await service.generateMessage(
        { diff: '-if (err) throw err;\n+if (err) throw err ?? new Error("unknown");' },
        'user-2',
      );

      expect(result.scope).toBeNull();
      expect(result.body).toBeNull();
      expect(result.type).toBe('fix');
    });

    it('calls AIEngine.infer with correct parameters', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          message: 'chore: update deps',
          type: 'chore',
          scope: null,
          description: 'update deps',
          body: null,
          breaking: false,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 40, totalTokens: 140, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await service.generateMessage({ diff: '+version: 2.0.0' }, 'user-3');

      expect(aiEngine.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantmail',
          feature: 'commit-message',
          userId: 'user-3',
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

      await expect(service.generateMessage({ diff: '+test' }, 'user-1')).rejects.toThrow(
        'Failed to parse AI commit message response',
      );
    });

    it('throws on invalid schema from AI', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({ message: 123, type: true }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 100,
        cached: false,
      });

      await expect(service.generateMessage({ diff: '+test' }, 'user-1')).rejects.toThrow(
        'AI returned invalid commit message result',
      );
    });
  });
});
