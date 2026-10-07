'use client';

import { useCallback } from 'react';

type FlashMode = 'off' | 'torch' | 'screen';

interface CameraControlsProps {
  /** Current facing mode */
  facingMode: 'user' | 'environment';
  /** Current flash mode */
  flashMode: FlashMode;
  /** Callback to flip the camera */
  onFlipCamera: () => void;
  /** Callback to cycle flash mode */
  onToggleFlash: () => void;
  /** Whether camera flip is in progress */
  isFlipping?: boolean;
}

/**
 * CameraControls provides:
 * - Flip camera button: requests opposite facingMode, targets 500ms switch
 * - Flash toggle: cycles off -> torch (rear) -> screen flash (front)
 */
export function CameraControls({
  facingMode,
  flashMode,
  onFlipCamera,
  onToggleFlash,
  isFlipping = false,
}: CameraControlsProps) {
  const flashLabel = useCallback(() => {
    switch (flashMode) {
      case 'off':
        return 'Flash off';
      case 'torch':
        return 'Torch on';
      case 'screen':
        return 'Screen flash';
    }
  }, [flashMode]);

  const flashIcon = useCallback(() => {
    switch (flashMode) {
      case 'off':
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        );
      case 'torch':
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        );
      case 'screen':
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <circle cx="12" cy="12" r="5" fill="currentColor" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        );
    }
  }, [flashMode]);

  return (
    <div className="flex items-center justify-between w-full px-6">
      {/* Flash toggle */}
      <button
        onClick={onToggleFlash}
        className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors ${
          flashMode !== 'off' ? 'bg-yellow-500/80 text-white' : 'bg-black/30 text-white'
        }`}
        aria-label={flashLabel()}
      >
        {flashIcon()}
      </button>

      {/* Facing mode label */}
      <span className="text-xs text-white/60 bg-black/30 backdrop-blur-sm px-3 py-1 rounded-full">
        {facingMode === 'user' ? 'Front Camera' : 'Rear Camera'}
      </span>

      {/* Flip camera */}
      <button
        onClick={onFlipCamera}
        disabled={isFlipping}
        className={`w-11 h-11 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white transition-transform ${
          isFlipping ? 'animate-spin' : ''
        }`}
        aria-label="Flip camera"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
        >
          <path d="M16 3h5v5" />
          <path d="M8 21H3v-5" />
          <path d="M21 3l-7 7" />
          <path d="M3 21l7-7" />
        </svg>
      </button>
    </div>
  );
}
