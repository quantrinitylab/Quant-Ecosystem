// ============================================================================
// QuantTube - Adaptive HLS Video Player with Quality & Speed Selectors
// Task W37-03: Adaptive HLS Player, quality selector, speed selector,
// theater mode toggle, and smart segment-skipping AI button
// ============================================================================

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type VideoSpeed = 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2;
export type VideoResolution = 'Auto' | '1080p' | '720p' | '480p' | '360p';

export interface VideoChapter {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
}

export interface SkipSegment {
  startSec: number;
  endSec: number;
  label?: string; // e.g. "intro", "sponsor", "recap"
  category?: 'intro' | 'sponsor' | 'recap' | 'outro' | 'custom';
}

export interface AdaptiveVideoPlayerProps {
  video: {
    id: string;
    title?: string;
    url?: string;
    hlsUrl?: string;
    thumbnailUrl?: string;
    duration?: number;
    chapters?: VideoChapter[];
  };
  skipSegments?: SkipSegment[];
  autoPlay?: boolean;
  initialSpeed?: VideoSpeed;
  initialQuality?: VideoResolution;
  initialTheaterMode?: boolean;
  onTheaterModeChange?: (isTheater: boolean) => void;
  onQualityChange?: (quality: VideoResolution) => void;
  onSpeedChange?: (speed: VideoSpeed) => void;
  onTimeUpdate?: (currentTime: number) => void;
  onEnded?: () => void;
  className?: string;
}

export const SPEED_OPTIONS: VideoSpeed[] = [0.5, 0.75, 1, 1.25, 1.5, 2];
export const QUALITY_OPTIONS: VideoResolution[] = ['Auto', '1080p', '720p', '480p', '360p'];

