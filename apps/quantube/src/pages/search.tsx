// ============================================================================
// QuantTube - Search Results Page
// Search with type filter, results, suggestions
//
// HONESTY NOTE: performSearch previously returned hardcoded MOCK_* results
// behind a fake 400ms delay, with invented suggestions and a scripted
// "did you mean". It now calls GET /api/search (and /api/search/autocomplete)
// and renders only what the backend returns.
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../services/api-client';
import type { SearchResult } from '../types';

type TypeFilter = 'all' | 'video' | 'channel' | 'playlist' | 'movie';

interface SearchPageState {
  query: string;
  typeFilter: TypeFilter;
  results: SearchResult[];
  suggestions: string[];
  loading: boolean;
  error: string | null;
  totalResults: number;
}

const SearchPage: React.FC = () => {
  const [state, setState] = useState<SearchPageState>({
    query: '',
    typeFilter: 'all',
    results: [],
    suggestions: [],
    loading: false,
    error: null,
    totalResults: 0,
  });
  const [showFilters, setShowFilters] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const performSearch = async () => {
      const query = state.query.trim();
      if (!query) {
        setState(prev => ({ ...prev, results: [], suggestions: [], totalResults: 0, loading: false, error: null }));
        return;
      }
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        const response = await apiClient.search(
          query,
          state.typeFilter !== 'all' ? state.typeFilter : undefined
        );
        if (!response.success || !response.data) {
          throw new Error(response.error?.message || 'Search failed. Please try again.');
        }
        const results = response.data.results ?? [];
        setState(prev => ({ ...prev, results, totalResults: results.length }));
      } catch (err) {
        setState(prev => ({
          ...prev,
          results: [],
          totalResults: 0,
          error: err instanceof Error ? err.message : 'Search failed. Please try again.',
        }));
      } finally {
        setState(prev => ({ ...prev, loading: false }));
      }
    };
    performSearch();
  }, [state.query, state.typeFilter]);

  // Suggestions from the real autocomplete endpoint, debounced.
  useEffect(() => {
    const query = state.query.trim();
    if (!query) {
      setState(prev => ({ ...prev, suggestions: [] }));
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const response = await apiClient.autocomplete(query);
        const data = response.data as unknown;
        const list = Array.isArray(data)
          ? data
          : data && typeof data === 'object' && Array.isArray((data as { suggestions?: unknown }).suggestions)
            ? (data as { suggestions: unknown[] }).suggestions
            : [];
        setState(prev => ({
          ...prev,
          suggestions: list.filter((s): s is string => typeof s === 'string').slice(0, 6),
        }));
      } catch {
        setState(prev => ({ ...prev, suggestions: [] }));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [state.query]);

  const handleSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    searchInputRef.current?.blur();
  }, []);

  const handleFilterChange = useCallback((value: TypeFilter) => {
    setState(prev => ({ ...prev, typeFilter: value }));
  }, []);

  const handleQueryChange = useCallback((value: string) => {
    setState(prev => ({ ...prev, query: value }));
  }, []);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    setState(prev => ({ ...prev, query: suggestion }));
  }, []);

  const formatNumber = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  const typeLabel = (type: SearchResult['type']): string => {
    switch (type) {
      case 'video': return 'Video';
      case 'channel': return 'Channel';
      case 'playlist': return 'Playlist';
      case 'track': return 'Track';
      case 'album': return 'Album';
      case 'show': return 'Show';
      default: return 'Result';
    }
  };

  const { query, typeFilter, results, suggestions, loading, error, totalResults } = state;

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="text-red-400 text-5xl mb-4">!</div>
          <p className="text-red-300 text-lg mb-4">{error}</p>
          <button
            onClick={() => setState(prev => ({ ...prev, error: null }))}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Search Header */}
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-6 py-4">
        <form onSubmit={handleSearchSubmit} className="max-w-3xl mx-auto flex gap-3">
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search QuantTube..."
            className="flex-1 px-5 py-3 bg-gray-800 border border-gray-700 rounded-full text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button type="submit" className="px-6 py-3 bg-gray-700 text-white rounded-full hover:bg-gray-600">
            Search
          </button>
          <button type="button" onClick={() => setShowFilters(!showFilters)} className={`px-4 py-3 rounded-full border transition ${showFilters ? 'border-blue-500 text-blue-400' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
            Filters
          </button>
        </form>
        {/* Autocomplete suggestions */}
        {!loading && suggestions.length > 0 && (
          <div className="max-w-3xl mx-auto mt-2 flex gap-2 flex-wrap">
            {suggestions.map(s => (
              <button key={s} onClick={() => handleSuggestionClick(s)} className="px-3 py-1 bg-gray-800 text-gray-300 rounded-full text-sm hover:bg-gray-700">
                {s}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Filter Chips — type filter only, passed to the search API */}
      {showFilters && (
        <div className="border-b border-gray-800 px-6 py-4">
          <div className="max-w-5xl mx-auto space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-400 w-24">Type:</span>
              {(['all', 'video', 'channel', 'playlist', 'movie'] as TypeFilter[]).map(option => (
                <button
                  key={option}
                  onClick={() => handleFilterChange(option)}
                  className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition ${typeFilter === option ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                >
                  {option === 'all' ? 'All types' : option}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* Results Count */}
        {!loading && query.trim() && (
          <p className="text-sm text-gray-500 mb-4">About {formatNumber(totalResults)} results for "{query}"</p>
        )}

        {/* Loading State */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex gap-4 animate-pulse">
                <div className="w-64 h-36 bg-gray-800 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-gray-800 rounded w-3/4" />
                  <div className="h-4 bg-gray-800 rounded w-1/2" />
                  <div className="h-3 bg-gray-800 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && results.length === 0 && query.trim() && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">No results</div>
            <p className="text-gray-400 text-lg">No results found for "{query}"</p>
            <p className="text-gray-500 mt-2">Try different keywords.</p>
          </div>
        )}

        {/* Idle State */}
        {!loading && results.length === 0 && !query.trim() && (
          <div className="text-center py-16">
            <p className="text-gray-400 text-lg">Type a search to find videos, channels, and playlists.</p>
          </div>
        )}

        {/* Search Results */}
        {!loading && results.length > 0 && (
          <div className="space-y-4">
            {results.map(result => (
              <div key={result.id} className="flex gap-4 group cursor-pointer">
                <div className="relative flex-shrink-0">
                  <img src={result.thumbnailUrl} alt={result.title} className="w-64 h-36 rounded-xl object-cover group-hover:opacity-80 transition" />
                  <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/70 text-white text-xs rounded capitalize">{typeLabel(result.type)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-medium text-white line-clamp-2 group-hover:text-blue-400 transition">{result.title}</h3>
                  <p className="text-sm text-gray-500 mt-2 line-clamp-3">{result.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default SearchPage;
