// ============================================================================
// QuantSync - useSpaces Hook
// Audio spaces: join/leave, toggle mic, raise hand, react, speaker management
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';

interface Speaker {
  id: string;
  name: string;
  avatar: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isHost: boolean;
}

interface Listener {
  id: string;
  name: string;
  avatar: string;
}

interface HandRaise {
  id: string;
  name: string;
  avatar: string;
  raisedAt: string;
}

interface SpaceState {
  id: string;
  title: string;
  description: string;
  speakers: Speaker[];
  listeners: Listener[];
  handRaiseQueue: HandRaise[];
  isHost: boolean;
  isSpeaker: boolean;
  isMicOn: boolean;
  hasRaisedHand: boolean;
  isRecording: boolean;
  listenerCount: number;
}

interface UseSpacesOptions {
  spaceId?: string;
  autoConnect?: boolean;
}

interface UseSpacesReturn {
  space: SpaceState | null;
  connected: boolean;
  loading: boolean;
  error: string | null;
  join: (spaceId: string) => Promise<void>;
  leave: () => Promise<void>;
  toggleMic: () => Promise<void>;
  raiseHand: () => Promise<void>;
  lowerHand: () => Promise<void>;
  react: (emoji: string) => void;
  inviteSpeaker: (userId: string) => Promise<void>;
  removeSpeaker: (userId: string) => Promise<void>;
  muteSpeaker: (userId: string) => Promise<void>;
  endSpace: () => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
}

