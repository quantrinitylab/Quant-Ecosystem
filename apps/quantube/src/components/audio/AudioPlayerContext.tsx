// ============================================================================
// QuantTube - Spotify-Class Singleton Audio Player Context
// Task W37-04: Persistent singleton audio state with Web Audio & MediaSession API
// ============================================================================

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';

export interface AudioTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  coverUrl?: string;
  audioUrl: string;
  duration: number; // in seconds
}

export type AudioRepeatMode = 'off' | 'all' | 'one';

export interface AudioPlayerContextType {
  currentTrack: AudioTrack | null;
  queue: AudioTrack[];
  queueIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number; // 0 to 1
  isMuted: boolean;
  shuffle: boolean;
  repeat: AudioRepeatMode;
  isDockVisible: boolean;
  playTrack: (track: AudioTrack, newQueue?: AudioTrack[]) => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  skipForward: (seconds?: number) => void;
  skipBackward: (seconds?: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setDockVisible: (visible: boolean) => void;
  addToQueue: (track: AudioTrack) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | null>(null);

const DEFAULT_ARTWORK = '/icons/music-placeholder.png';

export interface AudioPlayerProviderProps {
  children: ReactNode;
  initialTrack?: AudioTrack | null;
  initialQueue?: AudioTrack[];
}

export const AudioPlayerProvider: React.FC<AudioPlayerProviderProps> = ({
  children,
  initialTrack = null,
  initialQueue = [],
}) => {
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(initialTrack);
  const [queue, setQueue] = useState<AudioTrack[]>(
    initialQueue.length > 0 ? initialQueue : initialTrack ? [initialTrack] : [],
  );
  const [queueIndex, setQueueIndex] = useState<number>(initialTrack ? 0 : -1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(initialTrack?.duration || 0);
  const [volume, setVolumeState] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [previousVolume, setPreviousVolume] = useState<number>(0.8);
  const [shuffle, setShuffle] = useState<boolean>(false);
  const [repeat, setRepeat] = useState<AudioRepeatMode>('off');
  const [isDockVisible, setDockVisible] = useState<boolean>(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const shuffleHistoryRef = useRef<number[]>([]);

  // Initialize audio singleton on client
  useEffect(() => {
    if (typeof window !== 'undefined' && !audioRef.current) {
      try {
        const audio = new Audio();
        audio.preload = 'metadata';
        audioRef.current = audio;
      } catch {
        // Fallback for non-browser or test environments
      }
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  // Update volume and mute on audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Next index resolution taking shuffle and repeat into account
  const getNextIndex = useCallback((): number => {
    if (queue.length === 0) return -1;
    if (shuffle) {
      const available = queue
        .map((_, i) => i)
        .filter((i) => i !== queueIndex && !shuffleHistoryRef.current.includes(i));
      if (available.length === 0) {
        if (repeat === 'all') {
          shuffleHistoryRef.current = [];
          return Math.floor(Math.random() * queue.length);
        }
        return -1;
      }
      return available[Math.floor(Math.random() * available.length)];
    }

    const nextIdx = queueIndex + 1;
    if (nextIdx >= queue.length) {
      return repeat === 'all' ? 0 : -1;
    }
    return nextIdx;
  }, [queue, queueIndex, shuffle, repeat]);

  const playAtIndex = useCallback(
    (index: number) => {
      const target = queue[index];
      if (!target) return;
      setCurrentTrack(target);
      setQueueIndex(index);
      setCurrentTime(0);
      setDuration(target.duration);
      setIsPlaying(true);
      setDockVisible(true);
      shuffleHistoryRef.current.push(index);

      if (audioRef.current) {
        audioRef.current.src = target.audioUrl;
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {
          // Autoplay policy or error catch
        });
      }
    },
    [queue],
  );

  const playTrack = useCallback(
    (track: AudioTrack, newQueue?: AudioTrack[]) => {
      let resolvedQueue = newQueue || queue;
      let existingIndex = resolvedQueue.findIndex((t) => t.id === track.id);

      if (newQueue) {
        resolvedQueue = newQueue;
        if (existingIndex === -1) {
          resolvedQueue = [track, ...newQueue];
          existingIndex = 0;
        }
        setQueue(resolvedQueue);
      } else if (existingIndex === -1) {
        resolvedQueue = [...resolvedQueue, track];
        existingIndex = resolvedQueue.length - 1;
        setQueue(resolvedQueue);
      }

      setCurrentTrack(track);
      setQueueIndex(existingIndex);
      setCurrentTime(0);
      setDuration(track.duration);
      setIsPlaying(true);
      setDockVisible(true);
      shuffleHistoryRef.current = [existingIndex];

      if (audioRef.current) {
        audioRef.current.src = track.audioUrl;
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
    },
    [queue],
  );

  const pause = useCallback(() => {
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, []);

  const resume = useCallback(() => {
    if (!currentTrack && queue.length > 0) {
      playAtIndex(0);
      return;
    }
    setIsPlaying(true);
    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, [currentTrack, queue, playAtIndex]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  }, [isPlaying, pause, resume]);

  const next = useCallback(() => {
    if (repeat === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
      setCurrentTime(0);
      return;
    }
    const nextIdx = getNextIndex();
    if (nextIdx !== -1) {
      playAtIndex(nextIdx);
    } else {
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }, [repeat, getNextIndex, playAtIndex]);

  const previous = useCallback(() => {
    if (currentTime > 3) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
      setCurrentTime(0);
      return;
    }
    const prevIdx = queueIndex - 1;
    if (prevIdx >= 0) {
      playAtIndex(prevIdx);
    } else if (repeat === 'all' && queue.length > 0) {
      playAtIndex(queue.length - 1);
    }
  }, [currentTime, queueIndex, repeat, queue.length, playAtIndex]);

  const seek = useCallback((time: number) => {
    const clamped = Math.max(0, time);
    setCurrentTime(clamped);
    if (audioRef.current) {
      audioRef.current.currentTime = clamped;
    }
  }, []);

  const skipForward = useCallback(
    (seconds = 10) => {
      const target = Math.min(currentTime + seconds, duration || Infinity);
      seek(target);
    },
    [currentTime, duration, seek],
  );

  const skipBackward = useCallback(
    (seconds = 10) => {
      const target = Math.max(0, currentTime - seconds);
      seek(target);
    },
    [currentTime, seek],
  );

  const setVolume = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    setVolumeState(clamped);
    if (clamped > 0) {
      setIsMuted(false);
      setPreviousVolume(clamped);
    } else {
      setIsMuted(true);
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (isMuted) {
      setIsMuted(false);
      setVolumeState(previousVolume || 0.8);
    } else {
      setPreviousVolume(volume);
      setIsMuted(true);
      setVolumeState(0);
    }
  }, [isMuted, previousVolume, volume]);

  const toggleShuffle = useCallback(() => {
    setShuffle((prev) => !prev);
    shuffleHistoryRef.current = [];
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((prev) => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
  }, []);

  const addToQueue = useCallback((track: AudioTrack) => {
    setQueue((prev) => [...prev, track]);
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    setQueue((prev) => {
      const nextQ = prev.filter((_, i) => i !== index);
      return nextQ;
    });
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setQueueIndex(-1);
    setCurrentTrack(null);
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
  }, []);

  // Audio element event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      if (repeat === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        setCurrentTime(0);
      } else {
        const nextIdx = getNextIndex();
        if (nextIdx !== -1) {
          playAtIndex(nextIdx);
        } else {
          setIsPlaying(false);
          setCurrentTime(0);
        }
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [repeat, getNextIndex, playAtIndex]);

  // --------------------------------------------------------------------------
  // MediaSession API Integration (Task W37-04)
  // Syncs metadata (title, artist, album, artwork) and registers action handlers
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;

    if (currentTrack) {
      const artworkSrc = currentTrack.artworkUrl || currentTrack.coverUrl || DEFAULT_ARTWORK;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.artist,
          album: currentTrack.album || 'QuantTube Music',
          artwork: [
            { src: artworkSrc, sizes: '96x96', type: 'image/png' },
            { src: artworkSrc, sizes: '128x128', type: 'image/png' },
            { src: artworkSrc, sizes: '192x192', type: 'image/png' },
            { src: artworkSrc, sizes: '256x256', type: 'image/png' },
            { src: artworkSrc, sizes: '384x384', type: 'image/png' },
            { src: artworkSrc, sizes: '512x512', type: 'image/png' },
          ],
        });
      } catch {
        // Fallback for mock environments
      }
    }

    try {
      navigator.mediaSession.setActionHandler('play', () => resume());
      navigator.mediaSession.setActionHandler('pause', () => pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => previous());
      navigator.mediaSession.setActionHandler('nexttrack', () => next());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) seek(details.seekTime);
      });
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        skipBackward(details.seekOffset || 10);
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        skipForward(details.seekOffset || 10);
      });
    } catch {
      // In some environments, specific handlers might throw
    }

    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('seekto', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
      } catch {
        // ignore cleanup error
      }
    };
  }, [currentTrack, resume, pause, previous, next, seek, skipBackward, skipForward]);

  // Update MediaSession Position State when duration and time are valid
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'mediaSession' in navigator &&
      'setPositionState' in navigator.mediaSession &&
      duration > 0 &&
      Number.isFinite(duration)
    ) {
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(duration, 0),
          playbackRate: 1,
          position: Math.min(Math.max(currentTime, 0), duration),
        });
      } catch {
        // Catch invalid position state details
      }
    }
  }, [currentTime, duration]);

  const value: AudioPlayerContextType = {
    currentTrack,
    queue,
    queueIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    shuffle,
    repeat,
    isDockVisible,
    playTrack,
    pause,
    resume,
    togglePlay,
    next,
    previous,
    seek,
    skipForward,
    skipBackward,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    setDockVisible,
    addToQueue,
    removeFromQueue,
    clearQueue,
  };

  return <AudioPlayerContext.Provider value={value}>{children}</AudioPlayerContext.Provider>;
};

export function useAudioPlayer(): AudioPlayerContextType {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider');
  }
  return context;
}

export default AudioPlayerProvider;
