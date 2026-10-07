'use client';
// ============================================================================
// Shared UI - Controls Component
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { Room } from 'livekit-client';

export interface ControlsProps {
  room: Room;
  onLeave?: () => void;
  className?: string;
}

export const Controls: React.FC<ControlsProps> = ({ room, onLeave, className = '' }) => {
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isBlurEnabled, setIsBlurEnabled] = useState(false);
  const [isPushToTalk, setIsPushToTalk] = useState(false);

  const toggleMic = useCallback(async () => {
    await room.localParticipant.setMicrophoneEnabled(!isMicEnabled);
    setIsMicEnabled(!isMicEnabled);
  }, [room, isMicEnabled]);

  const toggleCamera = useCallback(async () => {
    await room.localParticipant.setCameraEnabled(!isCameraEnabled);
    setIsCameraEnabled(!isCameraEnabled);
  }, [room, isCameraEnabled]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      await room.localParticipant.setScreenShareEnabled(false);
    } else {
      await room.localParticipant.setScreenShareEnabled(true);
    }
    setIsScreenSharing(!isScreenSharing);
  }, [room, isScreenSharing]);

  const toggleHandRaise = useCallback(() => {
    const newState = !isHandRaised;
    setIsHandRaised(newState);
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify({ type: 'hand-raise', raised: newState }));
    room.localParticipant.publishData(data, { reliable: true });
  }, [room, isHandRaised]);

  const sendReaction = useCallback(
    (emoji: string) => {
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({ type: 'reaction', emoji }));
      room.localParticipant.publishData(data, { reliable: true });
    },
    [room],
  );

  const toggleBlur = useCallback(() => {
    setIsBlurEnabled(!isBlurEnabled);
  }, [isBlurEnabled]);

  const handleLeave = useCallback(() => {
    room.disconnect();
    onLeave?.();
  }, [room, onLeave]);

  // Push-to-talk (space key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && isPushToTalk) {
        e.preventDefault();
        room.localParticipant.setMicrophoneEnabled(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isPushToTalk) {
        e.preventDefault();
        room.localParticipant.setMicrophoneEnabled(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [room, isPushToTalk]);

  return (
    <div
      className={`flex items-center justify-center gap-3 p-4 bg-gray-800 ${className}`}
      data-testid="controls"
    >
      <button
        onClick={toggleMic}
        className={`p-3 rounded-full ${isMicEnabled ? 'bg-gray-700 text-white' : 'bg-red-600 text-white'}`}
        title={isMicEnabled ? 'Mute' : 'Unmute'}
        data-testid="mic-toggle"
      >
        {isMicEnabled ? '\u{1F3A4}' : '\u{1F507}'}
      </button>

      <button
        onClick={toggleCamera}
        className={`p-3 rounded-full ${isCameraEnabled ? 'bg-gray-700 text-white' : 'bg-red-600 text-white'}`}
        title={isCameraEnabled ? 'Turn off camera' : 'Turn on camera'}
        data-testid="camera-toggle"
      >
        {isCameraEnabled ? '\u{1F4F7}' : '\u{1F6AB}'}
      </button>

      <button
        onClick={toggleScreenShare}
        className={`p-3 rounded-full ${isScreenSharing ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white'}`}
        title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
        data-testid="screenshare-toggle"
      >
        {'\u{1F5A5}'}
      </button>

      <button
        onClick={toggleHandRaise}
        className={`p-3 rounded-full ${isHandRaised ? 'bg-yellow-500 text-white' : 'bg-gray-700 text-white'}`}
        title={isHandRaised ? 'Lower hand' : 'Raise hand'}
        data-testid="hand-raise-toggle"
      >
        {'\u{270B}'}
      </button>

      <button
        onClick={() => sendReaction('\u{1F44D}')}
        className="p-3 rounded-full bg-gray-700 text-white"
        title="React"
        data-testid="reaction-btn"
      >
        {'\u{1F44D}'}
      </button>

      <button
        onClick={() => setIsPushToTalk(!isPushToTalk)}
        className={`p-3 rounded-full ${isPushToTalk ? 'bg-green-600 text-white' : 'bg-gray-700 text-white'}`}
        title={isPushToTalk ? 'Disable push-to-talk' : 'Enable push-to-talk (Space)'}
        data-testid="ptt-toggle"
      >
        PTT
      </button>

      <button
        onClick={toggleBlur}
        className={`p-3 rounded-full ${isBlurEnabled ? 'bg-purple-600 text-white' : 'bg-gray-700 text-white'}`}
        title={isBlurEnabled ? 'Disable blur' : 'Enable blur'}
        data-testid="blur-toggle"
      >
        {'\u{1F32B}'}
      </button>

      <button
        onClick={handleLeave}
        className="px-6 py-3 rounded-full bg-red-600 text-white hover:bg-red-700"
        title="Leave meeting"
        data-testid="leave-btn"
      >
        Leave
      </button>
    </div>
  );
};
