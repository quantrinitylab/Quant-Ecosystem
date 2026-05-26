import { describe, it, expect, vi } from 'vitest';
import { SearchRouter, SearchAPIRequestSchema } from './search.router';
import type { QueryParser } from '@quant/search';
import type { HybridSearchEngine } from '@quant/search';
import type { CohereReranker } from '@quant/search';
import type { PermissionFilter } from '@quant/search';
import type { SearchFacetAggregator } from '@quant/search';
import type { BatchEmbedder } from '../embedder';

function createMockDeps() {
  const queryParser = {
    parse: vi.fn().mockReturnValue({
      type: 'email',
      keywords: ['John'],
      dateRange: {
        from: new Date('2024-01-01'),
        to: new Date('2024-02-01'),
      },
      filters: [{ field: 'from', value: 'John' }],
    }),
  } as unknown as QueryParser;

  const embedder = {
    embedText: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  } as unknown as BatchEmbedder;

  const hybridSearch = {
    hybridSearch: vi.fn().mockResolvedValue([
      {
        id: 'doc-1',
        score: 0.9,
        bm25Score: 0.8,
        vectorScore: 0.7,
        document: {
          title: 'Email from John',
          type: 'email',
          userId: 'user-1',
          visibility: 'public',
          snippet: 'Hey, regarding the project...',
          date: '2024-01-15',
          sender: 'John',
        },
      },
      {
        id: 'doc-2',
        score: 0.85,
        bm25Score: 0.75,
        vectorScore: 0.65,
        document: {
          title: 'Meeting Notes',
          type: 'email',
          userId: 'user-2',
          visibility: 'private',
          snippet: 'Private document content',
          date: '2024-01-10',
          sender: 'Jane',
        },
      },
      {
        id: 'doc-3',
        score: 0.8,
        bm25Score: 0.7,
        vectorScore: 0.6,
        document: {
          title: 'Shared File',
          type: 'file',
          userId: 'user-3',
          visibility: 'shared',
          sharedWith: ['user-1'],
          snippet: 'Shared with user',
          date: '2024-01-12',
          sender: 'Bob',
        },
      },
    ]),
  } as unknown as HybridSearchEngine;

  const reranker = {
    rerank: vi.fn().mockResolvedValue([
      { id: 'doc-1', text: 'Email from John', relevanceScore: 0.95, originalIndex: 0 },
      { id: 'doc-2', text: 'Meeting Notes', relevanceScore: 0.88, originalIndex: 1 },
      { id: 'doc-3', text: 'Shared File', relevanceScore: 0.82, originalIndex: 2 },
    ]),
  } as unknown as CohereReranker;

  const permissionFilter = {
    filterResults: vi.fn().mockImplementation((results, userId) => {
      return results.filter(
        (r: { ownerUserId: string; visibility: string; sharedWith?: string[] }) =>
          r.visibility === 'public' ||
          r.ownerUserId === userId ||
          (r.visibility === 'shared' && r.sharedWith?.includes(userId)),
      );
    }),
  } as unknown as PermissionFilter;

  const facetAggregator = {
    buildFacets: vi.fn().mockReturnValue([
      {
        name: 'type',
        field: 'type',
        type: 'terms',
        buckets: [{ key: 'email', count: 2 }],
        total: 2,
      },
      {
        name: 'date',
        field: 'date',
        type: 'date_histogram',
        buckets: [{ key: '2024-01-15', count: 1 }],
        total: 1,
      },
      {
        name: 'sender',
        field: 'sender',
        type: 'terms',
        buckets: [{ key: 'John', count: 1 }],
        total: 1,
      },
    ]),
  } as unknown as SearchFacetAggregator;

  return { queryParser, embedder, hybridSearch, reranker, permissionFilter, facetAggregator };
}

