// ============================================================================
// QuantTube - Search Results Page
// Search with filter chips, video/channel results, suggestions
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface VideoResult {
  id: string;
  type: 'video';
  title: string;
  thumbnail: string;
  channelName: string;
  channelAvatar: string;
  channelId: string;
  views: number;
  publishedAt: string;
  duration: number;
  description: string;
}

interface ChannelResult {
  id: string;
  type: 'channel';
  name: string;
  avatar: string;
  subscriberCount: number;
  videoCount: number;
  description: string;
  verified: boolean;
}

interface PlaylistResult {
  id: string;
  type: 'playlist';
  title: string;
  thumbnail: string;
  channelName: string;
  videoCount: number;
  updatedAt: string;
}

type SearchResult = VideoResult | ChannelResult | PlaylistResult;

type UploadDateFilter = 'any' | 'hour' | 'today' | 'week' | 'month' | 'year';
type TypeFilter = 'all' | 'video' | 'channel' | 'playlist' | 'movie';
type DurationFilter = 'any' | 'short' | 'medium' | 'long';
type SortFilter = 'relevance' | 'date' | 'views' | 'rating';

interface SearchFilters {
  uploadDate: UploadDateFilter;
  type: TypeFilter;
  duration: DurationFilter;
  sort: SortFilter;
}

interface SearchPageState {
  query: string;
  filters: SearchFilters;
  results: SearchResult[];
  suggestions: string[];
  didYouMean: string | null;
  loading: boolean;
  error: string | null;
  totalResults: number;
}

const MOCK_VIDEO_RESULTS: VideoResult[] = [
  { id: 'sr1', type: 'video', title: 'Complete React Tutorial for Beginners 2024', thumbnail: '/thumbs/react-tut.jpg', channelName: 'TechVision', channelAvatar: '/avatars/tv.jpg', channelId: 'ch1', views: 1250000, publishedAt: '2024-01-05', duration: 7200, description: 'Learn React from scratch with this comprehensive tutorial covering hooks, context, routing, and more.' },
  { id: 'sr2', type: 'video', title: 'React vs Vue vs Angular - 2024 Comparison', thumbnail: '/thumbs/comparison.jpg', channelName: 'WebDev Simplified', channelAvatar: '/avatars/wds.jpg', channelId: 'ch2', views: 890000, publishedAt: '2024-01-03', duration: 2400, description: 'In-depth comparison of the three major frontend frameworks for web development in 2024.' },
  { id: 'sr3', type: 'video', title: 'Building a Full Stack App with React & Node.js', thumbnail: '/thumbs/fullstack.jpg', channelName: 'Traversy Media', channelAvatar: '/avatars/tm.jpg', channelId: 'ch3', views: 567000, publishedAt: '2023-12-28', duration: 5400, description: 'Build a complete MERN stack application from scratch including authentication and deployment.' },
  { id: 'sr4', type: 'video', title: 'React Performance Optimization Tips', thumbnail: '/thumbs/perf.jpg', channelName: 'Jack Herrington', channelAvatar: '/avatars/jh.jpg', channelId: 'ch4', views: 234000, publishedAt: '2024-01-10', duration: 1800, description: 'Advanced techniques to make your React applications blazing fast with memoization, lazy loading, and more.' },
];

const MOCK_CHANNEL_RESULTS: ChannelResult[] = [
  { id: 'cr1', type: 'channel', name: 'React Official', avatar: '/avatars/react.jpg', subscriberCount: 1200000, videoCount: 180, description: 'Official React channel with tutorials, talks, and updates.', verified: true },
];

const MOCK_PLAYLIST_RESULTS: PlaylistResult[] = [
  { id: 'pr1', type: 'playlist', title: 'React Masterclass - Complete Series', thumbnail: '/thumbs/react-pl.jpg', channelName: 'TechVision', videoCount: 24, updatedAt: '2024-01-12' },
];

