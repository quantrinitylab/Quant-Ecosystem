// ============================================================================
// QuantEdits - Preview Player Component
// Video preview with play/pause, seek bar, frame step, fullscreen, loop, speed
// ============================================================================

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';

interface PreviewPlayerProps {
  src?: string;
  poster?: string;
  duration?: number;
  onTimeUpdate?: (time: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
}

type PlaybackSpeed = 0.25 | 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2;

const PLAYBACK_SPEEDS: PlaybackSpeed[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

const PreviewPlayer: React.FC<PreviewPlayerProps> = ({
  src,
  poster,
  duration = 0,
  onTimeUpdate,
  onPlay,
  onPause,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (duration > 0) setTotalDuration(duration);
  }, [duration]);

  const handlePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      onPause?.();
    } else {
      void videoRef.current.play();
      setIsPlaying(true);
      onPlay?.();
    }
  }, [isPlaying, onPlay, onPause]);

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current || isSeeking) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);
    onTimeUpdate?.(time);
  }, [onTimeUpdate, isSeeking]);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setTotalDuration(videoRef.current.duration);
    }
  }, []);

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = parseFloat(e.target.value);
      setCurrentTime(time);
      if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
      onTimeUpdate?.(time);
    },
    [onTimeUpdate],
  );

  const handleFrameStep = useCallback(
    (direction: 'forward' | 'backward') => {
      if (!videoRef.current) return;
      const frameTime = 1 / 30;
      const newTime =
        direction === 'forward'
          ? Math.min(totalDuration, currentTime + frameTime)
          : Math.max(0, currentTime - frameTime);
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      onTimeUpdate?.(newTime);
    },
    [currentTime, totalDuration, onTimeUpdate],
  );

  const handleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      void containerRef.current.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, [isFullscreen]);

  const handleSpeedChange = useCallback((speed: PlaybackSpeed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSpeedMenu(false);
  }, []);

  const formatTime = useCallback((seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, []);

  return (
    <div
      ref={containerRef}
      className="preview-player"
      role="region"
      aria-label="Video preview player"
    >
      {/* Video Area */}
      <div className="preview-video-container">
        {src ? (
          <video
            ref={videoRef}
            className="preview-video"
            src={src}
            poster={poster}
            loop={isLooping}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => {
              if (!isLooping) setIsPlaying(false);
            }}
            playsInline
          />
        ) : (
          <div className="preview-placeholder">
            <span className="placeholder-icon">&#9654;</span>
            <span className="placeholder-text">No media selected</span>
          </div>
        )}

        {/* Center Play/Pause Overlay */}
        {src && !isPlaying && (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', ...spring.snappy }}
            className="preview-play-overlay"
            onClick={handlePlayPause}
            aria-label="Play video"
          >
            <span className="play-overlay-icon">&#9654;</span>
          </motion.button>
        )}
      </div>

      {/* Controls Bar */}
      <div className="preview-controls-bar">
        {/* Frame Step Back */}
        <button
          className="preview-ctrl-btn"
          onClick={() => handleFrameStep('backward')}
          title="Previous frame"
          aria-label="Previous frame"
        >
          &lt;&lt;
        </button>

        {/* Play/Pause */}
        <button
          className="preview-ctrl-btn play-pause-btn"
          onClick={handlePlayPause}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '\u23F8' : '\u25B6'}
        </button>

        {/* Frame Step Forward */}
        <button
          className="preview-ctrl-btn"
          onClick={() => handleFrameStep('forward')}
          title="Next frame"
          aria-label="Next frame"
        >
          &gt;&gt;
        </button>

        {/* Seek Bar */}
        <div className="preview-seek-container">
          <span className="preview-time">{formatTime(currentTime)}</span>
          <input
            type="range"
            className="preview-seek-bar"
            min={0}
            max={totalDuration || 1}
            step={0.01}
            value={currentTime}
            onChange={handleSeek}
            onMouseDown={() => setIsSeeking(true)}
            onMouseUp={() => setIsSeeking(false)}
            aria-label="Seek position"
          />
          <span className="preview-time">{formatTime(totalDuration)}</span>
        </div>

        {/* Loop Toggle */}
        <button
          className={`preview-ctrl-btn ${isLooping ? 'active' : ''}`}
          onClick={() => setIsLooping(!isLooping)}
          title={isLooping ? 'Disable loop' : 'Enable loop'}
          aria-label={isLooping ? 'Disable loop' : 'Enable loop'}
          aria-pressed={isLooping}
        >
          &#128257;
        </button>

        {/* Playback Speed */}
        <div className="preview-speed-wrapper">
          <button
            className="preview-ctrl-btn speed-btn"
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            aria-label="Playback speed"
            aria-expanded={showSpeedMenu}
          >
            {playbackSpeed}x
          </button>
          {showSpeedMenu && (
            <div className="speed-dropdown" role="listbox" aria-label="Select playback speed">
              {PLAYBACK_SPEEDS.map((speed) => (
                <button
                  key={speed}
                  className={`speed-option ${playbackSpeed === speed ? 'active' : ''}`}
                  onClick={() => handleSpeedChange(speed)}
                  role="option"
                  aria-selected={playbackSpeed === speed}
                >
                  {speed}x
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Fullscreen */}
        <button
          className="preview-ctrl-btn"
          onClick={handleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? '\u2716' : '\u26F6'}
        </button>
      </div>
    </div>
  );
};

export default PreviewPlayer;
