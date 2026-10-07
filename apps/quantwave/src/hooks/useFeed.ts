// ============================================================================
// QuantSync - useFeed Hook
// Feed state management with infinite scroll, real-time updates, mode switching
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';

interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  isVerified: boolean;
  content: string;
  media: { type: string; url: string; thumbnail?: string }[];
  poll?: { options: { id: string; text: string; votes: number }[]; totalVotes: number; endsAt: string };
  likes: number;
  reposts: number;
  replies: number;
  bookmarks: number;
  isLiked: boolean;
  isReposted: boolean;
  isBookmarked: boolean;
  createdAt: string;
  communityId?: string;
  communityName?: string;
}

type FeedMode = 'algorithm' | 'chronological' | 'community';

interface UseFeedOptions {
  initialMode?: FeedMode;
  communityId?: string;
  pageSize?: number;
  enableRealtime?: boolean;
}

interface UseFeedReturn {
  posts: Post[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  mode: FeedMode;
  newPostsCount: number;
  wsConnected: boolean;
  switchMode: (mode: FeedMode) => void;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  loadNewPosts: () => void;
  likePost: (postId: string) => Promise<void>;
  repostPost: (postId: string) => Promise<void>;
  bookmarkPost: (postId: string) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
}

export function useFeed(options: UseFeedOptions = {}): UseFeedReturn {
  const { initialMode = 'algorithm', communityId, pageSize = 20, enableRealtime = true } = options;

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [mode, setMode] = useState<FeedMode>(initialMode);
  const [newPostsCount, setNewPostsCount] = useState<number>(0);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPosts = useCallback(async (feedMode: FeedMode, pageCursor?: string | null, reset?: boolean) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (reset || !pageCursor) setLoading(true);
      else setLoadingMore(true);

      const params = new URLSearchParams({ mode: feedMode, limit: String(pageSize) });
      if (pageCursor) params.set('cursor', pageCursor);
      if (communityId) params.set('community', communityId);

      const response = await fetch(`/api/feed?${params.toString()}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Feed request failed: ${response.status}`);

      const data = await response.json();
      const newPosts: Post[] = data.posts || [];

      if (reset || !pageCursor) {
        setPosts(newPosts);
      } else {
        setPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const unique = newPosts.filter(p => !existingIds.has(p.id));
          return [...prev, ...unique];
        });
      }

      setCursor(data.cursor || null);
      setHasMore(data.hasMore ?? newPosts.length >= pageSize);
      setError(null);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Failed to load feed');
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [pageSize, communityId]);

  useEffect(() => {
    fetchPosts(mode, null, true);
  }, [mode, fetchPosts]);

  useEffect(() => {
    if (!enableRealtime) return;

    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost';
    const ws = new WebSocket(`${protocol}//${host}/ws/feed`);

    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => {
      setWsConnected(false);
      setTimeout(() => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
      }, 5000);
    };
    ws.onerror = () => setWsConnected(false);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'new_post':
            setNewPostsCount(prev => prev + 1);
            break;
          case 'post_deleted':
            setPosts(prev => prev.filter(p => p.id !== msg.postId));
            break;
          case 'post_updated':
            setPosts(prev => prev.map(p => p.id === msg.post.id ? { ...p, ...msg.post } : p));
            break;
          case 'engagement_update':
            setPosts(prev => prev.map(p => {
              if (p.id === msg.postId) {
                return { ...p, likes: msg.likes ?? p.likes, reposts: msg.reposts ?? p.reposts, replies: msg.replies ?? p.replies };
              }
              return p;
            }));
            break;
        }
      } catch {}
    };

    wsRef.current = ws;
    return () => { ws.close(); };
  }, [enableRealtime]);

  const switchMode = useCallback((newMode: FeedMode) => {
    setPosts([]);
    setCursor(null);
    setHasMore(true);
    setNewPostsCount(0);
    setMode(newMode);
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !cursor) return;
    await fetchPosts(mode, cursor);
  }, [hasMore, loadingMore, cursor, mode, fetchPosts]);

  const refresh = useCallback(async () => {
    setNewPostsCount(0);
    setCursor(null);
    await fetchPosts(mode, null, true);
  }, [mode, fetchPosts]);

  const loadNewPosts = useCallback(() => {
    setNewPostsCount(0);
    fetchPosts(mode, null, true);
  }, [mode, fetchPosts]);

  const likePost = useCallback(async (postId: string) => {
    setPosts(prev => prev.map(p => {
      if (p.id === postId) return { ...p, isLiked: !p.isLiked, likes: p.isLiked ? p.likes - 1 : p.likes + 1 };
      return p;
    }));
    try {
      await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
    } catch {
      setPosts(prev => prev.map(p => {
        if (p.id === postId) return { ...p, isLiked: !p.isLiked, likes: p.isLiked ? p.likes - 1 : p.likes + 1 };
        return p;
      }));
    }
  }, []);

  const repostPost = useCallback(async (postId: string) => {
    setPosts(prev => prev.map(p => {
      if (p.id === postId) return { ...p, isReposted: !p.isReposted, reposts: p.isReposted ? p.reposts - 1 : p.reposts + 1 };
      return p;
    }));
    try {
      await fetch(`/api/posts/${postId}/repost`, { method: 'POST' });
    } catch {
      setPosts(prev => prev.map(p => {
        if (p.id === postId) return { ...p, isReposted: !p.isReposted, reposts: p.isReposted ? p.reposts - 1 : p.reposts + 1 };
        return p;
      }));
    }
  }, []);

  const bookmarkPost = useCallback(async (postId: string) => {
    setPosts(prev => prev.map(p => {
      if (p.id === postId) return { ...p, isBookmarked: !p.isBookmarked, bookmarks: p.isBookmarked ? p.bookmarks - 1 : p.bookmarks + 1 };
      return p;
    }));
    await fetch(`/api/posts/${postId}/bookmark`, { method: 'POST' });
  }, []);

  const deletePost = useCallback(async (postId: string) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
    await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
  }, []);

  return {
    posts, loading, loadingMore, error, hasMore, mode, newPostsCount, wsConnected,
    switchMode, loadMore, refresh, loadNewPosts, likePost, repostPost, bookmarkPost, deletePost,
  };
}

export default useFeed;
