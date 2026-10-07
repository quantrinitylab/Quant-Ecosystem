import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIPRDescriptionService } from '../services/ai-pr-description.service';

function createMockAIEngine() {
  return {
    infer: vi.fn(),
  };
}

describe('AIPRDescriptionService', () => {
  let service: AIPRDescriptionService;
  let aiEngine: ReturnType<typeof createMockAIEngine>;

  beforeEach(() => {
    aiEngine = createMockAIEngine();
    service = new AIPRDescriptionService(aiEngine as never);
  });

  describe('generateDescription', () => {
    it('generates a structured PR description', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          title: 'feat: add user authentication with OAuth2',
          summary: 'Implements OAuth2-based authentication with Google and GitHub providers.',
          changes: [
            'Added OAuth2 provider configuration',
            'Implemented token refresh logic',
            'Added login/logout routes',
          ],
          testingNotes:
            'Run npm test to verify OAuth flows. Manual testing with Google OAuth requires credentials.',
          breakingChanges: ['Removed legacy session-based auth endpoints'],
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 300, completionTokens: 200, totalTokens: 500, estimatedCost: 0.008 },
        latencyMs: 600,
        cached: false,
      });

      const result = await service.generateDescription(
        {
          commits: [
            { sha: 'abc1234', message: 'feat: add OAuth2 provider' },
            { sha: 'def5678', message: 'feat: add login routes' },
          ],
          diff: '+import { OAuth2Client } from "google-auth-library";\n+export async function login() {}',
          title: 'Add OAuth2 Auth',
        },
        'user-1',
      );

      expect(result.title).toContain('OAuth2');
      expect(result.summary).toContain('OAuth2');
      expect(result.changes).toHaveLength(3);
      expect(result.testingNotes).toContain('npm test');
      expect(result.breakingChanges).toHaveLength(1);
    });

    it('handles PRs with no breaking changes', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          title: 'fix: resolve race condition in worker pool',
          summary: 'Fixes a race condition that caused duplicate job processing.',
          changes: ['Added mutex lock on job dequeue'],
          testingNotes: 'Run the concurrent job test suite.',
          breakingChanges: [],
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300, estimatedCost: 0.004 },
        latencyMs: 400,
        cached: false,
      });

      const result = await service.generateDescription(
        {
          commits: [{ sha: '1234567', message: 'fix: add mutex lock' }],
          diff: '+const lock = new Mutex();',
        },
        'user-2',
      );

      expect(result.breakingChanges).toHaveLength(0);
    });

    it('calls AIEngine.infer with correct parameters', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          title: 'test',
          summary: 'test',
          changes: [],
          testingNotes: 'test',
          breakingChanges: [],
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150, estimatedCost: 0.001 },
        latencyMs: 200,
        cached: false,
      });

      await service.generateDescription(
        { commits: [{ sha: 'abc', message: 'test' }], diff: '+test' },
        'user-3',
      );

      expect(aiEngine.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantmail',
          feature: 'pr-description',
          userId: 'user-3',
          temperature: 0.4,
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

      await expect(
        service.generateDescription(
          { commits: [{ sha: 'abc', message: 'test' }], diff: '+test' },
          'user-1',
        ),
      ).rejects.toThrow('Failed to parse AI PR description response');
    });

    it('throws on invalid schema from AI', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({ title: 123 }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 100,
        cached: false,
      });

      await expect(
        service.generateDescription(
          { commits: [{ sha: 'abc', message: 'test' }], diff: '+test' },
          'user-1',
        ),
      ).rejects.toThrow('AI returned invalid PR description result');
    });
  });
});
