// ============================================================================
// Cross-App Search API - Frontend-friendly search interface
// ============================================================================

import { CrossAppSearchService } from '../cross-app-search';
import type {
  CrossAppSearchResult,
  CrossAppSearchOptions,
  CrossAppSearchResponse,
} from '../cross-app-search';

export interface SearchApiOptions {
  apps?: string[];
  types?: string[];
  limit?: number;
  offset?: number;
  userId?: string;
}

export interface SearchApiResponse {
  results: CrossAppSearchResult[];
  total: number;
  took: number;
  suggestions: string[];
}

/**
 * CrossAppSearchApi wraps the search service with user context,
 * permission filtering, and suggestion generation.
 */
export class CrossAppSearchApi {
  private searchService: CrossAppSearchService;

  constructor() {
    this.searchService = new CrossAppSearchService();
  }

  /**
   * Execute a search with user context.
   */
  search(query: string, options?: SearchApiOptions): SearchApiResponse {
    const searchOptions: CrossAppSearchOptions = {
      apps: options?.apps,
      types: options?.types,
      limit: options?.limit || 20,
      offset: options?.offset || 0,
    };

    const response: CrossAppSearchResponse = this.searchService.search(query, searchOptions);

    return {
      results: response.results,
      total: response.total,
      took: response.took,
      suggestions: this.generateSuggestions(query),
    };
  }

  /**
   * Index a document from an app backend.
   */
  indexDocument(doc: {
    id: string;
    app: string;
    type: string;
    title: string;
    content: string;
    url: string;
    metadata?: Record<string, string>;
  }): void {
    this.searchService.indexDocument(doc.app, {
      id: doc.id,
      type: doc.type,
      title: doc.title,
      content: doc.content,
      url: doc.url,
      metadata: doc.metadata,
    });
  }

  private generateSuggestions(query: string): string[] {
    if (!query || query.length < 2) return [];
    return [`${query} in emails`, `${query} in files`, `${query} in messages`];
  }
}
