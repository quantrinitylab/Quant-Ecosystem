'use client';

// ============================================================================
// QuantMail — Unified Mail Data & Mutation Layer (Task K06)
// Consolidates useInbox, useMailMutations, useThread, useInfiniteInbox, useEmail.
// Single canonical queryKey factory with documented schema & offline support.
// ============================================================================

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../services/api-client';
import { browserApiRequest as apiRequest } from '../services/browser-api-request';
import {
  belongsInFolder,
  folderTypeOf,
  EMAIL_LIST_PREFIXES,
  reconcileList,
} from '../lib/offline/folders';
import { mailboxKey, readMailbox, writeMailbox, patchEmail } from '../lib/offline/mail-cache';
import { enqueue, type MailMutationKind } from '../lib/offline/outbox';
import { showToast } from '../lib/toast-bus';
import { apiRequestError, backoffInterval } from '../lib/query-retry';
import type { Email, EmailCategory, EmailThread, SearchEmailRequest } from '../types';

// ============================================================================
// 1. CANONICAL QUERY KEY FACTORY & DOCUMENTED SCHEMA
// ============================================================================

/**
 * Single source of truth for React Query keys across all mail surfaces.
 * - ['inbox', label, category, folderType, page]: Mailbox lists with folder predicates
 * - ['thread', threadId]: Conversational thread views
 * - ['inbox', 'search', params]: Search result lists (invalidated with ['inbox'])
 */
export const mailQueryKeys = {
  all: ['inbox'] as const,
  inbox: (options?: { label?: string; category?: string; folderType?: string; page?: number }) =>
    [
      'inbox',
      options?.label,
      options?.category,
      options?.folderType ?? 'INBOX',
      options?.page,
    ] as const,
  thread: (threadId: string) => ['thread', threadId] as const,
  search: (params?: Partial<SearchEmailRequest> | string | null) =>
    ['inbox', 'search', params] as const,
};

// ============================================================================
// 2. TYPES
// ============================================================================

export interface UseInboxOptions {
  label?: string;
  category?: string;
  folderType?: string;
  page?: number;
  pageSize?: number;
  /** Set false to skip the IndexedDB read/write entirely. */
  offline?: boolean;
}

export type EmailPatch = Partial<Email>;

export interface MailMutations {
  archive: (ids: string | string[]) => Promise<void>;
  unarchive: (ids: string | string[]) => Promise<void>;
  trash: (ids: string | string[]) => Promise<void>;
  restore: (ids: string | string[]) => Promise<void>;
  toggleStar: (ids: string | string[]) => Promise<void>;
  markRead: (ids: string | string[]) => Promise<void>;
  markUnread: (ids: string | string[]) => Promise<void>;
  /**
   * `unitCount` switches the toast from a single row's voice to a batch's: omit it
   * and it reads "Snoozed until tomorrow 09:00", pass it and it says how many
   * conversations left. A row already knows which one it is; a selection does not.
   */
  snooze: (ids: string | string[], until: Date, unitCount?: number) => Promise<void>;
  /**
   * Batch archive or trash: one optimistic update, one request per id, one toast.
   * `unitCount` is what the toast counts — the number of *conversations* selected,
   * which is not `ids.length` once each one expands to its messages.
   */
  batch: (kind: 'archive' | 'trash', ids: string[], unitCount?: number) => Promise<void>;
}

export interface UseMailMutationsOptions {
  /**
   * Called with the ids that just left the current view, so the page can close a
   * reading pane showing one of them or move the focused row along.
   */
  onRemoved?: (ids: string[]) => void;
}

export interface UseInfiniteInboxOptions {
  category?: EmailCategory;
  pageSize?: number;
}