export function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const AdaptiveVideoPlayer: React.FC<AdaptiveVideoPlayerProps> = ({
  video,
  skipSegments = [],
  autoPlay = false,
  initialSpeed = 1,
  initialQuality = 'Auto',
  initialTheaterMode = false,
  onTheaterModeChange,
  onQualityChange,
  onSpeedChange,
  onTimeUpdate,
  onEnded,
  className = '',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(video.duration || 0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [previousVolume, setPreviousVolume] = useState<number>(1);
  const [speed, setSpeed] = useState<VideoSpeed>(initialSpeed);
  const [quality, setQuality] = useState<VideoResolution>(initialQuality);
  const [isTheaterMode, setIsTheaterMode] = useState<boolean>(initialTheaterMode);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const [showSpeedMenu, setShowSpeedMenu] = useState<boolean>(false);
  const [showQualityMenu, setShowQualityMenu] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [autoSkipAI, setAutoSkipAI] = useState<boolean>(false);

  // Active skip segment detection
  const activeSkipSegment = useMemo(() => {
    return skipSegments.find((seg) => currentTime >= seg.startSec && currentTime < seg.endSec);
  }, [skipSegments, currentTime]);

  // Current active chapter
  const currentChapter = useMemo(() => {
    if (!video.chapters || video.chapters.length === 0) return null;
    return video.chapters.find((ch) => currentTime >= ch.startTime && currentTime < ch.endTime);
  }, [video.chapters, currentTime]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Auto-hide controls timer
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        if (!showSpeedMenu && !showQualityMenu) {
          setShowControls(false);
        }
      }, 3500);
    }
  }, [isPlaying, showSpeedMenu, showQualityMenu]);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying, resetControlsTimer]);

  // Play / Pause handling
  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) {
      setIsPlaying((prev) => !prev);
      return;
    }
    if (el.paused) {
      el.play().catch(() => {});
      setIsPlaying(true);
    } else {
      el.pause();
      setIsPlaying(false);
    }
  }, []);

  // Time seek
  const seekTo = useCallback(
    (time: number) => {
      const clamped = Math.max(0, Math.min(time, duration || Infinity));
      setCurrentTime(clamped);
      if (videoRef.current) {
        videoRef.current.currentTime = clamped;
      }
      onTimeUpdate?.(clamped);
    },
    [duration, onTimeUpdate],
  );

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!progressBarRef.current || duration <= 0) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
      seekTo(ratio * duration);
    },
    [duration, seekTo],
  );

  // Speed selection
  const handleSpeedChange = useCallback(
    (newSpeed: VideoSpeed) => {
      setSpeed(newSpeed);
      if (videoRef.current) {
        videoRef.current.playbackRate = newSpeed;
      }
      setShowSpeedMenu(false);
      onSpeedChange?.(newSpeed);
    },
    [onSpeedChange],
  );

  // Quality selection
  const handleQualityChange = useCallback(
    (newQuality: VideoResolution) => {
      setQuality(newQuality);
      setShowQualityMenu(false);
      onQualityChange?.(newQuality);
    },
    [onQualityChange],
  );

  // Theater Mode toggle
  const toggleTheaterMode = useCallback(() => {
    setIsTheaterMode((prev) => {
      const next = !prev;
      onTheaterModeChange?.(next);
      return next;
    });
  }, [onTheaterModeChange]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  // Volume & Mute
  const handleVolumeSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
    }
    if (val > 0) {
      setIsMuted(false);
      setPreviousVolume(val);
    } else {
      setIsMuted(true);
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (isMuted) {
      setIsMuted(false);
      const restored = previousVolume || 1;
      setVolume(restored);
      if (videoRef.current) {
        videoRef.current.volume = restored;
        videoRef.current.muted = false;
      }
    } else {
      setPreviousVolume(volume);
      setIsMuted(true);
      setVolume(0);
      if (videoRef.current) {
        videoRef.current.volume = 0;
        videoRef.current.muted = true;
      }
    }
  }, [isMuted, previousVolume, volume]);

  // Smart Segment Skip action
  const handleSkipActiveSegment = useCallback(() => {
    if (activeSkipSegment) {
      seekTo(activeSkipSegment.endSec);
    }
  }, [activeSkipSegment, seekTo]);

  // Video element events
  const onTimeUpdateInternal = useCallback(() => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);
    onTimeUpdate?.(t);

    // Auto-skip AI execution
    if (autoSkipAI && activeSkipSegment && t < activeSkipSegment.endSec) {
      seekTo(activeSkipSegment.endSec);
    }
  }, [onTimeUpdate, autoSkipAI, activeSkipSegment, seekTo]);

  const onLoadedMetadataInternal = useCallback(() => {
    if (!videoRef.current) return;
    const d = videoRef.current.duration;
    if (Number.isFinite(d) && d > 0) {
      setDuration(d);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimer}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className={`relative bg-black select-none overflow-hidden transition-all duration-300 ${
        isTheaterMode
          ? 'w-full max-w-none aspect-[21/9] md:h-[75vh]'
          : 'w-full aspect-video rounded-xl shadow-2xl'
      } ${className}`}
      role="region"
      aria-label="Adaptive Video Player"
    >
      {/* Underlying Video Element */}
      <video
        ref={videoRef}
        src={video.url || video.hlsUrl}
        poster={video.thumbnailUrl}
        autoPlay={autoPlay}
        className="w-full h-full object-contain cursor-pointer"
        onClick={togglePlay}
        onTimeUpdate={onTimeUpdateInternal}
        onLoadedMetadata={onLoadedMetadataInternal}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          onEnded?.();
        }}
      />

      {/* Smart Segment-Skipping AI Floating Pill */}
      <AnimatePresence>
        {activeSkipSegment && (
          <motion.div
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            className="absolute bottom-20 right-4 z-40 flex items-center gap-2 bg-[#0D1117]/90 border border-emerald-500/40 text-white px-3.5 py-2 rounded-xl shadow-2xl backdrop-blur-md"
          >
            <span className="text-emerald-400 font-bold text-sm">⚡ AI</span>
            <span className="text-xs text-gray-200 capitalize">
              {activeSkipSegment.label || 'Intro / Sponsor'}
            </span>
            <button
              onClick={handleSkipActiveSegment}
              className="ml-1 px-3 py-1 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black font-semibold text-xs rounded-lg transition-all shadow-md"
              aria-label="Skip intro or sponsor"
            >
              Skip &#x21E5;
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Center Play Overlay Trigger (Click anywhere) */}
      {!isPlaying && (
        <div
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
          aria-hidden="true"
        >
          <div className="w-16 h-16 rounded-full bg-black/70 hover:bg-emerald-500 hover:text-black text-white flex items-center justify-center transition-all transform hover:scale-110 shadow-2xl backdrop-blur-sm border border-white/20">
            <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Top Banner (Title & Chapter) */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between text-white z-30"
          >
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold truncate max-w-md drop-shadow">
                {video.title || 'QuantTube Adaptive Stream'}
              </h2>
              {currentChapter && (
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded text-gray-200">
                  {currentChapter.title}
                </span>
              )}
            </div>

            {/* Auto-Skip AI Switch */}
            <div className="flex items-center gap-2">
              <label
                className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white cursor-pointer bg-black/50 px-2.5 py-1 rounded-full border border-white/10"
                title="Automatically skip intros and sponsor segments"
              >
                <input
                  type="checkbox"
                  checked={autoSkipAI}
                  onChange={(e) => setAutoSkipAI(e.target.checked)}
                  className="w-3.5 h-3.5 accent-emerald-500 rounded cursor-pointer"
                  aria-label="Auto-skip AI"
                />
                <span className="text-[11px] font-medium">Auto-skip AI</span>
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Controls Bar */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="absolute bottom-0 left-0 right-0 pt-6 pb-2 px-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent text-white z-30 flex flex-col gap-2"
          >
            {/* Scrubber track */}
            <div
              ref={progressBarRef}
              onClick={handleProgressClick}
              className="relative h-1.5 hover:h-2.5 bg-white/20 rounded-full cursor-pointer transition-all group"
              role="slider"
              aria-label="Seek time"
              aria-valuenow={currentTime}
              aria-valuemin={0}
              aria-valuemax={duration}
              tabIndex={0}
            >
              {/* Skip segment markers highlighted */}
              {skipSegments.map((seg, idx) => {
                const segLeft = duration > 0 ? (seg.startSec / duration) * 100 : 0;
                const segWidth = duration > 0 ? ((seg.endSec - seg.startSec) / duration) * 100 : 0;
                return (
                  <div
                    key={`seg-${idx}`}
                    className="absolute top-0 bottom-0 bg-yellow-400/80 rounded-sm"
                    style={{ left: `${segLeft}%`, width: `${segWidth}%` }}
                    title={`Skippable: ${seg.label || 'Segment'}`}
                  />
                );
              })}

              {/* Progress Played Fill */}
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />

              {/* Scrubber thumb */}
              <div
                className="absolute top-1/2 -translate-y-1/2 -ml-1.5 w-3.5 h-3.5 bg-white rounded-full shadow-md scale-0 group-hover:scale-100 transition-transform"
                style={{ left: `${progressPercent}%` }}
              />
            </div>

            {/* Controls Row */}
            <div className="flex items-center justify-between gap-3 text-xs">
              {/* Left group */}
              <div className="flex items-center gap-3">
                {/* Play/Pause */}
                <button
                  onClick={togglePlay}
                  className="p-1.5 text-white hover:text-emerald-400 transition-colors"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                {/* Volume & Mute */}
                <div className="flex items-center gap-1.5 group/vol">
                  <button
                    onClick={toggleMute}
                    className="p-1 text-gray-300 hover:text-white transition-colors"
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeSlider}
                    className="w-16 h-1 accent-emerald-500 rounded cursor-pointer"
                    aria-label="Volume"
                  />
                </div>

                {/* Time Display */}
                <div className="text-[11px] text-gray-300 tabular-nums font-mono">
                  <span>{formatVideoTime(currentTime)}</span>
                  <span className="mx-1">/</span>
                  <span>{formatVideoTime(duration)}</span>
                </div>
              </div>

              {/* Right group */}
              <div className="flex items-center gap-2 relative">
                {/* Playback Speed Selector */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowSpeedMenu(!showSpeedMenu);
                      setShowQualityMenu(false);
                    }}
                    className="px-2 py-1 bg-black/60 border border-white/20 rounded hover:border-emerald-400 hover:text-emerald-400 transition-colors text-xs font-medium"
                    aria-label="Playback speed selector"
                  >
                    {speed}x
                  </button>

                  <AnimatePresence>
                    {showSpeedMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 5 }}
                        className="absolute bottom-full mb-2 right-0 bg-[#0D1117] border border-white/20 rounded-lg shadow-2xl py-1 w-24 z-50 text-xs"
                      >
                        <div className="px-2 py-1 font-semibold text-gray-400 border-b border-white/10 text-[10px] uppercase">
                          Speed
                        </div>
                        {SPEED_OPTIONS.map((opt) => (
                          <button
                            key={`speed-${opt}`}
                            onClick={() => handleSpeedChange(opt)}
                            className={`w-full text-left px-3 py-1.5 hover:bg-white/10 transition-colors flex items-center justify-between ${
                              speed === opt ? 'text-emerald-400 font-bold' : 'text-gray-300'
                            }`}
                          >
                            <span>{opt}x</span>
                            {speed === opt && <span>✓</span>}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Quality Resolution Selector */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowQualityMenu(!showQualityMenu);
                      setShowSpeedMenu(false);
                    }}
                    className="px-2 py-1 bg-black/60 border border-white/20 rounded hover:border-emerald-400 hover:text-emerald-400 transition-colors text-xs font-medium flex items-center gap-1"
                    aria-label="Quality resolution selector"
                  >
                    <span>{quality}</span>
                    <span className="text-[10px] text-gray-400">&#x2699;</span>
                  </button>

                  <AnimatePresence>
                    {showQualityMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 5 }}
                        className="absolute bottom-full mb-2 right-0 bg-[#0D1117] border border-white/20 rounded-lg shadow-2xl py-1 w-28 z-50 text-xs"
                      >
                        <div className="px-2 py-1 font-semibold text-gray-400 border-b border-white/10 text-[10px] uppercase">
                          Quality
                        </div>
                        {QUALITY_OPTIONS.map((res) => (
                          <button
                            key={`quality-${res}`}
                            onClick={() => handleQualityChange(res)}
                            className={`w-full text-left px-3 py-1.5 hover:bg-white/10 transition-colors flex items-center justify-between ${
                              quality === res ? 'text-emerald-400 font-bold' : 'text-gray-300'
                            }`}
                          >
                            <span>{res}</span>
                            {quality === res && <span>✓</span>}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Theater Mode Toggle */}
                <button
                  onClick={toggleTheaterMode}
                  className={`p-1.5 rounded transition-colors text-xs flex items-center gap-1 ${
                    isTheaterMode
                      ? 'text-emerald-400 bg-white/10'
                      : 'text-gray-300 hover:text-white'
                  }`}
                  aria-label="Theater mode toggle"
                  title={isTheaterMode ? 'Exit theater mode' : 'Theater mode'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="2" y="5" width="20" height="14" rx="2" strokeWidth="2" />
                    <rect
                      x="5"
                      y="8"
                      width="14"
                      height="8"
                      strokeWidth="1.5"
                      strokeDasharray="2 2"
                    />
                  </svg>
                </button>

                {/* Fullscreen Toggle */}
                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 text-gray-300 hover:text-white transition-colors text-xs"
                  aria-label="Fullscreen"
                  title="Fullscreen"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                  </svg>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdaptiveVideoPlayer;
