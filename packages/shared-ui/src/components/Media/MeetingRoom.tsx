'use client';

// ============================================================================
// Shared UI - MeetingRoom Component
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Room, RoomEvent, RemoteParticipant, ConnectionState } from 'livekit-client';

export interface MeetingRoomProps {
  token: string;
  serverUrl: string;
  roomName: string;
  onDisconnect?: () => void;
  className?: string;
}

export interface ParticipantInfo {
  identity: string;
  name: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
}

export const MeetingRoom: React.FC<MeetingRoomProps> = ({
  token,
  serverUrl,
  roomName,
  onDisconnect,
  className = '',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [room] = useState(() => new Room());
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const disconnectRef = useRef(onDisconnect);
  disconnectRef.current = onDisconnect;

  const updateParticipants = useCallback(() => {
    const allParticipants: ParticipantInfo[] = [];

    const local = room.localParticipant;
    if (local) {
      allParticipants.push({
        identity: local.identity,
        name: local.name || local.identity,
        isSpeaking: local.isSpeaking,
        isMuted: !local.isMicrophoneEnabled,
        isCameraOff: !local.isCameraEnabled,
      });
    }

    room.remoteParticipants.forEach((p: RemoteParticipant) => {
      allParticipants.push({
        identity: p.identity,
        name: p.name || p.identity,
        isSpeaking: p.isSpeaking,
        isMuted: !p.isMicrophoneEnabled,
        isCameraOff: !p.isCameraEnabled,
      });
    });

    setParticipants(allParticipants);
  }, [room]);

  useEffect(() => {
    const connect = async () => {
      try {
        setConnectionState(ConnectionState.Connecting);

        room.on(RoomEvent.ParticipantConnected, updateParticipants);
        room.on(RoomEvent.ParticipantDisconnected, updateParticipants);
        room.on(RoomEvent.TrackSubscribed, updateParticipants);
        room.on(RoomEvent.TrackUnsubscribed, updateParticipants);
        room.on(RoomEvent.ActiveSpeakersChanged, updateParticipants);
        room.on(RoomEvent.TrackMuted, updateParticipants);
        room.on(RoomEvent.TrackUnmuted, updateParticipants);
        room.on(RoomEvent.Disconnected, () => {
          setConnectionState(ConnectionState.Disconnected);
          disconnectRef.current?.();
        });

        await room.connect(serverUrl, token);
        setConnectionState(ConnectionState.Connected);

        await room.localParticipant.enableCameraAndMicrophone();
        updateParticipants();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to connect');
        setConnectionState(ConnectionState.Disconnected);
      }
    };

    connect();

    return () => {
      room.disconnect();
      room.removeAllListeners();
    };
  }, [room, token, serverUrl, updateParticipants]);

  const handleDisconnect = useCallback(() => {
    room.disconnect();
  }, [room]);

  if (error) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-center">
          <p className="text-red-600 font-medium">Connection Error</p>
          <p className="text-gray-500 text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (connectionState === ConnectionState.Connecting) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-center">
          <div
            className={`w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto${prefersReducedMotion ? '' : ' animate-spin'}`}
          />
          <p className="text-gray-600 mt-4">Connecting to {roomName}...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-gray-900 ${className}`} data-testid="meeting-room">
      <div className="flex-1 grid grid-cols-2 gap-2 p-4">
        {participants.map((p) => (
          <div
            key={p.identity}
            className={`relative bg-gray-800 rounded-lg overflow-hidden ${p.isSpeaking ? 'ring-2 ring-green-500' : ''}`}
          >
            <div className="absolute bottom-2 left-2 bg-black/60 rounded px-2 py-1 text-white text-xs flex items-center gap-1">
              {p.isMuted && <span title="Muted">&#128263;</span>}
              <span>{p.name}</span>
            </div>
            {p.isCameraOff && (
              <div className="flex items-center justify-center h-full min-h-[120px]">
                <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center text-white text-lg">
                  {p.name.charAt(0).toUpperCase()}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-4 p-4 bg-gray-800">
        <button
          onClick={handleDisconnect}
          className="px-6 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors"
          data-testid="leave-button"
        >
          Leave
        </button>
      </div>
    </div>
  );
};
