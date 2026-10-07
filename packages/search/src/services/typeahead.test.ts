// ============================================================================
// Typeahead Service - Tests
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TypeaheadService } from './typeahead';
import type { SearchHistoryService } from './search-history';
import type { SearchObservabilityService } from './search-observability';
import type { AutocompleteEngine } from '../core/autocomplete';

describe('TypeaheadService', () => {
  let service: TypeaheadService;
  let mockHistory: { getHistory: ReturnType<typeof vi.fn> };
  let mockObservability: { getPopularQueries: ReturnType<typeof vi.fn> };
  let mockAutocomplete: { suggest: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockHistory = {
      getHistory: vi.fn().mockReturnValue([]),
    };
    mockObservability = {
      getPopularQueries: vi.fn().mockReturnValue([]),
    };
    mockAutocomplete = {
      suggest: vi.fn().mockReturnValue([]),
    };
    service = new TypeaheadService(
      mockHistory as unknown as SearchHistoryService,
      mockObservability as unknown as SearchObservabilityService,
      mockAutocomplete as unknown as AutocompleteEngine,
    );
  });

  it('should return recent searches first', async () => {
    mockHistory.getHistory.mockReturnValue([
      { id: 'sh-1', userId: 'user-1', query: 'test query', timestamp: new Date() },
      { id: 'sh-2', userId: 'user-1', query: 'testing stuff', timestamp: new Date() },
    ]);
    mockObservability.getPopularQueries.mockReturnValue([{ query: 'test popular', count: 10 }]);

    const result = await service.getSuggestions('test', 'user-1');

    expect(result.suggestions[0]!.type).toBe('recent');
    expect(result.suggestions[0]!.text).toBe('test query');
    expect(result.suggestions[1]!.type).toBe('recent');
    expect(result.suggestions[1]!.text).toBe('testing stuff');
  });

  it('should include popular queries', async () => {
    mockObservability.getPopularQueries.mockReturnValue([
      { query: 'popular search', count: 50 },
      { query: 'another popular', count: 30 },
    ]);

    const result = await service.getSuggestions('popular', 'user-1');

    expect(result.suggestions.some((s) => s.type === 'popular')).toBe(true);
    expect(result.suggestions[0]!.text).toBe('popular search');
  });

  it('should include autocomplete suggestions', async () => {
    mockAutocomplete.suggest.mockReturnValue([
      { text: 'autocomplete result', score: 0.9, frequency: 5, source: 'autocomplete' },
    ]);

    const result = await service.getSuggestions('auto', 'user-1');

    expect(result.suggestions.some((s) => s.type === 'autocomplete')).toBe(true);
    expect(result.suggestions[0]!.text).toBe('autocomplete result');
  });

  it('should deduplicate across sources', async () => {
    mockHistory.getHistory.mockReturnValue([
      { id: 'sh-1', userId: 'user-1', query: 'machine learning', timestamp: new Date() },
    ]);
    mockObservability.getPopularQueries.mockReturnValue([
      { query: 'machine learning', count: 100 },
    ]);
    mockAutocomplete.suggest.mockReturnValue([
      { text: 'machine learning', score: 0.9, frequency: 10, source: 'autocomplete' },
    ]);

    const result = await service.getSuggestions('machine', 'user-1');

    const mlSuggestions = result.suggestions.filter(
      (s) => s.text.toLowerCase() === 'machine learning',
    );
    expect(mlSuggestions.length).toBe(1);
    // Should be from recent (highest priority)
    expect(mlSuggestions[0]!.type).toBe('recent');
  });

  it('should respect the limit option', async () => {
    mockHistory.getHistory.mockReturnValue([
      { id: 'sh-1', userId: 'user-1', query: 'query 1', timestamp: new Date() },
      { id: 'sh-2', userId: 'user-1', query: 'query 2', timestamp: new Date() },
      { id: 'sh-3', userId: 'user-1', query: 'query 3', timestamp: new Date() },
      { id: 'sh-4', userId: 'user-1', query: 'query 4', timestamp: new Date() },
      { id: 'sh-5', userId: 'user-1', query: 'query 5', timestamp: new Date() },
    ]);

    const result = await service.getSuggestions('query', 'user-1', { limit: 3 });

    expect(result.suggestions.length).toBe(3);
  });

  it('should handle empty partial string', async () => {
    const result = await service.getSuggestions('', 'user-1');
    expect(result.suggestions).toEqual([]);
  });

  it('should handle whitespace-only partial string', async () => {
    const result = await service.getSuggestions('   ', 'user-1');
    expect(result.suggestions).toEqual([]);
  });

  it('should only include matching recent searches', async () => {
    mockHistory.getHistory.mockReturnValue([
      { id: 'sh-1', userId: 'user-1', query: 'matching query', timestamp: new Date() },
      { id: 'sh-2', userId: 'user-1', query: 'other unrelated', timestamp: new Date() },
    ]);

    const result = await service.getSuggestions('match', 'user-1');

    expect(result.suggestions.length).toBe(1);
    expect(result.suggestions[0]!.text).toBe('matching query');
  });

  it('should call autocomplete with correct partial', async () => {
    mockAutocomplete.suggest.mockReturnValue([]);

    await service.getSuggestions('test', 'user-1');

    expect(mockAutocomplete.suggest).toHaveBeenCalledWith('test', { limit: 10 });
  });

  it('should allow disabling sources via options', async () => {
    mockHistory.getHistory.mockReturnValue([
      { id: 'sh-1', userId: 'user-1', query: 'recent match', timestamp: new Date() },
    ]);
    mockObservability.getPopularQueries.mockReturnValue([{ query: 'popular match', count: 10 }]);

    const result = await service.getSuggestions('match', 'user-1', {
      includeRecent: false,
      includePopular: false,
      includeAutocomplete: true,
    });

    expect(result.suggestions.filter((s) => s.type === 'recent').length).toBe(0);
    expect(result.suggestions.filter((s) => s.type === 'popular').length).toBe(0);
  });
});
