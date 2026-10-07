// ============================================================================
// Universal Search Service - Tests
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UniversalSearchService, type UniversalSearchDependencies } from './universal-search';
import type { PipelineSearchResult } from './hybrid-search-pipeline';
import type { UserPermissions } from './permission-filter';

function createMockDeps(): UniversalSearchDependencies {
  const mockResults: PipelineSearchResult[] = [
    {
      id: 'doc-1',
      score: 0.95,
      document: {
        title: 'TypeScript Guide',
        content: 'TypeScript is a typed superset of JavaScript.',
        ownerUserId: 'user-1',
        visibility: 'public',
      },
      explanation: { itemId: 'doc-1', topSignals: [] },
    },
    {
      id: 'doc-2',
      score: 0.85,
      document: {
        title: 'Private Notes',
        content: 'Private content about internal planning.',
        ownerUserId: 'user-2',
        visibility: 'private',
      },
      explanation: { itemId: 'doc-2', topSignals: [] },
    },
    {
      id: 'doc-3',
      score: 0.75,
      document: {
        title: 'Shared Doc',
        content: 'Shared document about architecture design.',
        ownerUserId: 'user-2',
        visibility: 'shared',
        sharedWith: ['user-1'],
      },
      explanation: { itemId: 'doc-3', topSignals: [] },
    },
  ];

  return {
    hybridSearchPipeline: {
      search: vi.fn().mockResolvedValue(mockResults),
    } as never,
    nlQueryEnhancer: {
      enhance: vi.fn().mockImplementation((q: string) => ({
        query: q,
        keywords: q.split(/\s+/).filter(Boolean),
        type: 'general',
        filters: [],
        dateRange: undefined,
        intent: 'informational',
        entities: [],
        originalQuery: q,
      })),
    } as never,
    permissionFilter: {
      filterResults: vi.fn().mockImplementation((results, _userId, _perms) => {
        // Simulate permission filter: remove private docs not owned by user
        return results.filter(
          (r: { ownerUserId: string; visibility: string; sharedWith?: string[] }) =>
            r.visibility === 'public' ||
            r.ownerUserId === _userId ||
            (r.visibility === 'shared' && r.sharedWith?.includes(_userId)),
        );
      }),
    } as never,
    snippetHighlighter: {
      highlight: vi.fn().mockImplementation((_text: string, _terms: string[]) => ({
        text: `...<mark>highlighted</mark>...`,
        matchCount: 1,
      })),
    } as never,
    ragAnswerSynthesizer: {
      synthesize: vi.fn().mockResolvedValue({
        answer: 'TypeScript is a typed superset of JavaScript.',
        citations: [{ resultId: 'doc-1', excerpt: 'typed superset', confidence: 0.9 }],
      }),
    } as never,
    searchHistory: {
      addQuery: vi
        .fn()
        .mockReturnValue({ id: 'sh-1', userId: 'user-1', query: 'test', timestamp: new Date() }),
    } as never,
    observability: {
      recordQuery: vi.fn(),
    } as never,
  };
}

