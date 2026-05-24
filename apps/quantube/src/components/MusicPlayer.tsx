// ============================================================================
// QuantTube - MusicPlayer Component
// Full music player: album art, song info, progress bar, controls, volume,
// queue panel, lyrics toggle, minimize/maximize state
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string;
  duration: number;
  url: string;
  lyrics?: string[];
}

interface MusicPlayerProps {
  currentTrack: Track | null;
  queue: Track[];
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSkip: () => void;
  onPrev: () => void;
  onShuffle: () => void;
  onRepeat: () => void;
  onVolumeChange: (volume: number) => void;
  onSeek: (time: number) => void;
}

const MusicPlayer: React.FC<MusicPlayerProps> = ({
  currentTrack,
  queue,
  isPlaying,
  onPlay,
  onPause,
  onSkip,
  onPrev,
  onShuffle,
  onRepeat,
  onVolumeChange,
  onSeek,
}) => {
  const [showQueue, setShowQueue] = useState<boolean>(false);
  const [showLyrics, setShowLyrics] = useState<boolean>(false);
  const [minimized, setMinimized] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(75);
  const [progress, setProgress] = useState<number>(0);
  const [shuffleActive, setShuffleActive] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');

  const progressBarRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isPlaying && currentTrack) {
      intervalRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= currentTrack.duration) {
            onSkip();
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, currentTrack, onSkip]);

  useEffect(() => {
    setProgress(0);
  }, [currentTrack?.id]);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!progressBarRef.current || !currentTrack) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = clickX / rect.width;
      const seekTime = Math.floor(percentage * currentTrack.duration);
      setProgress(seekTime);
      onSeek(seekTime);
    },
    [currentTrack, onSeek]
  );

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseInt(e.target.value, 10);
      setVolume(newVolume);
      onVolumeChange(newVolume / 100);
    },
    [onVolumeChange]
  );

  const handleShuffle = useCallback(() => {
    setShuffleActive((prev) => !prev);
    onShuffle();
  }, [onShuffle]);

  const handleRepeat = useCallback(() => {
    setRepeatMode((prev) => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
    onRepeat();
  }, [onRepeat]);

  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  }, [isPlaying, onPlay, onPause]);

  if (!currentTrack) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-white p-4 text-center">
        <p className="text-gray-400">No track selected. Choose a song to start playing.</p>
      </div>
    );
  }

  if (minimized) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-white px-4 py-2 flex items-center justify-between z-50 border-t border-gray-700">
        <div className="flex items-center gap-3">
          <img
            src={currentTrack.albumArt}
            alt={currentTrack.album}
            className="w-10 h-10 rounded object-cover"
          />
          <div>
            <p className="text-sm font-medium truncate max-w-[150px]">{currentTrack.title}</p>
            <p className="text-xs text-gray-400 truncate max-w-[150px]">{currentTrack.artist}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onPrev} className="p-2 text-gray-300 hover:text-white">
            <span className="text-lg">&#9664;&#9664;</span>
          </button>
          <button onClick={togglePlayPause} className="p-2 bg-white text-black rounded-full w-8 h-8 flex items-center justify-center">
            {isPlaying ? '||' : '\u25B6'}
          </button>
          <button onClick={onSkip} className="p-2 text-gray-300 hover:text-white">
            <span className="text-lg">&#9654;&#9654;</span>
          </button>
          <button onClick={() => setMinimized(false)} className="p-2 text-gray-400 hover:text-white ml-2">
            <span className="text-sm">&#9650;</span>
          </button>
        </div>
      </div>
    );
  }

  const progressPercent = currentTrack.duration > 0 ? (progress / currentTrack.duration) * 100 : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-white z-50 border-t border-gray-700">
      {/* Main Player */}
      <div className="px-6 py-4">
        {/* Minimize button */}
        <div className="flex justify-end mb-2">
          <button onClick={() => setMinimized(true)} className="text-gray-400 hover:text-white text-sm">
            <span>&#9660; Minimize</span>
          </button>
        </div>

        <div className="flex items-center gap-6">
          {/* Album Art */}
          <div className="flex-shrink-0">
            <img
              src={currentTrack.albumArt}
              alt={currentTrack.album}
              className="w-20 h-20 rounded-lg object-cover shadow-lg"
            />
          </div>

          {/* Song Info */}
          <div className="flex-shrink-0 w-48">
            <h3 className="text-base font-semibold truncate">{currentTrack.title}</h3>
            <p className="text-sm text-gray-400 truncate">{currentTrack.artist}</p>
            <p className="text-xs text-gray-500 truncate">{currentTrack.album}</p>
          </div>

          {/* Progress Bar and Controls */}
          <div className="flex-1 flex flex-col gap-2">
            {/* Control Buttons */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={handleShuffle}
                className={`p-2 rounded-full transition-colors ${shuffleActive ? 'text-green-400' : 'text-gray-400 hover:text-white'}`}
              >
                <span className="text-sm font-bold">&#8645;</span>
              </button>
              <button onClick={onPrev} className="p-2 text-gray-300 hover:text-white transition-colors">
                <span className="text-xl">&#9664;&#9664;</span>
              </button>
              <button
                onClick={togglePlayPause}
                className="p-3 bg-white text-black rounded-full w-10 h-10 flex items-center justify-center hover:scale-105 transition-transform"
              >
                <span className="text-lg">{isPlaying ? '||' : '\u25B6'}</span>
              </button>
              <button onClick={onSkip} className="p-2 text-gray-300 hover:text-white transition-colors">
                <span className="text-xl">&#9654;&#9654;</span>
              </button>
              <button
                onClick={handleRepeat}
                className={`p-2 rounded-full transition-colors ${repeatMode !== 'off' ? 'text-green-400' : 'text-gray-400 hover:text-white'}`}
              >
                <span className="text-sm font-bold">
                  {repeatMode === 'one' ? '1\u21BA' : '\u21BA'}
                </span>
              </button>
            </div>

            {/* Progress Bar */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-10 text-right">{formatTime(progress)}</span>
              <div
                ref={progressBarRef}
                onClick={handleProgressClick}
                className="flex-1 h-1.5 bg-gray-700 rounded-full cursor-pointer group relative"
              >
                <div
                  className="h-full bg-green-500 rounded-full group-hover:bg-green-400 transition-colors relative"
                  style={{ width: `${progressPercent}%` }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              <span className="text-xs text-gray-400 w-10">{formatTime(currentTrack.duration)}</span>
            </div>
          </div>

          {/* Volume and Extra Controls */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <button
              onClick={() => setShowLyrics(!showLyrics)}
              className={`p-2 rounded transition-colors ${showLyrics ? 'text-green-400' : 'text-gray-400 hover:text-white'}`}
            >
              <span className="text-xs font-medium">Lyrics</span>
            </button>
            <div className="flex items-center gap-2 w-32">
              <span className="text-gray-400 text-xs">{volume === 0 ? '\u{1F507}' : '\u{1F50A}'}</span>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={handleVolumeChange}
                className="w-full h-1 bg-gray-700 rounded-full appearance-none cursor-pointer"
              />
            </div>
            <button
              onClick={() => setShowQueue(!showQueue)}
              className={`p-2 rounded transition-colors ${showQueue ? 'text-green-400' : 'text-gray-400 hover:text-white'}`}
            >
              <span className="text-xs font-medium">Queue ({queue.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Queue Panel */}
      {showQueue && (
        <div className="border-t border-gray-700 max-h-64 overflow-y-auto bg-gray-800">
          <div className="px-6 py-3">
            <h4 className="text-sm font-semibold text-gray-300 mb-3">Up Next</h4>
            {queue.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">Queue is empty</p>
            ) : (
              <ul className="space-y-2">
                {queue.map((track, index) => (
                  <li key={track.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-700 transition-colors">
                    <span className="text-xs text-gray-500 w-5">{index + 1}</span>
                    <img src={track.albumArt} alt={track.album} className="w-8 h-8 rounded object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{track.title}</p>
                      <p className="text-xs text-gray-400 truncate">{track.artist}</p>
                    </div>
                    <span className="text-xs text-gray-500">{formatTime(track.duration)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Lyrics Panel */}
      {showLyrics && currentTrack.lyrics && (
        <div className="border-t border-gray-700 max-h-48 overflow-y-auto bg-gray-800">
          <div className="px-6 py-3">
            <h4 className="text-sm font-semibold text-gray-300 mb-3">Lyrics</h4>
            <div className="space-y-1">
              {currentTrack.lyrics.map((line, index) => (
                <p key={index} className="text-sm text-gray-400 leading-relaxed">
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MusicPlayer;
