'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RemoteParticipant } from './useLiveKit';

export interface Participant {
  id: string;
  displayName: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isSpeaking: boolean;
  isScreenSharing: boolean;
  isLocal?: boolean;
  stream?: MediaStream | null;
  joinedAt: string;
  isPinned?: boolean;
}

export interface UseParticipantsOptions {
  roomId: string;
  localStream: MediaStream | null;
  localAudioEnabled: boolean;
  localVideoEnabled: boolean;
  localIsSpeaking: boolean;
  localIsScreenSharing: boolean;
  remoteParticipants: RemoteParticipant[];
  localDisplayName?: string;
}

export interface UseParticipantsReturn {
  participants: Participant[];
  activeSpeaker: Participant | null;
  pinnedParticipantId: string | null;
  pinParticipant: (id: string | null) => void;
}

/**
 * Fetch participants from the API (legacy/polling approach).
 * Used by the meeting page for server-side participant list.
 */
export function useParticipants(roomId: string) {
  return useQuery<Participant[]>({
    queryKey: ['participants', roomId],
    queryFn: async () => {
      const response = await fetch(`/api/rooms/${roomId}/participants`);
      if (!response.ok) {
        throw new Error('Failed to fetch participants');
      }
      return response.json();
    },
    enabled: !!roomId,
    refetchInterval: 5000,
  });
}

/**
 * Build a unified participants list from local + remote LiveKit participants.
 * Provides active speaker detection and pinning capabilities.
 */
export function useLiveParticipants(options: UseParticipantsOptions): UseParticipantsReturn {
  const {
    roomId,
    localStream,
    localAudioEnabled,
    localVideoEnabled,
    localIsSpeaking,
    localIsScreenSharing,
    remoteParticipants,
    localDisplayName = 'You',
  } = options;

  const [pinnedParticipantId, setPinnedParticipantId] = useState<string | null>(null);

  const pinParticipant = useCallback((id: string | null) => {
    setPinnedParticipantId(id);
  }, []);

  // Build unified participants list
  const participants = useMemo((): Participant[] => {
    const localParticipant: Participant = {
      id: 'local',
      displayName: localDisplayName,
      audioEnabled: localAudioEnabled,
      videoEnabled: localVideoEnabled,
      isSpeaking: localIsSpeaking,
      isScreenSharing: localIsScreenSharing,
      isLocal: true,
      stream: localStream,
      joinedAt: new Date().toISOString(),
      isPinned: pinnedParticipantId === 'local',
    };

    const remotes: Participant[] = remoteParticipants.map((rp) => ({
      id: rp.participantId,
      displayName: rp.displayName,
      audioEnabled: rp.audioEnabled,
      videoEnabled: rp.videoEnabled,
      isSpeaking: rp.isSpeaking,
      isScreenSharing: false,
      isLocal: false,
      stream: rp.stream,
      joinedAt: new Date().toISOString(),
      isPinned: pinnedParticipantId === rp.participantId,
    }));

    return [localParticipant, ...remotes];
  }, [
    localStream,
    localAudioEnabled,
    localVideoEnabled,
    localIsSpeaking,
    localIsScreenSharing,
    localDisplayName,
    remoteParticipants,
    pinnedParticipantId,
  ]);

  // Determine active speaker (participant with highest audio activity)
  const activeSpeaker = useMemo(() => {
    const speakingParticipants = participants.filter((p) => p.isSpeaking);
    if (speakingParticipants.length === 0) return null;
    // Prefer remote speakers over local
    const remoteSpeaker = speakingParticipants.find((p) => !p.isLocal);
    return remoteSpeaker || speakingParticipants[0] || null;
  }, [participants]);

  return {
    participants,
    activeSpeaker,
    pinnedParticipantId,
    pinParticipant,
  };
}
