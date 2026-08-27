import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { apiClient } from '../services/api-client';
import { belongsInFolder } from '../lib/offline/folders';
import { mailboxKey, readMailbox, writeMailbox } from '../lib/offline/mail-cache';
import type { Email } from '../types';

export interface UseInboxOptions {
  label?: string;
  category?: string;
  folderType?: string;
  page?: number;
  pageSize?: number;
  /** Set false to skip the IndexedDB read/write entirely. */
  offline?: boolean;
}

/**
 * A mailbox view, backed by an offline snapshot.
 *
 * Three things happen around the network request:
 *
 * 1. **Instant paint.** A cached snapshot is pushed into the query cache while
 *    the first fetch is still in flight, so a cold load shows real mail instead
 *    of a spinner. It is discarded if the network wins the race.
 * 2. **Offline reads.** If the fetch fails and a snapshot exists, the snapshot is
 *    returned rather than an error — the inbox stays usable on a dead connection.
 * 3. **Write-through.** Successful responses are persisted, once per fetch. This
 *    deliberately does not react to `data` changing, because optimistic updates
 *    also change `data`; those write their own single-record patches instead.
 */
export function useInbox(options?: UseInboxOptions) {
  const queryClient = useQueryClient();
  const { label, category, folderType, page, pageSize, offline = true } = options ?? {};

  const queryKey = useMemo(
    () => ['inbox', label, category, folderType, page] as const,
    [label, category, folderType, page],
  );
  const cacheKey = useMemo(
    () => mailboxKey({ label, category, folderType }),
    [label, category, folderType],
  );

  // Seed once per mailbox. Runs before paint completes for the fetch, so the
  // snapshot is on screen roughly an IndexedDB read after mount.
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!offline || seededRef.current === cacheKey) return;
    seededRef.current = cacheKey;

    let cancelled = false;
    void (async () => {
      const cached = await readMailbox(cacheKey);
      if (cancelled || !cached || cached.length === 0) return;
      // The network already answered — its data is newer, leave it alone.
      if (queryClient.getQueryState(queryKey)?.dataUpdatedAt) return;
      queryClient.setQueryData(
        queryKey,
        cached.filter((email) => belongsInFolder(email, folderType)),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, folderType, offline, queryClient, queryKey]);

  return useQuery<Email[]>({
    queryKey,
    queryFn: async () => {
      try {
        const response = await apiClient.getEmails({ label, category, folderType, page, pageSize });
        if (!response.success) {
          throw new Error(response.error?.message || 'Failed to load inbox');
        }
        const emails = response.data ?? [];
        if (offline) void writeMailbox(cacheKey, emails);
        return emails;
      } catch (error) {
        if (offline) {
          const cached = await readMailbox(cacheKey);
          if (cached && cached.length > 0) {
            return cached.filter((email) => belongsInFolder(email, folderType));
          }
        }
        throw error;
      }
    },
    // Live updates: refetch every 30 seconds when window is focused
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    // Refetch when user tabs back into QuantMail
    refetchOnWindowFocus: true,
    // Keep showing stale data while refetching
    staleTime: 15_000,
  });
}

export default useInbox;