describe('SearchRouter', () => {
  it('orchestrates full pipeline: parse, embed, hybrid search, rerank, filter, facets', async () => {
    const deps = createMockDeps();
    const router = new SearchRouter(
      deps.queryParser,
      deps.embedder,
      deps.hybridSearch,
      deps.reranker,
      deps.permissionFilter,
      deps.facetAggregator,
    );

    const response = await router.search({
      query: 'emails from John last month',
      userId: 'user-1',
      limit: 10,
      page: 1,
    });

    // Query was parsed
    expect(deps.queryParser.parse).toHaveBeenCalledWith('emails from John last month');

    // Embedding generated
    expect(deps.embedder.embedText).toHaveBeenCalledWith('emails from John last month');

    // Hybrid search called
    expect(deps.hybridSearch.hybridSearch).toHaveBeenCalled();

    // Reranker applied
    expect(deps.reranker.rerank).toHaveBeenCalled();

    // Permission filter applied
    expect(deps.permissionFilter.filterResults).toHaveBeenCalled();

    // Facets built
    expect(deps.facetAggregator.buildFacets).toHaveBeenCalled();

    // Response shape valid
    expect(response.results).toBeDefined();
    expect(response.total).toBeGreaterThanOrEqual(0);
    expect(response.facets).toBeDefined();
    expect(response.query.original).toBe('emails from John last month');
    expect(response.took).toBeGreaterThanOrEqual(0);
  });

  it('correctly parses NL query and includes parsed info in response', async () => {
    const deps = createMockDeps();
    const router = new SearchRouter(
      deps.queryParser,
      deps.embedder,
      deps.hybridSearch,
      deps.reranker,
      deps.permissionFilter,
      deps.facetAggregator,
    );

    const response = await router.search({
      query: 'emails from John last month',
      userId: 'user-1',
    });

    expect(response.query.parsed.type).toBe('email');
    expect(response.query.parsed.keywords).toContain('John');
    expect(response.query.parsed.dateRange).toBeDefined();
    expect(response.query.parsed.filters).toEqual([{ field: 'from', value: 'John' }]);
  });

  it('filters by scopes - only searches requested types', async () => {
    const deps = createMockDeps();
    const router = new SearchRouter(
      deps.queryParser,
      deps.embedder,
      deps.hybridSearch,
      deps.reranker,
      deps.permissionFilter,
      deps.facetAggregator,
    );

    await router.search({
      query: 'project updates',
      userId: 'user-1',
      scopes: ['emails', 'messages'],
    });

    // Should only call hybrid search for requested scopes (2 calls)
    expect(deps.hybridSearch.hybridSearch).toHaveBeenCalledTimes(2);

    const firstCall = (deps.hybridSearch.hybridSearch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(firstCall[2].index).toBe('emails');
    expect(firstCall[2].collection).toBe('emails-vectors');

    const secondCall = (deps.hybridSearch.hybridSearch as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(secondCall[2].index).toBe('messages');
    expect(secondCall[2].collection).toBe('messages-vectors');
  });

  it('permission filter removes unauthorized results', async () => {
    const deps = createMockDeps();
    const router = new SearchRouter(
      deps.queryParser,
      deps.embedder,
      deps.hybridSearch,
      deps.reranker,
      deps.permissionFilter,
      deps.facetAggregator,
    );

    const response = await router.search({
      query: 'emails from John',
      userId: 'user-1',
    });

    // user-1 should see doc-1 (own public) and doc-3 (shared with user-1)
    // but not doc-2 (private, owned by user-2)
    expect(response.results.some((r) => r.id === 'doc-1')).toBe(true);
    expect(response.results.some((r) => r.id === 'doc-3')).toBe(true);
    expect(response.results.some((r) => r.id === 'doc-2')).toBe(false);
  });

  it('returns facets in response', async () => {
    const deps = createMockDeps();
    const router = new SearchRouter(
      deps.queryParser,
      deps.embedder,
      deps.hybridSearch,
      deps.reranker,
      deps.permissionFilter,
      deps.facetAggregator,
    );

    const response = await router.search({
      query: 'test query',
      userId: 'user-1',
    });

    expect(response.facets.length).toBeGreaterThan(0);
    expect(response.facets[0].name).toBe('type');
    expect(response.facets[0].buckets.length).toBeGreaterThan(0);
    expect(response.facets[0].buckets[0].key).toBeDefined();
    expect(response.facets[0].buckets[0].count).toBeDefined();
  });

  it('includes timing (took field) in response', async () => {
    const deps = createMockDeps();
    const router = new SearchRouter(
      deps.queryParser,
      deps.embedder,
      deps.hybridSearch,
      deps.reranker,
      deps.permissionFilter,
      deps.facetAggregator,
    );

    const response = await router.search({
      query: 'test query',
      userId: 'user-1',
    });

    expect(typeof response.took).toBe('number');
    expect(response.took).toBeGreaterThanOrEqual(0);
  });

  it('rejects empty query via Zod validation', () => {
    const result = SearchAPIRequestSchema.safeParse({
      query: '',
      userId: 'user-1',
    });

    expect(result.success).toBe(false);
  });

  it('rejects missing userId via Zod validation', () => {
    const result = SearchAPIRequestSchema.safeParse({
      query: 'test',
    });

    expect(result.success).toBe(false);
  });

  it('applies default limit and page when not provided', async () => {
    const deps = createMockDeps();
    const router = new SearchRouter(
      deps.queryParser,
      deps.embedder,
      deps.hybridSearch,
      deps.reranker,
      deps.permissionFilter,
      deps.facetAggregator,
    );

    const response = await router.search({
      query: 'test',
      userId: 'user-1',
    });

    // Should not throw and produce valid response
    expect(response).toBeDefined();
    expect(response.results).toBeDefined();
  });
});
