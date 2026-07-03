import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import type { SubscribedChannelView, ChannelMessageView } from '../types';

/**
 * Broadcast-channels data hooks (real backend, real identity — the JWT rides
 * every apiClient request). `useChannels` lists the caller's owned + subscribed
 * channels; mutations (create/subscribe/unsubscribe/publish) invalidate the
 * relevant queries so the UI reflects the durable server state. Publishing is
 * gated server-side (OWNER/ADMIN → 403 CHANNEL_POST_FORBIDDEN otherwise); the
 * hook surfaces that error verbatim rather than masking it.
 */
export function useChannels() {
  const query = useQuery<SubscribedChannelView[], Error>({
    queryKey: ['channels'],
    queryFn: async () => {
      const res = await apiClient.getChannels();
      if (!res.success) throw new Error(res.error?.message || 'Failed to load channels');
      return res.data ?? [];
    },
  });

  return {
    channels: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Feed for a single channel (subscribers only; backend 403 for non-members). */
export function useChannelFeed(channelId: string | null) {
  const query = useQuery<ChannelMessageView[], Error>({
    queryKey: ['channel-feed', channelId],
    enabled: !!channelId,
    queryFn: async () => {
      const res = await apiClient.getChannelMessages(channelId as string);
      if (!res.success) throw new Error(res.error?.message || 'Failed to load channel feed');
      return res.data ?? [];
    },
  });

  return {
    messages: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) => {
      const res = await apiClient.createChannel(input.name, input.description);
      if (!res.success) throw new Error(res.error?.message || 'Failed to create channel');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  });
}

export function useSubscribeChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (channelId: string) => {
      const res = await apiClient.subscribeChannel(channelId);
      if (!res.success) throw new Error(res.error?.message || 'Failed to subscribe');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  });
}

export function useUnsubscribeChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (channelId: string) => {
      const res = await apiClient.unsubscribeChannel(channelId);
      if (!res.success) throw new Error(res.error?.message || 'Failed to unsubscribe');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  });
}

export function usePublishToChannel(channelId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      if (!channelId) throw new Error('No channel selected');
      const res = await apiClient.publishToChannel(channelId, content);
      // Surface the backend's authoritative 403 (subscribers are read-only).
      if (!res.success) throw new Error(res.error?.message || 'Failed to publish');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channel-feed', channelId] }),
  });
}