export interface UseInfiniteInboxReturn {
  emails: Email[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => Promise<void>;
  sentinelRef: (node: HTMLElement | null) => void;
}

export interface SendEmailParams {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  attachmentIds?: string[];
  threadId?: string;
  scheduledAt?: string;
}

export interface UseEmailOptions {
  category?: string;
  label?: string;
  pageSize?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export interface UseEmailReturn {
  emails: Email[];
  loading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  totalCount: number;
  unreadCount: number;
  fetchEmails: () => Promise<void>;
  sendEmail: (params: SendEmailParams) => Promise<{ success: boolean; messageId?: string }>;
  archiveEmail: (emailId: string) => Promise<void>;
  archiveEmails: (emailIds: string[]) => Promise<void>;
  deleteEmail: (emailId: string) => Promise<void>;
  deleteEmails: (emailIds: string[]) => Promise<void>;
  starEmail: (emailId: string) => Promise<void>;
  unstarEmail: (emailId: string) => Promise<void>;
  markRead: (emailId: string) => Promise<void>;
  markUnread: (emailId: string) => Promise<void>;
  addLabel: (emailId: string, label: string) => Promise<void>;
  removeLabel: (emailId: string, label: string) => Promise<void>;
  snoozeEmail: (emailId: string, until: Date) => Promise<void>;
  undoSend: (messageId: string) => Promise<boolean>;
  moveToCategory: (emailId: string, newCategory: string) => Promise<void>;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  refresh: () => Promise<void>;
}

// ============================================================================
// 3. INTERNAL HELPERS
// ============================================================================

const RECONCILE_DELAY_MS = 1_200;

function emailListQueries(queryClient: QueryClient): Array<[readonly unknown[], Email[]]> {
  const result: Array<[readonly unknown[], Email[]]> = [];
  for (const prefix of EMAIL_LIST_PREFIXES) {
    for (const [key, data] of queryClient.getQueriesData<Email[]>({ queryKey: prefix })) {
      if (Array.isArray(data)) result.push([key, data]);
    }
  }
  return result;
}

function findCachedEmail(queryClient: QueryClient, id: string): Email | undefined {
  for (const [, data] of emailListQueries(queryClient)) {
    const match = data.find((email) => email.id === id);
    if (match) return match;
  }
  return undefined;
}

function idList(ids: string | string[]): string[] {
  const raw = Array.isArray(ids) ? ids : [ids];
  return Array.from(new Set(raw.filter(Boolean)));
}

function conversationNoun(count: number): string {
  return `${count} conversation${count === 1 ? '' : 's'}`;
}

function formatSnoozeTarget(until: Date): string {
  const time = until.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const now = new Date();
  const days = Math.round(
    (new Date(until.getFullYear(), until.getMonth(), until.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000,
  );

  if (days <= 0) return time;
  if (days === 1) return `tomorrow ${time}`;
  if (days < 7) return `${until.toLocaleDateString(undefined, { weekday: 'long' })} ${time}`;
  return `${until.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`;
}

// ============================================================================
// 4. CORE HOOKS
// ============================================================================

/**
 * Mailbox view, backed by an offline snapshot.
 */
export function useInbox(options?: UseInboxOptions) {
  const queryClient = useQueryClient();
  const { label, category, page, pageSize, offline = true } = options ?? {};
  const folderType = options?.folderType ?? 'INBOX';

  const queryKey = useMemo(
    () => mailQueryKeys.inbox({ label, category, folderType, page }),
    [label, category, folderType, page],
  );
  const cacheKey = useMemo(
    () => mailboxKey({ label, category, folderType }),
    [label, category, folderType],
  );

  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!offline || seededRef.current === cacheKey) return;
    seededRef.current = cacheKey;

    let cancelled = false;
    void (async () => {
      const cached = await readMailbox(cacheKey);
      if (cancelled || !cached || cached.length === 0) return;
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
    refetchInterval: (query) => backoffInterval(30_000, query.state.status === 'error'),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}

/**
 * Optimistic, offline-tolerant mailbox mutations.
 */
export function useMailMutations(options: UseMailMutationsOptions = {}): MailMutations {
  const queryClient = useQueryClient();
  const onRemovedRef = useRef(options.onRemoved);
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onRemovedRef.current = options.onRemoved;
  });

  useEffect(
    () => () => {
      if (reconcileTimerRef.current !== null) clearTimeout(reconcileTimerRef.current);
    },
    [],
  );

  const scheduleReconcile = useCallback(() => {
    if (reconcileTimerRef.current !== null) clearTimeout(reconcileTimerRef.current);
    reconcileTimerRef.current = setTimeout(() => {
      reconcileTimerRef.current = null;
      for (const prefix of EMAIL_LIST_PREFIXES) {
        void queryClient.invalidateQueries({ queryKey: prefix });
      }
    }, RECONCILE_DELAY_MS);
  }, [queryClient]);

  const applyOptimistic = useCallback(
    (ids: string[], patch: EmailPatch): (() => void) => {
      const snapshots = emailListQueries(queryClient);

      const patched = new Map<string, Email>();
      for (const id of ids) {
        const current = findCachedEmail(queryClient, id);
        if (current) patched.set(id, { ...current, ...patch });
      }
      if (patched.size === 0) return () => {};

      for (const [key, data] of snapshots) {
        const next = reconcileList(data, patched, folderTypeOf(key));
        const unchanged =
          next.length === data.length && next.every((email, index) => email === data[index]);
        if (!unchanged) queryClient.setQueryData(key, next);
      }

      for (const [id, email] of patched) void patchEmail(id, email);

      return () => {
        for (const [key, data] of snapshots) queryClient.setQueryData(key, data);
      };
    },
    [queryClient],
  );

  const run = useCallback(
    async (config: {
      kind: MailMutationKind;
      ids: string[];
      patch: EmailPatch;
      snoozeUntil?: Date;
      toast?: string;
      undo?: { kind: MailMutationKind; patch: EmailPatch };
      removesFromView?: boolean;
    }): Promise<void> => {
      const { kind, ids, patch, snoozeUntil, toast, undo, removesFromView } = config;
      if (ids.length === 0) return;

      const rollback = applyOptimistic(ids, patch);
      if (removesFromView) onRemovedRef.current?.(ids);

      const results = await Promise.all(
        ids.map((id) => enqueue(kind, id, snoozeUntil ? { snoozeUntil } : {})),
      );
      const rejection = results.find((result) => result.rejected)?.rejected;

      if (rejection) {
        rollback();
        showToast({
          text: rejection.lastError || 'That change could not be saved',
          type: 'error',
        });
        scheduleReconcile();
        return;
      }

      if (toast) {
        showToast({
          text: toast,
          type: 'success',
          undoAction: undo
            ? () => {
                void run({ kind: undo.kind, ids, patch: undo.patch });
              }
            : undefined,
        });
      }

      scheduleReconcile();
    },
    [applyOptimistic, scheduleReconcile],
  );

  const archive = useCallback(
    (ids: string | string[]) =>
      run({
        kind: 'archive',
        ids: idList(ids),
        patch: { isArchived: true },
        toast: 'Conversation archived',
        undo: { kind: 'unarchive', patch: { isArchived: false } },
        removesFromView: true,
      }),
    [run],
  );

  const unarchive = useCallback(
    (ids: string | string[]) =>
      run({
        kind: 'unarchive',
        ids: idList(ids),
        patch: { isArchived: false },
        toast: 'Moved back to inbox',
        undo: { kind: 'archive', patch: { isArchived: true } },
        removesFromView: true,
      }),
    [run],
  );

  const trash = useCallback(
    (ids: string | string[]) =>
      run({
        kind: 'trash',
        ids: idList(ids),
        patch: { trashedAt: new Date() },
        toast: 'Conversation moved to trash',
        undo: { kind: 'restore', patch: { trashedAt: undefined } },
        removesFromView: true,
      }),
    [run],
  );

  const restore = useCallback(
    (ids: string | string[]) =>
      run({
        kind: 'restore',
        ids: idList(ids),
        patch: { trashedAt: undefined },
        toast: 'Conversation restored',
        removesFromView: true,
      }),
    [run],
  );

  const toggleStar = useCallback(
    (ids: string | string[]) => {
      const list = idList(ids);
      const target = !list.some((id) => findCachedEmail(queryClient, id)?.isStarred);
      const wrongSide = list.filter(
        (id) => Boolean(findCachedEmail(queryClient, id)?.isStarred) !== target,
      );
      return run({ kind: 'toggleStar', ids: wrongSide, patch: { isStarred: target } });
    },
    [queryClient, run],
  );

  const markRead = useCallback(
    (ids: string | string[]) =>
      run({
        kind: 'markRead',
        ids: idList(ids).filter((id) => findCachedEmail(queryClient, id)?.isRead !== true),
        patch: { isRead: true },
      }),
    [queryClient, run],
  );

  const markUnread = useCallback(
    (ids: string | string[]) =>
      run({
        kind: 'markUnread',
        ids: idList(ids).filter((id) => findCachedEmail(queryClient, id)?.isRead !== false),
        patch: { isRead: false },
        toast: 'Marked as unread',
      }),
    [queryClient, run],
  );

  const snooze = useCallback(
    (ids: string | string[], until: Date, unitCount?: number) =>
      run({
        kind: 'snooze',
        ids: idList(ids),
        patch: { snoozedUntil: until },
        snoozeUntil: until,
        toast:
          unitCount === undefined
            ? `Snoozed until ${formatSnoozeTarget(until)}`
            : `${conversationNoun(unitCount)} snoozed until ${formatSnoozeTarget(until)}`,
        undo: { kind: 'unsnooze', patch: { snoozedUntil: undefined } },
        removesFromView: true,
      }),
    [run],
  );

  const batch = useCallback(
    (kind: 'archive' | 'trash', ids: string[], unitCount?: number) => {
      const list = idList(ids);
      const noun = conversationNoun(unitCount ?? list.length);
      return kind === 'archive'
        ? run({
            kind: 'archive',
            ids: list,
            patch: { isArchived: true },
            toast: `${noun} archived`,
            undo: { kind: 'unarchive', patch: { isArchived: false } },
            removesFromView: true,
          })
        : run({
            kind: 'trash',
            ids: list,
            patch: { trashedAt: new Date() },
            toast: `${noun} moved to trash`,
            undo: { kind: 'restore', patch: { trashedAt: undefined } },
            removesFromView: true,
          });
    },
    [run],
  );

  return useMemo(
    () => ({
      archive,
      unarchive,
      trash,
      restore,
      toggleStar,
      markRead,
      markUnread,
      snooze,
      batch,
    }),
    [archive, unarchive, trash, restore, toggleStar, markRead, markUnread, snooze, batch],
  );
}

/**
 * Thread query hook.
 */
export function useThread(threadId: string) {
  return useQuery({
    queryKey: mailQueryKeys.thread(threadId),
    queryFn: async (): Promise<EmailThread> => {
      if (!threadId) throw new Error('No thread ID provided');

      try {
        const response = await apiClient.getThread(threadId);
        if (response.success && response.data) {
          const data = response.data;
          const messages = ((data.messages || (data as any).emails || []) as Email[]).filter(
            Boolean,
          );
          if (messages.length > 0) {
            return {
              ...data,
              messages,
            };
          }
        }
      } catch {
        // Fall through
      }

      try {
        const emailRes = await apiClient.getEmail(threadId);
        if (emailRes.success && emailRes.data) {
          const email = emailRes.data;
          if (email.threadId && email.threadId !== email.id) {
            try {
              const subThreadRes = await apiClient.getThread(email.threadId);
              if (subThreadRes.success && subThreadRes.data) {
                const subMsgs = (subThreadRes.data.messages ||
                  (subThreadRes.data as any).emails ||
                  []) as Email[];
                if (subMsgs.length > 0) {
                  return { ...subThreadRes.data, messages: subMsgs };
                }
              }
            } catch {
              // Ignore
            }
          }

          const fromAddress = email.from?.email || (email as any).fromAddress || '';
          const fromName =
            email.from?.name || (email as any).fromName || fromAddress.split('@')[0] || 'Sender';
          const fromObj = { email: fromAddress, name: fromName };

          const formattedEmail = {
            ...email,
            from: fromObj,
            fromAddress,
            fromName,
          };

          return {
            id: email.threadId || email.id,
            userId: email.userId || '',
            subject: email.subject || '(No Subject)',
            participants: [fromObj, ...(email.to || [])].filter(Boolean),
            messageCount: 1,
            lastMessageAt: email.receivedAt || new Date(),
            isRead: email.isRead,
            isStarred: email.isStarred,
            labels: email.labels || [],
            snippet: email.snippet || '',
            messages: [formattedEmail],
            createdAt: email.createdAt || new Date(),
            updatedAt: email.updatedAt || new Date(),
          };
        }
      } catch {
        // Fall through
      }

      throw new Error('Failed to load email conversation. Please refresh.');
    },
    enabled: !!threadId,
    retry: 2,
  });
}

/**
 * Infinite scroll hook for the inbox.
 */
export function useInfiniteInbox({
  category = 'primary',
  pageSize = 20,
}: UseInfiniteInboxOptions = {}): UseInfiniteInboxReturn {
  const [emails, setEmails] = useState<Email[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelNodeRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    setPage(1);
    setEmails([]);
    setHasMore(true);

    apiClient
      .getEmails({ category, page: 1, pageSize })
      .then((response) => {
        if (!active) return;
        if (response.success && response.data) {
          const items = response.data;
          setEmails(items);
          setHasMore(items.length >= pageSize);
        } else {
          setError(new Error(response.error?.message || 'Failed to load inbox'));
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err : new Error('Network error'));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [category, pageSize]);

  const loadMore = useCallback(() => {
    if (isLoading || isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    const nextPage = page + 1;

    apiClient
      .getEmails({ category, page: nextPage, pageSize })
      .then((response) => {
        if (response.success && response.data) {
          const newItems = response.data;
          if (newItems.length === 0) {
            setHasMore(false);
          } else {
            setEmails((prev) => {
              const existingIds = new Set(prev.map((e) => e.id));
              const unique = newItems.filter((e) => !existingIds.has(e.id));
              return [...prev, ...unique];
            });
            setPage(nextPage);
            setHasMore(newItems.length >= pageSize);
          }
        } else {
          setHasMore(false);
        }
      })
      .catch(() => {
        setHasMore(false);
      })
      .finally(() => {
        setIsLoadingMore(false);
      });
  }, [category, hasMore, isLoading, isLoadingMore, page, pageSize]);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setPage(1);
    setHasMore(true);
    try {
      const response = await apiClient.getEmails({ category, page: 1, pageSize });
      if (response.success && response.data) {
        setEmails(response.data);
        setHasMore(response.data.length >= pageSize);
      } else {
        setError(new Error(response.error?.message || 'Failed to refresh inbox'));
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Network error'));
    } finally {
      setIsLoading(false);
    }
  }, [category, pageSize]);

  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      sentinelNodeRef.current = node;
      if (!node) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          const [entry] = entries;
          if (entry?.isIntersecting) {
            loadMore();
          }
        },
        { rootMargin: '200px' },
      );

      observerRef.current.observe(node);
    },
    [loadMore],
  );

