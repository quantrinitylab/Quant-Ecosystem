// ============================================================================
// QuantSync - Main Feed Page
// Algorithm/Chronological toggle, infinite scroll, real-time WebSocket updates
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { sanitizeMediaUrl } from '@quant/common';

interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorHandle: string;
  isVerified: boolean;
  content: string;
  media: { type: 'image' | 'video' | 'gif'; url: string; thumbnail?: string }[];
  poll?: {
    options: { id: string; text: string; votes: number }[];
    totalVotes: number;
    endsAt: string;
  };
  likes: number;
  reposts: number;
  replies: number;
  bookmarks: number;
  isLiked: boolean;
  isReposted: boolean;
  isBookmarked: boolean;
  createdAt: string;
  threadId?: string;
  communityId?: string;
  communityName?: string;
}

const FeedPage: React.FC = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [mode, setMode] = useState<'algorithm' | 'chronological'>('algorithm');
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [newPostsCount, setNewPostsCount] = useState<number>(0);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchFeed = useCallback(async (feedMode: string, pageCursor?: string | null) => {
    try {
      if (!pageCursor) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      const params = new URLSearchParams({ mode: feedMode, limit: '20' });
      if (pageCursor) params.set('cursor', pageCursor);
      const response = await fetch(`/api/feed?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to load feed');
      const data = await response.json();
      if (pageCursor) {
        setPosts((prev) => [...prev, ...data.posts]);
      } else {
        setPosts(data.posts);
      }
      setCursor(data.cursor || null);
      setHasMore(data.hasMore ?? data.posts.length === 20);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed(mode);
  }, [mode, fetchFeed]);

  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.host}/ws/feed`);
    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'new_post') {
          setNewPostsCount((prev) => prev + 1);
        } else if (msg.type === 'post_updated') {
          setPosts((prev) => prev.map((p) => (p.id === msg.post.id ? { ...p, ...msg.post } : p)));
        }
      } catch {}
    };
    wsRef.current = ws;
    return () => {
      ws.close();
    };
  }, []);

  const handleInfiniteScroll = useCallback(() => {
    if (!hasMore || loadingMore || !cursor) return;
    fetchFeed(mode, cursor);
  }, [hasMore, loadingMore, cursor, mode, fetchFeed]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          handleInfiniteScroll();
        }
      },
      { threshold: 0.1 },
    );
    observerRef.current = observer;
    if (bottomRef.current) observer.observe(bottomRef.current);
    return () => {
      observer.disconnect();
    };
  }, [handleInfiniteScroll]);

  const handleModeSwitch = useCallback((newMode: 'algorithm' | 'chronological') => {
    setPosts([]);
    setCursor(null);
    setHasMore(true);
    setNewPostsCount(0);
    setMode(newMode);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setNewPostsCount(0);
    await fetchFeed(mode);
    setRefreshing(false);
  }, [mode, fetchFeed]);

  const loadNewPosts = useCallback(() => {
    setNewPostsCount(0);
    fetchFeed(mode);
  }, [mode, fetchFeed]);

  const handleLike = useCallback(async (postId: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          return { ...p, isLiked: !p.isLiked, likes: p.isLiked ? p.likes - 1 : p.likes + 1 };
        }
        return p;
      }),
    );
    await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
  }, []);

  const handleRepost = useCallback(async (postId: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          return {
            ...p,
            isReposted: !p.isReposted,
            reposts: p.isReposted ? p.reposts - 1 : p.reposts + 1,
          };
        }
        return p;
      }),
    );
    await fetch(`/api/posts/${postId}/repost`, { method: 'POST' });
  }, []);

  const handleReply = useCallback((postId: string) => {
    window.location.href = `/post/${postId}`;
  }, []);

  const handleShare = useCallback(async (postId: string) => {
    const url = `${window.location.origin}/post/${postId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback: do nothing, clipboard API may not be available
    }
  }, []);

  const handleBookmark = useCallback(async (postId: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          return {
            ...p,
            isBookmarked: !p.isBookmarked,
            bookmarks: p.isBookmarked ? p.bookmarks - 1 : p.bookmarks + 1,
          };
        }
        return p;
      }),
    );
    await fetch(`/api/posts/${postId}/bookmark`, { method: 'POST' });
  }, []);

  const formatTime = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  if (loading && posts.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        <span className="ml-3 text-gray-500">Loading feed...</span>
      </div>
    );
  }

  if (error && posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-red-500 text-xl mb-4">Something went wrong</div>
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={() => fetchFeed(mode)}
          className="px-6 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto min-h-screen">
      <header className="sticky top-0 bg-white/80 backdrop-blur-sm border-b z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold">Home</h1>
          <div className="flex items-center gap-2">
            {wsConnected && <span className="w-2 h-2 bg-green-500 rounded-full" title="Live" />}
          </div>
        </div>
        <div className="flex border-b">
          <button
            onClick={() => handleModeSwitch('algorithm')}
            className={`flex-1 py-3 text-center font-medium transition-colors ${
              mode === 'algorithm'
                ? 'border-b-2 border-blue-500 text-blue-500'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            For You
          </button>
          <button
            onClick={() => handleModeSwitch('chronological')}
            className={`flex-1 py-3 text-center font-medium transition-colors ${
              mode === 'chronological'
                ? 'border-b-2 border-blue-500 text-blue-500'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            Following
          </button>
        </div>
      </header>

      {newPostsCount > 0 && (
        <button
          onClick={loadNewPosts}
          className="w-full py-3 bg-blue-50 text-blue-500 font-medium hover:bg-blue-100 transition-colors"
        >
          Show {newPostsCount} new {newPostsCount === 1 ? 'post' : 'posts'}
        </button>
      )}

      {refreshing && (
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
        </div>
      )}

      {posts.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="text-6xl mb-4">📭</div>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">No posts yet</h3>
          <p className="text-gray-500 text-center">
            Follow some people or join communities to see posts here.
          </p>
        </div>
      )}

      <div className="divide-y">
        {posts.map((post) => (
          <article
            key={post.id}
            className="px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <div className="flex gap-3">
              <img
                src={sanitizeMediaUrl(post.authorAvatar)}
                alt={post.authorName}
                className="w-12 h-12 rounded-full object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="font-bold text-gray-900 truncate">{post.authorName}</span>
                  {post.isVerified && (
                    <span className="text-blue-500" title="Verified">
                      ✓
                    </span>
                  )}
                  <span className="text-gray-500 truncate">@{post.authorHandle}</span>
                  <span className="text-gray-400 mx-1">·</span>
                  <span className="text-gray-500 text-sm flex-shrink-0">
                    {formatTime(post.createdAt)}
                  </span>
                </div>
                {post.communityName && (
                  <div className="text-xs text-purple-600 mb-1">in {post.communityName}</div>
                )}
                <p className="text-gray-900 whitespace-pre-wrap break-words mb-2">{post.content}</p>
                {post.media.length > 0 && (
                  <div
                    className={`grid gap-1 mb-2 rounded-xl overflow-hidden ${
                      post.media.length === 1
                        ? 'grid-cols-1'
                        : post.media.length === 2
                          ? 'grid-cols-2'
                          : 'grid-cols-2'
                    }`}
                  >
                    {post.media.map((m, idx) => (
                      <div key={idx} className="relative aspect-video bg-gray-100">
                        {m.type === 'video' ? (
                          <video
                            src={sanitizeMediaUrl(m.url)}
                            poster={sanitizeMediaUrl(m.thumbnail)}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <img
                            src={sanitizeMediaUrl(m.url)}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {post.poll && (
                  <div className="border rounded-xl p-3 mb-2">
                    {post.poll.options.map((opt) => {
                      const pct =
                        post.poll!.totalVotes > 0
                          ? Math.round((opt.votes / post.poll!.totalVotes) * 100)
                          : 0;
                      return (
                        <div key={opt.id} className="mb-2 last:mb-0">
                          <div className="relative h-8 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="absolute inset-y-0 left-0 bg-blue-100 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                            <div className="absolute inset-0 flex items-center justify-between px-3">
                              <span className="text-sm font-medium">{opt.text}</span>
                              <span className="text-sm text-gray-600">{pct}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-xs text-gray-500 mt-2">{post.poll.totalVotes} votes</p>
                  </div>
                )}
                <div className="flex items-center justify-between mt-2 max-w-md">
                  <button
                    onClick={() => handleReply(post.id)}
                    className="flex items-center gap-1 text-gray-500 hover:text-blue-500 group"
                  >
                    <span className="p-2 rounded-full group-hover:bg-blue-50">💬</span>
                    <span className="text-sm">{post.replies > 0 ? post.replies : ''}</span>
                  </button>
                  <button
                    onClick={() => handleRepost(post.id)}
                    className={`flex items-center gap-1 group ${post.isReposted ? 'text-green-500' : 'text-gray-500 hover:text-green-500'}`}
                  >
                    <span className="p-2 rounded-full group-hover:bg-green-50">🔄</span>
                    <span className="text-sm">{post.reposts > 0 ? post.reposts : ''}</span>
                  </button>
                  <button
                    onClick={() => handleLike(post.id)}
                    className={`flex items-center gap-1 group ${post.isLiked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}
                  >
                    <span className="p-2 rounded-full group-hover:bg-red-50">
                      {post.isLiked ? '❤️' : '🤍'}
                    </span>
                    <span className="text-sm">{post.likes > 0 ? post.likes : ''}</span>
                  </button>
                  <button
                    onClick={() => handleBookmark(post.id)}
                    className={`flex items-center gap-1 group ${post.isBookmarked ? 'text-blue-500' : 'text-gray-500 hover:text-blue-500'}`}
                  >
                    <span className="p-2 rounded-full group-hover:bg-blue-50">
                      {post.isBookmarked ? '🔖' : '📑'}
                    </span>
                  </button>
                  <button
                    onClick={() => handleShare(post.id)}
                    className="flex items-center gap-1 text-gray-500 hover:text-blue-500 group"
                  >
                    <span className="p-2 rounded-full group-hover:bg-blue-50">↗️</span>
                  </button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      {loadingMore && (
        <div className="flex justify-center py-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      )}

      <div ref={bottomRef} className="h-4" />

      <button
        onClick={handleRefresh}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-600 flex items-center justify-center text-2xl"
        title="Refresh feed"
      >
        ↻
      </button>
    </div>
  );
};

export default FeedPage;
