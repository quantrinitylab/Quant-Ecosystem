import React, { useState, useEffect, useRef } from 'react';

export interface AudioWaveformMessageProps {
  id: string;
  audioUrl: string;
  durationSeconds: number;
  isSender?: boolean;
  deliveryStatus?: 'sent' | 'delivered' | 'read';
  readAt?: string;
  timestamp?: string;
  onPlayStateChange?: (isPlaying: boolean) => void;
}

/**
 * Generates deterministic array of normalized heights (0.15 to 1.0) based on seed string.
 */
export function generateWaveformAmplitudes(seedString: string, barCount: number = 28): number[] {
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    hash = (hash << 5) - hash + seedString.charCodeAt(i);
    hash |= 0;
  }

  const amplitudes: number[] = [];
  for (let i = 0; i < barCount; i++) {
    const x = Math.sin(hash + i * 1.5) * 10000;
    const rnd = x - Math.floor(x);
    const height = 0.15 + rnd * 0.85;
    amplitudes.push(Number(height.toFixed(3)));
  }
  return amplitudes;
}

/**
 * Formats seconds to m:ss (e.g. 65 -> '1:05', 9 -> '0:09')
 */
export function formatAudioDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Cycles through playback rates: 1.0 -> 1.5 -> 2.0 -> 1.0
 */
export function calculateNextPlaybackRate(currentRate: number): number {
  if (currentRate === 1.0) return 1.5;
  if (currentRate === 1.5) return 2.0;
  return 1.0;
}

export const AudioWaveformMessage: React.FC<AudioWaveformMessageProps> = ({
  id,
  audioUrl,
  durationSeconds,
  isSender = true,
  deliveryStatus = 'read',
  timestamp,
  onPlayStateChange,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [amplitudes] = useState<number[]>(() => generateWaveformAmplitudes(id));

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      onPlayStateChange?.(false);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      onPlayStateChange?.(false);
    } else {
      audio.play().catch(() => {
        setIsPlaying(true);
        onPlayStateChange?.(true);
      });
      setIsPlaying(true);
      onPlayStateChange?.(true);
    }
  };

  const handleBarClick = (index: number) => {
    const newTime = (index / amplitudes.length) * durationSeconds;
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const handleSpeedToggle = () => {
    const next = calculateNextPlaybackRate(playbackRate);
    setPlaybackRate(next);
  };

  const progressRatio = durationSeconds > 0 ? Math.min(currentTime / durationSeconds, 1) : 0;
  const activeBarIndex = Math.floor(progressRatio * amplitudes.length);

  return (
    <div
      className={`flex flex-col p-3 rounded-2xl max-w-sm shadow-md font-sans text-sm ${
        isSender ? 'bg-[#1F6FEB]/15 text-white ml-auto' : 'bg-[#21262D] text-gray-200'
      }`}
      data-testid="audio-waveform-message"
    >
      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-[#58A6FF] hover:bg-[#38BDF8] flex items-center justify-center text-gray-900 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-[#58A6FF]"
          aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
          data-testid="play-pause-btn"
        >
          {isPlaying ? (
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 fill-current translate-x-0.5" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Waveform & Scrubber */}
        <div className="flex-1 flex flex-col gap-1">
          <div
            className="flex items-center gap-[2px] h-8 cursor-pointer py-1"
            data-testid="waveform-container"
          >
            {amplitudes.map((amp, idx) => {
              const isPassed = idx <= activeBarIndex;
              return (
                <div
                  key={idx}
                  onClick={() => handleBarClick(idx)}
                  className={`w-1 rounded-full transition-all duration-150 ${
                    isPassed ? 'bg-[#58A6FF]' : 'bg-[#30363D] hover:bg-[#484F58]'
                  }`}
                  style={{ height: `${Math.max(amp * 100, 15)}%` }}
                  data-testid={`waveform-bar-${idx}`}
                />
              );
            })}
          </div>

          {/* Time & Controls Footer */}
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span data-testid="duration-display">
              {formatAudioDuration(currentTime > 0 ? currentTime : durationSeconds)}
            </span>

            {/* Speed Switcher */}
            <button
              onClick={handleSpeedToggle}
              className="px-1.5 py-0.5 rounded bg-[#30363D] hover:bg-[#3b434b] text-gray-200 font-medium text-[11px] transition-colors focus:outline-none"
              aria-label="Toggle playback speed"
              data-testid="speed-toggle-btn"
            >
              {playbackRate}x
            </button>
          </div>
        </div>
      </div>

      {/* Footer Info: Timestamp & Delivery Status */}
      {(timestamp || deliveryStatus) && (
        <div className="flex items-center justify-end gap-1 mt-1.5 text-[10px] text-gray-400">
          {timestamp && <span>{timestamp}</span>}
          {isSender && deliveryStatus && (
            <span
              className="flex items-center"
              title={`Status: ${deliveryStatus}`}
              data-testid="delivery-status-indicator"
            >
              {deliveryStatus === 'sent' && (
                <svg
                  className="w-3.5 h-3.5 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
              {deliveryStatus === 'delivered' && (
                <svg
                  className="w-4 h-4 text-gray-400 -mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
              {deliveryStatus === 'delivered' && (
                <svg
                  className="w-4 h-4 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
              {deliveryStatus === 'read' && (
                <svg
                  className="w-4 h-4 text-[#58A6FF] -mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
              {deliveryStatus === 'read' && (
                <svg
                  className="w-4 h-4 text-[#58A6FF]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default AudioWaveformMessage;
