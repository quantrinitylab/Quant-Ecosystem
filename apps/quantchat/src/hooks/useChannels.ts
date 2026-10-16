import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
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

interface ChannelFeedPage {
  messages: ChannelMessageView[];
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Feed for a single channel (subscribers only; backend 403 for non-members).
 *
 * QC-F-449: an infinite query over the backend's composite `before` cursor —
 * page 1 is the newest page, `loadOlder` walks the archive upward until the
 * server says there is no older page. The flattened list is chronological
 * and deduped by id (a refetch replays the same cursor-anchored pages, so
 * no post is ever shown twice). A backend that predates the cursor API
 * sends no `pagination` sibling: `hasMore` then reads false, so the UI
 * honestly shows no Load-older control rather than inventing one.
 * `refetchInterval` (30s, the house presence cadence) keeps an open feed
 * fresh; cursor anchoring means refreshed pages cannot shift or duplicate.
 * `error` is the first-page failure; a failed OLDER page is reported
 * separately as `olderError` so the loaded posts stay on screen.
 */
export function useChannelFeed(channelId: string | null) {
  const query = useInfiniteQuery<ChannelFeedPage, Error>({
    queryKey: ['channel-feed', channelId],
    enabled: !!channelId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const res = await apiClient.getChannelMessages(channelId as string, {
        before: pageParam as string | undefined,
      });
      if (!res.success) throw new Error(res.error?.message || 'Failed to load channel feed');
      return {
        messages: res.data ?? [],
        hasMore: res.pagination?.hasMore ?? false,
        nextCursor: res.pagination?.nextCursor ?? null,
      };
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
    refetchInterval: 30_000,
  });

  const seen = new Set<string>();
  const messages: ChannelMessageView[] = [];
  const pages = query.data?.pages ?? [];
  // pages[0] is the newest page; display order is oldest page first, each
  // page internally chronological.
  for (const page of [...pages].reverse()) {
    for (const m of page.messages) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      messages.push(m);
    }
  }

  return {
    messages,
    hasMore: query.hasNextPage ?? false,
    isLoading: query.isLoading,
    isLoadingOlder: query.isFetchingNextPage,
    olderError: query.isFetchNextPageError ? query.error : null,
    loadOlder: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
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
