// ============================================================================
// QuantSync - Community Detail Page
// Community feed, sidebar, moderator tools, post flair filtering
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';

interface CommunityDetail {
  id: string;
  name: string;
  description: string;
  icon: string;
  banner: string;
  category: string;
  memberCount: number;
  onlineCount: number;
  postsToday: number;
  createdAt: string;
  isJoined: boolean;
  isModerator: boolean;
  rules: { id: string; title: string; description: string }[];
  moderators: { id: string; name: string; avatar: string; role: string }[];
  flairs: { id: string; name: string; color: string }[];
}

interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  title: string;
  content: string;
  flair?: { id: string; name: string; color: string };
  likes: number;
  comments: number;
  isLiked: boolean;
  isPinned: boolean;
  createdAt: string;
}

interface ModAction {
  type: 'remove_post' | 'ban_user' | 'edit_rules';
  targetId: string;
  reason: string;
}

const CommunityPage: React.FC<{ id?: string }> = ({ id }) => {
  const [community, setCommunity] = useState<CommunityDetail | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFlair, setSelectedFlair] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'hot' | 'new' | 'top'>('hot');
  const [showRules, setShowRules] = useState<boolean>(true);
  const [showModPanel, setShowModPanel] = useState<boolean>(false);
  const [_modAction, _setModAction] = useState<ModAction | null>(null);
  const [modReason, setModReason] = useState<string>('');
  const [banUserId, setBanUserId] = useState<string>('');
  const [removePostId, setRemovePostId] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const communityId =
    id || (typeof window !== 'undefined' ? window.location.pathname.split('/').pop() : '');

  const fetchCommunity = useCallback(async () => {
    try {
      setLoading(true);
      const [communityRes, postsRes] = await Promise.all([
        fetch(`/api/communities/${communityId}`),
        fetch(
          `/api/communities/${communityId}/posts?sort=${sortBy}${selectedFlair ? `&flair=${selectedFlair}` : ''}`,
        ),
      ]);
      if (!communityRes.ok) throw new Error('Community not found');
      const communityData = await communityRes.json();
      const postsData = await postsRes.json();
      setCommunity(communityData);
      setPosts(postsData.posts || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [communityId, sortBy, selectedFlair]);

  useEffect(() => {
    if (communityId) fetchCommunity();
  }, [communityId, fetchCommunity]);

  const handleJoinLeave = useCallback(async () => {
    if (!community) return;
    const action = community.isJoined ? 'leave' : 'join';
    setCommunity((prev) =>
      prev
        ? {
            ...prev,
            isJoined: !prev.isJoined,
            memberCount: prev.memberCount + (prev.isJoined ? -1 : 1),
          }
        : null,
    );
    try {
      await fetch(`/api/communities/${communityId}/${action}`, { method: 'POST' });
    } catch {
      setCommunity((prev) =>
        prev
          ? {
              ...prev,
              isJoined: !prev.isJoined,
              memberCount: prev.memberCount + (prev.isJoined ? 1 : -1),
            }
          : null,
      );
    }
  }, [community, communityId]);

  const handleLikePost = useCallback(async (postId: string) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, isLiked: !p.isLiked, likes: p.isLiked ? p.likes - 1 : p.likes + 1 }
          : p,
      ),
    );
    await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
  }, []);

  const handleRemovePost = useCallback(
    async (postId: string) => {
      setActionLoading(true);
      try {
        await fetch(`/api/communities/${communityId}/posts/${postId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: modReason }),
        });
        setPosts((prev) => prev.filter((p) => p.id !== postId));
        setRemovePostId('');
        setModReason('');
      } catch {
      } finally {
        setActionLoading(false);
      }
    },
    [communityId, modReason],
  );

  const handleBanUser = useCallback(
    async (userId: string) => {
      setActionLoading(true);
      try {
        await fetch(`/api/communities/${communityId}/ban`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, reason: modReason }),
        });
        setBanUserId('');
        setModReason('');
      } catch {
      } finally {
        setActionLoading(false);
      }
    },
    [communityId, modReason],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
      </div>
    );
  }

  if (error || !community) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-red-500 text-xl mb-4">Community not found</div>
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={fetchCommunity}
          className="px-6 py-2 bg-purple-500 text-white rounded-full"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <div className="h-48 bg-gradient-to-r from-purple-500 to-pink-500 relative">
        {community.banner && (
          <img src={community.banner} alt="" className="w-full h-full object-cover" />
        )}
      </div>

      <div className="max-w-6xl mx-auto px-4 -mt-8 relative z-10">
        <div className="flex items-end gap-4 mb-4">
          <img
            src={community.icon}
            alt={community.name}
            className="w-20 h-20 rounded-full border-4 border-white shadow-lg"
          />
          <div className="flex-1 pb-2">
            <h1 className="text-2xl font-bold text-gray-900">{community.name}</h1>
            <p className="text-gray-600 text-sm">{community.description}</p>
          </div>
          <button
            onClick={handleJoinLeave}
            className={`px-6 py-2 rounded-full font-medium ${
              community.isJoined
                ? 'border border-gray-300 hover:border-red-300 hover:text-red-600'
                : 'bg-purple-500 text-white hover:bg-purple-600'
            }`}
          >
            {community.isJoined ? 'Joined' : 'Join'}
          </button>
        </div>

        <div className="flex items-center gap-6 text-sm text-gray-600 mb-6">
          <span>
            <strong>{community.memberCount.toLocaleString()}</strong> members
          </span>
          <span>
            <strong>{community.onlineCount}</strong> online
          </span>
          <span>
            <strong>{community.postsToday}</strong> posts today
          </span>
          <span className="bg-gray-200 px-2 py-0.5 rounded text-xs">{community.category}</span>
        </div>

        <div className="flex gap-6">
          <main className="flex-1">
            <div className="bg-white rounded-xl shadow-sm mb-4 p-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex gap-2">
                  {(['hot', 'new', 'top'] as const).map((sort) => (
                    <button
                      key={sort}
                      onClick={() => setSortBy(sort)}
                      className={`px-3 py-1 rounded-full text-sm capitalize ${sortBy === sort ? 'bg-purple-100 text-purple-700' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                      {sort}
                    </button>
                  ))}
                </div>
                {community.isModerator && (
                  <button
                    onClick={() => setShowModPanel(!showModPanel)}
                    className="px-3 py-1 text-sm bg-red-50 text-red-600 rounded-full"
                  >
                    Mod Tools
                  </button>
                )}
              </div>
              {community.flairs.length > 0 && (
                <div className="flex gap-2 overflow-x-auto">
                  <button
                    onClick={() => setSelectedFlair(null)}
                    className={`px-2 py-0.5 rounded text-xs ${!selectedFlair ? 'bg-gray-800 text-white' : 'bg-gray-100'}`}
                  >
                    All
                  </button>
                  {community.flairs.map((flair) => (
                    <button
                      key={flair.id}
                      onClick={() => setSelectedFlair(flair.id)}
                      className={`px-2 py-0.5 rounded text-xs ${selectedFlair === flair.id ? 'ring-2 ring-offset-1' : ''}`}
                      style={{ backgroundColor: flair.color + '30', color: flair.color }}
                    >
                      {flair.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {showModPanel && community.isModerator && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                <h3 className="font-bold text-red-700 mb-3">Moderator Tools</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-red-700">Remove Post by ID</label>
                    <div className="flex gap-2 mt-1">
                      <input
                        type="text"
                        value={removePostId}
                        onChange={(e) => setRemovePostId(e.target.value)}
                        className="flex-1 border rounded px-3 py-1 text-sm"
                        placeholder="Post ID"
                      />
                      <input
                        type="text"
                        value={modReason}
                        onChange={(e) => setModReason(e.target.value)}
                        className="flex-1 border rounded px-3 py-1 text-sm"
                        placeholder="Reason"
                      />
                      <button
                        onClick={() => handleRemovePost(removePostId)}
                        disabled={actionLoading}
                        className="px-3 py-1 bg-red-500 text-white rounded text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-red-700">Ban User</label>
                    <div className="flex gap-2 mt-1">
                      <input
                        type="text"
                        value={banUserId}
                        onChange={(e) => setBanUserId(e.target.value)}
                        className="flex-1 border rounded px-3 py-1 text-sm"
                        placeholder="User ID"
                      />
                      <button
                        onClick={() => handleBanUser(banUserId)}
                        disabled={actionLoading}
                        className="px-3 py-1 bg-red-500 text-white rounded text-sm"
                      >
                        Ban
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {posts.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl">
                <div className="text-5xl mb-3">📝</div>
                <h3 className="text-lg font-semibold text-gray-700">No posts yet</h3>
                <p className="text-gray-500 mt-1">Be the first to post in this community!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {posts.map((post) => (
                  <article
                    key={post.id}
                    className="bg-white rounded-xl p-4 shadow-sm hover:shadow transition-shadow"
                  >
                    {post.isPinned && (
                      <div className="text-xs text-purple-600 font-medium mb-2">📌 Pinned</div>
                    )}
                    <div className="flex items-center gap-2 mb-2">
                      <img src={post.authorAvatar} alt="" className="w-8 h-8 rounded-full" />
                      <span className="font-medium text-sm">{post.authorName}</span>
                      <span className="text-gray-400 text-xs">
                        {new Date(post.createdAt).toLocaleDateString()}
                      </span>
                      {post.flair && (
                        <span
                          className="px-2 py-0.5 rounded text-xs"
                          style={{
                            backgroundColor: post.flair.color + '30',
                            color: post.flair.color,
                          }}
                        >
                          {post.flair.name}
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-lg mb-1">{post.title}</h3>
                    <p className="text-gray-700 mb-3 line-clamp-3">{post.content}</p>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <button
                        onClick={() => handleLikePost(post.id)}
                        className={`flex items-center gap-1 ${post.isLiked ? 'text-red-500' : 'hover:text-red-500'}`}
                      >
                        {post.isLiked ? '❤️' : '🤍'} {post.likes}
                      </button>
                      <button className="flex items-center gap-1 hover:text-blue-500">
                        💬 {post.comments}
                      </button>
                      <button className="hover:text-green-500">↗️ Share</button>
                      {community.isModerator && (
                        <button
                          onClick={() => {
                            setRemovePostId(post.id);
                            handleRemovePost(post.id);
                          }}
                          className="hover:text-red-500 ml-auto"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </main>

          <aside className="w-72 hidden lg:block space-y-4">
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-bold mb-3">About</h3>
              <p className="text-sm text-gray-600 mb-3">{community.description}</p>
              <div className="text-xs text-gray-500">
                Created {new Date(community.createdAt).toLocaleDateString()}
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm">
              <button
                onClick={() => setShowRules(!showRules)}
                className="flex items-center justify-between w-full font-bold mb-2"
              >
                <span>Rules</span>
                <span className="text-gray-400">{showRules ? '▼' : '▶'}</span>
              </button>
              {showRules && (
                <ol className="space-y-2">
                  {community.rules.map((rule, idx) => (
                    <li key={rule.id} className="text-sm">
                      <span className="font-medium">
                        {idx + 1}. {rule.title}
                      </span>
                      <p className="text-gray-500 text-xs">{rule.description}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-bold mb-3">Moderators</h3>
              <div className="space-y-2">
                {community.moderators.map((mod) => (
                  <div key={mod.id} className="flex items-center gap-2">
                    <img src={mod.avatar} alt="" className="w-7 h-7 rounded-full" />
                    <div>
                      <div className="text-sm font-medium">{mod.name}</div>
                      <div className="text-xs text-gray-500">{mod.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-bold mb-3">Community Stats</h3>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="bg-purple-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-purple-700">
                    {community.memberCount.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">Members</div>
                </div>
                <div className="bg-green-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-green-700">{community.onlineCount}</div>
                  <div className="text-xs text-gray-500">Online</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-blue-700">{community.postsToday}</div>
                  <div className="text-xs text-gray-500">Posts Today</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-orange-700">{community.rules.length}</div>
                  <div className="text-xs text-gray-500">Rules</div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default CommunityPage;
