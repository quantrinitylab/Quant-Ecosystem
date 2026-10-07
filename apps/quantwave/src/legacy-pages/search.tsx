// ============================================================================
// QuantSync - Search Page
// Multi-tab search with filters, recent searches, autocomplete
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface SearchResult {
  posts: {
    id: string;
    authorName: string;
    authorHandle: string;
    authorAvatar: string;
    content: string;
    likes: number;
    createdAt: string;
  }[];
  people: {
    id: string;
    name: string;
    handle: string;
    avatar: string;
    bio: string;
    isVerified: boolean;
    followersCount: number;
    isFollowing: boolean;
  }[];
  communities: {
    id: string;
    name: string;
    icon: string;
    memberCount: number;
    description: string;
  }[];
  hashtags: { tag: string; postCount: number; trending: boolean }[];
}

interface SearchFilters {
  dateFrom: string;
  dateTo: string;
  fromUser: string;
  hasMedia: boolean;
  minLikes: number;
}

type SearchTab = 'posts' | 'people' | 'communities' | 'hashtags';

const SearchPage: React.FC = () => {
  const [query, setQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<SearchTab>('posts');
  const [results, setResults] = useState<SearchResult>({
    posts: [],
    people: [],
    communities: [],
    hashtags: [],
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [filters, setFilters] = useState<SearchFilters>({
    dateFrom: '',
    dateTo: '',
    fromUser: '',
    hasMedia: false,
    minLikes: 0,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('quantsync_recent_searches');
    if (saved) setRecentSearches(JSON.parse(saved));
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      }
    } catch {}
  }, []);

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      setShowSuggestions(true);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchSuggestions(value), 300);
    },
    [fetchSuggestions],
  );

  const executeSearch = useCallback(
    async (searchQuery?: string) => {
      const q = searchQuery || query;
      if (!q.trim()) return;
      setLoading(true);
      setShowSuggestions(false);
      setError(null);
      try {
        const params = new URLSearchParams({ q, tab: activeTab });
        if (filters.dateFrom) params.set('from', filters.dateFrom);
        if (filters.dateTo) params.set('to', filters.dateTo);
        if (filters.fromUser) params.set('user', filters.fromUser);
        if (filters.hasMedia) params.set('media', 'true');
        if (filters.minLikes > 0) params.set('minLikes', String(filters.minLikes));
        const res = await fetch(`/api/search?${params.toString()}`);
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        setResults(data);
        const updated = [q, ...recentSearches.filter((s) => s !== q)].slice(0, 10);
        setRecentSearches(updated);
        localStorage.setItem('quantsync_recent_searches', JSON.stringify(updated));
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [query, activeTab, filters, recentSearches],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') executeSearch();
    },
    [executeSearch],
  );

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    localStorage.removeItem('quantsync_recent_searches');
  }, []);

  const handleFollow = useCallback(async (userId: string) => {
    setResults((prev) => ({
      ...prev,
      people: prev.people.map((p) => (p.id === userId ? { ...p, isFollowing: !p.isFollowing } : p)),
    }));
    await fetch(`/api/users/${userId}/follow`, { method: 'POST' });
  }, []);

  const hasResults =
    results.posts.length > 0 ||
    results.people.length > 0 ||
    results.communities.length > 0 ||
    results.hashtags.length > 0;

  return (
    <div className="max-w-2xl mx-auto min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <header className="sticky top-0 bg-white/90 backdrop-blur border-b z-10 px-4 py-3">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Search posts, people, communities..."
            className="w-full border rounded-full px-4 py-2.5 pl-10 text-sm bg-gray-50 focus:bg-white focus:border-blue-500"
          />
          <span className="absolute left-3 top-3 text-gray-400">🔍</span>
          {query && (
            <button
              onClick={() => {
                setQuery('');
                setSuggestions([]);
              }}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>

        {showSuggestions && (suggestions.length > 0 || recentSearches.length > 0) && (
          <div className="absolute left-4 right-4 top-16 bg-white border rounded-xl shadow-lg z-30 max-h-64 overflow-y-auto">
            {suggestions.length > 0 ? (
              suggestions.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setQuery(s);
                    executeSearch(s);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm flex items-center gap-2"
                >
                  <span className="text-gray-400">🔍</span> {s}
                </button>
              ))
            ) : (
              <>
                <div className="flex items-center justify-between px-4 py-2 border-b">
                  <span className="text-xs font-medium text-gray-500">Recent</span>
                  <button onClick={clearRecentSearches} className="text-xs text-blue-500">
                    Clear all
                  </button>
                </div>
                {recentSearches.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setQuery(s);
                      executeSearch(s);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm flex items-center gap-2"
                  >
                    <span className="text-gray-400">🕐</span> {s}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-3">
          <div className="flex gap-1">
            {(['posts', 'people', 'communities', 'hashtags'] as SearchTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 rounded-full text-xs capitalize ${activeTab === tab ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {tab}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`text-xs px-2 py-1 rounded ${showFilters ? 'bg-blue-100 text-blue-700' : 'text-gray-500'}`}
          >
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="mt-3 p-3 bg-gray-50 rounded-xl space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-500">From date</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                  className="w-full border rounded px-2 py-1 text-xs"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500">To date</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                  className="w-full border rounded px-2 py-1 text-xs"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">From user</label>
              <input
                type="text"
                value={filters.fromUser}
                onChange={(e) => setFilters((f) => ({ ...f, fromUser: e.target.value }))}
                className="w-full border rounded px-2 py-1 text-xs"
                placeholder="@handle"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={filters.hasMedia}
                  onChange={(e) => setFilters((f) => ({ ...f, hasMedia: e.target.checked }))}
                />
                Has media
              </label>
              <div className="flex items-center gap-1">
                <label className="text-xs text-gray-500">Min likes:</label>
                <input
                  type="number"
                  value={filters.minLikes}
                  onChange={(e) => setFilters((f) => ({ ...f, minLikes: Number(e.target.value) }))}
                  className="w-16 border rounded px-2 py-0.5 text-xs"
                  min="0"
                />
              </div>
            </div>
          </div>
        )}
      </header>

      {loading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      )}

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {!loading && !hasResults && query && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🔍</div>
          <h3 className="text-lg font-semibold text-gray-700">No results found</h3>
          <p className="text-gray-500 mt-1">Try different keywords or filters</p>
        </div>
      )}

      {!loading && !query && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🔍</div>
          <h3 className="text-lg font-semibold text-gray-700">Search QuantSync</h3>
          <p className="text-gray-500 mt-1">Find posts, people, communities, and hashtags</p>
        </div>
      )}

      {activeTab === 'posts' && results.posts.length > 0 && (
        <div className="divide-y">
          {results.posts.map((post) => (
            <div key={post.id} className="px-4 py-3 hover:bg-gray-50 cursor-pointer">
              <div className="flex gap-2">
                <img src={post.authorAvatar} alt="" className="w-8 h-8 rounded-full" />
                <div className="flex-1">
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-sm">{post.authorName}</span>
                    <span className="text-gray-500 text-xs">@{post.authorHandle}</span>
                  </div>
                  <p className="text-sm text-gray-900 mt-0.5 line-clamp-3">{post.content}</p>
                  <span className="text-xs text-gray-500 mt-1">❤️ {post.likes}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'people' && results.people.length > 0 && (
        <div className="divide-y">
          {results.people.map((person) => (
            <div key={person.id} className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={person.avatar} alt="" className="w-12 h-12 rounded-full" />
                <div>
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-sm">{person.name}</span>
                    {person.isVerified && <span className="text-blue-500 text-xs">✓</span>}
                  </div>
                  <span className="text-gray-500 text-sm">@{person.handle}</span>
                  <p className="text-xs text-gray-600 line-clamp-1 mt-0.5">{person.bio}</p>
                  <span className="text-xs text-gray-500">
                    {person.followersCount.toLocaleString()} followers
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleFollow(person.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium ${person.isFollowing ? 'border' : 'bg-gray-900 text-white'}`}
              >
                {person.isFollowing ? 'Following' : 'Follow'}
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'communities' && results.communities.length > 0 && (
        <div className="divide-y">
          {results.communities.map((community) => (
            <div
              key={community.id}
              className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 cursor-pointer"
            >
              <img src={community.icon} alt="" className="w-12 h-12 rounded-full" />
              <div>
                <h3 className="font-bold text-sm">{community.name}</h3>
                <p className="text-xs text-gray-600 line-clamp-1">{community.description}</p>
                <span className="text-xs text-gray-500">
                  {community.memberCount.toLocaleString()} members
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'hashtags' && results.hashtags.length > 0 && (
        <div className="divide-y">
          {results.hashtags.map((hashtag) => (
            <div key={hashtag.tag} className="px-4 py-3 hover:bg-gray-50 cursor-pointer">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold">#{hashtag.tag}</span>
                  <p className="text-sm text-gray-500">
                    {hashtag.postCount.toLocaleString()} posts
                  </p>
                </div>
                {hashtag.trending && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    Trending
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchPage;
