// ============================================================================
// Typeahead Service - Search-as-you-type suggestions
// ============================================================================

import type { SearchHistoryService, SearchHistoryEntry } from './search-history';
import type { SearchObservabilityService, PopularQuery } from './search-observability';
import type { AutocompleteEngine } from '../core/autocomplete';

export interface TypeaheadOptions {
  limit?: number;
  includeRecent?: boolean;
  includePopular?: boolean;
  includeAutocomplete?: boolean;
}

export interface TypeaheadSuggestion {
  text: string;
  type: 'recent' | 'popular' | 'autocomplete';
}

export interface TypeaheadResponse {
  suggestions: TypeaheadSuggestion[];
}

/**
 * TypeaheadService - Provides fast search-as-you-type suggestions
 *
 * Aggregates suggestions from three sources:
 * 1. User recent searches (from SearchHistory)
 * 2. Popular queries (from SearchObservabilityService)
 * 3. Autocomplete matches (from AutocompleteEngine)
 *
 * Designed for < 50ms response time by using only in-memory data lookups.
 * Results are deduplicated and ordered by priority: recent > popular > autocomplete.
 */
export class TypeaheadService {
  constructor(
    private readonly searchHistory: SearchHistoryService,
    private readonly observability: SearchObservabilityService,
    private readonly autocomplete: AutocompleteEngine,
  ) {}

  async getSuggestions(
    partial: string,
    userId: string,
    options: TypeaheadOptions = {},
  ): Promise<TypeaheadResponse> {
    const limit = options.limit ?? 10;
    const includeRecent = options.includeRecent ?? true;
    const includePopular = options.includePopular ?? true;
    const includeAutocomplete = options.includeAutocomplete ?? true;

    if (!partial.trim()) {
      return { suggestions: [] };
    }

    const normalizedPartial = partial.toLowerCase().trim();
    const seen = new Set<string>();
    const suggestions: TypeaheadSuggestion[] = [];

    // 1. User's recent searches (highest priority)
    if (includeRecent) {
      const recentEntries: SearchHistoryEntry[] = this.searchHistory.getHistory(userId, 20);
      const matchingRecent = recentEntries.filter((entry) =>
        entry.query.toLowerCase().includes(normalizedPartial),
      );

      for (const entry of matchingRecent) {
        const key = entry.query.toLowerCase();
        if (!seen.has(key) && suggestions.length < limit) {
          seen.add(key);
          suggestions.push({ text: entry.query, type: 'recent' });
        }
      }
    }

    // 2. Popular queries
    if (includePopular && suggestions.length < limit) {
      const popularQueries: PopularQuery[] = this.observability.getPopularQueries(20);
      const matchingPopular = popularQueries.filter((q) =>
        q.query.toLowerCase().includes(normalizedPartial),
      );

      for (const query of matchingPopular) {
        const key = query.query.toLowerCase();
        if (!seen.has(key) && suggestions.length < limit) {
          seen.add(key);
          suggestions.push({ text: query.query, type: 'popular' });
        }
      }
    }

    // 3. Autocomplete from document titles/terms
    if (includeAutocomplete && suggestions.length < limit) {
      const remaining = limit - suggestions.length;
      const autocompleteSuggestions = this.autocomplete.suggest(normalizedPartial, {
        limit: remaining,
      });

      for (const suggestion of autocompleteSuggestions) {
        const key = suggestion.text.toLowerCase();
        if (!seen.has(key) && suggestions.length < limit) {
          seen.add(key);
          suggestions.push({ text: suggestion.text, type: 'autocomplete' });
        }
      }
    }

    return { suggestions: suggestions.slice(0, limit) };
  }
}
