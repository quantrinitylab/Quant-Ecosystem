'use client';

// ============================================================================
// Shared UI - Media Player Components
// ============================================================================

import React, { useState, useRef, useCallback } from 'react';
import { useReducedMotion } from 'framer-motion';

// ===== Video Player =====
export interface VideoPlayerProps {
  src: string;
  poster?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  width?: string | number;
  height?: string | number;
  className?: string;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  poster,
  autoPlay = false,
  muted = false,
  loop = false,
  controls = true,
  width = '100%',
  height = 'auto',
  className = '',
  onPlay,
  onPause,
  onEnded,
  onTimeUpdate,
}) => {
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(muted ? 0 : 1);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      onPause?.();
    } else {
      videoRef.current.play();
      onPlay?.();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, onPlay, onPause]);

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    const dur = videoRef.current.duration;
    setCurrentTime(time);
    setDuration(dur);
    onTimeUpdate?.(time, dur);
  }, [onTimeUpdate]);

  const seek = useCallback((time: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={`relative group bg-black rounded-lg overflow-hidden ${className}`}
      style={{ width, height }}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        onTimeUpdate={handleTimeUpdate}
        onEnded={onEnded}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        className="w-full h-full object-contain"
        playsInline
      />
      {controls && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              className="text-white hover:text-blue-400 transition-colors"
            >
              {isPlaying ? '||' : '\u25B6'}
            </button>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={(e) => seek(Number(e.target.value))}
              className="flex-1 h-1 bg-gray-600 rounded-full appearance-none cursor-pointer"
            />
            <span className="text-white text-xs">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                if (videoRef.current) videoRef.current.volume = v;
              }}
              className="w-16 h-1 bg-gray-600 rounded-full appearance-none cursor-pointer"
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ===== Audio Player =====
export interface AudioPlayerProps {
  src: string;
  title?: string;
  artist?: string;
  coverArt?: string;
  autoPlay?: boolean;
  className?: string;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  src,
  title,
  artist,
  coverArt,
  autoPlay = false,
  className = '',
  onPlay,
  onPause,
  onEnded,
}) => {
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      onPause?.();
    } else {
      audioRef.current.play();
      onPlay?.();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, onPlay, onPause]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`flex items-center gap-3 p-3 bg-gray-100 rounded-lg ${className}`}>
      <audio
        ref={audioRef}
        src={src}
        autoPlay={autoPlay}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={onEnded}
      />
      {coverArt && <img src={coverArt} alt="Cover" className="w-12 h-12 rounded-md object-cover" />}
      <div className="flex-1 min-w-0">
        {title && <p className="text-sm font-medium text-gray-900 truncate">{title}</p>}
        {artist && <p className="text-xs text-gray-500 truncate">{artist}</p>}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-400">{formatTime(currentTime)}</span>
          <div className="flex-1 h-1 bg-gray-300 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
            />
          </div>
          <span className="text-xs text-gray-400">{formatTime(duration)}</span>
        </div>
      </div>
      <button
        onClick={togglePlay}
        className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
      >
        {isPlaying ? '||' : '\u25B6'}
      </button>
    </div>
  );
};

// ===== Image Viewer =====
export interface ImageViewerProps {
  src: string;
  alt?: string;
  width?: string | number;
  height?: string | number;
  zoomable?: boolean;
  className?: string;
  onLoad?: () => void;
  onError?: () => void;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({
  src,
  alt = 'Image',
  width = '100%',
  height = 'auto',
  zoomable = true,
  className = '',
  onLoad,
  onError,
}) => {
  const [isZoomed, setIsZoomed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ width, height }}>
      {isLoading && (
        <div
          className={`absolute inset-0 flex items-center justify-center bg-gray-100${prefersReducedMotion ? '' : ' animate-pulse'}`}
        >
          <svg
            className="w-8 h-8 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
      )}
      {hasError ? (
        <div className="flex items-center justify-center w-full h-full bg-gray-100 text-gray-400">
          <p>Failed to load image</p>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-contain transition-transform duration-300 ${zoomable ? 'cursor-zoom-in' : ''} ${isZoomed ? 'scale-150 cursor-zoom-out' : ''}`}
          onClick={zoomable ? () => setIsZoomed(!isZoomed) : undefined}
          onLoad={() => {
            setIsLoading(false);
            onLoad?.();
          }}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
            onError?.();
          }}
        />
      )}
    </div>
  );
};
