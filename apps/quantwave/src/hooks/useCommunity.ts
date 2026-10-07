// ============================================================================
// QuantSync - useCommunity Hook
// Community operations: join, leave, post, moderate, settings, members
// ============================================================================

import { useState, useEffect, useCallback } from 'react';

interface Community {
  id: string;
  name: string;
  description: string;
  icon: string;
  banner: string;
  category: string;
  memberCount: number;
  onlineCount: number;
  isJoined: boolean;
  isModerator: boolean;
  rules: { id: string; title: string; description: string }[];
  moderators: { id: string; name: string; avatar: string; role: string }[];
  flairs: { id: string; name: string; color: string }[];
  createdAt: string;
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
  createdAt: string;
}

interface UseCommunityOptions {
  communityId: string;
  autoFetch?: boolean;
}

interface UseCommunityReturn {
  community: Community | null;
  posts: CommunityPost[];
  loading: boolean;
  postsLoading: boolean;
  error: string | null;
  isJoined: boolean;
  isModerator: boolean;
  join: () => Promise<void>;
  leave: () => Promise<void>;
  fetchPosts: (sort?: string, flair?: string) => Promise<void>;
  createPost: (data: { title: string; content: string; flairId?: string }) => Promise<void>;
  likePost: (postId: string) => Promise<void>;
  removePost: (postId: string, reason: string) => Promise<void>;
  banUser: (userId: string, reason: string, duration?: number) => Promise<void>;
  updateRules: (rules: { title: string; description: string }[]) => Promise<void>;
  addModerator: (userId: string) => Promise<void>;
  removeModerator: (userId: string) => Promise<void>;
  updateSettings: (settings: { name?: string; description?: string; category?: string }) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useCommunity(options: UseCommunityOptions): UseCommunityReturn {
  const { communityId, autoFetch = true } = options;

  const [community, setCommunity] = useState<Community | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [postsLoading, setPostsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCommunity = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/communities/${communityId}`);
      if (!res.ok) throw new Error('Community not found');
      const data = await res.json();
      setCommunity(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  const fetchPosts = useCallback(async (sort: string = 'hot', flair?: string) => {
    try {
      setPostsLoading(true);
      const params = new URLSearchParams({ sort });
      if (flair) params.set('flair', flair);
      const res = await fetch(`/api/communities/${communityId}/posts?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
      }
    } catch {} finally {
      setPostsLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    if (autoFetch && communityId) {
      fetchCommunity();
      fetchPosts();
    }
  }, [communityId, autoFetch, fetchCommunity, fetchPosts]);

  const join = useCallback(async () => {
    setCommunity(prev => prev ? { ...prev, isJoined: true, memberCount: prev.memberCount + 1 } : null);
    try {
      const res = await fetch(`/api/communities/${communityId}/join`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to join');
    } catch {
      setCommunity(prev => prev ? { ...prev, isJoined: false, memberCount: prev.memberCount - 1 } : null);
    }
  }, [communityId]);

  const leave = useCallback(async () => {
    setCommunity(prev => prev ? { ...prev, isJoined: false, memberCount: prev.memberCount - 1 } : null);
    try {
      const res = await fetch(`/api/communities/${communityId}/leave`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to leave');
    } catch {
      setCommunity(prev => prev ? { ...prev, isJoined: true, memberCount: prev.memberCount + 1 } : null);
    }
  }, [communityId]);

  const createPost = useCallback(async (data: { title: string; content: string; flairId?: string }) => {
    const res = await fetch(`/api/communities/${communityId}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create post');
    await fetchPosts();
  }, [communityId, fetchPosts]);

  const likePost = useCallback(async (postId: string) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, isLiked: !p.isLiked, likes: p.isLiked ? p.likes - 1 : p.likes + 1 } : p));
    await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
  }, []);

  const removePost = useCallback(async (postId: string, reason: string) => {
    await fetch(`/api/communities/${communityId}/posts/${postId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    setPosts(prev => prev.filter(p => p.id !== postId));
  }, [communityId]);

  const banUser = useCallback(async (userId: string, reason: string, duration?: number) => {
    await fetch(`/api/communities/${communityId}/ban`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, reason, duration }),
    });
  }, [communityId]);

  const updateRules = useCallback(async (rules: { title: string; description: string }[]) => {
    const res = await fetch(`/api/communities/${communityId}/rules`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules }),
    });
    if (res.ok) {
      setCommunity(prev => prev ? { ...prev, rules: rules.map((r, i) => ({ id: String(i), ...r })) } : null);
    }
  }, [communityId]);

  const addModerator = useCallback(async (userId: string) => {
    await fetch(`/api/communities/${communityId}/moderators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    await fetchCommunity();
  }, [communityId, fetchCommunity]);

  const removeModerator = useCallback(async (userId: string) => {
    await fetch(`/api/communities/${communityId}/moderators/${userId}`, { method: 'DELETE' });
    await fetchCommunity();
  }, [communityId, fetchCommunity]);

  const updateSettings = useCallback(async (settings: { name?: string; description?: string; category?: string }) => {
    const res = await fetch(`/api/communities/${communityId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (res.ok) {
      setCommunity(prev => prev ? { ...prev, ...settings } : null);
    }
  }, [communityId]);

  const refresh = useCallback(async () => {
    await Promise.all([fetchCommunity(), fetchPosts()]);
  }, [fetchCommunity, fetchPosts]);

  return {
    community, posts, loading, postsLoading, error,
    isJoined: community?.isJoined ?? false,
    isModerator: community?.isModerator ?? false,
    join, leave, fetchPosts, createPost, likePost, removePost,
    banUser, updateRules, addModerator, removeModerator, updateSettings, refresh,
  };
}

export default useCommunity;
