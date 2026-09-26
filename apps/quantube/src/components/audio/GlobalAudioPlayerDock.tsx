// ============================================================================
// QuantTube - Spotify-Class Global Audio Player Dock
// Task W37-04: Persistent floating frosted bottom dock (#0D1117 glassmorphism),
// rotating vinyl record, scrubber, volume slider, MediaSession sync
// ============================================================================

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAudioPlayer } from './AudioPlayerContext';

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const GlobalAudioPlayerDock: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    shuffle,
    repeat,
    isDockVisible,
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
  } = useAudioPlayer();

  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isHoveringProgress, setIsHoveringProgress] = useState<boolean>(false);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const progressPercent =
    duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!progressBarRef.current || duration <= 0) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
      seek(ratio * duration);
    },
    [duration, seek],
  );

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setVolume(parseFloat(e.target.value));
    },
    [setVolume],
  );

  // If there's no track selected, render empty or hidden dock
  if (!currentTrack || !isDockVisible) {
    if (currentTrack && !isDockVisible) {
      return (
        <button
          onClick={() => setDockVisible(true)}
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-[#0D1117]/95 border border-white/20 text-white rounded-full shadow-2xl backdrop-blur-md hover:border-emerald-500/50 hover:bg-[#161B22] transition-all text-xs font-medium"
          aria-label="Restore music player dock"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>{currentTrack.title}</span>
          <span>&#x25B6;</span>
        </button>
      );
    }
    return null;
  }

  const artwork =
    currentTrack.artworkUrl || currentTrack.coverUrl || '/icons/music-placeholder.png';

  if (isMinimized) {
    return (
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        className="fixed bottom-3 right-4 z-50 flex items-center gap-3 px-4 py-2.5 bg-[#0D1117]/95 border border-white/15 text-white rounded-2xl shadow-2xl backdrop-blur-xl"
        role="region"
        aria-label="Minimized Audio Player"
      >
        {/* Compact Vinyl */}
        <div
          className={`relative w-8 h-8 rounded-full overflow-hidden border border-black/40 shadow-md ${
            isPlaying ? 'animate-[spin_4s_linear_infinite]' : ''
          }`}
        >
          <img src={artwork} alt={currentTrack.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-[#0D1117] border border-white/30" />
        </div>

        <div className="flex flex-col max-w-[140px] truncate">
          <span className="text-xs font-semibold text-white truncate">{currentTrack.title}</span>
          <span className="text-[11px] text-gray-400 truncate">{currentTrack.artist}</span>
        </div>

        <button
          onClick={togglePlay}
          className="w-8 h-8 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center font-bold text-xs transition-colors"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        <button
          onClick={() => setIsMinimized(false)}
          className="text-gray-400 hover:text-white p-1 text-xs"
          aria-label="Expand Audio Player"
        >
          &#x25B2;
        </button>
      </motion.div>
    );
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-[#0D1117]/95 border-t border-white/10 text-white backdrop-blur-xl shadow-[0_-10px_40px_rgba(0,0,0,0.85)] select-none"
      role="region"
      aria-label="Spotify-Class Audio Player Dock"
    >
      {/* Top Scrubber Bar */}
      <div
        ref={progressBarRef}
        onClick={handleProgressClick}
        onMouseEnter={() => setIsHoveringProgress(true)}
        onMouseLeave={() => setIsHoveringProgress(false)}
        className="relative h-1.5 hover:h-2.5 bg-gray-800/80 cursor-pointer transition-all group"
        role="slider"
        aria-label="Track progress"
        aria-valuenow={currentTime}
        aria-valuemin={0}
        aria-valuemax={duration}
        tabIndex={0}
      >
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all"
          style={{ width: `${progressPercent}%` }}
        />
        {/* Scrubber thumb */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -ml-1.5 w-3 h-3 bg-white rounded-full shadow-md transition-opacity ${
            isHoveringProgress ? 'opacity-100 scale-125' : 'opacity-0'
          }`}
          style={{ left: `${progressPercent}%` }}
        />
      </div>

      <div className="max-w-[1920px] mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
        {/* Left: Artwork + Vinyl Animation + Track Details */}
        <div className="flex items-center gap-3 min-w-[200px] max-w-[320px] lg:max-w-[400px]">
          {/* Rotating Vinyl Record Simulation */}
          <div className="relative group/vinyl flex-shrink-0">
            {/* Vinyl disc that slides slightly out and rotates */}
            <div
              className={`w-12 h-12 rounded-full bg-[#111] border-2 border-black flex items-center justify-center overflow-hidden shadow-xl transition-transform ${
                isPlaying ? 'animate-[spin_6s_linear_infinite]' : ''
              }`}
              style={{
                background:
                  'radial-gradient(circle, #242424 0%, #151515 40%, #050505 70%, #1c1c1c 100%)',
              }}
            >
              {/* Vinyl grooves */}
              <div className="absolute inset-1 rounded-full border border-white/5 pointer-events-none" />
              <div className="absolute inset-2 rounded-full border border-white/5 pointer-events-none" />
              <div className="absolute inset-3 rounded-full border border-white/10 pointer-events-none" />

              {/* Center artwork thumbnail label */}
              <div className="w-6 h-6 rounded-full overflow-hidden border border-black/80">
                <img
                  src={artwork}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                />
              </div>
              {/* Spindle hole */}
              <div className="absolute w-1.5 h-1.5 bg-[#0D1117] rounded-full border border-white/40" />
            </div>
          </div>

          {/* Track Meta */}
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-white truncate hover:underline cursor-pointer">
              {currentTrack.title}
            </span>
            <span className="text-xs text-gray-400 truncate hover:text-gray-300 cursor-pointer">
              {currentTrack.artist}
              {currentTrack.album ? ` • ${currentTrack.album}` : ''}
            </span>
          </div>
        </div>

        {/* Center: Controls + Skip + Progress */}
        <div className="flex-1 max-w-[680px] flex flex-col items-center">
          <div className="flex items-center gap-3 sm:gap-4 mb-1">
            {/* Shuffle */}
            <button
              onClick={toggleShuffle}
              className={`p-2 rounded-full transition-colors relative min-w-[36px] min-h-[36px] flex items-center justify-center ${
                shuffle
                  ? 'text-emerald-400 hover:text-emerald-300'
                  : 'text-gray-400 hover:text-white'
              }`}
              aria-label={shuffle ? 'Disable shuffle' : 'Enable shuffle'}
              title="Shuffle"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
              </svg>
              {shuffle && (
                <span className="absolute bottom-0 w-1 h-1 rounded-full bg-emerald-400" />
              )}
            </button>

            {/* Skip Previous */}
            <button
              onClick={previous}
              className="p-2 text-gray-300 hover:text-white transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
              aria-label="Previous track"
              title="Previous"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>

            {/* 10s Rewind */}
            <button
              onClick={() => skipBackward(10)}
              className="p-1.5 text-gray-400 hover:text-white transition-colors text-xs font-semibold flex items-center gap-0.5"
              aria-label="Rewind 10 seconds"
              title="Rewind 10s"
            >
              <span>↺</span>
              <span className="text-[10px]">10s</span>
            </button>

            {/* Play / Pause Toggle Button */}
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-white hover:bg-emerald-400 hover:scale-105 active:scale-95 text-black flex items-center justify-center transition-all shadow-lg font-bold"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg
                  className="w-5 h-5 ml-0.5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* 10s Forward */}
            <button
              onClick={() => skipForward(10)}
              className="p-1.5 text-gray-400 hover:text-white transition-colors text-xs font-semibold flex items-center gap-0.5"
              aria-label="Forward 10 seconds"
              title="Forward 10s"
            >
              <span className="text-[10px]">10s</span>
              <span>↻</span>
            </button>

            {/* Skip Next */}
            <button
              onClick={next}
              className="p-2 text-gray-300 hover:text-white transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
              aria-label="Next track"
              title="Next"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>

            {/* Repeat Mode */}
            <button
              onClick={cycleRepeat}
              className={`p-2 rounded-full transition-colors relative min-w-[36px] min-h-[36px] flex items-center justify-center ${
                repeat !== 'off'
                  ? 'text-emerald-400 hover:text-emerald-300'
                  : 'text-gray-400 hover:text-white'
              }`}
              aria-label={`Repeat mode: ${repeat}`}
              title={`Repeat: ${repeat}`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
              </svg>
              {repeat === 'one' && (
                <span className="absolute top-1 right-1 text-[9px] font-bold bg-emerald-500 text-black rounded-full px-0.5 leading-none">
                  1
                </span>
              )}
              {repeat === 'all' && (
                <span className="absolute bottom-0 w-1 h-1 rounded-full bg-emerald-400" />
              )}
            </button>
          </div>

          {/* Time scrubber text */}
          <div className="flex items-center gap-2 text-[11px] text-gray-400 tabular-nums">
            <span>{formatTime(currentTime)}</span>
            <span>/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Volume + Minimize + Close */}
        <div className="flex items-center gap-3 min-w-[180px] justify-end">
          {/* Mute Toggle */}
          <button
            onClick={toggleMute}
            className="p-1.5 text-gray-400 hover:text-white transition-colors"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? (
              <svg
                className="w-5 h-5 text-red-400"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              </svg>
            ) : volume < 0.5 ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 9v6h4l5 5V4l-5 5H7z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              </svg>
            )}
          </button>

          {/* Volume Slider */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-20 md:w-24 h-1.5 bg-gray-700 accent-emerald-500 rounded-lg cursor-pointer"
            aria-label="Volume slider"
            title={`Volume: ${Math.round(volume * 100)}%`}
          />

          {/* Minimize Button */}
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1.5 text-gray-400 hover:text-white transition-colors text-sm"
            aria-label="Minimize player"
            title="Minimize"
          >
            &#x25BC;
          </button>

          {/* Close/Hide Dock */}
          <button
            onClick={() => setDockVisible(false)}
            className="p-1.5 text-gray-400 hover:text-red-400 transition-colors text-sm"
            aria-label="Close audio player dock"
            title="Close dock"
          >
            &#x2715;
          </button>
        </div>
      </div>
    </div>
  );
};

export default GlobalAudioPlayerDock;
