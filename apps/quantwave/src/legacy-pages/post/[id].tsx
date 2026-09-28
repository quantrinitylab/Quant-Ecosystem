// ============================================================================
// QuantSync - Post Detail Page
// Full thread display, nested replies, engagement bar, reply composer
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';

interface PostDetail {
  id: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  isVerified: boolean;
  content: string;
  media: { url: string; type: string }[];
  likes: number;
  reposts: number;
  quotes: number;
  replies: number;
  bookmarks: number;
  views: number;
  isLiked: boolean;
  isReposted: boolean;
  isBookmarked: boolean;
  createdAt: string;
  threadParent?: PostDetail;
  quotedPost?: { id: string; authorName: string; authorHandle: string; content: string };
}

interface Reply {
  id: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  isVerified: boolean;
  content: string;
  likes: number;
  replies: number;
  isLiked: boolean;
  createdAt: string;
  children: Reply[];
  depth: number;
}

const PostPage: React.FC<{ id?: string }> = ({ id }) => {
  const [post, setPost] = useState<PostDetail | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState<string>('');
  const [replying, setReplying] = useState<boolean>(false);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [collapsedThreads, setCollapsedThreads] = useState<Set<string>>(new Set());
  const [showShareMenu, setShowShareMenu] = useState<boolean>(false);

  const postId =
    id || (typeof window !== 'undefined' ? window.location.pathname.split('/').pop() : '');

  const fetchPost = useCallback(async () => {
    try {
      setLoading(true);
      const [postRes, repliesRes] = await Promise.all([
        fetch(`/api/posts/${postId}`),
        fetch(`/api/posts/${postId}/replies`),
      ]);
      if (!postRes.ok) throw new Error('Post not found');
      const postData = await postRes.json();
      const repliesData = await repliesRes.json();
      setPost(postData);
      setReplies(repliesData.replies || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (postId) fetchPost();
  }, [postId, fetchPost]);

  const handleLike = useCallback(async () => {
    if (!post) return;
    setPost((prev) =>
      prev
        ? { ...prev, isLiked: !prev.isLiked, likes: prev.isLiked ? prev.likes - 1 : prev.likes + 1 }
        : null,
    );
    await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
  }, [post, postId]);

  const handleRepost = useCallback(async () => {
    if (!post) return;
    setPost((prev) =>
      prev
        ? {
            ...prev,
            isReposted: !prev.isReposted,
            reposts: prev.isReposted ? prev.reposts - 1 : prev.reposts + 1,
          }
        : null,
    );
    await fetch(`/api/posts/${postId}/repost`, { method: 'POST' });
  }, [post, postId]);

  const handleBookmark = useCallback(async () => {
    if (!post) return;
    setPost((prev) =>
      prev
        ? {
            ...prev,
            isBookmarked: !prev.isBookmarked,
            bookmarks: prev.isBookmarked ? prev.bookmarks - 1 : prev.bookmarks + 1,
          }
        : null,
    );
    await fetch(`/api/posts/${postId}/bookmark`, { method: 'POST' });
  }, [post, postId]);

  const handleReply = useCallback(async () => {
    if (!replyContent.trim()) return;
    setReplying(true);
    try {
      const targetId = replyToId || postId;
      const res = await fetch(`/api/posts/${targetId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: replyContent }),
      });
      if (!res.ok) throw new Error('Failed to reply');
      setReplyContent('');
      setReplyToId(null);
      fetchPost();
    } catch {
    } finally {
      setReplying(false);
    }
  }, [replyContent, replyToId, postId, fetchPost]);

  const handleLikeReply = useCallback(async (replyId: string) => {
    const updateReplies = (items: Reply[]): Reply[] => {
      return items.map((r) => {
        if (r.id === replyId)
          return { ...r, isLiked: !r.isLiked, likes: r.isLiked ? r.likes - 1 : r.likes + 1 };
        if (r.children.length > 0) return { ...r, children: updateReplies(r.children) };
        return r;
      });
    };
    setReplies((prev) => updateReplies(prev));
    await fetch(`/api/posts/${replyId}/like`, { method: 'POST' });
  }, []);

  const toggleCollapse = useCallback((replyId: string) => {
    setCollapsedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(replyId)) next.delete(replyId);
      else next.add(replyId);
      return next;
    });
  }, []);

  const formatCount = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  const renderReply = (reply: Reply): React.ReactNode => {
    const isCollapsed = collapsedThreads.has(reply.id);
    return (
      <div
        key={reply.id}
        className={`${reply.depth > 0 ? 'ml-8 border-l-2 border-gray-100 pl-4' : ''}`}
      >
        <div className="py-3">
          <div className="flex gap-2">
            <img src={reply.authorAvatar} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="font-bold text-sm">{reply.authorName}</span>
                {reply.isVerified && <span className="text-blue-500 text-xs">✓</span>}
                <span className="text-gray-500 text-xs">@{reply.authorHandle}</span>
                <span className="text-gray-400 text-xs ml-auto">
                  {new Date(reply.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-gray-900 text-sm mt-0.5">{reply.content}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                <button
                  onClick={() => handleLikeReply(reply.id)}
                  className={`hover:text-red-500 ${reply.isLiked ? 'text-red-500' : ''}`}
                >
                  {reply.isLiked ? '❤️' : '🤍'} {reply.likes > 0 ? reply.likes : ''}
                </button>
                <button onClick={() => setReplyToId(reply.id)} className="hover:text-blue-500">
                  💬 Reply
                </button>
                {reply.children.length > 0 && (
                  <button onClick={() => toggleCollapse(reply.id)} className="text-blue-500">
                    {isCollapsed ? `Show ${reply.children.length} replies` : 'Hide replies'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        {!isCollapsed && reply.children.map((child) => renderReply(child))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-red-500 text-xl mb-4">Post not found</div>
        <p className="text-gray-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <header className="sticky top-0 bg-white/90 backdrop-blur border-b z-10 px-4 py-3">
        <h1 className="text-xl font-bold">Post</h1>
      </header>

      {post.threadParent && (
        <div className="px-4 py-3 border-b bg-gray-50">
          <div className="flex gap-2">
            <img src={post.threadParent.authorAvatar} alt="" className="w-8 h-8 rounded-full" />
            <div>
              <div className="flex items-center gap-1">
                <span className="font-bold text-sm">{post.threadParent.authorName}</span>
                <span className="text-gray-500 text-xs">@{post.threadParent.authorHandle}</span>
              </div>
              <p className="text-gray-700 text-sm line-clamp-2">{post.threadParent.content}</p>
            </div>
          </div>
          <div className="border-l-2 border-blue-300 h-4 ml-4 mt-1" />
        </div>
      )}

      <article className="px-4 py-4 border-b">
        <div className="flex items-center gap-3 mb-3">
          <img src={post.authorAvatar} alt={post.authorName} className="w-12 h-12 rounded-full" />
          <div>
            <div className="flex items-center gap-1">
              <span className="font-bold">{post.authorName}</span>
              {post.isVerified && <span className="text-blue-500">✓</span>}
            </div>
            <span className="text-gray-500 text-sm">@{post.authorHandle}</span>
          </div>
        </div>

        <p className="text-xl text-gray-900 whitespace-pre-wrap mb-3">{post.content}</p>

        {post.media.length > 0 && (
          <div className="rounded-xl overflow-hidden mb-3">
            {post.media.map((m, idx) => (
              <div key={idx}>
                {m.type === 'video' ? (
                  <video src={m.url} controls className="w-full max-h-96 object-contain bg-black" />
                ) : (
                  <img src={m.url} alt="" className="w-full max-h-96 object-contain" />
                )}
              </div>
            ))}
          </div>
        )}

        {post.quotedPost && (
          <div className="border rounded-xl p-3 mb-3 hover:bg-gray-50">
            <div className="flex items-center gap-1 mb-1">
              <span className="font-bold text-sm">{post.quotedPost.authorName}</span>
              <span className="text-gray-500 text-xs">@{post.quotedPost.authorHandle}</span>
            </div>
            <p className="text-sm text-gray-700">{post.quotedPost.content}</p>
          </div>
        )}

        <div className="text-sm text-gray-500 mb-3">
          {new Date(post.createdAt).toLocaleString()} ·{' '}
          <span className="font-medium text-gray-700">{formatCount(post.views)}</span> Views
        </div>

        <div className="border-y py-3 flex items-center gap-6 text-sm">
          <span>
            <strong>{formatCount(post.replies)}</strong>{' '}
            <span className="text-gray-500">Replies</span>
          </span>
          <span>
            <strong>{formatCount(post.reposts)}</strong>{' '}
            <span className="text-gray-500">Reposts</span>
          </span>
          <span>
            <strong>{formatCount(post.quotes)}</strong>{' '}
            <span className="text-gray-500">Quotes</span>
          </span>
          <span>
            <strong>{formatCount(post.likes)}</strong> <span className="text-gray-500">Likes</span>
          </span>
          <span>
            <strong>{formatCount(post.bookmarks)}</strong>{' '}
            <span className="text-gray-500">Bookmarks</span>
          </span>
        </div>

        <div className="flex items-center justify-around py-3 border-b">
          <button className="p-2 rounded-full hover:bg-blue-50 text-gray-500 hover:text-blue-500">
            💬
          </button>
          <button
            onClick={handleRepost}
            className={`p-2 rounded-full hover:bg-green-50 ${post.isReposted ? 'text-green-500' : 'text-gray-500 hover:text-green-500'}`}
          >
            🔄
          </button>
          <button
            onClick={handleLike}
            className={`p-2 rounded-full hover:bg-red-50 ${post.isLiked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}
          >
            {post.isLiked ? '❤️' : '🤍'}
          </button>
          <button
            onClick={handleBookmark}
            className={`p-2 rounded-full hover:bg-blue-50 ${post.isBookmarked ? 'text-blue-500' : 'text-gray-500 hover:text-blue-500'}`}
          >
            {post.isBookmarked ? '🔖' : '📑'}
          </button>
          <div className="relative">
            <button
              onClick={() => setShowShareMenu(!showShareMenu)}
              className="p-2 rounded-full hover:bg-blue-50 text-gray-500 hover:text-blue-500"
            >
              ↗️
            </button>
            {showShareMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-white border rounded-xl shadow-lg py-1 w-40">
                <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">
                  Copy link
                </button>
                <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">
                  Share via DM
                </button>
                <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">
                  Quote Post
                </button>
              </div>
            )}
          </div>
        </div>
      </article>

      <div className="divide-y">{replies.map((reply) => renderReply(reply))}</div>

      {replies.length === 0 && (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">💬</div>
          <p className="text-gray-500">No replies yet. Start the conversation!</p>
        </div>
      )}

      <div className="sticky bottom-0 bg-white border-t p-3">
        {replyToId && (
          <div className="flex items-center justify-between mb-2 text-xs text-gray-500">
            <span>Replying to a comment</span>
            <button onClick={() => setReplyToId(null)} className="text-blue-500">
              Cancel
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="Post your reply..."
            className="flex-1 border rounded-full px-4 py-2 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleReply()}
          />
          <button
            onClick={handleReply}
            disabled={replying || !replyContent.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-full text-sm font-medium disabled:opacity-50"
          >
            {replying ? '...' : 'Reply'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PostPage;
