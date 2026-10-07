// ============================================================================
// QuantTube - VideoPlayer Component
// Full-featured video player with chapters, subtitles, quality selection,
// playback speed selector, theater mode toggle, and smart segment-skipping AI
// ============================================================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import type { Video, Subtitle, PlayerState } from '../types';
export { AdaptiveVideoPlayer } from './video/AdaptiveVideoPlayer';
export type { VideoSpeed, VideoResolution, SkipSegment } from './video/AdaptiveVideoPlayer';

export interface VideoPlayerProps {
  video: Video;
  state: PlayerState;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onQualityChange: (quality: string) => void;
  onSubtitleChange: (subtitle: Subtitle | null) => void;
  onFullscreen: () => void;
  onMiniPlayer: () => void;
  onPlaybackRateChange: (rate: number) => void;
  isTheaterMode?: boolean;
  onTheaterModeToggle?: () => void;
  skipSegments?: Array<{ startSec: number; endSec: number; label?: string }>;
}

const controlsVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', ...spring.stiff } },
  exit: { opacity: 0, y: 12, transition: { duration: 0.15 } },
};

export function VideoPlayer({
  video,
  state,
  onPlay,
  onPause,
  onSeek,
  onQualityChange,
  onSubtitleChange: _onSubtitleChange,
  onFullscreen,
  onMiniPlayer,
  onPlaybackRateChange,
  isTheaterMode = false,
  onTheaterModeToggle,
  skipSegments = [],
}: VideoPlayerProps) {
  const [showControls, setShowControls] = useState(true);
  const progressPercent = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
  const currentChapter = video.chapters.find(
    (ch) => state.currentTime >= ch.startTime && state.currentTime < ch.endTime,
  );
  const qualities = ['Auto', '1080p', '720p', '480p', '360p'];
  const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2];

  // Smart segment-skipping AI button detection
  const activeSkipSegment = skipSegments.find(
    (seg) => state.currentTime >= seg.startSec && state.currentTime < seg.endSec,
  );

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    onSeek(percent * state.duration);
  };

  return (
    <motion.div
      className={`relative flex flex-col bg-black transition-all duration-300 ${
        state.isFullscreen
          ? 'fixed inset-0 z-50'
          : isTheaterMode
            ? 'w-full max-w-none aspect-[21/9] md:h-[75vh]'
            : state.isMiniPlayer
              ? 'w-80 h-48'
              : 'w-full aspect-video rounded-xl overflow-hidden'
      }`}
      role="region"
      aria-label="Video player"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      animate={
        state.isMiniPlayer
          ? { scale: 1, transition: { type: 'spring', ...spring.stiff } }
          : { scale: 1 }
      }
    >
      {/* Viewport */}
      <div className="relative flex-1 flex items-center justify-center bg-black">
        <video
          src={video.url}
          poster={video.thumbnailUrl}
          className="max-w-full max-h-full"
          aria-label={video.title}
        />

        {/* Smart Segment-Skipping AI Button */}
        <AnimatePresence>
          {activeSkipSegment && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="absolute bottom-16 right-4 z-40 flex items-center gap-2 bg-[#0D1117]/90 border border-emerald-500/40 text-white px-3 py-1.5 rounded-xl shadow-2xl backdrop-blur-md"
            >
              <span className="text-emerald-400 font-bold text-xs">⚡ AI</span>
              <span className="text-xs text-gray-200 capitalize">
                {activeSkipSegment.label || 'intro / sponsor'}
              </span>
              <button
                onClick={() => onSeek(activeSkipSegment.endSec)}
                className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs rounded-lg transition-colors shadow"
                aria-label="Skip intro / sponsor"
              >
                Skip intro / sponsor
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={state.isPlaying ? onPause : onPlay}
            className="w-16 h-16 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
            aria-label={state.isPlaying ? 'Pause' : 'Play'}
          >
            {state.isPlaying ? (
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Progress container */}
      <div className="relative px-2 py-1 group">
        {/* Chapter markers */}
        <div className="absolute inset-x-2 top-1 h-1" aria-hidden="true">
          {video.chapters.map((ch) => (
            <div
              key={ch.id}
              className="absolute w-0.5 h-full bg-yellow-400"
              style={{ left: `${(ch.startTime / state.duration) * 100}%` }}
              title={ch.title}
            />
          ))}
        </div>
        {/* Progress track */}
        <div
          className="relative h-1 bg-[var(--quant-muted)] rounded-full cursor-pointer group-hover:h-2 transition-all"
          onClick={handleProgressClick}
          role="slider"
          aria-label="Seek"
          aria-valuenow={state.currentTime}
          aria-valuemin={0}
          aria-valuemax={state.duration}
          tabIndex={0}
        >
          <div
            className="h-full bg-[var(--brand-primary)] rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-[var(--brand-primary)] rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Controls bar */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            variants={controlsVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex items-center gap-2 px-3 py-2 bg-gradient-to-t from-black/90 to-transparent"
          >
            {/* Left controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={state.isPlaying ? onPause : onPlay}
                className="w-11 h-11 flex items-center justify-center text-white hover:bg-white/10 rounded transition-colors"
                aria-label={state.isPlaying ? 'Pause' : 'Play'}
              >
                {state.isPlaying ? 'II' : '\u25B6'}
              </button>
              <button
                className="w-11 h-11 flex items-center justify-center text-white hover:bg-white/10 rounded transition-colors"
                aria-label="Previous"
              >
                \u23EE
              </button>
              <button
                className="w-11 h-11 flex items-center justify-center text-white hover:bg-white/10 rounded transition-colors"
                aria-label="Next"
              >
                \u23ED
              </button>
              <div className="flex items-center gap-1 ml-2">
                <button
                  className="w-11 h-11 flex items-center justify-center text-white hover:bg-white/10 rounded transition-colors"
                  aria-label={state.muted ? 'Unmute' : 'Mute'}
                >
                  {state.muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={state.volume * 100}
                  className="w-20 accent-[var(--brand-primary)]"
                  aria-label="Volume"
                  readOnly
                />
              </div>
              <span className="text-xs text-white ml-2 tabular-nums" aria-label="Time">
                {formatTime(state.currentTime)} / {formatTime(state.duration)}
              </span>
            </div>

            {/* Center - current chapter */}
            {currentChapter && (
              <span className="flex-1 text-center text-xs text-gray-300 truncate px-2">
                {currentChapter.title}
              </span>
            )}
            {!currentChapter && <span className="flex-1" />}

            {/* Right controls */}
            <div className="flex items-center gap-1">
              {/* Playback speed selector */}
              <select
                value={state.playbackRate}
                onChange={(e) => onPlaybackRateChange(parseFloat(e.target.value))}
                className="bg-transparent text-white text-xs border border-gray-600 rounded px-1 py-1 min-h-[44px]"
                aria-label="Playback speed"
              >
                {playbackRates.map((r) => (
                  <option key={r} value={r} className="bg-gray-900">
                    {r}x
                  </option>
                ))}
              </select>

              {/* Quality resolution selector */}
              <select
                value={state.quality}
                onChange={(e) => onQualityChange(e.target.value)}
                className="bg-transparent text-white text-xs border border-gray-600 rounded px-1 py-1 min-h-[44px]"
                aria-label="Video quality"
              >
                {qualities.map((q) => (
                  <option key={q} value={q} className="bg-gray-900">
                    {q}
                  </option>
                ))}
              </select>

              <button
                className="w-11 h-11 flex items-center justify-center text-white hover:bg-white/10 rounded transition-colors"
                aria-label="Subtitles"
              >
                CC
              </button>

              {/* Theater mode toggle */}
              {onTheaterModeToggle && (
                <button
                  onClick={onTheaterModeToggle}
                  className={`w-11 h-11 flex items-center justify-center hover:bg-white/10 rounded transition-colors ${
                    isTheaterMode ? 'text-emerald-400 font-bold' : 'text-white'
                  }`}
                  aria-label="Theater mode"
                  title="Theater mode"
                >
                  &#x25A2;
                </button>
              )}

              <button
                onClick={onMiniPlayer}
                className="w-11 h-11 flex items-center justify-center text-white hover:bg-white/10 rounded transition-colors"
                aria-label="Mini player"
              >
                \u25A3
              </button>
              <button
                onClick={onFullscreen}
                className="w-11 h-11 flex items-center justify-center text-white hover:bg-white/10 rounded transition-colors"
                aria-label={state.isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {state.isFullscreen ? '\u2716' : '\u26F6'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default VideoPlayer;
