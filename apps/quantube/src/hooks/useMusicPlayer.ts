// ============================================================================
// QuantTube - useMusicPlayer Hook
// Music playback state (queue, shuffle, repeat, lyrics sync)
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';

interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverUrl: string;
  audioUrl: string;
}

interface LyricLine {
  time: number;
  text: string;
}

type RepeatMode = 'off' | 'all' | 'one';

interface MusicPlayerState {
  currentTrack: MusicTrack | null;
  queue: MusicTrack[];
  queueIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  lyrics: LyricLine[];
  currentLyricIndex: number;
  isLyricsVisible: boolean;
  crossfadeEnabled: boolean;
  crossfadeDuration: number;
  isCrossfading: boolean;
  error: string | null;
  loading: boolean;
}

interface MusicPlayerActions {
  playTrack: (track: MusicTrack) => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  addToQueue: (track: MusicTrack) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  toggleLyrics: () => void;
  toggleCrossfade: () => void;
  setCrossfadeDuration: (seconds: number) => void;
}

const INITIAL_STATE: MusicPlayerState = {
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  isMuted: false,
  shuffle: false,
  repeat: 'off',
  lyrics: [],
  currentLyricIndex: -1,
  isLyricsVisible: false,
  crossfadeEnabled: false,
  crossfadeDuration: 5,
  isCrossfading: false,
  error: null,
  loading: false,
};

