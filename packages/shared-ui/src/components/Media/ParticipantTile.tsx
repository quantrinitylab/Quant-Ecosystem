'use client';
// ============================================================================
// Shared UI - ParticipantTile Component
// ============================================================================

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Track, RemoteParticipant, LocalParticipant } from 'livekit-client';

export interface ParticipantTileProps {
  participant: RemoteParticipant | LocalParticipant;
  isSpeaking?: boolean;
  isLocal?: boolean;
  className?: string;
  /**
   * QC-F-263: the participant's hand is raised (derived by the caller from
   * the LiveKit participant attributes — the tile itself stores nothing).
   * Optional and default-false so every existing consumer is unchanged.
   */
  handRaised?: boolean;
}

/** Raised-hand glyph for the tile badge — same shape as QuantChat's HandIcon. */
const HandBadgeGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className="h-3.5 w-3.5">
    <rect x="7.15" y="4.6" width="2.1" height="6.9" rx="1.05" />
    <rect x="9.95" y="3.2" width="2.1" height="8.3" rx="1.05" />
    <rect x="12.75" y="4.3" width="2.1" height="7.2" rx="1.05" />
    <rect x="15.55" y="5.7" width="2.1" height="5.8" rx="1.05" />
    <rect x="6.9" y="10.1" width="10.9" height="9.2" rx="3.1" />
    <rect x="3.9" y="11.2" width="2.2" height="6.4" rx="1.1" transform="rotate(24 5 14.4)" />
  </svg>
);

export const ParticipantTile: React.FC<ParticipantTileProps> = ({
  participant,
  isSpeaking = false,
  isLocal = false,
  className = '',
  handRaised = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  useEffect(() => {
    const videoTrack = participant.getTrackPublication(Track.Source.Camera);
    if (videoTrack?.track && videoRef.current) {
      videoTrack.track.attach(videoRef.current);
    }
    setIsCameraOff(!participant.isCameraEnabled);
    setIsMuted(!participant.isMicrophoneEnabled);

    return () => {
      if (videoTrack?.track && videoRef.current) {
        videoTrack.track.detach(videoRef.current);
      }
    };
  }, [participant]);

  useEffect(() => {
    if (!isLocal) {
      const audioTrack = participant.getTrackPublication(Track.Source.Microphone);
      if (audioTrack?.track && audioRef.current) {
        audioTrack.track.attach(audioRef.current);
        audioRef.current.volume = volume / 100;
      }
      return () => {
        if (audioTrack?.track && audioRef.current) {
          audioTrack.track.detach(audioRef.current);
        }
      };
    }
  }, [participant, isLocal, volume]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val / 100;
    }
  }, []);

  const name = participant.name || participant.identity;

  return (
    <div
      className={`relative bg-gray-800 rounded-lg overflow-hidden ${isSpeaking ? 'ring-2 ring-green-400' : ''} ${className}`}
      data-testid="participant-tile"
    >
      {!isCameraOff ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex items-center justify-center h-full min-h-[160px] bg-gray-700">
          <div className="w-16 h-16 bg-gray-600 rounded-full flex items-center justify-center text-white text-2xl font-medium">
            {name.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {!isLocal && <audio ref={audioRef} autoPlay />}

      {/* QC-F-263: raised-hand badge — top-left (name overlay is bottom,
          volume slider is top-right, so nothing collides) */}
      {handRaised && (
        <div
          className="absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-black"
          title="Hand raised"
          data-testid="hand-badge"
        >
          <HandBadgeGlyph />
        </div>
      )}

      {/* Name overlay */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 rounded px-2 py-1">
        {isMuted && (
          <span className="text-red-400 text-xs" title="Muted">
            &#128263;
          </span>
        )}
        <span className="text-white text-xs">
          {name}
          {isLocal && ' (You)'}
        </span>
      </div>

      {/* Volume slider for remote participants */}
      {!isLocal && (
        <div className="absolute top-2 right-2">
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={handleVolumeChange}
            className="w-16 h-1 appearance-none bg-white/30 rounded-full"
            title={`Volume: ${volume}%`}
            data-testid="volume-slider"
          />
        </div>
      )}
    </div>
  );
};
