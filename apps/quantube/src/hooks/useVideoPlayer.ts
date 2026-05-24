// ============================================================================
// QuantTube - useVideoPlayer Hook
// Video player state (play/pause/seek/volume/quality/fullscreen/PiP)
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';

interface VideoPlayerState {
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  quality: VideoQuality;
  isFullscreen: boolean;
  isPiP: boolean;
  isBuffering: boolean;
  bufferedPercentage: number;
  isTheaterMode: boolean;
  showControls: boolean;
  error: string | null;
  loop: boolean;
  autoplay: boolean;
  subtitlesEnabled: boolean;
  subtitleTrack: string | null;
}

type VideoQuality = 'auto' | '360p' | '480p' | '720p' | '1080p' | '1440p' | '4k';

interface VideoPlayerActions {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  seekForward: (seconds?: number) => void;
  seekBackward: (seconds?: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setPlaybackRate: (rate: number) => void;
  setQuality: (quality: VideoQuality) => void;
  toggleFullscreen: () => void;
  togglePiP: () => void;
  toggleTheaterMode: () => void;
  toggleLoop: () => void;
  toggleSubtitles: () => void;
  setSubtitleTrack: (trackId: string | null) => void;
  reset: () => void;
}

interface UseVideoPlayerOptions {
  autoPlay?: boolean;
  initialVolume?: number;
  initialQuality?: VideoQuality;
  onTimeUpdate?: (time: number) => void;
  onEnded?: () => void;
  onError?: (error: string) => void;
}

const INITIAL_STATE: VideoPlayerState = {
  isPlaying: false,
  isPaused: true,
  currentTime: 0,
  duration: 0,
  volume: 1,
  isMuted: false,
  playbackRate: 1,
  quality: 'auto',
  isFullscreen: false,
  isPiP: false,
  isBuffering: false,
  bufferedPercentage: 0,
  isTheaterMode: false,
  showControls: true,
  error: null,
  loop: false,
  autoplay: false,
  subtitlesEnabled: false,
  subtitleTrack: null,
};

export function useVideoPlayer(options: UseVideoPlayerOptions = {}): [VideoPlayerState, VideoPlayerActions] {
  const { autoPlay = false, initialVolume = 1, initialQuality = 'auto', onTimeUpdate, onEnded, onError } = options;

  const [state, setState] = useState<VideoPlayerState>({
    ...INITIAL_STATE,
    volume: initialVolume,
    quality: initialQuality,
    autoplay: autoPlay,
  });

  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeUpdateRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (state.isPlaying) {
      timeUpdateRef.current = setInterval(() => {
        setState(prev => {
          const newTime = prev.currentTime + 0.1;
          if (newTime >= prev.duration && prev.duration > 0) {
            if (prev.loop) {
              return { ...prev, currentTime: 0 };
            }
            if (onEnded) onEnded();
            return { ...prev, isPlaying: false, isPaused: true, currentTime: prev.duration };
          }
          if (onTimeUpdate) onTimeUpdate(newTime);
          return { ...prev, currentTime: newTime };
        });
      }, 100);
      return () => { if (timeUpdateRef.current) clearInterval(timeUpdateRef.current); };
    }
  }, [state.isPlaying, state.loop, onTimeUpdate, onEnded]);

  useEffect(() => {
    if (state.showControls) {
      controlsTimerRef.current = setTimeout(() => {
        if (state.isPlaying) {
          setState(prev => ({ ...prev, showControls: false }));
        }
      }, 3000);
      return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
    }
  }, [state.showControls, state.isPlaying]);

  const play = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: true, isPaused: false, error: null }));
  }, []);

  const pause = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: false, isPaused: true }));
  }, []);

  const togglePlay = useCallback(() => {
    setState(prev => ({
      ...prev,
      isPlaying: !prev.isPlaying,
      isPaused: prev.isPlaying,
      showControls: true,
    }));
  }, []);

  const seek = useCallback((time: number) => {
    setState(prev => ({
      ...prev,
      currentTime: Math.max(0, Math.min(time, prev.duration)),
      showControls: true,
    }));
  }, []);

  const seekForward = useCallback((seconds: number = 10) => {
    setState(prev => ({
      ...prev,
      currentTime: Math.min(prev.currentTime + seconds, prev.duration),
      showControls: true,
    }));
  }, []);

  const seekBackward = useCallback((seconds: number = 10) => {
    setState(prev => ({
      ...prev,
      currentTime: Math.max(prev.currentTime - seconds, 0),
      showControls: true,
    }));
  }, []);

  const setVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    setState(prev => ({
      ...prev,
      volume: clampedVolume,
      isMuted: clampedVolume === 0,
    }));
  }, []);

  const toggleMute = useCallback(() => {
    setState(prev => ({ ...prev, isMuted: !prev.isMuted }));
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    setState(prev => ({ ...prev, playbackRate: rate }));
  }, []);

  const setQuality = useCallback((quality: VideoQuality) => {
    setState(prev => ({ ...prev, quality, isBuffering: true }));
    setTimeout(() => {
      setState(prev => ({ ...prev, isBuffering: false }));
    }, 1000);
  }, []);

  const toggleFullscreen = useCallback(() => {
    setState(prev => ({ ...prev, isFullscreen: !prev.isFullscreen, showControls: true }));
  }, []);

  const togglePiP = useCallback(() => {
    setState(prev => ({ ...prev, isPiP: !prev.isPiP }));
  }, []);

  const toggleTheaterMode = useCallback(() => {
    setState(prev => ({ ...prev, isTheaterMode: !prev.isTheaterMode }));
  }, []);

  const toggleLoop = useCallback(() => {
    setState(prev => ({ ...prev, loop: !prev.loop }));
  }, []);

  const toggleSubtitles = useCallback(() => {
    setState(prev => ({ ...prev, subtitlesEnabled: !prev.subtitlesEnabled }));
  }, []);

  const setSubtitleTrack = useCallback((trackId: string | null) => {
    setState(prev => ({ ...prev, subtitleTrack: trackId, subtitlesEnabled: trackId !== null }));
  }, []);

  const reset = useCallback(() => {
    setState({ ...INITIAL_STATE, volume: initialVolume, quality: initialQuality });
  }, [initialVolume, initialQuality]);

  const actions: VideoPlayerActions = {
    play, pause, togglePlay, seek, seekForward, seekBackward,
    setVolume, toggleMute, setPlaybackRate, setQuality,
    toggleFullscreen, togglePiP, toggleTheaterMode, toggleLoop,
    toggleSubtitles, setSubtitleTrack, reset,
  };

  return [state, actions];
}

export default useVideoPlayer;