describe('UniversalSearchService', () => {
  let deps: UniversalSearchDependencies;
  let service: UniversalSearchService;
  const defaultPermissions: UserPermissions = {
    userId: 'user-1',
    isAdmin: false,
    groupIds: [],
  };

  beforeEach(() => {
    deps = createMockDeps();
    service = new UniversalSearchService(deps);
  });

  describe('full flow', () => {
    it('should orchestrate the complete search pipeline', async () => {
      const response = await service.search({
        query: 'TypeScript guide',
        userId: 'user-1',
        permissions: defaultPermissions,
      });

      // NL enhancer was called
      expect(deps.nlQueryEnhancer.enhance).toHaveBeenCalledWith('TypeScript guide');

      // Pipeline was called
      expect(deps.hybridSearchPipeline.search).toHaveBeenCalled();

      // Permission filter was called
      expect(deps.permissionFilter.filterResults).toHaveBeenCalled();

      // Snippet highlighter was called for each result
      expect(deps.snippetHighlighter.highlight).toHaveBeenCalled();

      // Observability was recorded
      expect(deps.observability.recordQuery).toHaveBeenCalledWith(
        'TypeScript guide',
        expect.any(Number),
        expect.any(Number),
        'user-1',
      );

      // Response contains results
      expect(response.results.length).toBeGreaterThan(0);
      expect(response.query).toBe('TypeScript guide');
      expect(response.enhancedQuery).toBeDefined();
      expect(response.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return enhanced query info', async () => {
      const response = await service.search({
        query: 'TypeScript guide',
        userId: 'user-1',
        permissions: defaultPermissions,
      });

      expect(response.enhancedQuery.intent).toBe('informational');
      expect(response.enhancedQuery.originalQuery).toBe('TypeScript guide');
    });
  });

  describe('permission filtering', () => {
    it('should block unauthorized access to private documents', async () => {
      const response = await service.search({
        query: 'internal planning',
        userId: 'user-1',
        permissions: defaultPermissions,
      });

      // doc-2 is private and owned by user-2, should not appear
      const docIds = response.results.map((r) => r.id);
      expect(docIds).not.toContain('doc-2');
    });

    it('should allow access to shared documents', async () => {
      const response = await service.search({
        query: 'architecture',
        userId: 'user-1',
        permissions: defaultPermissions,
      });

      // doc-3 is shared with user-1, should appear
      const docIds = response.results.map((r) => r.id);
      expect(docIds).toContain('doc-3');
    });

    it('should allow admin to see all documents', async () => {
      // Override permission filter for admin
      const adminPerms: UserPermissions = { userId: 'admin', isAdmin: true, groupIds: [] };
      vi.mocked(deps.permissionFilter.filterResults).mockImplementation((results) => results);

      const response = await service.search({
        query: 'all content',
        userId: 'admin',
        permissions: adminPerms,
      });

      expect(response.results).toHaveLength(3);
    });
  });

  describe('AI mode (RAG)', () => {
    it('should call RAG synthesizer when aiMode is true', async () => {
      const response = await service.search({
        query: 'What is TypeScript?',
        userId: 'user-1',
        permissions: defaultPermissions,
        options: { aiMode: true },
      });

      expect(deps.ragAnswerSynthesizer.synthesize).toHaveBeenCalled();
      expect(response.ragAnswer).toBeDefined();
      expect(response.ragAnswer!.answer).toContain('TypeScript');
      expect(response.ragAnswer!.citations).toHaveLength(1);
    });

    it('should not call RAG synthesizer when aiMode is false', async () => {
      const response = await service.search({
        query: 'TypeScript guide',
        userId: 'user-1',
        permissions: defaultPermissions,
        options: { aiMode: false },
      });

      expect(deps.ragAnswerSynthesizer.synthesize).not.toHaveBeenCalled();
      expect(response.ragAnswer).toBeUndefined();
    });

    it('should not call RAG when no results after filtering', async () => {
      vi.mocked(deps.permissionFilter.filterResults).mockReturnValue([]);

      const response = await service.search({
        query: 'impossible query',
        userId: 'user-1',
        permissions: defaultPermissions,
        options: { aiMode: true },
      });

      expect(deps.ragAnswerSynthesizer.synthesize).not.toHaveBeenCalled();
      expect(response.ragAnswer).toBeUndefined();
    });

    it('should still return results when RAG synthesizer fails', async () => {
      vi.mocked(deps.ragAnswerSynthesizer.synthesize).mockRejectedValue(
        new Error('AI provider timeout'),
      );

      const response = await service.search({
        query: 'What is TypeScript?',
        userId: 'user-1',
        permissions: defaultPermissions,
        options: { aiMode: true },
      });

      expect(response.results.length).toBeGreaterThan(0);
      expect(response.ragAnswer).toBeUndefined();
      expect(response.query).toBe('What is TypeScript?');
    });
  });

  describe('incognito mode', () => {
    it('should not record query in history when incognito', async () => {
      await service.search({
        query: 'secret query',
        userId: 'user-1',
        permissions: defaultPermissions,
        options: { incognito: true },
      });

      expect(deps.searchHistory.addQuery).not.toHaveBeenCalled();
    });

    it('should record query in history when not incognito', async () => {
      await service.search({
        query: 'normal query',
        userId: 'user-1',
        permissions: defaultPermissions,
      });

      expect(deps.searchHistory.addQuery).toHaveBeenCalledWith('user-1', 'normal query');
    });
  });

  describe('observability', () => {
    it('should always record query metrics', async () => {
      await service.search({
        query: 'any query',
        userId: 'user-1',
        permissions: defaultPermissions,
      });

      expect(deps.observability.recordQuery).toHaveBeenCalledWith(
        'any query',
        expect.any(Number),
        expect.any(Number),
        'user-1',
      );
    });

    it('should record correct result count after permission filtering', async () => {
      await service.search({
        query: 'query',
        userId: 'user-1',
        permissions: defaultPermissions,
      });

      // 2 results pass the filter (doc-1 public, doc-3 shared with user-1)
      const recordCall = vi.mocked(deps.observability.recordQuery).mock.calls[0]!;
      expect(recordCall[2]).toBe(2);
    });
  });

  describe('scopes', () => {
    it('should search across specified scopes', async () => {
      await service.search({
        query: 'test',
        userId: 'user-1',
        permissions: defaultPermissions,
        options: { scopes: ['emails', 'docs'] },
      });

      expect(deps.hybridSearchPipeline.search).toHaveBeenCalledTimes(2);
      const calls = vi.mocked(deps.hybridSearchPipeline.search).mock.calls;
      expect(calls[0]![1]!.index).toBe('emails');
      expect(calls[1]![1]!.index).toBe('docs');
    });

    it('should use default scope when none specified', async () => {
      await service.search({
        query: 'test',
        userId: 'user-1',
        permissions: defaultPermissions,
      });

      const calls = vi.mocked(deps.hybridSearchPipeline.search).mock.calls;
      expect(calls[0]![1]!.index).toBe('default');
    });
  });

  describe('pagination', () => {
    it('should return different results for page 2 than page 1', async () => {
      // Mock pipeline to return enough results for multiple pages
      const manyResults: PipelineSearchResult[] = Array.from({ length: 10 }, (_, i) => ({
        id: `doc-${i}`,
        score: 1 - i * 0.05,
        document: {
          title: `Document ${i}`,
          content: `Content for doc ${i}`,
          ownerUserId: 'user-1',
          visibility: 'public' as const,
        },
        explanation: { itemId: `doc-${i}`, topSignals: [] },
      }));
      vi.mocked(deps.hybridSearchPipeline.search).mockResolvedValue(manyResults);
      vi.mocked(deps.permissionFilter.filterResults).mockImplementation((results) => results);

      const page1 = await service.search({
        query: 'test',
        userId: 'user-1',
        permissions: defaultPermissions,
        options: { limit: 3, page: 1 },
      });

      const page2 = await service.search({
        query: 'test',
        userId: 'user-1',
        permissions: defaultPermissions,
        options: { limit: 3, page: 2 },
      });

      expect(page1.results).toHaveLength(3);
      expect(page2.results).toHaveLength(3);
      expect(page1.results[0]!.id).toBe('doc-0');
      expect(page2.results[0]!.id).toBe('doc-3');
    });
  });
});