const SearchPage: React.FC = () => {
  const [query, setQuery] = useState('react tutorial');
  const [filters, setFilters] = useState<SearchFilters>({ uploadDate: 'any', type: 'all', duration: 'any', sort: 'relevance' });
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [didYouMean, setDidYouMean] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalResults, setTotalResults] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const performSearch = async () => {
      if (!query.trim()) {
        setResults([]);
        setTotalResults(0);
        return;
      }
      try {
        setLoading(true);
        await new Promise(resolve => setTimeout(resolve, 400));
        let allResults: SearchResult[] = [...MOCK_VIDEO_RESULTS, ...MOCK_CHANNEL_RESULTS, ...MOCK_PLAYLIST_RESULTS];

        if (filters.type !== 'all') {
          allResults = allResults.filter(r => r.type === filters.type);
        }

        if (filters.duration !== 'any') {
          allResults = allResults.filter(r => {
            if (r.type !== 'video') return true;
            const dur = r.duration;
            switch (filters.duration) {
              case 'short': return dur < 240;
              case 'medium': return dur >= 240 && dur <= 1200;
              case 'long': return dur > 1200;
              default: return true;
            }
          });
        }

        if (filters.sort === 'views') {
          allResults.sort((a, b) => {
            const aViews = a.type === 'video' ? a.views : 0;
            const bViews = b.type === 'video' ? b.views : 0;
            return bViews - aViews;
          });
        } else if (filters.sort === 'date') {
          allResults.sort((a, b) => {
            const aDate = a.type === 'video' ? a.publishedAt : '';
            const bDate = b.type === 'video' ? b.publishedAt : '';
            return bDate.localeCompare(aDate);
          });
        }

        setResults(allResults);
        setTotalResults(allResults.length);
        setDidYouMean(query.includes('recat') ? 'react tutorial' : null);
        setSuggestions(['react hooks', 'react native', 'react router', 'react context']);
        setError(null);
      } catch (err) {
        setError('Search failed. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    performSearch();
  }, [query, filters]);

  const handleSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
  }, []);

  const handleFilterChange = useCallback((filterKey: keyof SearchFilters, value: string) => {
    setFilters(prev => ({ ...prev, [filterKey]: value }));
  }, []);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    setQuery(suggestion);
  }, []);

  const formatNumber = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="text-red-400 text-5xl mb-4">!</div>
          <p className="text-red-300 text-lg mb-4">{error}</p>
          <button onClick={() => setError(null)} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Retry</button>
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
            onChange={(e) => setQuery(e.target.value)}
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
      </header>

      {/* Filter Chips */}
      {showFilters && (
        <div className="border-b border-gray-800 px-6 py-4">
          <div className="max-w-5xl mx-auto space-y-3">
            {/* Upload Date */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-400 w-24">Upload date:</span>
              {(['any', 'hour', 'today', 'week', 'month', 'year'] as UploadDateFilter[]).map(option => (
                <button
                  key={option}
                  onClick={() => handleFilterChange('uploadDate', option)}
                  className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition ${filters.uploadDate === option ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                >
                  {option === 'any' ? 'Any time' : option === 'hour' ? 'Last hour' : option === 'today' ? 'Today' : option === 'week' ? 'This week' : option === 'month' ? 'This month' : 'This year'}
                </button>
              ))}
            </div>

            {/* Type */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-400 w-24">Type:</span>
              {(['all', 'video', 'channel', 'playlist', 'movie'] as TypeFilter[]).map(option => (
                <button
                  key={option}
                  onClick={() => handleFilterChange('type', option)}
                  className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition ${filters.type === option ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                >
                  {option === 'all' ? 'All types' : option}
                </button>
              ))}
            </div>

            {/* Duration */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-400 w-24">Duration:</span>
              {(['any', 'short', 'medium', 'long'] as DurationFilter[]).map(option => (
                <button
                  key={option}
                  onClick={() => handleFilterChange('duration', option)}
                  className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition ${filters.duration === option ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                >
                  {option === 'any' ? 'Any' : option === 'short' ? 'Under 4 min' : option === 'medium' ? '4-20 min' : 'Over 20 min'}
                </button>
              ))}
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-400 w-24">Sort by:</span>
              {(['relevance', 'date', 'views', 'rating'] as SortFilter[]).map(option => (
                <button
                  key={option}
                  onClick={() => handleFilterChange('sort', option)}
                  className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition ${filters.sort === option ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                >
                  {option === 'date' ? 'Upload date' : option === 'views' ? 'View count' : option}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* Did You Mean */}
        {didYouMean && (
          <div className="mb-4">
            <p className="text-gray-400">
              Did you mean: <button onClick={() => setQuery(didYouMean)} className="text-blue-400 hover:underline font-medium">{didYouMean}</button>?
            </p>
          </div>
        )}

        {/* Results Count */}
        {!loading && (
          <p className="text-sm text-gray-500 mb-4">About {totalResults} results for "{query}"</p>
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
            <p className="text-gray-500 mt-2">Try different keywords or remove some filters.</p>
            {suggestions.length > 0 && (
              <div className="mt-4">
                <p className="text-gray-400 text-sm mb-2">Suggestions:</p>
                <div className="flex gap-2 justify-center flex-wrap">
                  {suggestions.map(s => (
                    <button key={s} onClick={() => handleSuggestionClick(s)} className="px-3 py-1 bg-gray-800 text-gray-300 rounded-full text-sm hover:bg-gray-700">{s}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search Results */}
        {!loading && results.length > 0 && (
          <div className="space-y-4">
            {results.map(result => {
              if (result.type === 'video') {
                return (
                  <div key={result.id} className="flex gap-4 group cursor-pointer">
                    <div className="relative flex-shrink-0">
                      <img src={result.thumbnail} alt={result.title} className="w-64 h-36 rounded-xl object-cover group-hover:opacity-80 transition" />
                      <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 text-white text-xs rounded">{formatDuration(result.duration)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-medium text-white line-clamp-2 group-hover:text-blue-400 transition">{result.title}</h3>
                      <p className="text-sm text-gray-500 mt-1">{formatNumber(result.views)} views - {result.publishedAt}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <img src={result.channelAvatar} alt={result.channelName} className="w-6 h-6 rounded-full" />
                        <span className="text-sm text-gray-400">{result.channelName}</span>
                      </div>
                      <p className="text-sm text-gray-500 mt-2 line-clamp-2">{result.description}</p>
                    </div>
                  </div>
                );
              }

              if (result.type === 'channel') {
                return (
                  <div key={result.id} className="flex items-center gap-6 p-4 bg-gray-800 rounded-xl cursor-pointer hover:bg-gray-750 transition">
                    <img src={result.avatar} alt={result.name} className="w-20 h-20 rounded-full" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-medium text-white">{result.name}</h3>
                        {result.verified && <span className="text-xs text-blue-400 font-bold">Verified</span>}
                      </div>
                      <p className="text-sm text-gray-400">{formatNumber(result.subscriberCount)} subscribers - {result.videoCount} videos</p>
                      <p className="text-sm text-gray-500 mt-1 line-clamp-1">{result.description}</p>
                    </div>
                    <button className="px-4 py-2 bg-white text-gray-900 rounded-full text-sm font-medium hover:bg-gray-200">Subscribe</button>
                  </div>
                );
              }

              if (result.type === 'playlist') {
                return (
                  <div key={result.id} className="flex gap-4 group cursor-pointer">
                    <div className="relative flex-shrink-0">
                      <img src={result.thumbnail} alt={result.title} className="w-64 h-36 rounded-xl object-cover" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl">
                        <span className="text-white font-bold">{result.videoCount} videos</span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-white group-hover:text-blue-400 transition">{result.title}</h3>
                      <p className="text-sm text-gray-400 mt-1">{result.channelName} - Playlist</p>
                      <p className="text-xs text-gray-500 mt-1">Updated {result.updatedAt}</p>
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default SearchPage;
