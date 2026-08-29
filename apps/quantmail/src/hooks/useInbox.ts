import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { apiClient } from '../services/api-client';
import { belongsInFolder } from '../lib/offline/folders';
import { mailboxKey, readMailbox, writeMailbox } from '../lib/offline/mail-cache';
import { apiRequestError, backoffInterval } from '../lib/query-retry';
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
 *
 * A missing `folderType` means the default mailbox, which is the same thing
 * `'INBOX'` means — see the `else` branch of `GET /emails`, which `'INBOX'` also
 * falls into. Both spellings were in use (`AppSidebar` and `contacts` passed
 * nothing, `AppShell` and the inbox page passed `'INBOX'`), so every route was
 * running two query keys, two 30s polls, two retry bursts and two IndexedDB
 * snapshots against one server response. Worse, they disagreed on the client:
 * `belongsInFolder(undefined)` keeps archived and snoozed mail while
 * `belongsInFolder('INBOX')` drops it, so an optimistic archive left the message
 * visible in one view and gone from the other. Normalising here collapses both.
 */
export function useInbox(options?: UseInboxOptions) {
  const queryClient = useQueryClient();
  const { label, category, page, pageSize, offline = true } = options ?? {};
  const folderType = options?.folderType ?? 'INBOX';

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
          // Carries the status through, so a 401 is not retried like a 502.
          throw apiRequestError(response.error, 'Failed to load inbox');
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
    /*
     * 30s while healthy. On a failing backend the interval kept firing at full
     * rate on top of each fetch's retries, which is how a local outage produced
     * unbroken runs of the same three mailbox requests. Backing off to 2 minutes
     * keeps the view self-healing without being the reason the gateway stays
     * busy; returning `false` would be quieter but the mailbox would then never
     * notice the backend came back.
     */
    refetchInterval: (query) => backoffInterval(30_000, query.state.status === 'error'),
    refetchIntervalInBackground: false,
    // Refetch when user tabs back into QuantMail
    refetchOnWindowFocus: true,
    // Keep showing stale data while refetching
    staleTime: 15_000,
  });
}

export default useInbox;
