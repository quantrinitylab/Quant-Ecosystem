// ============================================================================
// QuantTube - Shorts Player Component
// Vertical swipe video player with like/comment/share overlay
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface ShortVideoData {
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
}

interface ShortsPlayerProps {
  videos: ShortVideoData[];
  initialIndex?: number;
  onVideoChange?: (index: number) => void;
  autoPlay?: boolean;
}

interface PlayerState {
  currentIndex: number;
  isPlaying: boolean;
  isMuted: boolean;
  progress: number;
  liked: Set<string>;
  transitioning: boolean;
  direction: 'up' | 'down' | null;
}

const ShortsPlayer: React.FC<ShortsPlayerProps> = ({ videos, initialIndex = 0, onVideoChange, autoPlay = true }) => {
  const [state, setState] = useState<PlayerState>({
    currentIndex: initialIndex,
    isPlaying: autoPlay,
    isMuted: false,
    progress: 0,
    liked: new Set(),
    transitioning: false,
    direction: null,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<number>(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (state.isPlaying && videos.length > 0) {
      const currentVideo = videos[state.currentIndex];
      progressIntervalRef.current = setInterval(() => {
        setState(prev => {
          const newProgress = prev.progress + (100 / (currentVideo.duration * 10));
          if (newProgress >= 100) {
            return { ...prev, progress: 0 };
          }
          return { ...prev, progress: newProgress };
        });
      }, 100);
      return () => { if (progressIntervalRef.current) clearInterval(progressIntervalRef.current); };
    }
  }, [state.isPlaying, state.currentIndex, videos]);

  const goToVideo = useCallback((index: number, direction: 'up' | 'down') => {
    if (index < 0 || index >= videos.length) return;
    setState(prev => ({ ...prev, transitioning: true, direction }));
    setTimeout(() => {
      setState(prev => ({ ...prev, currentIndex: index, progress: 0, transitioning: false, direction: null }));
      if (onVideoChange) onVideoChange(index);
    }, 300);
  }, [videos.length, onVideoChange]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const diff = touchStartRef.current - e.changedTouches[0].clientY;
    if (diff > 60) goToVideo(state.currentIndex + 1, 'up');
    else if (diff < -60) goToVideo(state.currentIndex - 1, 'down');
  }, [state.currentIndex, goToVideo]);

  const toggleLike = useCallback((videoId: string) => {
    setState(prev => {
      const newLiked = new Set(prev.liked);
      if (newLiked.has(videoId)) newLiked.delete(videoId);
      else newLiked.add(videoId);
      return { ...prev, liked: newLiked };
    });
  }, []);

  const togglePlay = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, []);

  const toggleMute = useCallback(() => {
    setState(prev => ({ ...prev, isMuted: !prev.isMuted }));
  }, []);

  if (videos.length === 0) {
    return (
      <div className="h-full w-full bg-black flex items-center justify-center">
        <p className="text-gray-400">No shorts available</p>
      </div>
    );
  }

  const current = videos[state.currentIndex];
  const isLiked = state.liked.has(current.id);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full bg-black overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={togglePlay}
    >
      {/* Video Background */}
      <div className={`absolute inset-0 transition-transform duration-300 ${
        state.transitioning
          ? state.direction === 'up' ? '-translate-y-full' : 'translate-y-full'
          : 'translate-y-0'
      }`}>
        <img src={current.thumbnailUrl} alt={current.title} className="w-full h-full object-cover" />
      </div>

      {/* Progress Bar */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/20 z-20">
        <div className="h-full bg-white transition-all" style={{ width: `${state.progress}%` }} />
      </div>

      {/* Play/Pause Indicator */}
      {!state.isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="w-16 h-16 bg-black/50 rounded-full flex items-center justify-center">
            <span className="text-white text-2xl ml-1">▶</span>
          </div>
        </div>
      )}

      {/* Right Actions */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center space-y-5 z-10">
        <button onClick={(e) => { e.stopPropagation(); toggleLike(current.id); }} className="flex flex-col items-center">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center ${isLiked ? 'bg-red-500' : 'bg-white/20'}`}>
            <span className="text-white">{isLiked ? '♥' : '♡'}</span>
          </div>
          <span className="text-white text-xs mt-1">{(current.likeCount + (isLiked ? 1 : 0)).toLocaleString()}</span>
        </button>
        <div className="flex flex-col items-center">
          <div className="w-11 h-11 bg-white/20 rounded-full flex items-center justify-center">
            <span className="text-white">💬</span>
          </div>
          <span className="text-white text-xs mt-1">{current.commentCount.toLocaleString()}</span>
        </div>
        <div className="flex flex-col items-center">
          <div className="w-11 h-11 bg-white/20 rounded-full flex items-center justify-center">
            <span className="text-white">↗</span>
          </div>
          <span className="text-white text-xs mt-1">{current.shareCount.toLocaleString()}</span>
        </div>
        <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="flex flex-col items-center">
          <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
            <span className="text-white text-sm">{state.isMuted ? '🔇' : '🔊'}</span>
          </div>
        </button>
      </div>

      {/* Bottom Info */}
      <div className="absolute bottom-4 left-4 right-16 z-10">
        <div className="flex items-center space-x-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-gray-600 overflow-hidden">
            <img src={current.creatorAvatar} alt={current.creator} className="w-full h-full object-cover" />
          </div>
          <span className="text-white text-sm font-semibold">@{current.creator}</span>
        </div>
        <p className="text-white text-sm mb-2">{current.title}</p>
        <div className="flex items-center space-x-2">
          <span className="text-white text-xs">♫ {current.soundName}</span>
        </div>
      </div>

      {/* Navigation Dots */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col space-y-1 z-10">
        {videos.map((_, idx) => (
          <div key={idx} className={`w-1.5 rounded-full transition-all ${idx === state.currentIndex ? 'h-4 bg-white' : 'h-1.5 bg-white/40'}`} />
        ))}
      </div>
    </div>
  );
};

export default ShortsPlayer;
