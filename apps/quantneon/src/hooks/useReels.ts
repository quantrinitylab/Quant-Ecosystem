// ============================================================================
// QuantNeon - useReels Hook
// Reel playback state, creation workflow, sound selection
// Powered by React Query + apiClient
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

interface Reel {
  id: string;
  videoUrl: string;
  thumbnailUrl: string;
  creator: string;
  creatorAvatar: string;
  caption: string;
  soundName: string;
  soundId: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  isLiked: boolean;
  isSaved: boolean;
}

interface ReelSound {
  id: string;
  name: string;
  artist: string;
  duration: number;
  usageCount: number;
  isOriginal: boolean;
}

interface ReelCreationData {
  videoUrl: string | null;
  soundId: string | null;
  caption: string;
  effects: string[];
  speed: number;
  duration: number;
  coverFrame: number;
}

interface ReelsState {
  reels: Reel[];
  currentIndex: number;
  isPlaying: boolean;
  isMuted: boolean;
  progress: number;
  loading: boolean;
  error: string | null;
  creationMode: boolean;
  creationData: ReelCreationData;
  sounds: ReelSound[];
  liked: Set<string>;
  saved: Set<string>;
}

interface ReelsActions {
  next: () => void;
  previous: () => void;
  goToIndex: (index: number) => void;
  togglePlay: () => void;
  toggleMute: () => void;
  like: (reelId: string) => void;
  unlike: (reelId: string) => void;
  save: (reelId: string) => void;
  unsave: (reelId: string) => void;
  share: (reelId: string) => void;
  startCreation: () => void;
  cancelCreation: () => void;
  selectSound: (soundId: string) => void;
  setCaption: (caption: string) => void;
  setSpeed: (speed: number) => void;
  addEffect: (effect: string) => void;
  removeEffect: (effect: string) => void;
  publish: () => Promise<void>;
  loadMore: () => Promise<void>;
}

export function useReels(): [ReelsState, ReelsActions] {
  const queryClient = useQueryClient();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [creationMode, setCreationMode] = useState(false);
  const [creationData, setCreationData] = useState<ReelCreationData>({
    videoUrl: null,
    soundId: null,
    caption: '',
    effects: [],
    speed: 1,
    duration: 30,
    coverFrame: 0,
  });
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());

  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reelsQuery = useQuery({
    queryKey: ['neon-reels'],
    queryFn: async () => {
      const response = await apiClient.getReelsFeed();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load reels');
      }
      return response.data?.reels ?? [];
    },
  });

  const likeMutation = useMutation({
    mutationFn: async (reelId: string) => {
      const response = await apiClient.likeReel(reelId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to like reel');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['neon-reels'] });
    },
  });

  const createReelMutation = useMutation({
    mutationFn: async (data: ReelCreationData) => {
      const response = await apiClient.createReel(data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create reel');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['neon-reels'] });
    },
  });

  const reels: Reel[] = (reelsQuery.data ?? []) as Reel[];

  useEffect(() => {
    if (isPlaying && reels.length > 0) {
      progressRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) return 0;
          return prev + 1;
        });
      }, 300);
      return () => {
        if (progressRef.current) clearInterval(progressRef.current);
      };
    }
  }, [isPlaying, currentIndex, reels.length]);

  const next = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, reels.length - 1));
    setProgress(0);
  }, [reels.length]);

  const previous = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
    setProgress(0);
  }, []);

  const goToIndex = useCallback((index: number) => {
    setCurrentIndex(index);
    setProgress(0);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const like = useCallback(
    (reelId: string) => {
      setLiked((prev) => new Set([...prev, reelId]));
      likeMutation.mutate(reelId);
    },
    [likeMutation],
  );

  const unlike = useCallback((reelId: string) => {
    setLiked((prev) => {
      const next = new Set(prev);
      next.delete(reelId);
      return next;
    });
  }, []);

  const save = useCallback((reelId: string) => {
    setSaved((prev) => new Set([...prev, reelId]));
  }, []);

  const unsave = useCallback((reelId: string) => {
    setSaved((prev) => {
      const next = new Set(prev);
      next.delete(reelId);
      return next;
    });
  }, []);

  const share = useCallback((_reelId: string) => {
    // Share action
  }, []);

  const startCreation = useCallback(() => {
    setCreationMode(true);
    setCreationData({
      videoUrl: null,
      soundId: null,
      caption: '',
      effects: [],
      speed: 1,
      duration: 30,
      coverFrame: 0,
    });
  }, []);

  const cancelCreation = useCallback(() => {
    setCreationMode(false);
  }, []);

  const selectSound = useCallback((soundId: string) => {
    setCreationData((prev) => ({ ...prev, soundId }));
  }, []);

  const setCaption = useCallback((caption: string) => {
    setCreationData((prev) => ({ ...prev, caption }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    setCreationData((prev) => ({ ...prev, speed }));
  }, []);

  const addEffect = useCallback((effect: string) => {
    setCreationData((prev) => ({ ...prev, effects: [...prev.effects, effect] }));
  }, []);

  const removeEffect = useCallback((effect: string) => {
    setCreationData((prev) => ({ ...prev, effects: prev.effects.filter((e) => e !== effect) }));
  }, []);

  const publish = useCallback(async () => {
    await createReelMutation.mutateAsync(creationData);
    setCreationMode(false);
  }, [createReelMutation, creationData]);

  const loadMore = useCallback(async () => {
    await reelsQuery.refetch();
  }, [reelsQuery]);

  const state: ReelsState = {
    reels,
    currentIndex,
    isPlaying,
    isMuted,
    progress,
    loading: reelsQuery.isLoading,
    error: reelsQuery.error?.message ?? null,
    creationMode,
    creationData,
    sounds: [],
    liked,
    saved,
  };

  const actions: ReelsActions = {
    next,
    previous,
    goToIndex,
    togglePlay,
    toggleMute,
    like,
    unlike,
    save,
    unsave,
    share,
    startCreation,
    cancelCreation,
    selectSound,
    setCaption,
    setSpeed,
    addEffect,
    removeEffect,
    publish,
    loadMore,
  };
  return [state, actions];
}

export default useReels;
