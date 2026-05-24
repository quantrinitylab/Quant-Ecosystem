// ============================================================================
// QuantTube - useShorts Hook
// Shorts feed state, navigation, interactions
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';

interface ShortVideo {
  id: string;
  videoUrl: string;
  thumbnailUrl: string;
  title: string;
  creator: string;
  creatorAvatar: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  soundName: string;
  duration: number;
  isSubscribed: boolean;
}

interface ShortsState {
  shorts: ShortVideo[];
  currentIndex: number;
  isPlaying: boolean;
  isMuted: boolean;
  liked: Set<string>;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  animatingLike: string | null;
}

interface ShortsActions {
  next: () => void;
  previous: () => void;
  goToIndex: (index: number) => void;
  togglePlay: () => void;
  toggleMute: () => void;
  like: (shortId: string) => void;
  unlike: (shortId: string) => void;
  share: (shortId: string) => void;
  subscribe: (creatorId: string) => void;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useShorts(): [ShortsState, ShortsActions] {
  const [state, setState] = useState<ShortsState>({
    shorts: [],
    currentIndex: 0,
    isPlaying: true,
    isMuted: false,
    liked: new Set(),
    loading: true,
    error: null,
    hasMore: true,
    animatingLike: null,
  });

  const likeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadInitial();
  }, []);

  const loadInitial = async () => {
    setState(prev => ({ ...prev, loading: true }));
    await new Promise(resolve => setTimeout(resolve, 500));
    setState(prev => ({
      ...prev,
      shorts: generateMockShorts(10),
      loading: false,
    }));
  };

  const next = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentIndex: Math.min(prev.currentIndex + 1, prev.shorts.length - 1),
    }));
  }, []);

  const previous = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentIndex: Math.max(prev.currentIndex - 1, 0),
    }));
  }, []);

  const goToIndex = useCallback((index: number) => {
    setState(prev => ({ ...prev, currentIndex: index }));
  }, []);

  const togglePlay = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, []);

  const toggleMute = useCallback(() => {
    setState(prev => ({ ...prev, isMuted: !prev.isMuted }));
  }, []);

  const like = useCallback((shortId: string) => {
    setState(prev => {
      const newLiked = new Set(prev.liked);
      newLiked.add(shortId);
      return {
        ...prev,
        liked: newLiked,
        shorts: prev.shorts.map(s => s.id === shortId ? { ...s, likeCount: s.likeCount + 1 } : s),
        animatingLike: shortId,
      };
    });
    if (likeTimerRef.current) clearTimeout(likeTimerRef.current);
    likeTimerRef.current = setTimeout(() => {
      setState(prev => ({ ...prev, animatingLike: null }));
    }, 600);
  }, []);

  const unlike = useCallback((shortId: string) => {
    setState(prev => {
      const newLiked = new Set(prev.liked);
      newLiked.delete(shortId);
      return {
        ...prev,
        liked: newLiked,
        shorts: prev.shorts.map(s => s.id === shortId ? { ...s, likeCount: Math.max(0, s.likeCount - 1) } : s),
      };
    });
  }, []);

  const share = useCallback((shortId: string) => {
    setState(prev => ({
      ...prev,
      shorts: prev.shorts.map(s => s.id === shortId ? { ...s, shareCount: s.shareCount + 1 } : s),
    }));
  }, []);

  const subscribe = useCallback((creatorId: string) => {
    setState(prev => ({
      ...prev,
      shorts: prev.shorts.map(s => s.creator === creatorId ? { ...s, isSubscribed: true } : s),
    }));
  }, []);

  const loadMore = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }));
    await new Promise(resolve => setTimeout(resolve, 300));
    setState(prev => ({
      ...prev,
      shorts: [...prev.shorts, ...generateMockShorts(5)],
      loading: false,
    }));
  }, []);

  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, currentIndex: 0 }));
    await new Promise(resolve => setTimeout(resolve, 500));
    setState(prev => ({
      ...prev,
      shorts: generateMockShorts(10),
      loading: false,
    }));
  }, []);

  return [state, { next, previous, goToIndex, togglePlay, toggleMute, like, unlike, share, subscribe, loadMore, refresh }];
}

function generateMockShorts(count: number): ShortVideo[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `short_${Date.now()}_${i}`,
    videoUrl: `/videos/short${i}.mp4`,
    thumbnailUrl: `/thumbs/short${i}.jpg`,
    title: `Short #${i + 1}`,
    creator: ['CodeSnippets', 'TrickShots', 'CoffeeArtist', 'NatureViews', 'PetLife'][i % 5],
    creatorAvatar: `/avatars/creator${i % 5}.jpg`,
    likeCount: Math.floor(Math.random() * 100000),
    commentCount: Math.floor(Math.random() * 5000),
    shareCount: Math.floor(Math.random() * 10000),
    soundName: ['Lo-fi Beats', 'Original Sound', 'Trending Audio', 'Epic Music', 'Funny Moments'][i % 5],
    duration: 15 + Math.floor(Math.random() * 45),
    isSubscribed: Math.random() > 0.7,
  }));
}

export default useShorts;
