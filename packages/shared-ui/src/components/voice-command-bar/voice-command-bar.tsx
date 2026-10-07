'use client';

// ============================================================================
// Shared UI - VoiceCommandBar Component
// ============================================================================

import React from 'react';
import { useVoiceCommands } from '@quant/agentic/voice-commands';

export interface VoiceCommandBarProps {
  appId: string;
  userId: string;
  onClose: () => void;
  className?: string;
}

function formatStatus(status: string): string {
  switch (status) {
    case 'listening':
      return 'Listening…';
    case 'processing':
      return 'Processing…';
    case 'error':
      return 'Error';
    default:
      return 'Idle';
  }
}

export const VoiceCommandBar: React.FC<VoiceCommandBarProps> = ({
  appId,
  userId,
  onClose,
  className = '',
}) => {
  const { isListening, status, transcript, error, recentCommands, toggleListening } =
    useVoiceCommands({ appId, userId });

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 w-80 rounded-2xl border border-gray-700 bg-gray-900 p-4 text-white shadow-2xl ${className}`}
      role="complementary"
      aria-label="Voice command bar"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Voice Command</h2>
          <p className="text-xs text-gray-400" aria-live="polite">{formatStatus(status)}</p>
        </div>
        <button type="button" onClick={onClose}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Close voice command bar">
          <span aria-hidden="true">&#10005;</span>
        </button>
      </div>

      <div className="mt-4 flex flex-col items-center gap-3">
        <button type="button" onClick={toggleListening}
          className={`relative flex h-14 w-14 items-center justify-center rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 ${
            isListening
              ? 'bg-red-500 shadow-lg shadow-red-500/30 hover:bg-red-600 focus:ring-red-500'
              : 'bg-blue-600 shadow-lg shadow-blue-600/30 hover:bg-blue-700 focus:ring-blue-500'
          }`}
          aria-label={isListening ? 'Stop listening' : 'Start listening'}
          aria-pressed={isListening}>
          {isListening ? (
            <span className="h-5 w-5 rounded-sm bg-white" aria-hidden="true" />
          ) : (
            <span className="text-xl" aria-hidden="true">&#127908;</span>
          )}
        </button>

        <div className="min-h-[1.5rem] text-center text-sm text-gray-300"
          aria-live="polite" aria-atomic="true">
          {transcript ? <span>{transcript}</span> : (
            <span className="text-gray-500">Tap the microphone and speak</span>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-red-900/30 p-2 text-sm text-red-200" role="alert">
          {error}
        </div>
      )}

      <div className="mt-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Recent commands
        </h3>
        {recentCommands.length === 0 ? (
          <p className="text-sm text-gray-500">No commands yet.</p>
        ) : (
          <ul className="max-h-32 space-y-2 overflow-auto pr-1" role="log" aria-live="polite">
            {recentCommands.map((entry, index) => (
              <li key={`${entry.timestamp}-${index}`} className="rounded-lg bg-gray-800 p-2 text-sm">
                <p className="text-gray-200">&ldquo;{entry.transcript}&rdquo;</p>
                {entry.results.length > 0 && (
                  <p className="mt-1 text-xs text-gray-400">
                    {entry.results.map((result) => result.message).join(' • ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
