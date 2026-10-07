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
}

export const ParticipantTile: React.FC<ParticipantTileProps> = ({
  participant,
  isSpeaking = false,
  isLocal = false,
  className = '',
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
