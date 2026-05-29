'use client';

// ============================================================================
// Shared UI - KnockFlow Component
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Room, RoomEvent } from 'livekit-client';

export interface KnockRequest {
  participantId: string;
  participantName: string;
  timestamp: number;
}

export interface KnockFlowProps {
  room: Room;
  isHost?: boolean;
  isLocked?: boolean;
  onKnock?: () => void;
  onAdmit?: (participantId: string) => void;
  onDeny?: (participantId: string) => void;
  className?: string;
}

export const KnockFlow: React.FC<KnockFlowProps> = ({
  room,
  isHost = false,
  isLocked = false,
  onKnock,
  onAdmit,
  onDeny,
  className = '',
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [knockRequests, setKnockRequests] = useState<KnockRequest[]>([]);
  const [knockStatus, setKnockStatus] = useState<'idle' | 'waiting' | 'admitted' | 'denied'>(
    'idle',
  );

  useEffect(() => {
    const decoder = new TextDecoder();
    const handleDataReceived = (
      payload: Uint8Array,
      participant: { identity: string; name?: string } | undefined,
    ) => {
      try {
        const text = decoder.decode(payload);
        const parsed = JSON.parse(text);
        if (parsed.type === 'knock' && isHost) {
          setKnockRequests((prev) => [
            ...prev,
            {
              participantId: parsed.participantId || participant?.identity || 'unknown',
              participantName: parsed.participantName || participant?.name || 'Unknown',
              timestamp: Date.now(),
            },
          ]);
        }
        if (parsed.type === 'knock-response' && !isHost) {
          setKnockStatus(parsed.admitted ? 'admitted' : 'denied');
        }
      } catch {
        // ignore non-knock messages
      }
    };

    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room, isHost]);

  const sendKnock = useCallback(() => {
    const encoder = new TextEncoder();
    const data = encoder.encode(
      JSON.stringify({
        type: 'knock',
        participantId: room.localParticipant.identity,
        participantName: room.localParticipant.name || room.localParticipant.identity,
      }),
    );
    room.localParticipant.publishData(data, { reliable: true });
    setKnockStatus('waiting');
    onKnock?.();
  }, [room, onKnock]);

  const handleAdmit = useCallback(
    (participantId: string) => {
      setKnockRequests((prev) => prev.filter((r) => r.participantId !== participantId));
      const encoder = new TextEncoder();
      const data = encoder.encode(
        JSON.stringify({ type: 'knock-response', admitted: true, participantId }),
      );
      room.localParticipant.publishData(data, { reliable: true });
      onAdmit?.(participantId);
    },
    [room, onAdmit],
  );

  const handleDeny = useCallback(
    (participantId: string) => {
      setKnockRequests((prev) => prev.filter((r) => r.participantId !== participantId));
      const encoder = new TextEncoder();
      const data = encoder.encode(
        JSON.stringify({ type: 'knock-response', admitted: false, participantId }),
      );
      room.localParticipant.publishData(data, { reliable: true });
      onDeny?.(participantId);
    },
    [room, onDeny],
  );

  if (!isLocked && !isHost) return null;

  // Participant view - knock UI
  if (!isHost && isLocked) {
    return (
      <div className={`p-6 text-center ${className}`} data-testid="knock-flow-participant">
        {knockStatus === 'idle' && (
          <div>
            <p className="text-gray-700 mb-4">This room is locked. Knock to request entry.</p>
            <button
              onClick={sendKnock}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              data-testid="knock-btn"
            >
              Knock
            </button>
          </div>
        )}
        {knockStatus === 'waiting' && (
          <div>
            <div className={`${prefersReducedMotion ? '' : 'animate-pulse '}text-gray-600`}>
              Waiting for host to admit you...
            </div>
          </div>
        )}
        {knockStatus === 'admitted' && (
          <div className="text-green-600 font-medium">You have been admitted!</div>
        )}
        {knockStatus === 'denied' && (
          <div className="text-red-600 font-medium">Your request was denied.</div>
        )}
      </div>
    );
  }

  // Host view - approval dialog
  if (isHost) {
    return (
      <div className={`p-4 ${className}`} data-testid="knock-flow-host">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Waiting Room ({knockRequests.length})
        </h3>
        {knockRequests.length === 0 && <p className="text-sm text-gray-500">No one is waiting</p>}
        <div className="space-y-2">
          {knockRequests.map((req) => (
            <div
              key={req.participantId}
              className="flex items-center justify-between bg-gray-50 rounded-lg p-3"
            >
              <span className="text-sm font-medium text-gray-900">{req.participantName}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAdmit(req.participantId)}
                  className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                  data-testid={`admit-${req.participantId}`}
                >
                  Admit
                </button>
                <button
                  onClick={() => handleDeny(req.participantId)}
                  className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                  data-testid={`deny-${req.participantId}`}
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
};
