'use client';
// ============================================================================
// Shared UI - BreakoutRoomPanel Component
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { Room, RoomEvent } from 'livekit-client';

export interface BreakoutRoom {
  id: string;
  name: string;
  participantCount: number;
  maxParticipants?: number;
}

export interface BreakoutRoomPanelProps {
  room: Room;
  isHost?: boolean;
  onJoinBreakout?: (roomId: string) => void;
  onReturnToMain?: () => void;
  className?: string;
}

export const BreakoutRoomPanel: React.FC<BreakoutRoomPanelProps> = ({
  room,
  isHost = false,
  onJoinBreakout,
  onReturnToMain,
  className = '',
}) => {
  const [breakoutRooms, setBreakoutRooms] = useState<BreakoutRoom[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [currentBreakout, setCurrentBreakout] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  useEffect(() => {
    const decoder = new TextDecoder();
    const handleDataReceived = (payload: Uint8Array) => {
      try {
        const text = decoder.decode(payload);
        const parsed = JSON.parse(text);
        if (parsed.type === 'breakout-rooms-update') {
          setBreakoutRooms(parsed.rooms);
        }
        if (parsed.type === 'breakout-timer') {
          setTimeRemaining(parsed.seconds);
        }
        if (parsed.type === 'breakout-closed') {
          setCurrentBreakout(null);
          onReturnToMain?.();
        }
      } catch {
        // ignore non-breakout messages
      }
    };

    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room, onReturnToMain]);

  // Timer countdown
  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) return;
    const interval = setInterval(() => {
      setTimeRemaining((prev) => (prev !== null && prev > 0 ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [timeRemaining]);

  const createBreakoutRoom = useCallback(() => {
    if (!newRoomName.trim()) return;

    const newRoom: BreakoutRoom = {
      id: `breakout-${Date.now()}`,
      name: newRoomName.trim(),
      participantCount: 0,
    };

    const updatedRooms = [...breakoutRooms, newRoom];
    setBreakoutRooms(updatedRooms);

    const encoder = new TextEncoder();
    const data = encoder.encode(
      JSON.stringify({ type: 'breakout-rooms-update', rooms: updatedRooms }),
    );
    room.localParticipant.publishData(data, { reliable: true });

    setNewRoomName('');
    setShowCreate(false);
  }, [room, newRoomName, breakoutRooms]);

  const joinBreakout = useCallback(
    (roomId: string) => {
      setCurrentBreakout(roomId);
      onJoinBreakout?.(roomId);
    },
    [onJoinBreakout],
  );

  const returnToMain = useCallback(() => {
    setCurrentBreakout(null);
    onReturnToMain?.();
  }, [onReturnToMain]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`flex flex-col h-full p-4 ${className}`} data-testid="breakout-panel">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Breakout Rooms</h3>
        {isHost && (
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-3 py-1 bg-blue-600 text-white rounded text-xs"
            data-testid="create-breakout-btn"
          >
            {showCreate ? 'Cancel' : 'Create Room'}
          </button>
        )}
      </div>

      {timeRemaining !== null && timeRemaining > 0 && (
        <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
          Time remaining: {formatTime(timeRemaining)}
        </div>
      )}

      {showCreate && (
        <div
          className="mb-4 p-3 bg-gray-50 rounded-lg space-y-2"
          data-testid="breakout-create-form"
        >
          <input
            type="text"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder="Room name"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            data-testid="breakout-name-input"
          />
          <button
            onClick={createBreakoutRoom}
            className="w-full px-3 py-2 bg-blue-600 text-white rounded text-sm"
            data-testid="submit-breakout-btn"
          >
            Create
          </button>
        </div>
      )}

      {currentBreakout && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800 mb-2">
            You are in:{' '}
            {breakoutRooms.find((r) => r.id === currentBreakout)?.name || 'Breakout Room'}
          </p>
          <button
            onClick={returnToMain}
            className="px-3 py-1 bg-blue-600 text-white rounded text-xs"
            data-testid="return-main-btn"
          >
            Return to Main Room
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2">
        {breakoutRooms.map((br) => (
          <div key={br.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-900">{br.name}</p>
              <p className="text-xs text-gray-500">{br.participantCount} participants</p>
            </div>
            {!currentBreakout && (
              <button
                onClick={() => joinBreakout(br.id)}
                className="px-3 py-1 bg-green-600 text-white rounded text-xs"
                data-testid={`join-${br.id}`}
              >
                Join
              </button>
            )}
          </div>
        ))}
        {breakoutRooms.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">No breakout rooms available</p>
        )}
      </div>
    </div>
  );
};
