// ============================================================================
// QuantSync - Anonymous Feed Page
// Anonymous posting with reputation system, trust scores, reveal mechanism
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';

interface AnonymousPost {
  id: string;
  content: string;
  media?: { url: string; type: string }[];
  upvotes: number;
  downvotes: number;
  replies: number;
  trustScore: number;
  isRevealed: boolean;
  revealedAuthor?: { name: string; avatar: string; handle: string };
  canReveal: boolean;
  userVote: 'up' | 'down' | null;
  createdAt: string;
  tags: string[];
}

interface UserTrustProfile {
  score: number;
  level: string;
  postsCount: number;
  totalUpvotes: number;
  rank: number;
}

const AnonymousPage: React.FC = () => {
  const [posts, setPosts] = useState<AnonymousPost[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isAnonymousMode, setIsAnonymousMode] = useState<boolean>(true);
  const [trustProfile, setTrustProfile] = useState<UserTrustProfile | null>(null);
  const [newPostContent, setNewPostContent] = useState<string>('');
  const [posting, setPosting] = useState<boolean>(false);
  const [showCompose, setShowCompose] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'hot' | 'new' | 'top'>('hot');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);

  const fetchPosts = useCallback(
    async (reset?: boolean) => {
      try {
        if (reset) setLoading(true);
        const params = new URLSearchParams({ sort: sortBy, limit: '20' });
        if (cursor && !reset) params.set('cursor', cursor);
        const res = await fetch(`/api/anonymous/posts?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to load posts');
        const data = await res.json();
        if (reset) {
          setPosts(data.posts || []);
        } else {
          setPosts((prev) => [...prev, ...(data.posts || [])]);
        }
        setCursor(data.cursor);
        setHasMore(data.hasMore ?? false);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [sortBy, cursor],
  );

  const fetchTrustProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/anonymous/trust-profile');
      if (res.ok) {
        const data = await res.json();
        setTrustProfile(data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchPosts(true);
    fetchTrustProfile();
  }, [sortBy]);

  const handleVote = useCallback(async (postId: string, direction: 'up' | 'down') => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        let newUp = p.upvotes;
        let newDown = p.downvotes;
        let newVote: 'up' | 'down' | null = direction;
        if (p.userVote === direction) {
          newVote = null;
          if (direction === 'up') newUp--;
          else newDown--;
        } else {
          if (p.userVote === 'up') newUp--;
          if (p.userVote === 'down') newDown--;
          if (direction === 'up') newUp++;
          else newDown++;
        }
        return { ...p, upvotes: newUp, downvotes: newDown, userVote: newVote };
      }),
    );
    await fetch(`/api/anonymous/posts/${postId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction }),
    });
  }, []);

  const handleReveal = useCallback(async (postId: string) => {
    try {
      const res = await fetch(`/api/anonymous/posts/${postId}/reveal`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, isRevealed: true, revealedAuthor: data.author } : p,
          ),
        );
      }
    } catch {}
  }, []);

  const handlePost = useCallback(async () => {
    if (!newPostContent.trim()) return;
    setPosting(true);
    try {
      const res = await fetch('/api/anonymous/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newPostContent, anonymous: isAnonymousMode }),
      });
      if (!res.ok) throw new Error('Failed to post');
      setNewPostContent('');
      setShowCompose(false);
      fetchPosts(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPosting(false);
    }
  }, [newPostContent, isAnonymousMode]);

  const getTrustColor = (score: number): string => {
    if (score >= 80) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getTrustBadge = (score: number): string => {
    if (score >= 90) return '🏆';
    if (score >= 70) return '⭐';
    if (score >= 50) return '👍';
    return '🆕';
  };

  if (loading && posts.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-500" />
        <span className="ml-3 text-gray-500">Loading anonymous feed...</span>
      </div>
    );
  }

  if (error && posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-red-500 text-xl mb-4">Failed to load feed</div>
        <button
          onClick={() => fetchPosts(true)}
          className="px-6 py-2 bg-gray-800 text-white rounded-full"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <header className="sticky top-0 bg-white/90 backdrop-blur border-b z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">Anonymous</h1>
          {trustProfile && (
            <div className="flex items-center gap-2">
              <span className="text-sm">{getTrustBadge(trustProfile.score)}</span>
              <span className={`text-sm font-medium ${getTrustColor(trustProfile.score)}`}>
                Trust: {trustProfile.score}
              </span>
            </div>
          )}
        </div>
        <div className="px-4 pb-3 flex items-center justify-between">
          <div className="flex gap-2">
            {(['hot', 'new', 'top'] as const).map((sort) => (
              <button
                key={sort}
                onClick={() => setSortBy(sort)}
                className={`px-3 py-1 rounded-full text-sm capitalize ${sortBy === sort ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {sort}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Identity:</label>
            <button
              onClick={() => setIsAnonymousMode(!isAnonymousMode)}
              className={`px-3 py-1 rounded-full text-xs font-medium ${isAnonymousMode ? 'bg-gray-800 text-white' : 'bg-blue-100 text-blue-700'}`}
            >
              {isAnonymousMode ? '🎭 Anonymous' : '👤 Named'}
            </button>
          </div>
        </div>
      </header>

      {trustProfile && (
        <div className="mx-4 mt-3 p-3 bg-gray-50 rounded-xl border">
          <div className="flex items-center justify-between text-sm">
            <span>Your Trust Score</span>
            <span className={`font-bold ${getTrustColor(trustProfile.score)}`}>
              {trustProfile.score}/100
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div
              className="bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 h-2 rounded-full"
              style={{ width: `${trustProfile.score}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>{trustProfile.postsCount} posts</span>
            <span>{trustProfile.totalUpvotes} upvotes</span>
            <span>Rank #{trustProfile.rank}</span>
          </div>
        </div>
      )}

      <div className="px-4 py-3">
        <button
          onClick={() => setShowCompose(!showCompose)}
          className="w-full py-3 bg-gray-100 rounded-xl text-gray-500 text-left px-4 hover:bg-gray-200"
        >
          Share something anonymously...
        </button>
      </div>

      {showCompose && (
        <div className="mx-4 mb-4 p-4 border rounded-xl bg-white shadow-sm">
          <textarea
            value={newPostContent}
            onChange={(e) => setNewPostContent(e.target.value)}
            placeholder={isAnonymousMode ? 'Your identity is hidden...' : 'Posting as yourself...'}
            className="w-full min-h-[100px] resize-none border-none outline-none text-sm"
            maxLength={2000}
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-gray-400">{newPostContent.length}/2000</span>
            <button
              onClick={handlePost}
              disabled={posting || !newPostContent.trim()}
              className="px-4 py-1.5 bg-gray-800 text-white rounded-full text-sm disabled:opacity-50"
            >
              {posting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>
      )}

      {posts.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🎭</div>
          <h3 className="text-xl font-semibold text-gray-700">No anonymous posts yet</h3>
          <p className="text-gray-500 mt-2">Be the first to share something!</p>
        </div>
      ) : (
        <div className="divide-y">
          {posts.map((post) => (
            <article key={post.id} className="px-4 py-4 hover:bg-gray-50">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-lg flex-shrink-0">
                  {post.isRevealed ? (
                    <img
                      src={post.revealedAuthor?.avatar}
                      alt=""
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    '🎭'
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {post.isRevealed ? (
                      <>
                        <span className="font-medium text-sm">{post.revealedAuthor?.name}</span>
                        <span className="text-gray-500 text-xs">
                          @{post.revealedAuthor?.handle}
                        </span>
                        <span className="bg-green-100 text-green-700 text-xs px-1.5 py-0.5 rounded">
                          Revealed
                        </span>
                      </>
                    ) : (
                      <span className="text-gray-500 text-sm">Anonymous</span>
                    )}
                    <span className="text-xs text-gray-400 ml-auto">
                      {new Date(post.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-gray-900 whitespace-pre-wrap">{post.content}</p>
                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleVote(post.id, 'up')}
                        className={`p-1 rounded ${post.userVote === 'up' ? 'text-green-600 bg-green-50' : 'text-gray-500 hover:text-green-600'}`}
                      >
                        ▲
                      </button>
                      <span
                        className={`text-sm font-medium ${post.upvotes - post.downvotes > 0 ? 'text-green-600' : post.upvotes - post.downvotes < 0 ? 'text-red-600' : 'text-gray-500'}`}
                      >
                        {post.upvotes - post.downvotes}
                      </span>
                      <button
                        onClick={() => handleVote(post.id, 'down')}
                        className={`p-1 rounded ${post.userVote === 'down' ? 'text-red-600 bg-red-50' : 'text-gray-500 hover:text-red-600'}`}
                      >
                        ▼
                      </button>
                    </div>
                    <button className="text-sm text-gray-500 hover:text-blue-500">
                      💬 {post.replies}
                    </button>
                    <span className={`text-xs ${getTrustColor(post.trustScore)}`}>
                      Trust: {post.trustScore}
                    </span>
                    {post.canReveal && !post.isRevealed && (
                      <button
                        onClick={() => handleReveal(post.id)}
                        className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full ml-auto hover:bg-yellow-200"
                      >
                        Reveal (100+ upvotes)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="px-4 py-4">
          <button
            onClick={() => fetchPosts()}
            className="w-full py-2 bg-gray-100 rounded-full text-sm text-gray-600 hover:bg-gray-200"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
};

export default AnonymousPage;
