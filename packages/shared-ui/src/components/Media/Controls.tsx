'use client';
// ============================================================================
// Shared UI - Controls Component
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { Room, Track } from 'livekit-client';
import {
  applyBackgroundBlur,
  removeBackgroundBlur,
  trackHasBackgroundProcessor,
  BACKGROUND_ASSET_PATH,
  BACKGROUND_BLUR_ERROR_MESSAGE,
  type BackgroundStatus,
} from './BackgroundBlur';

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
  const [bgStatus, setBgStatus] = useState<BackgroundStatus>('off');
  const [bgError, setBgError] = useState<string | null>(null);
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

  // QC-F-322: blur is REAL or it is OFF. The button's ON state is set
  // only from the track's verified processor (getProcessor()) — never
  // from the click itself. The old toggle flipped a state flag and
  // showed purple ON with no processing at all; that theatre is gone.
  const toggleBlur = useCallback(async () => {
    const track =
      room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack ??
      null;
    if (!track) {
      setBgStatus('error');
      setBgError('Camera is off — turn it on to use background blur.');
      setIsBlurEnabled(false);
      return;
    }
    if (trackHasBackgroundProcessor(track)) {
      await removeBackgroundBlur(track).catch(() => undefined);
      const off = !trackHasBackgroundProcessor(track);
      setIsBlurEnabled(!off);
      setBgStatus(off ? 'off' : 'active');
      setBgError(null);
      return;
    }
    setBgStatus('starting');
    setBgError(null);
    try {
      await applyBackgroundBlur(track, { assetPath: BACKGROUND_ASSET_PATH });
      const on = trackHasBackgroundProcessor(track);
      setIsBlurEnabled(on);
      setBgStatus(on ? 'active' : 'error');
      if (!on) setBgError(BACKGROUND_BLUR_ERROR_MESSAGE);
    } catch {
      setIsBlurEnabled(false);
      setBgStatus('error');
      setBgError(BACKGROUND_BLUR_ERROR_MESSAGE);
    }
  }, [room]);

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
        onClick={() => void toggleBlur()}
        aria-pressed={isBlurEnabled}
        className={`p-3 rounded-full ${isBlurEnabled ? 'bg-purple-600 text-white' : 'bg-gray-700 text-white'}`}
        title={
          bgStatus === 'error' && bgError
            ? bgError
            : isBlurEnabled
              ? 'Disable blur'
              : 'Enable blur'
        }
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
