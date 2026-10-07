// ============================================================================
// QuantLive - Controls Component
// ============================================================================

import React from 'react';
import type { QuantLiveControlsProps } from './types';

export const QuantLiveControls: React.FC<QuantLiveControlsProps> = ({
  micMuted,
  cameraActive,
  screenSharing,
  onToggleMic,
  onToggleCamera,
  onToggleScreen,
  onEndSession,
  onToggleMinimize,
  isMinimized = false,
  className = '',
}) => {
  const buttonBase =
    'min-w-11 min-h-11 w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={onToggleMic}
        className={`${buttonBase} ${micMuted ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
      >
        <span aria-hidden="true">{micMuted ? '\u{1F507}' : '\u{1F3A4}'}</span>
      </button>

      {onToggleCamera && (
        <button
          type="button"
          onClick={onToggleCamera}
          className={`${buttonBase} ${cameraActive ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-red-100 text-red-600'}`}
          aria-label={cameraActive ? 'Turn off camera' : 'Turn on camera'}
        >
          <span aria-hidden="true">{cameraActive ? '\u{1F4F9}' : '\u{1F4F7}'}</span>
        </button>
      )}

      {onToggleScreen && (
        <button
          type="button"
          onClick={onToggleScreen}
          className={`${buttonBase} ${screenSharing ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          aria-label={screenSharing ? 'Stop screen sharing' : 'Share screen'}
        >
          <span aria-hidden="true">{'\u{1F4BB}'}</span>
        </button>
      )}

      <button
        type="button"
        onClick={onEndSession}
        className={`${buttonBase} bg-red-600 text-white hover:bg-red-700 focus:ring-red-500`}
        aria-label="End session"
      >
        <span aria-hidden="true">{'\u{2716}'}</span>
      </button>

      {onToggleMinimize && (
        <button
          type="button"
          onClick={onToggleMinimize}
          className={`${buttonBase} bg-gray-100 text-gray-700 hover:bg-gray-200`}
          aria-label={isMinimized ? 'Maximize' : 'Minimize'}
        >
          <span aria-hidden="true">{isMinimized ? '\u{2B06}' : '\u{2B07}'}</span>
        </button>
      )}
    </div>
  );
};
