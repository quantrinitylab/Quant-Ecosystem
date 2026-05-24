// ============================================================================
// QuantNeon - useFeed Hook
// Feed state with infinite scroll, like animations, story tracking
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';

interface FeedPost {
  id: string;
  authorId: string;
  authorUsername: string;
  authorAvatar: string;
  mediaUrls: string[];
  mediaType: 'image' | 'carousel' | 'video';
  caption: string;
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  isSaved: boolean;
  createdAt: string;
}

interface StoryUser {
  id: string;
  username: string;
  avatar: string;
  hasUnseenStory: boolean;
  isCloseFriend: boolean;
}

interface FeedState {
  posts: FeedPost[];
  stories: StoryUser[];
  loading: boolean;
  refreshing: boolean;
  hasMore: boolean;
  error: string | null;
  likeAnimation: string | null;
  page: number;
}

interface FeedActions {
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  likePost: (postId: string) => void;
  unlikePost: (postId: string) => void;
  doubleTapLike: (postId: string) => void;
  savePost: (postId: string) => void;
  unsavePost: (postId: string) => void;
  markStorySeen: (userId: string) => void;
  hidePost: (postId: string) => void;
}

export function useFeed(): [FeedState, FeedActions] {
  const [state, setState] = useState<FeedState>({
    posts: [],
    stories: [],
    loading: true,
    refreshing: false,
    hasMore: true,
    error: null,
    likeAnimation: null,
    page: 0,
  });

  const likeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadInitialFeed();
  }, []);

  const loadInitialFeed = async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      setState(prev => ({
        ...prev,
        posts: generateMockPosts(0, 10),
        stories: generateMockStories(),
        loading: false,
        page: 1,
      }));
    } catch (err) {
      setState(prev => ({ ...prev, error: 'Failed to load feed', loading: false }));
    }
  };

  const loadMore = useCallback(async () => {
    if (state.loading || !state.hasMore) return;
    setState(prev => ({ ...prev, loading: true }));
    await new Promise(resolve => setTimeout(resolve, 300));
    const newPosts = generateMockPosts(state.page * 10, 10);
    setState(prev => ({
      ...prev,
      posts: [...prev.posts, ...newPosts],
      loading: false,
      page: prev.page + 1,
      hasMore: prev.page < 5,
    }));
  }, [state.loading, state.hasMore, state.page]);

  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, refreshing: true }));
    await new Promise(resolve => setTimeout(resolve, 800));
    setState(prev => ({
      ...prev,
      posts: generateMockPosts(0, 10),
      refreshing: false,
      page: 1,
      hasMore: true,
    }));
  }, []);

  const likePost = useCallback((postId: string) => {
    setState(prev => ({
      ...prev,
      posts: prev.posts.map(p => p.id === postId ? { ...p, isLiked: true, likeCount: p.likeCount + 1 } : p),
    }));
  }, []);

  const unlikePost = useCallback((postId: string) => {
    setState(prev => ({
      ...prev,
      posts: prev.posts.map(p => p.id === postId ? { ...p, isLiked: false, likeCount: Math.max(0, p.likeCount - 1) } : p),
    }));
  }, []);

  const doubleTapLike = useCallback((postId: string) => {
    setState(prev => ({
      ...prev,
      posts: prev.posts.map(p => p.id === postId && !p.isLiked ? { ...p, isLiked: true, likeCount: p.likeCount + 1 } : p),
      likeAnimation: postId,
    }));
    if (likeTimerRef.current) clearTimeout(likeTimerRef.current);
    likeTimerRef.current = setTimeout(() => {
      setState(prev => ({ ...prev, likeAnimation: null }));
    }, 800);
  }, []);

  const savePost = useCallback((postId: string) => {
    setState(prev => ({
      ...prev,
      posts: prev.posts.map(p => p.id === postId ? { ...p, isSaved: true } : p),
    }));
  }, []);

  const unsavePost = useCallback((postId: string) => {
    setState(prev => ({
      ...prev,
      posts: prev.posts.map(p => p.id === postId ? { ...p, isSaved: false } : p),
    }));
  }, []);

  const markStorySeen = useCallback((userId: string) => {
    setState(prev => ({
      ...prev,
      stories: prev.stories.map(s => s.id === userId ? { ...s, hasUnseenStory: false } : s),
    }));
  }, []);

  const hidePost = useCallback((postId: string) => {
    setState(prev => ({
      ...prev,
      posts: prev.posts.filter(p => p.id !== postId),
    }));
  }, []);

  const actions: FeedActions = { loadMore, refresh, likePost, unlikePost, doubleTapLike, savePost, unsavePost, markStorySeen, hidePost };
  return [state, actions];
}

function generateMockPosts(offset: number, count: number): FeedPost[] {
  const posts: FeedPost[] = [];
  for (let i = 0; i < count; i++) {
    posts.push({
      id: `post_${offset + i}`,
      authorId: `user_${(offset + i) % 5}`,
      authorUsername: ['alex_photo', 'travel_emma', 'foodie_mark', 'design_sara', 'music_jay'][i % 5],
      authorAvatar: `/avatars/${['alex', 'emma', 'mark', 'sara', 'jay'][i % 5]}.jpg`,
      mediaUrls: [`/posts/feed_${offset + i}.jpg`],
      mediaType: 'image',
      caption: `Post caption #${offset + i + 1} with some hashtags #content #create`,
      likeCount: Math.floor(Math.random() * 10000),
      commentCount: Math.floor(Math.random() * 500),
      isLiked: Math.random() > 0.7,
      isSaved: Math.random() > 0.85,
      createdAt: new Date(Date.now() - (offset + i) * 3600000).toISOString(),
    });
  }
  return posts;
}

function generateMockStories(): StoryUser[] {
  return [
    { id: 'su1', username: 'alex_photo', avatar: '/avatars/alex.jpg', hasUnseenStory: true, isCloseFriend: false },
    { id: 'su2', username: 'travel_emma', avatar: '/avatars/emma.jpg', hasUnseenStory: true, isCloseFriend: true },
    { id: 'su3', username: 'foodie_mark', avatar: '/avatars/mark.jpg', hasUnseenStory: false, isCloseFriend: false },
    { id: 'su4', username: 'design_sara', avatar: '/avatars/sara.jpg', hasUnseenStory: true, isCloseFriend: false },
    { id: 'su5', username: 'music_jay', avatar: '/avatars/jay.jpg', hasUnseenStory: true, isCloseFriend: true },
  ];
}

export default useFeed;
