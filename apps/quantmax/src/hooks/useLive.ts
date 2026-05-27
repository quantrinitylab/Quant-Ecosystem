// ============================================================================
// QuantMax - useLive Hook
// Live streaming state: viewer management, gifts, chat, stream controls
// Powered by React Query + apiClient
// ============================================================================

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import type { LiveEvent } from '../types';

interface StreamSettings {
  title: string;
  category: string;
  isMuted: boolean;
  isCameraOn: boolean;
  isFlipped: boolean;
  effectsEnabled: boolean;
  chatEnabled: boolean;
  giftsEnabled: boolean;
}

interface LiveChat {
  id: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: number;
  type: 'message' | 'gift' | 'system' | 'pinned';
}

interface UseLiveReturn {
  stream: LiveEvent | null;
  streams: LiveEvent[];
  viewers: { userId: string; name: string }[];
  chat: LiveChat[];
  recentGifts: { id: string; fromUserName: string; giftType: string; diamonds: number }[];
  settings: StreamSettings;
  topGifters: { userId: string; name: string; diamonds: number }[];
  isStreaming: boolean;
  isLoading: boolean;
  startStream: (title: string, category: string) => void;
  endStream: () => void;
  updateSettings: (updates: Partial<StreamSettings>) => void;
  sendChat: (message: string) => void;
  pinMessage: (messageId: string) => void;
  banViewer: (viewerId: string) => void;
  muteViewer: (viewerId: string) => void;
}

export function useLive(_userId: string): UseLiveReturn {
  const queryClient = useQueryClient();
  const [stream, setStream] = useState<LiveEvent | null>(null);
  const [chat, setChat] = useState<LiveChat[]>([]);
  const [settings, setSettings] = useState<StreamSettings>({
    title: '',
    category: 'Just Chatting',
    isMuted: false,
    isCameraOn: true,
    isFlipped: false,
    effectsEnabled: false,
    chatEnabled: true,
    giftsEnabled: true,
  });

  const liveStreamsQuery = useQuery({
    queryKey: ['live-streams'],
    queryFn: async () => {
      const response = await apiClient.getLiveStreams();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load live streams');
      }
      return response.data ?? [];
    },
  });

  const goLiveMutation = useMutation({
    mutationFn: async ({ title, type }: { title: string; type: string }) => {
      const response = await apiClient.goLive(title, type);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to start stream');
      }
      return response.data;
    },
    onSuccess: (data) => {
      if (data) {
        setStream(data);
        setChat([
          {
            id: 'sys-1',
            userId: 'system',
            userName: 'System',
            message: 'Stream started!',
            timestamp: Date.now(),
            type: 'system',
          },
        ]);
      }
      queryClient.invalidateQueries({ queryKey: ['live-streams'] });
    },
  });

  const startStream = useCallback(
    (title: string, category: string) => {
      setSettings((prev) => ({ ...prev, title, category }));
      goLiveMutation.mutate({ title, type: category });
    },
    [goLiveMutation],
  );

  const endStream = useCallback(() => {
    setStream(null);
    setChat([]);
  }, []);

  const updateSettings = useCallback((updates: Partial<StreamSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  const sendChat = useCallback((message: string) => {
    const msg: LiveChat = {
      id: `chat-${Date.now()}`,
      userId: 'self',
      userName: 'You',
      message,
      timestamp: Date.now(),
      type: 'message',
    };
    setChat((prev) => [...prev, msg]);
  }, []);

  const pinMessage = useCallback((messageId: string) => {
    setChat((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, type: 'pinned' as const } : m)),
    );
  }, []);

  const banViewer = useCallback((_viewerId: string) => {
    // Handled by API in production
  }, []);

  const muteViewer = useCallback((_viewerId: string) => {
    // Handled by API in production
  }, []);

  const streams: LiveEvent[] = liveStreamsQuery.data ?? [];

  return {
    stream,
    streams,
    viewers: streams.map((s) => ({ userId: s.hostId, name: s.host?.displayName ?? s.hostId })),
    chat,
    recentGifts: [],
    settings,
    topGifters: streams
      .sort((a, b) => b.viewerCount - a.viewerCount)
      .slice(0, 10)
      .map((s) => ({
        userId: s.hostId,
        name: s.host?.displayName ?? s.hostId,
        diamonds: s.viewerCount,
      })),
    isStreaming: stream?.isLive ?? false,
    isLoading: liveStreamsQuery.isLoading,
    startStream,
    endStream,
    updateSettings,
    sendChat,
    pinMessage,
    banViewer,
    muteViewer,
  };
}

export default useLive;
