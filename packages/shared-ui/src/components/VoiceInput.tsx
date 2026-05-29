'use client';

// ============================================================================
// Shared UI - VoiceInput Component
// ============================================================================

import React, { useCallback } from 'react';
import { useReducedMotion } from 'framer-motion';

export interface VoiceInputProps {
  onTranscript?: (text: string) => void;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
  isRecording?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({
  onRecordingStart,
  onRecordingStop,
  isRecording = false,
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}) => {
  const prefersReducedMotion = useReducedMotion();

  const handleClick = useCallback(() => {
    if (disabled) return;
    if (isRecording) {
      onRecordingStop?.();
    } else {
      onRecordingStart?.();
    }
  }, [isRecording, disabled, onRecordingStart, onRecordingStop]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <button
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`relative flex items-center justify-center w-14 h-14 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
          isRecording
            ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30'
            : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/30'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        aria-label={ariaLabel || (isRecording ? 'Stop recording' : 'Start recording')}
        aria-pressed={isRecording}
        type="button"
      >
        {isRecording ? (
          <span className="w-5 h-5 rounded-sm bg-white" aria-hidden="true" />
        ) : (
          <span className="text-xl" aria-hidden="true">
            &#127908;
          </span>
        )}
      </button>

      {isRecording && (
        <div className="flex items-center gap-1" aria-label="Recording in progress" role="status">
          {[...Array(5)].map((_, i) => (
            <span
              key={i}
              className={`w-1 bg-red-500 rounded-full${prefersReducedMotion ? '' : ' animate-pulse'}`}
              style={{
                height: `${12 + Math.random() * 12}px`,
                animationDelay: `${i * 0.1}s`,
              }}
              aria-hidden="true"
            />
          ))}
          <span className="sr-only">Recording audio</span>
        </div>
      )}
    </div>
  );
};
