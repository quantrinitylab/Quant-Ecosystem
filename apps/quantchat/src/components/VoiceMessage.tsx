// ============================================================================
// QuantChat - Voice Message Component
// Audio player with waveform visualization and playback controls
// ============================================================================

import React, { useState, useCallback } from 'react';

export interface VoiceMessageProps {
  audioUrl: string;
  duration: number;
  waveform: number[];
  onPlay?: () => void;
  onPause?: () => void;
}

export const VoiceMessageComponent: React.FC<VoiceMessageProps> = ({
  audioUrl,
  duration,
  waveform,
  onPlay,
  onPause,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      onPause?.();
    } else {
      setIsPlaying(true);
      onPlay?.();
    }
  }, [isPlaying, onPlay, onPause]);

  const handleSpeedChange = useCallback(() => {
    const speeds = [1, 1.5, 2];
    const currentIndex = speeds.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % speeds.length;
    const nextSpeed = speeds[nextIndex];
    if (nextSpeed !== undefined) {
      setPlaybackSpeed(nextSpeed);
    }
  }, [playbackSpeed]);

  const handleWaveformClick = useCallback(
    (index: number) => {
      const newProgress = waveform.length > 0 ? index / waveform.length : 0;
      setProgress(newProgress);
    },
    [waveform.length],
  );

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const currentTime = progress * duration;

  return (
    <div className="voice-message-player" data-url={audioUrl}>
      <button
        className="play-pause-btn"
        onClick={handlePlayPause}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <div className="waveform-container">
        {waveform.map((amplitude, index) => {
          const isActive = waveform.length > 0 && index / waveform.length <= progress;
          return (
            <div
              key={index}
              className={`waveform-bar ${isActive ? 'active' : ''}`}
              style={{ height: `${Math.max(4, amplitude * 32)}px` }}
              onClick={() => handleWaveformClick(index)}
              role="slider"
              aria-valuenow={amplitude}
              aria-valuemin={0}
              aria-valuemax={1}
              tabIndex={0}
            />
          );
        })}
      </div>

      <div className="voice-meta">
        <span className="voice-duration">
          {formatDuration(currentTime)} / {formatDuration(duration)}
        </span>
        <button
          className="speed-btn"
          onClick={handleSpeedChange}
          aria-label={`Playback speed ${playbackSpeed}x`}
        >
          {playbackSpeed}x
        </button>
      </div>
    </div>
  );
};

export default VoiceMessageComponent;
