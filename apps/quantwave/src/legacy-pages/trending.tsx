// ============================================================================
// QuantSync - Trending Page
// Trending hashtags, posts, time range filter, location, personalized trends
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';

interface TrendingHashtag {
  id: string;
  tag: string;
  postCount: number;
  direction: 'up' | 'down' | 'stable';
  changePercent: number;
  category: string;
}

interface TrendingPost {
  id: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  isVerified: boolean;
  content: string;
  media?: { url: string; type: string }[];
  likes: number;
  reposts: number;
  replies: number;
  createdAt: string;
}

type TimeRange = '1h' | '6h' | '24h' | '7d';
type TrendView = 'hashtags' | 'posts' | 'foryou';

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '1h', label: '1 Hour' },
  { value: '6h', label: '6 Hours' },
  { value: '24h', label: '24 Hours' },
  { value: '7d', label: '7 Days' },
];

const TrendingPage: React.FC = () => {
  const [hashtags, setHashtags] = useState<TrendingHashtag[]>([]);
  const [posts, setPosts] = useState<TrendingPost[]>([]);
  const [forYouPosts, setForYouPosts] = useState<TrendingPost[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [view, setView] = useState<TrendView>('hashtags');
  const [location, setLocation] = useState<string>('global');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrending = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ timeRange, location });
      const [hashtagsRes, postsRes] = await Promise.all([
        fetch(`/api/trending/hashtags?${params.toString()}`),
        fetch(`/api/trending/posts?${params.toString()}`),
      ]);
      if (!hashtagsRes.ok || !postsRes.ok) throw new Error('Failed to load trending');
      const hashtagsData = await hashtagsRes.json();
      const postsData = await postsRes.json();
      setHashtags(hashtagsData.hashtags || []);
      setPosts(postsData.posts || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [timeRange, location]);

  const fetchForYou = useCallback(async () => {
    try {
      const res = await fetch('/api/trending/foryou');
      if (res.ok) {
        const data = await res.json();
        setForYouPosts(data.posts || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchTrending();
    fetchForYou();
  }, [fetchTrending, fetchForYou]);

  const formatCount = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  const getDirectionIcon = (dir: string): string => {
    if (dir === 'up') return '📈';
    if (dir === 'down') return '📉';
    return '➡️';
  };

  if (loading && hashtags.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        <span className="ml-3 text-gray-500">Loading trends...</span>
      </div>
    );
  }

  if (error && hashtags.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-red-500 text-xl mb-4">Failed to load trends</div>
        <p className="text-gray-600 mb-4">{error}</p>
        <button onClick={fetchTrending} className="px-6 py-2 bg-blue-500 text-white rounded-full">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <header className="sticky top-0 bg-white/90 backdrop-blur border-b z-10">
        <div className="px-4 py-3">
          <h1 className="text-xl font-bold">Trending</h1>
        </div>
        <div className="flex border-b">
          {(['hashtags', 'posts', 'foryou'] as TrendView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 py-3 text-center text-sm font-medium capitalize ${
                view === v
                  ? 'border-b-2 border-blue-500 text-blue-500'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {v === 'foryou' ? 'For You' : v}
            </button>
          ))}
        </div>
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex gap-2">
            {TIME_RANGES.map((tr) => (
              <button
                key={tr.value}
                onClick={() => setTimeRange(tr.value)}
                className={`px-3 py-1 rounded-full text-xs ${
                  timeRange === tr.value
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tr.label}
              </button>
            ))}
          </div>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="border rounded-lg px-2 py-1 text-xs"
          >
            <option value="global">Global</option>
            <option value="us">United States</option>
            <option value="uk">United Kingdom</option>
            <option value="in">India</option>
            <option value="de">Germany</option>
            <option value="jp">Japan</option>
          </select>
        </div>
      </header>

      {view === 'hashtags' && (
        <div className="divide-y">
          {hashtags.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-3">🔥</div>
              <p className="text-gray-500">No trending hashtags right now</p>
            </div>
          ) : (
            hashtags.map((tag, idx) => (
              <div key={tag.id} className="px-4 py-3 hover:bg-gray-50 cursor-pointer">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">{idx + 1}</span>
                      <span className="font-bold text-lg">#{tag.tag}</span>
                      <span>{getDirectionIcon(tag.direction)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-sm text-gray-500">
                        {formatCount(tag.postCount)} posts
                      </span>
                      <span
                        className={`text-xs ${tag.direction === 'up' ? 'text-green-500' : tag.direction === 'down' ? 'text-red-500' : 'text-gray-500'}`}
                      >
                        {tag.direction === 'up' ? '+' : tag.direction === 'down' ? '-' : ''}
                        {tag.changePercent}%
                      </span>
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                        {tag.category}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {view === 'posts' && (
        <div className="divide-y">
          {posts.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-3">📰</div>
              <p className="text-gray-500">No trending posts right now</p>
            </div>
          ) : (
            posts.map((post) => (
              <article key={post.id} className="px-4 py-3 hover:bg-gray-50">
                <div className="flex gap-3">
                  <img src={post.authorAvatar} alt="" className="w-10 h-10 rounded-full" />
                  <div className="flex-1">
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-sm">{post.authorName}</span>
                      {post.isVerified && <span className="text-blue-500 text-xs">✓</span>}
                      <span className="text-gray-500 text-sm">@{post.authorHandle}</span>
                    </div>
                    <p className="text-gray-900 mt-1 line-clamp-3">{post.content}</p>
                    {post.media && post.media.length > 0 && (
                      <div className="mt-2 rounded-xl overflow-hidden">
                        <img src={post.media[0]?.url} alt="" className="w-full h-48 object-cover" />
                      </div>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <span>💬 {formatCount(post.replies)}</span>
                      <span>🔄 {formatCount(post.reposts)}</span>
                      <span>❤️ {formatCount(post.likes)}</span>
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      )}

      {view === 'foryou' && (
        <div className="divide-y">
          {forYouPosts.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-3">✨</div>
              <h3 className="text-lg font-semibold text-gray-700">Personalized for you</h3>
              <p className="text-gray-500 mt-1">
                Engage more to get personalized trend suggestions.
              </p>
            </div>
          ) : (
            forYouPosts.map((post) => (
              <article key={post.id} className="px-4 py-3 hover:bg-gray-50">
                <div className="flex gap-3">
                  <img src={post.authorAvatar} alt="" className="w-10 h-10 rounded-full" />
                  <div className="flex-1">
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-sm">{post.authorName}</span>
                      {post.isVerified && <span className="text-blue-500 text-xs">✓</span>}
                    </div>
                    <p className="text-gray-900 mt-1">{post.content}</p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <span>❤️ {formatCount(post.likes)}</span>
                      <span>🔄 {formatCount(post.reposts)}</span>
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default TrendingPage;
