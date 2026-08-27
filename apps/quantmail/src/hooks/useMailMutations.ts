'use client';

/**
 * Optimistic, offline-tolerant mailbox mutations.
 *
 * The handlers this replaces did the following for every action:
 *
 * ```ts
 * const response = await apiClient.archiveEmail(id);   // wait for the server
 * await Promise.all([refetch(), refetchArchived()]);   // then refetch everything
 * ```
 *
 * Two sequential round trips before the row moved, and holding `j`+`e` down the
 * list queued a full inbox refetch per keystroke. Here the cache is updated
 * first, the row moves in the same frame, and the request goes out behind the
 * user through the outbox — which also means archiving works with no connection
 * at all and replays on reconnect.
 *
 * A mutation declares only what changed about the message; folder membership is
 * derived from that by `lib/offline/folders`. One code path therefore covers
 * archive, unarchive, trash, restore and snooze, and a message can never end up
 * visible in both the inbox and the archive.
 */

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { showToast } from '../components/InboxToast';
import { enqueue, type MailMutationKind } from '../lib/offline/outbox';
import { patchEmail } from '../lib/offline/mail-cache';
import {
  EMAIL_LIST_PREFIXES,
  folderTypeOf,
  reconcileList,
} from '../lib/offline/folders';
import type { Email } from '../types';

/**
 * Delay before asking the server for canonical state. Long enough that holding
 * `e` down a thread list collapses into a single refetch, short enough that
 * server-side changes land promptly.
 */
const RECONCILE_DELAY_MS = 1_200;

type EmailPatch = Partial<Email>;

/** Every cached `Email[]` list, as `[queryKey, data]` pairs. */
function emailListQueries(queryClient: QueryClient): Array<[readonly unknown[], Email[]]> {
  const result: Array<[readonly unknown[], Email[]]> = [];
  for (const prefix of EMAIL_LIST_PREFIXES) {
    for (const [key, data] of queryClient.getQueriesData<Email[]>({ queryKey: prefix })) {
      if (Array.isArray(data)) result.push([key, data]);
    }
  }
  return result;
}

/** Find a message anywhere in the cache. */
function findCachedEmail(queryClient: QueryClient, id: string): Email | undefined {
  for (const [, data] of emailListQueries(queryClient)) {
    const match = data.find((email) => email.id === id);
    if (match) return match;
  }
  return undefined;
}

export interface MailMutations {
  archive: (id: string) => Promise<void>;
  unarchive: (id: string) => Promise<void>;
  trash: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  toggleStar: (id: string) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markUnread: (id: string) => Promise<void>;
  snooze: (id: string, until: Date) => Promise<void>;
  /** Batch archive or trash: one optimistic update, one request per id, one toast. */
  batch: (kind: 'archive' | 'trash', ids: string[]) => Promise<void>;
}

export interface UseMailMutationsOptions {
  /**
   * Called with the ids that just left the current view, so the page can close a
   * reading pane showing one of them or move the focused row along.
   */
  onRemoved?: (ids: string[]) => void;
}