export function useMusicPlayer(): [MusicPlayerState, MusicPlayerActions] {
  const [state, setState] = useState<MusicPlayerState>(INITIAL_STATE);
  const timeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shuffleHistoryRef = useRef<number[]>([]);

  useEffect(() => {
    if (state.isPlaying && state.currentTrack) {
      timeIntervalRef.current = setInterval(() => {
        setState(prev => {
          const newTime = prev.currentTime + 0.1;
          if (newTime >= prev.duration) {
            return prev;
          }
          const newLyricIndex = prev.lyrics.findLastIndex(l => l.time <= newTime);
          return { ...prev, currentTime: newTime, currentLyricIndex: newLyricIndex };
        });
      }, 100);
      return () => { if (timeIntervalRef.current) clearInterval(timeIntervalRef.current); };
    }
  }, [state.isPlaying, state.currentTrack]);

  useEffect(() => {
    if (state.currentTime >= state.duration && state.duration > 0 && state.isPlaying) {
      if (state.repeat === 'one') {
        setState(prev => ({ ...prev, currentTime: 0 }));
      } else {
        const nextIndex = getNextIndex();
        if (nextIndex !== -1) {
          playAtIndex(nextIndex);
        } else {
          setState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
        }
      }
    }
  }, [state.currentTime, state.duration]);

  const getNextIndex = useCallback((): number => {
    if (state.queue.length === 0) return -1;
    if (state.shuffle) {
      const available = state.queue
        .map((_, i) => i)
        .filter(i => i !== state.queueIndex && !shuffleHistoryRef.current.includes(i));
      if (available.length === 0) {
        if (state.repeat === 'all') {
          shuffleHistoryRef.current = [];
          return Math.floor(Math.random() * state.queue.length);
        }
        return -1;
      }
      return available[Math.floor(Math.random() * available.length)];
    }
    const nextIdx = state.queueIndex + 1;
    if (nextIdx >= state.queue.length) {
      return state.repeat === 'all' ? 0 : -1;
    }
    return nextIdx;
  }, [state.queue, state.queueIndex, state.shuffle, state.repeat]);

  const playAtIndex = useCallback((index: number) => {
    setState(prev => {
      const track = prev.queue[index];
      if (!track) return prev;
      return {
        ...prev,
        currentTrack: track,
        queueIndex: index,
        isPlaying: true,
        currentTime: 0,
        duration: track.duration,
        loading: false,
        currentLyricIndex: -1,
      };
    });
    shuffleHistoryRef.current.push(index);
  }, []);

  const playTrack = useCallback((track: MusicTrack) => {
    setState(prev => {
      const existingIndex = prev.queue.findIndex(t => t.id === track.id);
      if (existingIndex !== -1) {
        return {
          ...prev,
          currentTrack: track,
          queueIndex: existingIndex,
          isPlaying: true,
          currentTime: 0,
          duration: track.duration,
          currentLyricIndex: -1,
        };
      }
      const newQueue = [...prev.queue, track];
      return {
        ...prev,
        queue: newQueue,
        currentTrack: track,
        queueIndex: newQueue.length - 1,
        isPlaying: true,
        currentTime: 0,
        duration: track.duration,
        currentLyricIndex: -1,
      };
    });
  }, []);

  const pause = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: false }));
  }, []);

  const resume = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: true }));
  }, []);

  const togglePlay = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, []);

  const next = useCallback(() => {
    const nextIdx = getNextIndex();
    if (nextIdx !== -1) playAtIndex(nextIdx);
  }, [getNextIndex, playAtIndex]);

  const previous = useCallback(() => {
    if (state.currentTime > 3) {
      setState(prev => ({ ...prev, currentTime: 0 }));
      return;
    }
    const prevIdx = state.queueIndex - 1;
    if (prevIdx >= 0) playAtIndex(prevIdx);
  }, [state.currentTime, state.queueIndex, playAtIndex]);

  const seek = useCallback((time: number) => {
    setState(prev => ({ ...prev, currentTime: Math.max(0, Math.min(time, prev.duration)) }));
  }, []);

  const setVolume = useCallback((volume: number) => {
    setState(prev => ({ ...prev, volume: Math.max(0, Math.min(1, volume)), isMuted: volume === 0 }));
  }, []);

  const toggleMute = useCallback(() => {
    setState(prev => ({ ...prev, isMuted: !prev.isMuted }));
  }, []);

  const toggleShuffle = useCallback(() => {
    setState(prev => ({ ...prev, shuffle: !prev.shuffle }));
    shuffleHistoryRef.current = [];
  }, []);

  const cycleRepeat = useCallback(() => {
    setState(prev => {
      const modes: RepeatMode[] = ['off', 'all', 'one'];
      const currentIdx = modes.indexOf(prev.repeat);
      return { ...prev, repeat: modes[(currentIdx + 1) % modes.length] };
    });
  }, []);

  const addToQueue = useCallback((track: MusicTrack) => {
    setState(prev => ({ ...prev, queue: [...prev.queue, track] }));
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    setState(prev => {
      const newQueue = prev.queue.filter((_, i) => i !== index);
      let newIndex = prev.queueIndex;
      if (index < prev.queueIndex) newIndex--;
      else if (index === prev.queueIndex) newIndex = Math.min(newIndex, newQueue.length - 1);
      return { ...prev, queue: newQueue, queueIndex: newIndex };
    });
  }, []);

  const clearQueue = useCallback(() => {
    setState(prev => ({ ...prev, queue: [], queueIndex: -1, currentTrack: null, isPlaying: false, currentTime: 0 }));
  }, []);

  const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    setState(prev => {
      const newQueue = [...prev.queue];
      const [moved] = newQueue.splice(fromIndex, 1);
      newQueue.splice(toIndex, 0, moved);
      let newIndex = prev.queueIndex;
      if (fromIndex === prev.queueIndex) newIndex = toIndex;
      else if (fromIndex < prev.queueIndex && toIndex >= prev.queueIndex) newIndex--;
      else if (fromIndex > prev.queueIndex && toIndex <= prev.queueIndex) newIndex++;
      return { ...prev, queue: newQueue, queueIndex: newIndex };
    });
  }, []);

  const toggleLyrics = useCallback(() => {
    setState(prev => ({ ...prev, isLyricsVisible: !prev.isLyricsVisible }));
  }, []);

  const toggleCrossfade = useCallback(() => {
    setState(prev => ({ ...prev, crossfadeEnabled: !prev.crossfadeEnabled }));
  }, []);

  const setCrossfadeDuration = useCallback((seconds: number) => {
    setState(prev => ({ ...prev, crossfadeDuration: Math.max(1, Math.min(12, seconds)) }));
  }, []);

  const actions: MusicPlayerActions = {
    playTrack, pause, resume, togglePlay, next, previous, seek,
    setVolume, toggleMute, toggleShuffle, cycleRepeat,
    addToQueue, removeFromQueue, clearQueue, reorderQueue,
    toggleLyrics, toggleCrossfade, setCrossfadeDuration,
  };

  return [state, actions];
}

export default useMusicPlayer;