export function useSpaces(options: UseSpacesOptions = {}): UseSpacesReturn {
  const { spaceId: initialSpaceId, autoConnect = false } = options;

  const [space, setSpace] = useState<SpaceState | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const connectWebSocket = useCallback((spaceId: string) => {
    const protocol =
      typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost';
    const ws = new WebSocket(`${protocol}//${host}/ws/spaces/${spaceId}`);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
    };
    ws.onerror = () => setError('WebSocket connection failed');
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'speaker_joined':
            setSpace((prev) =>
              prev ? { ...prev, speakers: [...prev.speakers, msg.speaker] } : null,
            );
            break;
          case 'speaker_left':
            setSpace((prev) =>
              prev ? { ...prev, speakers: prev.speakers.filter((s) => s.id !== msg.userId) } : null,
            );
            break;
          case 'listener_joined':
            setSpace((prev) =>
              prev
                ? {
                    ...prev,
                    listeners: [...prev.listeners, msg.listener],
                    listenerCount: prev.listenerCount + 1,
                  }
                : null,
            );
            break;
          case 'listener_left':
            setSpace((prev) =>
              prev
                ? {
                    ...prev,
                    listeners: prev.listeners.filter((l) => l.id !== msg.userId),
                    listenerCount: prev.listenerCount - 1,
                  }
                : null,
            );
            break;
          case 'hand_raised':
            setSpace((prev) =>
              prev ? { ...prev, handRaiseQueue: [...prev.handRaiseQueue, msg.user] } : null,
            );
            break;
          case 'hand_lowered':
            setSpace((prev) =>
              prev
                ? {
                    ...prev,
                    handRaiseQueue: prev.handRaiseQueue.filter((h) => h.id !== msg.userId),
                  }
                : null,
            );
            break;
          case 'speaker_muted':
            setSpace((prev) =>
              prev
                ? {
                    ...prev,
                    speakers: prev.speakers.map((s) =>
                      s.id === msg.userId ? { ...s, isMuted: true } : s,
                    ),
                  }
                : null,
            );
            break;
          case 'speaker_unmuted':
            setSpace((prev) =>
              prev
                ? {
                    ...prev,
                    speakers: prev.speakers.map((s) =>
                      s.id === msg.userId ? { ...s, isMuted: false } : s,
                    ),
                  }
                : null,
            );
            break;
          case 'speaking_update':
            setSpace((prev) =>
              prev
                ? {
                    ...prev,
                    speakers: prev.speakers.map((s) =>
                      s.id === msg.userId ? { ...s, isSpeaking: msg.isSpeaking } : s,
                    ),
                  }
                : null,
            );
            break;
          case 'space_ended':
            setSpace(null);
            setConnected(false);
            break;
          case 'promoted_to_speaker':
            setSpace((prev) => (prev ? { ...prev, isSpeaker: true } : null));
            break;
          case 'demoted_to_listener':
            setSpace((prev) => (prev ? { ...prev, isSpeaker: false, isMicOn: false } : null));
            break;
        }
      } catch {}
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    if (autoConnect && initialSpaceId) {
      join(initialSpaceId);
    }
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const join = useCallback(
    async (spaceId: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/spaces/${spaceId}/join`, { method: 'POST' });
        if (!res.ok) throw new Error('Failed to join space');
        const data = await res.json();
        setSpace({
          id: spaceId,
          title: data.title,
          description: data.description || '',
          speakers: data.speakers || [],
          listeners: data.listeners || [],
          handRaiseQueue: data.handRaiseQueue || [],
          isHost: data.isHost || false,
          isSpeaker: data.isSpeaker || false,
          isMicOn: false,
          hasRaisedHand: false,
          isRecording: data.isRecording || false,
          listenerCount: data.listenerCount || 0,
        });
        connectWebSocket(spaceId);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [connectWebSocket],
  );

  const leave = useCallback(async () => {
    if (!space) return;
    try {
      await fetch(`/api/spaces/${space.id}/leave`, { method: 'POST' });
    } catch {}
    if (wsRef.current) wsRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    setSpace(null);
    setConnected(false);
  }, [space]);

  const toggleMic = useCallback(async () => {
    if (!space) return;
    const newMicState = !space.isMicOn;
    if (newMicState && !streamRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      } catch {
        setError('Microphone access denied');
        return;
      }
    }
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = newMicState;
      });
    }
    setSpace((prev) => (prev ? { ...prev, isMicOn: newMicState } : null));
    wsRef.current?.send(JSON.stringify({ type: 'mic_toggle', muted: !newMicState }));
  }, [space]);

  const raiseHand = useCallback(async () => {
    if (!space) return;
    setSpace((prev) => (prev ? { ...prev, hasRaisedHand: true } : null));
    await fetch(`/api/spaces/${space.id}/hand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raised: true }),
    });
  }, [space]);

  const lowerHand = useCallback(async () => {
    if (!space) return;
    setSpace((prev) => (prev ? { ...prev, hasRaisedHand: false } : null));
    await fetch(`/api/spaces/${space.id}/hand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raised: false }),
    });
  }, [space]);

  const react = useCallback((emoji: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'reaction', emoji }));
  }, []);

  const inviteSpeaker = useCallback(
    async (userId: string) => {
      if (!space) return;
      await fetch(`/api/spaces/${space.id}/invite-speaker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
    },
    [space],
  );

  const removeSpeaker = useCallback(
    async (userId: string) => {
      if (!space) return;
      await fetch(`/api/spaces/${space.id}/remove-speaker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
    },
    [space],
  );

  const muteSpeaker = useCallback(
    async (userId: string) => {
      if (!space) return;
      await fetch(`/api/spaces/${space.id}/mute-speaker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
    },
    [space],
  );

  const endSpace = useCallback(async () => {
    if (!space) return;
    await fetch(`/api/spaces/${space.id}/end`, { method: 'POST' });
    if (wsRef.current) wsRef.current.close();
    setSpace(null);
  }, [space]);

  const startRecording = useCallback(async () => {
    if (!space) return;
    await fetch(`/api/spaces/${space.id}/recording/start`, { method: 'POST' });
    setSpace((prev) => (prev ? { ...prev, isRecording: true } : null));
  }, [space]);

  const stopRecording = useCallback(async () => {
    if (!space) return;
    await fetch(`/api/spaces/${space.id}/recording/stop`, { method: 'POST' });
    setSpace((prev) => (prev ? { ...prev, isRecording: false } : null));
  }, [space]);

  return {
    space,
    connected,
    loading,
    error,
    join,
    leave,
    toggleMic,
    raiseHand,
    lowerHand,
    react,
    inviteSpeaker,
    removeSpeaker,
    muteSpeaker,
    endSpace,
    startRecording,
    stopRecording,
  };
}

export default useSpaces;
