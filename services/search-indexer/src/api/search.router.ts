// ============================================================================
// Search API Router - Full search pipeline orchestrator
// ============================================================================

import { z } from 'zod';
import type { QueryParser, ParsedQuery } from '@quant/search';
import type { HybridSearchEngine, HybridSearchResult } from '@quant/search';
import type { CohereReranker, RerankResult } from '@quant/search';
import type { PermissionFilter, SearchResultWithPermissions } from '@quant/search';
import type { SearchFacetAggregator, FacetableResult } from '@quant/search';
import type { BatchEmbedder } from '../embedder';

export const SearchAPIRequestSchema = z.object({
  query: z.string().min(1),
  userId: z.string(),
  isAdmin: z.boolean().default(false),
  scopes: z.array(z.enum(['emails', 'messages', 'posts', 'videos', 'files', 'users'])).optional(),
  limit: z.number().int().positive().max(100).default(10),
  page: z.number().int().positive().default(1),
});

export type SearchAPIRequest = z.infer<typeof SearchAPIRequestSchema>;

export const SearchAPIResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      score: z.number(),
      title: z.string(),
      snippet: z.string(),
      metadata: z.record(z.unknown()),
    }),
  ),
  total: z.number(),
  facets: z.array(
    z.object({
      name: z.string(),
      buckets: z.array(z.object({ key: z.string(), count: z.number() })),
    }),
  ),
  query: z.object({
    original: z.string(),
    parsed: z.object({
      type: z.string().optional(),
      keywords: z.array(z.string()),
      dateRange: z.object({ from: z.string(), to: z.string() }).optional(),
      filters: z.array(z.object({ field: z.string(), value: z.string() })),
    }),
  }),
  took: z.number(),
});

export type SearchAPIResponse = z.infer<typeof SearchAPIResponseSchema>;

const ALL_SCOPES = ['emails', 'messages', 'posts', 'videos', 'files', 'users'] as const;

const SCOPE_INDEX_MAP: Record<string, { index: string; collection: string }> = {
  emails: { index: 'emails', collection: 'emails-vectors' },
  messages: { index: 'messages', collection: 'messages-vectors' },
  posts: { index: 'posts', collection: 'posts-vectors' },
  videos: { index: 'videos', collection: 'videos-vectors' },
  files: { index: 'files', collection: 'files-vectors' },
  users: { index: 'users', collection: 'users-vectors' },
};

/**
 * SearchRouter - Orchestrates the full search pipeline
 *
 * 1. Parse natural language query
 * 2. Generate embedding for vector search
 * 3. Run hybrid search across requested scopes
 * 4. Rerank top-50 to get top-N
 * 5. Apply permission filter
 * 6. Build facets
 * 7. Return typed response with timing
 */
export class SearchRouter {
  constructor(
    private readonly queryParser: QueryParser,
    private readonly embedder: BatchEmbedder,
    private readonly hybridSearch: HybridSearchEngine,
    private readonly reranker: CohereReranker,
    private readonly permissionFilter: PermissionFilter,
    private readonly facetAggregator: SearchFacetAggregator,
  ) {}

  async search(request: SearchAPIRequest): Promise<SearchAPIResponse> {
    const start = Date.now();
    const validated = SearchAPIRequestSchema.parse(request);

    // 1. Parse NL query
    const parsed: ParsedQuery = this.queryParser.parse(validated.query);

    // 2. Generate embedding for vector search
    const embedding = await this.embedder.embedText(validated.query);

    // 3. Run hybrid search across requested scopes
    const scopes = validated.scopes ?? [...ALL_SCOPES];
    const searchPromises = scopes.map((scope) => {
      const mapping = SCOPE_INDEX_MAP[scope];
      if (!mapping) return Promise.resolve([]);
      return this.hybridSearch.hybridSearch(validated.query, embedding, {
        index: mapping.index,
        collection: mapping.collection,
        limit: 50,
        bm25Weight: 0.5,
        vectorWeight: 0.5,
      });
    });

    const scopeResults = await Promise.all(searchPromises);
    const allResults: HybridSearchResult[] = scopeResults
      .flat()
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);

    // 4. Rerank top-50 to get top-N (over-fetch 3x to account for permission filtering)
    const overFetchLimit = validated.limit * 3;
    const reranked: RerankResult[] = await this.reranker.rerank(
      validated.query,
      allResults.map((r) => ({
        id: r.id,
        text: String(r.document.title ?? r.document.subject ?? r.id),
        score: r.score,
      })),
      overFetchLimit,
    );

    // 5. Apply permission filter
    // TODO: For production scale, push tenant/visibility filters into the Qdrant `filter`
    // clause and MeiliSearch `filter` parameter as pre-query filtering. Post-query filtering
    // alone leaks result counts, degrades performance at scale, and can return fewer results
    // than requested. Pre-query filtering should be layered alongside this post-query check
    // for defense in depth.
    const withPermissions: SearchResultWithPermissions[] = reranked.map((r) => {
      const original = allResults.find((o) => o.id === r.id);
      const doc = original?.document ?? {};
      return {
        id: r.id,
        ownerUserId: String(doc.userId ?? ''),
        visibility: (doc.visibility as 'public' | 'private' | 'shared') ?? 'public',
        sharedWith: (doc.sharedWith as string[]) ?? [],
        score: r.relevanceScore,
        document: doc,
      };
    });

    const filtered = this.permissionFilter.filterResults(withPermissions, validated.userId, {
      userId: validated.userId,
      isAdmin: validated.isAdmin,
    });

    // Trim to the originally requested limit after permission filtering
    const trimmed = filtered.slice(0, validated.limit);

    // 6. Build facets
    const facetableResults: FacetableResult[] = trimmed.map((r) => ({
      id: r.id,
      type: String(r.document.type ?? 'unknown'),
      date: r.document.date as string | undefined,
      sender: r.document.sender as string | undefined,
      score: r.score,
    }));

    const facets = this.facetAggregator.buildFacets(facetableResults);

    // 7. Build response
    const results = trimmed.map((r) => ({
      id: r.id,
      type: String(r.document.type ?? 'unknown'),
      score: r.score,
      title: String(r.document.title ?? r.document.subject ?? ''),
      snippet: String(r.document.snippet ?? r.document.bodyPlain ?? ''),
      metadata: r.document,
    }));

    const took = Date.now() - start;

    return SearchAPIResponseSchema.parse({
      results,
      total: trimmed.length,
      facets: facets.map((f) => ({
        name: f.name,
        buckets: f.buckets.map((b) => ({ key: b.key, count: b.count })),
      })),
      query: {
        original: validated.query,
        parsed: {
          type: parsed.type,
          keywords: parsed.keywords,
          dateRange: parsed.dateRange
            ? {
                from: parsed.dateRange.from.toISOString(),
                to: parsed.dateRange.to.toISOString(),
              }
            : undefined,
          filters: parsed.filters,
        },
      },
      took,
    });
  }
}
