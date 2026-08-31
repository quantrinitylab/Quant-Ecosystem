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
 *
 * Every handler takes one id or many, because the unit a person acts on is a
 * *conversation*: the row says `11` and its archive button has to move all eleven.
 * Callers pass `threadMessageIds(thread)`; see the note there for what went wrong
 * when they passed `thread.id`.
 */

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { showToast } from '../lib/toast-bus';
import { enqueue, type MailMutationKind } from '../lib/offline/outbox';
import { patchEmail } from '../lib/offline/mail-cache';
import { EMAIL_LIST_PREFIXES, folderTypeOf, reconcileList } from '../lib/offline/folders';
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

/**
 * One id or many, as a de-duplicated array.
 *
 * Every handler here takes either, because the thing a user acts on is a
 * *conversation* — the row counts eleven messages and the archive button on it has
 * to move all eleven. See `threadMessageIds`.
 */
function idList(ids: string | string[]): string[] {
  const raw = Array.isArray(ids) ? ids : [ids];
  return Array.from(new Set(raw.filter(Boolean)));
}

export interface MailMutations {
  archive: (ids: string | string[]) => Promise<void>;
  unarchive: (ids: string | string[]) => Promise<void>;
  trash: (ids: string | string[]) => Promise<void>;
  restore: (ids: string | string[]) => Promise<void>;
  toggleStar: (ids: string | string[]) => Promise<void>;
  markRead: (ids: string | string[]) => Promise<void>;
  markUnread: (ids: string | string[]) => Promise<void>;
  snooze: (ids: string | string[], until: Date) => Promise<void>;
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
      /*
       * A conversation is starred when *any* message in it is — that is the `some`
       * the row renders — so the target is the opposite of that, written to the
       * whole conversation.
       *
       * Only the messages on the wrong side of the target are sent, because
       * `toggleStar` is a per-message flip on the server (`apiClient.toggleStar`
       * takes no value). Sending it to all eleven would un-star the one that was
       * already starred and star the ten that were not, so the row would come back
       * starred no matter which way the user pressed it.
       */
      const target = !list.some((id) => findCachedEmail(queryClient, id)?.isStarred);
      const wrongSide = list.filter(
        (id) => Boolean(findCachedEmail(queryClient, id)?.isStarred) !== target,
      );
      return run({ kind: 'toggleStar', ids: wrongSide, patch: { isStarred: target } });
    },
    [queryClient, run],
  );

  /*
   * Read state is filtered to the messages that actually disagree. `markRead` and
   * `markUnread` are idempotent on the server, so this is only about not firing
   * eleven requests to change three things — but it also keeps the Undo toast
   * honest, since `run` stays silent when nothing needed changing.
   */
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
    (ids: string | string[], until: Date) =>
      run({
        kind: 'snooze',
        ids: idList(ids),
        patch: { snoozedUntil: until },
        snoozeUntil: until,
        toast: `Snoozed until ${formatSnoozeTarget(until)}`,
        removesFromView: true,
      }),
    [run],
  );

  const batch = useCallback(
    (kind: 'archive' | 'trash', ids: string[], unitCount?: number) => {
      const list = idList(ids);
      const units = unitCount ?? list.length;
      const noun = `${units} conversation${units === 1 ? '' : 's'}`;
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
