// ============================================================================
// QuantTube - MiniPlayer Component
// Picture-in-picture mini player for videos and music
// ============================================================================

import type { Video, Track, PlayerState } from '../types';

interface MiniPlayerProps {
  content: Video | Track | null;
  state: PlayerState;
  onExpand: () => void;
  onClose: () => void;
  onPlayPause: () => void;
  onNext: () => void;
}

export function MiniPlayer({
  content,
  state,
  onExpand,
  onClose,
  onPlayPause,
  onNext,
}: MiniPlayerProps) {
  if (!content || !state.isMiniPlayer) return null;

  const isVideo = 'channelName' in content;
  const progress = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;

  return (
    <div
      className="fixed bottom-0 right-0 z-50 w-96 bg-gray-900 border border-gray-700 rounded-t-lg shadow-2xl overflow-hidden"
      role="region"
      aria-label="Mini player"
    >
      {/* Progress bar */}
      <div className="h-1 bg-gray-700 w-full">
        <div
          className="h-full bg-red-500 transition-all"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={state.currentTime}
          aria-valuemin={0}
          aria-valuemax={state.duration}
          aria-label="Playback progress"
        />
      </div>

      {/* Content area */}
      <div className="flex items-center gap-3 p-2">
        {/* Thumbnail */}
        <div className="w-16 h-12 flex-shrink-0 rounded overflow-hidden bg-gray-800">
          {isVideo ? (
            <video
              src={(content as Video).url}
              className="w-full h-full object-cover"
              aria-hidden="true"
            />
          ) : (
            <img
              src={(content as Track).albumCover}
              alt={content.title}
              className="w-full h-full object-cover"
            />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{content.title}</p>
          <p className="text-xs text-gray-400 truncate">
            {isVideo ? (content as Video).channelName : (content as Track).artistName}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onPlayPause}
            className="w-9 h-9 flex items-center justify-center text-white hover:bg-gray-700 rounded-full transition-colors"
            aria-label={state.isPlaying ? 'Pause' : 'Play'}
          >
            {state.isPlaying ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button
            onClick={onNext}
            className="w-9 h-9 flex items-center justify-center text-white hover:bg-gray-700 rounded-full transition-colors"
            aria-label="Next"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>
          <button
            onClick={onExpand}
            className="w-9 h-9 flex items-center justify-center text-white hover:bg-gray-700 rounded-full transition-colors"
            aria-label="Expand player"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-white hover:bg-gray-700 rounded-full transition-colors"
            aria-label="Close mini player"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default MiniPlayer;
