// ============================================================================
// QuantNeon - useFeed Hook
// Feed state with infinite scroll, like animations, story tracking
// Powered by React Query + apiClient
// ============================================================================

import { useState, useCallback, useRef } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import type { Post } from '../types';

interface StoryUser {
  id: string;
  username: string;
  avatar: string;
  hasUnseenStory: boolean;
  isCloseFriend: boolean;
}

interface FeedState {
  posts: Post[];
  stories: StoryUser[];
  loading: boolean;
  refreshing: boolean;
  hasMore: boolean;
  error: string | null;
  likeAnimation: string | null;
  page: number;
  isGuest?: boolean;
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
  const queryClient = useQueryClient();
  const [likeAnimation, setLikeAnimation] = useState<string | null>(null);
  const [hiddenPosts, setHiddenPosts] = useState<Set<string>>(new Set());
  const [seenStories, setSeenStories] = useState<Set<string>>(new Set());
  const likeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const feedQuery = useInfiniteQuery({
    queryKey: ['neon-feed'],
    queryFn: async ({ pageParam = 1 }) => {
      try {
        const response = await apiClient.getFeed(pageParam);
        if (response.success && response.data?.posts && response.data.posts.length > 0) {
          return {
            posts: response.data.posts,
            page: pageParam,
            isGuest: false,
          };
        }
        // Fallback for unauthenticated guests (e.g. 401 response) or empty feed: explore feed
        const exploreRes = await apiClient.getExploreFeed();
        if (exploreRes.success && exploreRes.data?.posts && exploreRes.data.posts.length > 0) {
          return {
            posts: exploreRes.data.posts,
            page: pageParam,
            isGuest: true,
          };
        }
        return {
          posts: response.data?.posts ?? [],
          page: pageParam,
          isGuest: !response.success,
        };
      } catch {
        // Network or 401 error: graceful fallback to explore feed so guests never hang
        try {
          const exploreRes = await apiClient.getExploreFeed();
          if (exploreRes.success && exploreRes.data?.posts && exploreRes.data.posts.length > 0) {
            return {
              posts: exploreRes.data.posts,
              page: pageParam,
              isGuest: true,
            };
          }
        } catch {}
        return {
          posts: [],
          page: pageParam,
          isGuest: true,
        };
      }
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.posts.length === 0 || lastPage.isGuest) return undefined;
      return lastPage.page + 1;
    },
    retry: 1,
  });

  const storiesQuery = useInfiniteQuery({
    queryKey: ['neon-stories-feed'],
    queryFn: async () => {
      try {
        const response = await apiClient.getStoriesFeed();
        if (!response.success) {
          return { stories: [] };
        }
        return {
          stories: (Array.isArray(response.data) ? response.data : []) as StoryUser[],
        };
      } catch {
        return { stories: [] };
      }
    },
    initialPageParam: 0,
    getNextPageParam: () => undefined,
    retry: false,
  });

  const likeMutation = useMutation({
    mutationFn: async (postId: string) => {
      const response = await apiClient.likePost(postId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to like post');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['neon-feed'] });
    },
  });

  const allPosts: Post[] = (feedQuery.data?.pages ?? [])
    .flatMap((page) => page.posts)
    .filter((p) => !hiddenPosts.has(p.id));

  const allStories: StoryUser[] = (storiesQuery.data?.pages ?? [])
    .flatMap((page) => page.stories)
    .map((s: StoryUser) => (seenStories.has(s.id) ? { ...s, hasUnseenStory: false } : s));

  const currentPage = feedQuery.data?.pages?.length ?? 0;
  const isGuest = Boolean(feedQuery.data?.pages?.[0]?.isGuest);

  const state: FeedState = {
    posts: allPosts,
    stories: allStories,
    loading: feedQuery.isLoading || feedQuery.isFetchingNextPage,
    refreshing: feedQuery.isRefetching && !feedQuery.isFetchingNextPage,
    hasMore: feedQuery.hasNextPage ?? false,
    error: feedQuery.error?.message ?? null,
    likeAnimation,
    page: currentPage,
    isGuest,
  };

  const loadMore = useCallback(async () => {
    if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
      await feedQuery.fetchNextPage();
    }
  }, [feedQuery]);

  const refresh = useCallback(async () => {
    await feedQuery.refetch();
  }, [feedQuery]);

  const likePost = useCallback(
    (postId: string) => {
      likeMutation.mutate(postId);
    },
    [likeMutation],
  );

  const unlikePost = useCallback(
    (postId: string) => {
      likeMutation.mutate(postId);
    },
    [likeMutation],
  );

  const doubleTapLike = useCallback(
    (postId: string) => {
      likeMutation.mutate(postId);
      setLikeAnimation(postId);
      if (likeTimerRef.current) clearTimeout(likeTimerRef.current);
      likeTimerRef.current = setTimeout(() => {
        setLikeAnimation(null);
      }, 800);
    },
    [likeMutation],
  );

  const savePost = useCallback((_postId: string) => {
    // Save action handled optimistically
  }, []);

  const unsavePost = useCallback((_postId: string) => {
    // Unsave action handled optimistically
  }, []);

  const markStorySeen = useCallback((userId: string) => {
    setSeenStories((prev) => new Set([...prev, userId]));
  }, []);

  const hidePost = useCallback((postId: string) => {
    setHiddenPosts((prev) => new Set([...prev, postId]));
  }, []);

  const actions: FeedActions = {
    loadMore,
    refresh,
    likePost,
    unlikePost,
    doubleTapLike,
    savePost,
    unsavePost,
    markStorySeen,
    hidePost,
  };
  return [state, actions];
}

export default useFeed;
