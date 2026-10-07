import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AICodeSearchService } from '../services/ai-code-search.service';

function createMockAIEngine() {
  return {
    infer: vi.fn(),
  };
}

describe('AICodeSearchService', () => {
  let service: AICodeSearchService;
  let aiEngine: ReturnType<typeof createMockAIEngine>;

  beforeEach(() => {
    aiEngine = createMockAIEngine();
    service = new AICodeSearchService(aiEngine as never);
  });

  describe('semanticSearch', () => {
    it('returns relevant code search results', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          results: [
            {
              filePath: 'src/auth/login.ts',
              snippet: 'export async function login(email: string, password: string)',
              relevanceScore: 0.95,
              explanation: 'Main login function that handles user authentication',
            },
            {
              filePath: 'src/auth/middleware.ts',
              snippet: 'export function requireAuth(req, res, next)',
              relevanceScore: 0.8,
              explanation: 'Auth middleware that validates JWT tokens',
            },
          ],
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350, estimatedCost: 0.005 },
        latencyMs: 400,
        cached: false,
      });

      const result = await service.semanticSearch(
        {
          query: 'how does authentication work',
          repoId: 'repo-123',
          maxResults: 5,
        },
        'user-1',
      );

      expect(result.results).toHaveLength(2);
      expect(result.results[0]!.filePath).toBe('src/auth/login.ts');
      expect(result.results[0]!.relevanceScore).toBe(0.95);
      expect(result.results[1]!.relevanceScore).toBe(0.8);
    });

    it('handles search with file filter', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          results: [
            {
              filePath: 'src/services/email.service.ts',
              snippet: 'async sendEmail(to: string, subject: string)',
              relevanceScore: 0.9,
              explanation: 'Email sending service method',
            },
          ],
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 150, completionTokens: 80, totalTokens: 230, estimatedCost: 0.003 },
        latencyMs: 300,
        cached: false,
      });

      const result = await service.semanticSearch(
        {
          query: 'email sending',
          repoId: 'repo-456',
          fileFilter: '*.service.ts',
          maxResults: 10,
        },
        'user-2',
      );

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.filePath).toContain('.service.ts');
    });

    it('calls AIEngine.infer with correct parameters', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({ results: [] }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await service.semanticSearch(
        { query: 'test query', repoId: 'repo-789', maxResults: 10 },
        'user-3',
      );

      expect(aiEngine.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantmail',
          feature: 'code-search',
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

      await expect(
        service.semanticSearch({ query: 'test', repoId: 'repo-1', maxResults: 10 }, 'user-1'),
      ).rejects.toThrow('Failed to parse AI code search response');
    });

    it('throws on invalid schema from AI', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({ results: 'not an array' }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 100,
        cached: false,
      });

      await expect(
        service.semanticSearch({ query: 'test', repoId: 'repo-1', maxResults: 10 }, 'user-1'),
      ).rejects.toThrow('AI returned invalid code search result');
    });
  });
});