  return {
    emails,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    refetch,
    sentinelRef,
  };
}

/**
 * Backward-compatible useEmail hook.
 */
export function useEmail(options: UseEmailOptions = {}): UseEmailReturn {
  const { category, label, pageSize = 50, autoRefresh = false, refreshInterval = 30000 } = options;

  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchEmails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        ...(category && { category }),
        ...(label && { label }),
      });
      const response = await apiRequest(`/api/emails?${params}`);
      if (!response.ok) throw new Error(`Failed to fetch emails: ${response.statusText}`);
      const data = await response.json();
      setEmails(data.data || data.emails || []);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.total || 0);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load emails');
    } finally {
      setLoading(false);
    }
  }, [category, page, pageSize, label]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  useEffect(() => {
    if (autoRefresh) {
      refreshTimerRef.current = setInterval(fetchEmails, refreshInterval);
      return () => {
        if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      };
    }
  }, [autoRefresh, refreshInterval, fetchEmails]);

  const sendEmail = useCallback(
    async (params: SendEmailParams): Promise<{ success: boolean; messageId?: string }> => {
      try {
        const response = await apiRequest('/api/emails/send', {
          method: 'POST',
          body: JSON.stringify(params),
        });
        if (!response.ok) throw new Error('Failed to send email');
        const data = await response.json();
        return { success: true, messageId: data.messageId };
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Send failed');
        return { success: false };
      }
    },
    [],
  );

  const archiveEmail = useCallback(
    async (emailId: string) => {
      setEmails((prev) => prev.filter((e) => e.id !== emailId));
      try {
        const response = await apiRequest(`/api/emails/${emailId}/archive`, { method: 'POST' });
        if (!response.ok) throw new Error('Archive failed');
      } catch (err) {
        fetchEmails();
        setError(err instanceof Error ? err.message : 'Archive failed');
      }
    },
    [fetchEmails],
  );

  const archiveEmails = useCallback(
    async (emailIds: string[]) => {
      setEmails((prev) => prev.filter((e) => !emailIds.includes(e.id)));
      try {
        const response = await apiRequest('/api/emails/batch/archive', {
          method: 'POST',
          body: JSON.stringify({ emailIds }),
        });
        if (!response.ok) throw new Error('Batch archive failed');
      } catch (err) {
        fetchEmails();
      }
    },
    [fetchEmails],
  );

  const deleteEmail = useCallback(
    async (emailId: string) => {
      setEmails((prev) => prev.filter((e) => e.id !== emailId));
      try {
        await apiRequest(`/api/emails/${emailId}`, { method: 'DELETE' });
      } catch (err) {
        fetchEmails();
      }
    },
    [fetchEmails],
  );

  const deleteEmails = useCallback(
    async (emailIds: string[]) => {
      setEmails((prev) => prev.filter((e) => !emailIds.includes(e.id)));
      try {
        await apiRequest('/api/emails/batch/delete', {
          method: 'POST',
          body: JSON.stringify({ emailIds }),
        });
      } catch (err) {
        fetchEmails();
      }
    },
    [fetchEmails],
  );

  const starEmail = useCallback(async (emailId: string) => {
    setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isStarred: true } : e)));
    try {
      await apiRequest(`/api/emails/${emailId}/star`, {
        method: 'PUT',
        body: JSON.stringify({ starred: true }),
      });
    } catch (err) {
      setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isStarred: false } : e)));
    }
  }, []);

  const unstarEmail = useCallback(async (emailId: string) => {
    setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isStarred: false } : e)));
    try {
      await apiRequest(`/api/emails/${emailId}/star`, {
        method: 'PUT',
        body: JSON.stringify({ starred: false }),
      });
    } catch (err) {
      setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isStarred: true } : e)));
    }
  }, []);

  const markRead = useCallback(async (emailId: string) => {
    setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isRead: true } : e)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await apiRequest(`/api/emails/${emailId}/read`, {
        method: 'PUT',
        body: JSON.stringify({ read: true }),
      });
    } catch (err) {
      /* optimistic update stays */
    }
  }, []);

  const markUnread = useCallback(async (emailId: string) => {
    setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isRead: false } : e)));
    setUnreadCount((prev) => prev + 1);
    try {
      await apiRequest(`/api/emails/${emailId}/read`, {
        method: 'PUT',
        body: JSON.stringify({ read: false }),
      });
    } catch (err) {
      /* optimistic update stays */
    }
  }, []);

  const addLabel = useCallback(async (emailId: string, labelName: string) => {
    setEmails((prev) =>
      prev.map((e) => (e.id === emailId ? { ...e, labels: [...e.labels, labelName] } : e)),
    );
    try {
      await apiRequest(`/api/emails/${emailId}/labels`, {
        method: 'POST',
        body: JSON.stringify({ label: labelName }),
      });
    } catch (err) {
      setEmails((prev) =>
        prev.map((e) =>
          e.id === emailId ? { ...e, labels: e.labels.filter((l) => l !== labelName) } : e,
        ),
      );
    }
  }, []);

  const removeLabel = useCallback(async (emailId: string, labelName: string) => {
    setEmails((prev) =>
      prev.map((e) =>
        e.id === emailId ? { ...e, labels: e.labels.filter((l) => l !== labelName) } : e,
      ),
    );
    try {
      await apiRequest(`/api/emails/${emailId}/labels/${encodeURIComponent(labelName)}`, {
        method: 'DELETE',
      });
    } catch (err) {
      setEmails((prev) =>
        prev.map((e) => (e.id === emailId ? { ...e, labels: [...e.labels, labelName] } : e)),
      );
    }
  }, []);

  const snoozeEmail = useCallback(async (emailId: string, until: Date) => {
    setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isSnoozed: true } : e)));
    try {
      await apiRequest(`/api/emails/${emailId}/snooze`, {
        method: 'POST',
        body: JSON.stringify({ snoozeUntil: until.toISOString() }),
      });
    } catch (err) {
      setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isSnoozed: false } : e)));
    }
  }, []);

  const undoSend = useCallback(async (messageId: string): Promise<boolean> => {
    try {
      const response = await apiRequest(`/api/emails/${messageId}/undo-send`, { method: 'POST' });
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  const moveToCategory = useCallback(
    async (emailId: string, newCategory: string) => {
      setEmails((prev) => prev.filter((e) => e.id !== emailId));
      try {
        await apiRequest(`/api/emails/${emailId}/category`, {
          method: 'PUT',
          body: JSON.stringify({ category: newCategory }),
        });
      } catch (err) {
        fetchEmails();
      }
    },
    [fetchEmails],
  );

  const refresh = useCallback(async () => {
    await fetchEmails();
  }, [fetchEmails]);

  return {
    emails,
    loading,
    error,
    page,
    totalPages,
    totalCount,
    unreadCount,
    fetchEmails,
    sendEmail,
    archiveEmail,
    archiveEmails,
    deleteEmail,
    deleteEmails,
    starEmail,
    unstarEmail,
    markRead,
    markUnread,
    addLabel,
    removeLabel,
    snoozeEmail,
    undoSend,
    moveToCategory,
    setPage,
    refresh,
  };
}

// ============================================================================
// 5. PRIMARY CONSOLIDATED HOOK: useMail
// ============================================================================

/**
 * Consolidated mail hook providing query data and optimistic mutations in one place.
 */
export function useMail(options?: UseInboxOptions & UseMailMutationsOptions) {
  const inbox = useInbox(options);
  const mutations = useMailMutations(options);

  return {
    ...inbox,
    mutations,
  };
}

// ============================================================================
// 6. SEARCH HOOK: useSearchEmails
// ============================================================================

/**
 * Normalizes email list payload from direct array or nested data envelope.
 */
function toEmailList(payload: unknown): Email[] {
  if (Array.isArray(payload)) return payload as Email[];
  const nested = (payload as { data?: unknown } | null | undefined)?.data;
  return Array.isArray(nested) ? (nested as Email[]) : [];
}

/**
 * Searches emails via canonical API client with query key prefix ['inbox', 'search', ...].
 * This guarantees cache eviction whenever `mailQueryKeys.all` (['inbox']) is invalidated.
 */
export function useSearchEmails(params: Partial<SearchEmailRequest> | null) {
  return useQuery<Email[]>({
    queryKey: mailQueryKeys.search(params),
    queryFn: async () => {
      if (!params) return [];
      const response = await apiClient.searchEmails(params);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to search emails');
      }
      return toEmailList(response.data);
    },
    enabled: !!params,
  });
}

export default useMail;