export function useMailMutations(options: UseMailMutationsOptions = {}): MailMutations {
  const queryClient = useQueryClient();
  const onRemovedRef = useRef(options.onRemoved);
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Assigned on every commit so callbacks below always see the newest closure
  // without being rebuilt — the handlers are registered as keyboard bindings.
  useEffect(() => {
    onRemovedRef.current = options.onRemoved;
  });

  useEffect(
    () => () => {
      if (reconcileTimerRef.current !== null) clearTimeout(reconcileTimerRef.current);
    },
    [],
  );

  /** Ask the server for canonical lists, coalescing bursts of actions into one. */
  const scheduleReconcile = useCallback(() => {
    if (reconcileTimerRef.current !== null) clearTimeout(reconcileTimerRef.current);
    reconcileTimerRef.current = setTimeout(() => {
      reconcileTimerRef.current = null;
      for (const prefix of EMAIL_LIST_PREFIXES) {
        void queryClient.invalidateQueries({ queryKey: prefix });
      }
    }, RECONCILE_DELAY_MS);
  }, [queryClient]);

  /**
   * Apply `patch` to `ids` across every cached list and return a rollback.
   * Rollback restores the exact previous arrays, so a rejected batch cannot leave
   * half of itself applied.
   */
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

      // Mirror the field change into IndexedDB — one small record per message, not
      // a whole mailbox snapshot, so a burst of archives stays cheap. The cached
      // id lists are unchanged; `useInbox` re-applies the folder predicate when it
      // seeds from disk, so an archived message stays out of the inbox on reload.
      for (const [id, email] of patched) void patchEmail(id, email);

      return () => {
        for (const [key, data] of snapshots) queryClient.setQueryData(key, data);
      };
    },
    [queryClient],
  );

  /**
   * The single mutation path: patch the cache, queue the requests, roll back and
   * explain if the server refuses.
   */
  const run = useCallback(
    async (config: {
      kind: MailMutationKind;
      ids: string[];
      patch: EmailPatch;
      snoozeUntil?: Date;
      /** Omit to stay silent — `markRead` fires on every message open. */
      toast?: string;
      /** Reverses the action from the toast's Undo button. */
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
    (id: string) =>
      run({
        kind: 'archive',
        ids: [id],
        patch: { isArchived: true },
        toast: 'Conversation archived',
        undo: { kind: 'unarchive', patch: { isArchived: false } },
        removesFromView: true,
      }),
    [run],
  );

  const unarchive = useCallback(
    (id: string) =>
      run({
        kind: 'unarchive',
        ids: [id],
        patch: { isArchived: false },
        toast: 'Moved back to inbox',
        undo: { kind: 'archive', patch: { isArchived: true } },
        removesFromView: true,
      }),
    [run],
  );

  const trash = useCallback(
    (id: string) =>
      run({
        kind: 'trash',
        ids: [id],
        patch: { trashedAt: new Date() },
        toast: 'Conversation moved to trash',
        undo: { kind: 'restore', patch: { trashedAt: undefined } },
        removesFromView: true,
      }),
    [run],
  );

  const restore = useCallback(
    (id: string) =>
      run({
        kind: 'restore',
        ids: [id],
        patch: { trashedAt: undefined },
        toast: 'Conversation restored',
        removesFromView: true,
      }),
    [run],
  );

  const toggleStar = useCallback(
    (id: string) => {
      const current = findCachedEmail(queryClient, id);
      return run({
        kind: 'toggleStar',
        ids: [id],
        patch: { isStarred: !(current?.isStarred ?? false) },
      });
    },
    [queryClient, run],
  );

  const markRead = useCallback(
    (id: string) => run({ kind: 'markRead', ids: [id], patch: { isRead: true } }),
    [run],
  );

  const markUnread = useCallback(
    (id: string) =>
      run({ kind: 'markUnread', ids: [id], patch: { isRead: false }, toast: 'Marked as unread' }),
    [run],
  );

  const snooze = useCallback(
    (id: string, until: Date) =>
      run({
        kind: 'snooze',
        ids: [id],
        patch: { snoozedUntil: until },
        snoozeUntil: until,
        toast: `Snoozed until ${formatSnoozeTarget(until)}`,
        removesFromView: true,
      }),
    [run],
  );

  const batch = useCallback(
    (kind: 'archive' | 'trash', ids: string[]) => {
      const noun = `${ids.length} conversation${ids.length === 1 ? '' : 's'}`;
      return kind === 'archive'
        ? run({
            kind: 'archive',
            ids,
            patch: { isArchived: true },
            toast: `${noun} archived`,
            undo: { kind: 'unarchive', patch: { isArchived: false } },
            removesFromView: true,
          })
        : run({
            kind: 'trash',
            ids,
            patch: { trashedAt: new Date() },
            toast: `${noun} moved to trash`,
            undo: { kind: 'restore', patch: { trashedAt: undefined } },
            removesFromView: true,
          });
    },
    [run],
  );

  // Memoised so the object is referentially stable: callers pass it straight into
  // dependency arrays and into `useInboxKeyboard`.
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

/** "Snoozed until tomorrow 09:00" reads better than a full locale timestamp. */
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
