// ============================================================================
// QuantSync - User Profile Page
// Profile header, verification badge, tabs, follow/block, DM, pinned post
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';

interface UserProfile {
  id: string;
  name: string;
  handle: string;
  bio: string;
  avatar: string;
  banner: string;
  isVerified: boolean;
  verificationType: 'blue' | 'gold' | 'gray' | null;
  joinDate: string;
  location: string;
  website: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isFollowing: boolean;
  isFollowedBy: boolean;
  isBlocked: boolean;
  isMuted: boolean;
  pinnedPost?: ProfilePost;
}

interface ProfilePost {
  id: string;
  content: string;
  media: { url: string; type: string }[];
  likes: number;
  reposts: number;
  replies: number;
  createdAt: string;
  isLiked: boolean;
}

type ProfileTab = 'posts' | 'replies' | 'media' | 'likes';

const ProfilePage: React.FC<{ id?: string }> = ({ id }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [loading, setLoading] = useState<boolean>(true);
  const [postsLoading, setPostsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState<boolean>(false);

  const userId =
    id || (typeof window !== 'undefined' ? window.location.pathname.split('/').pop() : '');

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/users/${userId}`);
      if (!res.ok) throw new Error('User not found');
      const data = await res.json();
      setProfile(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const fetchPosts = useCallback(
    async (tab: ProfileTab) => {
      try {
        setPostsLoading(true);
        const res = await fetch(`/api/users/${userId}/${tab}`);
        if (res.ok) {
          const data = await res.json();
          setPosts(data.posts || []);
        }
      } catch {
      } finally {
        setPostsLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    if (userId) fetchProfile();
  }, [userId, fetchProfile]);

  useEffect(() => {
    if (userId) fetchPosts(activeTab);
  }, [userId, activeTab, fetchPosts]);

  const handleFollow = useCallback(async () => {
    if (!profile) return;
    const action = profile.isFollowing ? 'unfollow' : 'follow';
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            isFollowing: !prev.isFollowing,
            followersCount: prev.followersCount + (prev.isFollowing ? -1 : 1),
          }
        : null,
    );
    await fetch(`/api/users/${userId}/${action}`, { method: 'POST' });
  }, [profile, userId]);

  const handleBlock = useCallback(async () => {
    if (!profile) return;
    setProfile((prev) => (prev ? { ...prev, isBlocked: !prev.isBlocked } : null));
    await fetch(`/api/users/${userId}/block`, { method: 'POST' });
    setShowMenu(false);
  }, [profile, userId]);

  const handleMute = useCallback(async () => {
    if (!profile) return;
    setProfile((prev) => (prev ? { ...prev, isMuted: !prev.isMuted } : null));
    await fetch(`/api/users/${userId}/mute`, { method: 'POST' });
    setShowMenu(false);
  }, [profile, userId]);

  const getVerificationColor = (type: string | null): string => {
    if (type === 'gold') return 'text-yellow-500';
    if (type === 'gray') return 'text-gray-500';
    return 'text-blue-500';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-red-500 text-xl mb-4">User not found</div>
        <p className="text-gray-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <div className="h-48 bg-gradient-to-r from-blue-400 to-purple-500 relative">
        {profile.banner && (
          <img src={profile.banner} alt="" className="w-full h-full object-cover" />
        )}
      </div>

      <div className="px-4 relative">
        <div className="flex items-end justify-between -mt-16 mb-3">
          <img
            src={profile.avatar}
            alt={profile.name}
            className="w-32 h-32 rounded-full border-4 border-white shadow-lg"
          />
          <div className="flex items-center gap-2 mt-16">
            <button
              onClick={() => (window.location.href = `/messages?user=${userId}`)}
              className="w-9 h-9 border rounded-full flex items-center justify-center hover:bg-gray-50"
            >
              ✉️
            </button>
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="w-9 h-9 border rounded-full flex items-center justify-center hover:bg-gray-50"
              >
                ⋯
              </button>
              {showMenu && (
                <div className="absolute right-0 top-11 bg-white border rounded-xl shadow-lg py-1 w-48 z-20">
                  <button
                    onClick={handleMute}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm"
                  >
                    {profile.isMuted ? 'Unmute' : 'Mute'} @{profile.handle}
                  </button>
                  <button
                    onClick={handleBlock}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm text-red-600"
                  >
                    {profile.isBlocked ? 'Unblock' : 'Block'} @{profile.handle}
                  </button>
                  <button className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm">
                    Report
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={handleFollow}
              className={`px-5 py-2 rounded-full font-bold text-sm ${
                profile.isFollowing
                  ? 'border border-gray-300 hover:border-red-300 hover:text-red-600'
                  : 'bg-gray-900 text-white hover:bg-gray-800'
              }`}
            >
              {profile.isFollowing ? 'Following' : 'Follow'}
            </button>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center gap-1">
            <h1 className="text-xl font-bold">{profile.name}</h1>
            {profile.isVerified && (
              <span
                className={getVerificationColor(profile.verificationType)}
                title={`Verified (${profile.verificationType})`}
              >
                ✓
              </span>
            )}
          </div>
          <p className="text-gray-500">@{profile.handle}</p>
          {profile.isFollowedBy && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded mt-1 inline-block">
              Follows you
            </span>
          )}
        </div>

        <p className="text-gray-900 mb-3 whitespace-pre-wrap">{profile.bio}</p>

        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mb-4">
          {profile.location && <span>📍 {profile.location}</span>}
          {profile.website && (
            <a href={profile.website} className="text-blue-500 hover:underline">
              🔗 {profile.website}
            </a>
          )}
          <span>
            📅 Joined{' '}
            {new Date(profile.joinDate).toLocaleDateString('en-US', {
              month: 'long',
              year: 'numeric',
            })}
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm mb-4">
          <span>
            <strong>{profile.followingCount.toLocaleString()}</strong>{' '}
            <span className="text-gray-500">Following</span>
          </span>
          <span>
            <strong>{profile.followersCount.toLocaleString()}</strong>{' '}
            <span className="text-gray-500">Followers</span>
          </span>
        </div>
      </div>

      {profile.pinnedPost && (
        <div className="mx-4 mb-4 p-4 border rounded-xl bg-blue-50/50">
          <div className="text-xs text-gray-500 mb-2">📌 Pinned</div>
          <p className="text-gray-900">{profile.pinnedPost.content}</p>
          <div className="flex gap-4 mt-2 text-sm text-gray-500">
            <span>❤️ {profile.pinnedPost.likes}</span>
            <span>🔄 {profile.pinnedPost.reposts}</span>
            <span>💬 {profile.pinnedPost.replies}</span>
          </div>
        </div>
      )}

      <div className="border-b flex">
        {(['posts', 'replies', 'media', 'likes'] as ProfileTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-center text-sm font-medium capitalize ${
              activeTab === tab
                ? 'border-b-2 border-blue-500 text-blue-500'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {postsLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">📝</div>
          <p className="text-gray-500">No {activeTab} yet</p>
        </div>
      ) : (
        <div className="divide-y">
          {posts.map((post) => (
            <article key={post.id} className="px-4 py-3 hover:bg-gray-50">
              <div className="flex gap-3">
                <img src={profile.avatar} alt="" className="w-10 h-10 rounded-full" />
                <div className="flex-1">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="font-bold text-sm">{profile.name}</span>
                    {profile.isVerified && (
                      <span className={getVerificationColor(profile.verificationType)}>✓</span>
                    )}
                    <span className="text-gray-500 text-sm">@{profile.handle}</span>
                    <span className="text-gray-400 mx-1">·</span>
                    <span className="text-gray-500 text-xs">
                      {new Date(post.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-gray-900 whitespace-pre-wrap">{post.content}</p>
                  {post.media.length > 0 && (
                    <div className="mt-2 rounded-xl overflow-hidden">
                      <img src={post.media[0]?.url} alt="" className="w-full h-48 object-cover" />
                    </div>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span>💬 {post.replies}</span>
                    <span>🔄 {post.reposts}</span>
                    <span className={post.isLiked ? 'text-red-500' : ''}>❤️ {post.likes}</span>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
