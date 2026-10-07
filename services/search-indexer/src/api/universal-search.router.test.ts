// ============================================================================
// Universal Search Router - Tests
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  UniversalSearchRouter,
  UniversalSearchRequestSchema,
  SuggestionsRequestSchema,
  FindSimilarRequestSchema,
  HistoryRequestSchema,
  ClearHistoryRequestSchema,
  DefaultPermissionResolver,
} from './universal-search.router';
import type { PermissionResolver } from './universal-search.router';
import type { UniversalSearchService } from '@quant/search';
import type { FindSimilarService } from '@quant/search';
import type { TypeaheadService } from '@quant/search';
import type { SearchHistoryService } from '@quant/search';

describe('UniversalSearchRouter', () => {
  let router: UniversalSearchRouter;
  let mockUniversalSearch: { search: ReturnType<typeof vi.fn> };
  let mockFindSimilar: { findSimilar: ReturnType<typeof vi.fn> };
  let mockTypeahead: { getSuggestions: ReturnType<typeof vi.fn> };
  let mockHistory: {
    getHistory: ReturnType<typeof vi.fn>;
    clearHistory: ReturnType<typeof vi.fn>;
  };
  let mockPermissionResolver: PermissionResolver;

  beforeEach(() => {
    mockUniversalSearch = {
      search: vi.fn().mockResolvedValue({
        query: 'test',
        enhancedQuery: { keywords: ['test'], intent: 'search', entities: [] },
        results: [
          {
            id: 'doc-1',
            score: 0.9,
            document: { title: 'Test Doc' },
            snippet: { text: 'test result', matchCount: 1 },
          },
        ],
        totalResults: 1,
        latencyMs: 42,
      }),
    };
    mockFindSimilar = {
      findSimilar: vi
        .fn()
        .mockResolvedValue([
          { id: 'sim-1', type: 'emails', score: 0.85, title: 'Similar', metadata: {} },
        ]),
    };
    mockTypeahead = {
      getSuggestions: vi.fn().mockResolvedValue({
        suggestions: [{ text: 'test query', type: 'recent' }],
      }),
    };
    mockHistory = {
      getHistory: vi
        .fn()
        .mockReturnValue([
          { id: 'sh-1', userId: 'user-1', query: 'past query', timestamp: new Date() },
        ]),
      clearHistory: vi.fn(),
    };

    mockPermissionResolver = {
      resolve: vi.fn().mockReturnValue({ userId: 'user-1', isAdmin: false }),
    };

    router = new UniversalSearchRouter(
      mockUniversalSearch as unknown as UniversalSearchService,
      mockFindSimilar as unknown as FindSimilarService,
      mockTypeahead as unknown as TypeaheadService,
      mockHistory as unknown as SearchHistoryService,
      mockPermissionResolver,
    );
  });

  describe('POST /search', () => {
    it('should validate input with UniversalSearchRequestSchema', () => {
      const valid = UniversalSearchRequestSchema.safeParse({
        query: 'test',
        userId: 'user-1',
      });
      expect(valid.success).toBe(true);

      const invalid = UniversalSearchRequestSchema.safeParse({
        query: '',
        userId: 'user-1',
      });
      expect(invalid.success).toBe(false);
    });

    it('should not accept isAdmin from request body', () => {
      const result = UniversalSearchRequestSchema.safeParse({
        query: 'test',
        userId: 'user-1',
        isAdmin: true,
      });
      // Schema should still parse but strip unknown fields
      expect(result.success).toBe(true);
      if (result.success) {
        expect('isAdmin' in result.data).toBe(false);
      }
    });

    it('should call universalSearch.search with permissions from resolver', async () => {
      await router.search({ query: 'hello', userId: 'user-1' });

      expect(mockPermissionResolver.resolve).toHaveBeenCalledWith('user-1');
      expect(mockUniversalSearch.search).toHaveBeenCalledWith({
        query: 'hello',
        userId: 'user-1',
        permissions: { userId: 'user-1', isAdmin: false },
        options: undefined,
      });
    });

    it('should use resolver to derive admin permissions instead of trusting client', async () => {
      (mockPermissionResolver.resolve as ReturnType<typeof vi.fn>).mockReturnValue({
        userId: 'admin-1',
        isAdmin: true,
      });

      await router.search({ query: 'hello', userId: 'admin-1' });

      expect(mockPermissionResolver.resolve).toHaveBeenCalledWith('admin-1');
      expect(mockUniversalSearch.search).toHaveBeenCalledWith({
        query: 'hello',
        userId: 'admin-1',
        permissions: { userId: 'admin-1', isAdmin: true },
        options: undefined,
      });
    });

    it('should pass options when provided', async () => {
      await router.search({
        query: 'hello',
        userId: 'user-1',
        options: { aiMode: true, limit: 10, page: 1, incognito: false },
      });

      expect(mockUniversalSearch.search).toHaveBeenCalledWith(
        expect.objectContaining({
          options: {
            aiMode: true,
            limit: 10,
            page: 1,
            incognito: false,
            scopes: undefined,
          },
        }),
      );
    });

    it('should return expected response shape', async () => {
      const result = await router.search({ query: 'test', userId: 'user-1' });

      expect(result.query).toBe('test');
      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.id).toBe('doc-1');
      expect(result.results[0]!.score).toBe(0.9);
      expect(result.results[0]!.snippet).toBeDefined();
      expect(result.totalResults).toBe(1);
      expect(result.latencyMs).toBe(42);
    });

    it('should include ragAnswer when present', async () => {
      mockUniversalSearch.search.mockResolvedValue({
        query: 'test',
        enhancedQuery: { keywords: ['test'], intent: 'search', entities: [] },
        results: [],
        totalResults: 0,
        ragAnswer: {
          answer: 'AI response',
          citations: [{ resultId: 'doc-1', excerpt: 'relevant excerpt', confidence: 0.9 }],
        },
        latencyMs: 100,
      });

      const result = await router.search({
        query: 'test',
        userId: 'user-1',
        options: { aiMode: true, limit: 20, page: 1, incognito: false },
      });

      expect(result.ragAnswer).toBeDefined();
      expect(result.ragAnswer!.answer).toBe('AI response');
      expect(result.ragAnswer!.citations).toHaveLength(1);
    });
  });

  describe('DefaultPermissionResolver', () => {
    it('should return non-admin permissions by default', () => {
      const resolver = new DefaultPermissionResolver();
      const permissions = resolver.resolve('user-123');
      expect(permissions).toEqual({ userId: 'user-123', isAdmin: false });
    });
  });

  describe('GET /search/suggestions', () => {
    it('should validate input with SuggestionsRequestSchema', () => {
      const valid = SuggestionsRequestSchema.safeParse({
        partial: 'tes',
        userId: 'user-1',
      });
      expect(valid.success).toBe(true);

      const invalid = SuggestionsRequestSchema.safeParse({
        partial: '',
        userId: 'user-1',
      });
      expect(invalid.success).toBe(false);
    });

    it('should call typeaheadService with correct params', async () => {
      await router.getSuggestions({ partial: 'hello', userId: 'user-1', limit: 5 });

      expect(mockTypeahead.getSuggestions).toHaveBeenCalledWith('hello', 'user-1', { limit: 5 });
    });

    it('should return suggestions response shape', async () => {
      const result = await router.getSuggestions({ partial: 'test', userId: 'user-1', limit: 10 });

      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0]!.text).toBe('test query');
      expect(result.suggestions[0]!.type).toBe('recent');
    });
  });

  describe('POST /search/similar', () => {
    it('should validate input with FindSimilarRequestSchema', () => {
      const valid = FindSimilarRequestSchema.safeParse({
        documentId: 'doc-1',
        text: 'some content',
      });
      expect(valid.success).toBe(true);

      const invalid = FindSimilarRequestSchema.safeParse({
        documentId: '',
        text: 'content',
      });
      expect(invalid.success).toBe(false);
    });

    it('should call findSimilarService with correct params', async () => {
      await router.findSimilar({
        documentId: 'doc-1',
        text: 'test content',
        limit: 5,
        minScore: 0.7,
      });

      expect(mockFindSimilar.findSimilar).toHaveBeenCalledWith('doc-1', 'test content', {
        limit: 5,
        collections: undefined,
        minScore: 0.7,
      });
    });

    it('should return find similar response shape', async () => {
      const result = await router.findSimilar({
        documentId: 'doc-1',
        text: 'test content',
        limit: 10,
        minScore: 0.5,
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.id).toBe('sim-1');
      expect(result.results[0]!.type).toBe('emails');
      expect(result.results[0]!.score).toBe(0.85);
      expect(result.took).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /search/history', () => {
    it('should validate input with HistoryRequestSchema', () => {
      const valid = HistoryRequestSchema.safeParse({
        userId: 'user-1',
      });
      expect(valid.success).toBe(true);

      const invalid = HistoryRequestSchema.safeParse({
        userId: '',
      });
      expect(invalid.success).toBe(false);
    });

    it('should call searchHistory.getHistory with correct params', async () => {
      await router.getHistory({ userId: 'user-1', limit: 25 });

      expect(mockHistory.getHistory).toHaveBeenCalledWith('user-1', 25);
    });

    it('should return history response shape', async () => {
      const result = await router.getHistory({ userId: 'user-1', limit: 50 });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.id).toBe('sh-1');
      expect(result.entries[0]!.query).toBe('past query');
      expect(result.entries[0]!.timestamp).toBeDefined();
    });
  });

  describe('DELETE /search/history', () => {
    it('should validate input with ClearHistoryRequestSchema', () => {
      const valid = ClearHistoryRequestSchema.safeParse({
        userId: 'user-1',
      });
      expect(valid.success).toBe(true);

      const invalid = ClearHistoryRequestSchema.safeParse({
        userId: '',
      });
      expect(invalid.success).toBe(false);
    });

    it('should call searchHistory.clearHistory', async () => {
      await router.clearHistory({ userId: 'user-1' });

      expect(mockHistory.clearHistory).toHaveBeenCalledWith('user-1');
    });

    it('should return success response', async () => {
      const result = await router.clearHistory({ userId: 'user-1' });

      expect(result).toEqual({ success: true });
    });
  });
});
