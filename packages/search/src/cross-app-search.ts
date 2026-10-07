// ============================================================================
// Cross-App Search Service - Federated Search Across All Apps
// ============================================================================

export interface CrossAppSearchResult {
  id: string;
  app: string;
  type: string;
  title: string;
  snippet: string;
  url: string;
  score: number;
  timestamp: number;
  metadata?: Record<string, string>;
}

export interface CrossAppSearchOptions {
  apps?: string[];
  types?: string[];
  timeRange?: { start: number; end: number };
  limit?: number;
  offset?: number;
}

export interface CrossAppSearchSuggestion {
  text: string;
  type: 'recent' | 'trending' | 'autocomplete';
  app?: string;
}

export interface CrossAppSearchResponse {
  results: CrossAppSearchResult[];
  total: number;
  took: number;
}

interface IndexedDocument {
  id: string;
  app: string;
  type: string;
  title: string;
  content: string;
  url: string;
  metadata?: Record<string, string>;
  indexedAt: number;
}

export class CrossAppSearchService {
  private documents: Map<string, IndexedDocument> = new Map();
  private recentSearches: Map<string, string[]> = new Map();

  search(query: string, options?: CrossAppSearchOptions): CrossAppSearchResponse {
    const start = Date.now();
    const lower = query.toLowerCase();

    let results: CrossAppSearchResult[] = [];

    for (const [, doc] of this.documents) {
      const titleMatch = doc.title.toLowerCase().includes(lower);
      const contentMatch = doc.content.toLowerCase().includes(lower);

      if (titleMatch || contentMatch) {
        const score = titleMatch ? 1.0 : 0.5;
        results.push({
          id: doc.id,
          app: doc.app,
          type: doc.type,
          title: doc.title,
          snippet: this.buildSnippet(doc.content, query),
          url: doc.url,
          score,
          timestamp: doc.indexedAt,
          metadata: doc.metadata,
        });
      }
    }

    // Apply filters
    if (options?.apps && options.apps.length > 0) {
      const apps = options.apps;
      results = results.filter((r) => apps.includes(r.app));
    }

    if (options?.types && options.types.length > 0) {
      const types = options.types;
      results = results.filter((r) => types.includes(r.type));
    }

    if (options?.timeRange) {
      const { start: rangeStart, end: rangeEnd } = options.timeRange;
      results = results.filter((r) => r.timestamp >= rangeStart && r.timestamp <= rangeEnd);
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    const total = results.length;
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 20;
    results = results.slice(offset, offset + limit);

    return {
      results,
      total,
      took: Date.now() - start,
    };
  }

  getSuggestions(partial: string, limit?: number): CrossAppSearchSuggestion[] {
    const lower = partial.toLowerCase();
    const maxItems = limit ?? 10;
    const suggestions: CrossAppSearchSuggestion[] = [];

    // Search document titles for autocomplete
    for (const [, doc] of this.documents) {
      if (doc.title.toLowerCase().includes(lower)) {
        suggestions.push({
          text: doc.title,
          type: 'autocomplete',
          app: doc.app,
        });
      }
      if (suggestions.length >= maxItems) break;
    }

    return suggestions.slice(0, maxItems);
  }

  getRecentSearches(userId: string, limit?: number): string[] {
    const searches = this.recentSearches.get(userId) ?? [];
    return limit ? searches.slice(0, limit) : searches;
  }

  addToRecentSearches(userId: string, query: string): void {
    const searches = this.recentSearches.get(userId) ?? [];
    // Remove duplicate if exists
    const idx = searches.indexOf(query);
    if (idx >= 0) {
      searches.splice(idx, 1);
    }
    searches.unshift(query);
    // Keep max 50 recent searches
    if (searches.length > 50) {
      searches.pop();
    }
    this.recentSearches.set(userId, searches);
  }

  clearRecentSearches(userId: string): void {
    this.recentSearches.delete(userId);
  }

  indexDocument(
    app: string,
    document: {
      id: string;
      type: string;
      title: string;
      content: string;
      url: string;
      metadata?: Record<string, string>;
    },
  ): boolean {
    const key = `${app}:${document.id}`;
    this.documents.set(key, {
      ...document,
      app,
      indexedAt: Date.now(),
    });
    return true;
  }

  removeDocument(app: string, documentId: string): boolean {
    const key = `${app}:${documentId}`;
    return this.documents.delete(key);
  }

  getIndexStats(): Record<string, { documents: number; lastUpdated: number }> {
    const stats: Record<string, { documents: number; lastUpdated: number }> = {};

    for (const [, doc] of this.documents) {
      const existing = stats[doc.app];
      if (!existing) {
        stats[doc.app] = { documents: 1, lastUpdated: doc.indexedAt };
      } else {
        existing.documents++;
        if (doc.indexedAt > existing.lastUpdated) {
          existing.lastUpdated = doc.indexedAt;
        }
      }
    }

    return stats;
  }

  private buildSnippet(content: string, query: string): string {
    const lower = content.toLowerCase();
    const idx = lower.indexOf(query.toLowerCase());
    if (idx < 0) {
      return content.slice(0, 150);
    }
    const start = Math.max(0, idx - 50);
    const end = Math.min(content.length, idx + query.length + 100);
    let snippet = content.slice(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';
    return snippet;
  }
}
