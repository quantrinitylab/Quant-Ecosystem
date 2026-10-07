// ============================================================================
// Universal Search Service - Main orchestrator
// ============================================================================

import type { HybridSearchPipeline, PipelineSearchResult } from './hybrid-search-pipeline';
import type { NLQueryEnhancer, EnhancedQuery } from './nl-query-enhancer';
import type { PermissionFilter, UserPermissions } from './permission-filter';
import type { SnippetHighlighter, HighlightedSnippet } from './snippet-highlighter';
import type { RagAnswerSynthesizer, RagAnswer, RagContext } from './rag-answer-synthesizer';
import type { SearchHistoryService } from './search-history';
import type { SearchObservabilityService } from './search-observability';

export interface UniversalSearchRequest {
  query: string;
  userId: string;
  permissions: UserPermissions;
  options?: UniversalSearchOptions;
}

export interface UniversalSearchOptions {
  aiMode?: boolean;
  scopes?: string[];
  limit?: number;
  page?: number;
  incognito?: boolean;
}

export interface UniversalSearchResultItem {
  id: string;
  score: number;
  document: Record<string, unknown>;
  snippet: HighlightedSnippet;
}

export interface UniversalSearchResponse {
  query: string;
  enhancedQuery: EnhancedQuery;
  results: UniversalSearchResultItem[];
  totalResults: number;
  ragAnswer?: RagAnswer;
  latencyMs: number;
}

export interface UniversalSearchDependencies {
  hybridSearchPipeline: HybridSearchPipeline;
  nlQueryEnhancer: NLQueryEnhancer;
  permissionFilter: PermissionFilter;
  snippetHighlighter: SnippetHighlighter;
  ragAnswerSynthesizer: RagAnswerSynthesizer;
  searchHistory: SearchHistoryService;
  observability: SearchObservabilityService;
}

/**
 * UniversalSearchService - Main orchestrator for the universal search query bar.
 *
 * Ties together NL query enhancement, hybrid search pipeline, permission filtering,
 * snippet highlighting, RAG-based AI answer synthesis, search history, and observability.
 *
 * Flow:
 * 1. Record in history (unless incognito)
 * 2. Enhance query via NLQueryEnhancer
 * 3. Run HybridSearchPipeline across requested scopes
 * 4. Apply permission filter
 * 5. Generate highlighted snippets
 * 6. If aiMode, run RAG synthesizer on top results
 * 7. Record metrics in observability
 * 8. Return unified response
 */
export class UniversalSearchService {
  private readonly pipeline: HybridSearchPipeline;
  private readonly nlEnhancer: NLQueryEnhancer;
  private readonly permissionFilter: PermissionFilter;
  private readonly snippetHighlighter: SnippetHighlighter;
  private readonly ragSynthesizer: RagAnswerSynthesizer;
  private readonly searchHistory: SearchHistoryService;
  private readonly observability: SearchObservabilityService;

  constructor(deps: UniversalSearchDependencies) {
    this.pipeline = deps.hybridSearchPipeline;
    this.nlEnhancer = deps.nlQueryEnhancer;
    this.permissionFilter = deps.permissionFilter;
    this.snippetHighlighter = deps.snippetHighlighter;
    this.ragSynthesizer = deps.ragAnswerSynthesizer;
    this.searchHistory = deps.searchHistory;
    this.observability = deps.observability;
  }

  async search(request: UniversalSearchRequest): Promise<UniversalSearchResponse> {
    const startTime = Date.now();
    const { query, userId, permissions, options = {} } = request;
    const { aiMode = false, scopes, limit = 20, page = 1, incognito = false } = options;

    // Step 1: Record in history (unless incognito)
    if (!incognito) {
      this.searchHistory.addQuery(userId, query);
    }

    // Step 2: Enhance query
    const enhancedQuery = this.nlEnhancer.enhance(query);

    // Step 3: Run hybrid search pipeline across scopes (concurrently)
    const searchScopes = scopes ?? ['default'];
    const scopeResultArrays = await Promise.all(
      searchScopes.map((scope) =>
        this.pipeline.search(enhancedQuery.keywords.join(' ') || query, {
          index: scope,
          collection: `${scope}-vectors`,
          limit: limit * 2, // Over-fetch so permission filtering still leaves enough
        }),
      ),
    );
    const allResults: PipelineSearchResult[] = scopeResultArrays.flat();

    // Sort by score
    allResults.sort((a, b) => b.score - a.score);

    // Step 4: Apply permission filter
    const permissionResults = allResults.map((r) => ({
      id: r.id,
      ownerUserId: (r.document.ownerUserId as string) ?? '',
      visibility: (r.document.visibility as 'public' | 'private' | 'shared') ?? 'public',
      sharedWith: (r.document.sharedWith as string[]) ?? [],
      score: r.score,
      document: r.document,
    }));

    const filteredResults = this.permissionFilter.filterResults(
      permissionResults,
      userId,
      permissions,
    );

    // Step 5: Generate highlighted snippets
    const queryTerms =
      enhancedQuery.keywords.length > 0
        ? enhancedQuery.keywords
        : query.split(/\s+/).filter(Boolean);

    const offset = (page - 1) * limit;
    const paginatedResults = filteredResults.slice(offset, offset + limit);
    const resultItems: UniversalSearchResultItem[] = paginatedResults.map((r) => {
      const textContent = this.extractText(r.document);
      const snippet = this.snippetHighlighter.highlight(textContent, queryTerms);
      return {
        id: r.id,
        score: r.score,
        document: r.document,
        snippet,
      };
    });

    // Step 6: If aiMode, run RAG synthesizer
    let ragAnswer: RagAnswer | undefined;
    if (aiMode && filteredResults.length > 0) {
      try {
        const ragContexts: RagContext[] = filteredResults.slice(0, 20).map((r) => ({
          id: r.id,
          content: this.extractText(r.document),
          title: (r.document.title as string) ?? undefined,
          score: r.score,
        }));
        ragAnswer = await this.ragSynthesizer.synthesize(query, ragContexts);
      } catch {
        // RAG failure should not prevent returning search results
        ragAnswer = undefined;
      }
    }

    // Step 7: Record metrics in observability
    const latencyMs = Date.now() - startTime;
    this.observability.recordQuery(query, latencyMs, filteredResults.length, userId);

    // Step 8: Return unified response
    return {
      query,
      enhancedQuery,
      results: resultItems,
      totalResults: filteredResults.length,
      ragAnswer,
      latencyMs,
    };
  }

  private extractText(document: Record<string, unknown>): string {
    if (typeof document.content === 'string') return document.content;
    if (typeof document.text === 'string') return document.text;
    if (typeof document.bodyPlain === 'string') return document.bodyPlain;
    if (typeof document.description === 'string') return document.description;
    if (typeof document.title === 'string') return document.title;
    return '';
  }
}
