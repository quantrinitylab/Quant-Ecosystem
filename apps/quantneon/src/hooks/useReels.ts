// ============================================================================
// QuantNeon - useReels Hook
// Reel playback state, creation workflow, sound selection
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';

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
  const [state, setState] = useState<ReelsState>({
    reels: [],
    currentIndex: 0,
    isPlaying: true,
    isMuted: false,
    progress: 0,
    loading: true,
    error: null,
    creationMode: false,
    creationData: { videoUrl: null, soundId: null, caption: '', effects: [], speed: 1, duration: 30, coverFrame: 0 },
    sounds: [],
    liked: new Set(),
    saved: new Set(),
  });

  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadInitialReels();
  }, []);

  useEffect(() => {
    if (state.isPlaying && state.reels.length > 0) {
      progressRef.current = setInterval(() => {
        setState(prev => {
          const newProgress = prev.progress + 1;
          if (newProgress >= 100) return { ...prev, progress: 0 };
          return { ...prev, progress: newProgress };
        });
      }, 300);
      return () => { if (progressRef.current) clearInterval(progressRef.current); };
    }
  }, [state.isPlaying, state.currentIndex]);

  const loadInitialReels = async () => {
    setState(prev => ({ ...prev, loading: true }));
    await new Promise(resolve => setTimeout(resolve, 500));
    setState(prev => ({
      ...prev,
      reels: generateMockReels(10),
      sounds: generateMockSounds(),
      loading: false,
    }));
  };

  const next = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentIndex: Math.min(prev.currentIndex + 1, prev.reels.length - 1),
      progress: 0,
    }));
  }, []);

  const previous = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentIndex: Math.max(prev.currentIndex - 1, 0),
      progress: 0,
    }));
  }, []);

  const goToIndex = useCallback((index: number) => {
    setState(prev => ({ ...prev, currentIndex: index, progress: 0 }));
  }, []);

  const togglePlay = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, []);

  const toggleMute = useCallback(() => {
    setState(prev => ({ ...prev, isMuted: !prev.isMuted }));
  }, []);

  const like = useCallback((reelId: string) => {
    setState(prev => {
      const newLiked = new Set(prev.liked);
      newLiked.add(reelId);
      return { ...prev, liked: newLiked, reels: prev.reels.map(r => r.id === reelId ? { ...r, isLiked: true, likeCount: r.likeCount + 1 } : r) };
    });
  }, []);

  const unlike = useCallback((reelId: string) => {
    setState(prev => {
      const newLiked = new Set(prev.liked);
      newLiked.delete(reelId);
      return { ...prev, liked: newLiked, reels: prev.reels.map(r => r.id === reelId ? { ...r, isLiked: false, likeCount: Math.max(0, r.likeCount - 1) } : r) };
    });
  }, []);

  const save = useCallback((reelId: string) => {
    setState(prev => { const s = new Set(prev.saved); s.add(reelId); return { ...prev, saved: s }; });
  }, []);

  const unsave = useCallback((reelId: string) => {
    setState(prev => { const s = new Set(prev.saved); s.delete(reelId); return { ...prev, saved: s }; });
  }, []);

  const share = useCallback((reelId: string) => {
    setState(prev => ({ ...prev, reels: prev.reels.map(r => r.id === reelId ? { ...r, shareCount: r.shareCount + 1 } : r) }));
  }, []);

  const startCreation = useCallback(() => {
    setState(prev => ({ ...prev, creationMode: true, creationData: { videoUrl: null, soundId: null, caption: '', effects: [], speed: 1, duration: 30, coverFrame: 0 } }));
  }, []);

  const cancelCreation = useCallback(() => {
    setState(prev => ({ ...prev, creationMode: false }));
  }, []);

  const selectSound = useCallback((soundId: string) => {
    setState(prev => ({ ...prev, creationData: { ...prev.creationData, soundId } }));
  }, []);

  const setCaption = useCallback((caption: string) => {
    setState(prev => ({ ...prev, creationData: { ...prev.creationData, caption } }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    setState(prev => ({ ...prev, creationData: { ...prev.creationData, speed } }));
  }, []);

  const addEffect = useCallback((effect: string) => {
    setState(prev => ({ ...prev, creationData: { ...prev.creationData, effects: [...prev.creationData.effects, effect] } }));
  }, []);

  const removeEffect = useCallback((effect: string) => {
    setState(prev => ({ ...prev, creationData: { ...prev.creationData, effects: prev.creationData.effects.filter(e => e !== effect) } }));
  }, []);

  const publish = useCallback(async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    setState(prev => ({ ...prev, creationMode: false }));
  }, []);

  const loadMore = useCallback(async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    setState(prev => ({ ...prev, reels: [...prev.reels, ...generateMockReels(5)] }));
  }, []);

  const actions: ReelsActions = { next, previous, goToIndex, togglePlay, toggleMute, like, unlike, save, unsave, share, startCreation, cancelCreation, selectSound, setCaption, setSpeed, addEffect, removeEffect, publish, loadMore };
  return [state, actions];
}

function generateMockReels(count: number): Reel[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `reel_${Date.now()}_${i}`,
    videoUrl: `/videos/reel${i}.mp4`,
    thumbnailUrl: `/thumbs/reel${i}.jpg`,
    creator: ['style_queen', 'art_collective', 'fitness_pro', 'travel_emma', 'music_vibes'][i % 5],
    creatorAvatar: `/avatars/${['sq', 'ac', 'fp', 'emma', 'mv'][i % 5]}.jpg`,
    caption: `Reel caption ${i + 1} #trending #viral`,
    soundName: ['Original Sound', 'Trending Beat', 'Popular Song'][i % 3],
    soundId: `sound_${i % 3}`,
    likeCount: Math.floor(Math.random() * 100000),
    commentCount: Math.floor(Math.random() * 5000),
    shareCount: Math.floor(Math.random() * 10000),
    isLiked: false,
    isSaved: false,
  }));
}

function generateMockSounds(): ReelSound[] {
  return [
    { id: 's1', name: 'Trending Beat 2024', artist: 'Producer X', duration: 30, usageCount: 45000, isOriginal: false },
    { id: 's2', name: 'Viral Dance Track', artist: 'DJ Nova', duration: 15, usageCount: 120000, isOriginal: false },
    { id: 's3', name: 'Chill Vibes', artist: 'LoFi Studio', duration: 60, usageCount: 23000, isOriginal: false },
    { id: 's4', name: 'Epic Moment', artist: 'Cinematic Sounds', duration: 20, usageCount: 67000, isOriginal: false },
  ];
}

export default useReels;
