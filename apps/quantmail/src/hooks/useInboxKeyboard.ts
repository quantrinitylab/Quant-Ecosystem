'use client';

/**
 * Superhuman-style cursor and mail actions for the thread list.
 *
 * Two things were wrong with the previous implementation, and both are fixed by
 * the shape of this one rather than by patching it:
 *
 * 1. **It acted on the wrong row.** It was handed the flat `Email[]` from the
 *    query while the list rendered *grouped conversations*, sorted differently
 *    and of a different length. `j` highlighted row 4 and `e` archived whatever
 *    message happened to sit at index 4 of the ungrouped array. This hook takes
 *    the rows that are actually rendered, so the cursor and the action always
 *    address the same conversation.
 *
 * 2. **Focus was an index.** When a mutation removed the focused row every index
 *    below it shifted, so the cursor silently jumped. Focus is now an *id*, with
 *    the last known position kept only as the fallback for "the row that took its
 *    place" — which is exactly the behaviour wanted after archiving: `e` leaves
 *    the cursor on the next conversation with no explicit advance step.
 *
 * The keys themselves are registered as commands in the `inbox` scope, so they
 * appear in the palette and the shortcuts sheet automatically, and their depth in
 * the scope stack is what resolves the conflicts the old `document` listener lost:
 * the inbox's `r` (reply to the focused thread) outranks the global `r` (focus an
 * inline reply box), and `Escape` reaches the list only when nothing modal is open.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useKeyboardScope, useRegisterCommands } from '../lib/keyboard/hooks';
import type { Command } from '../lib/keyboard/command-registry';
import type { MailMutations } from './useMailMutations';

const SCOPE = 'inbox';

/**
 * The minimum a row must expose. Structural rather than an import of
 * `ConversationThread`, which lives in the inbox page — the page imports this
 * hook, so the dependency has to point one way.
 */
export interface InboxKeyboardRow {
  id: string;
  threadId: string;
  isRead: boolean;
  isStarred: boolean;
}

export interface UseInboxKeyboardOptions<Row extends InboxKeyboardRow> {
  /** The rows as rendered — grouped, filtered and sorted. Not the raw query data. */
  rows: Row[];
  /** Id of the conversation open in the reading pane, or `null`. */
  selectedId: string | null;
  /** Open a conversation. Called by `Enter`/`o`, and by `j`/`k` while a pane is open. */
  onOpen: (row: Row) => void;
  /** Close the reading pane. */
  onClose: () => void;
  /** Toggle the row's selection checkbox. */
  onToggleSelect: (id: string) => void;
  mutations: MailMutations;
  /** Usually the virtualizer's `scrollToIndex`; without it the cursor can leave the viewport. */
  scrollToIndex?: (index: number) => void;
  /** Set `false` on views that render the list but should not own the keys. */
  active?: boolean;
}

export interface InboxKeyboardState {
  /** Index of the focused row in `rows`, or `-1` when nothing is focused. */
  focusedIndex: number;
  focusedId: string | null;
  /** Move the cursor to a row, e.g. from a click or a swipe. */
  focusRow: (id: string) => void;
  clearFocus: () => void;
}

export function useInboxKeyboard<Row extends InboxKeyboardRow>(
  options: UseInboxKeyboardOptions<Row>,
): InboxKeyboardState {
  const {
    rows,
    selectedId,
    onOpen,
    onClose,
    onToggleSelect,
    mutations,
    scrollToIndex,
    active = true,
  } = options;

  const router = useRouter();
  const [focusedId, setFocusedId] = useState<string | null>(null);

  /** Where the focused row last sat, so a removal can hand focus to its successor. */
  const lastIndexRef = useRef(-1);
  const rowsRef = useRef(rows);
  const scrollRef = useRef(scrollToIndex);
  const previousSelectedRef = useRef<string | null>(null);

  useEffect(() => {
    rowsRef.current = rows;
    scrollRef.current = scrollToIndex;
  });

  const focusedIndex = useMemo(
    () => (focusedId === null ? -1 : rows.findIndex((row) => row.id === focusedId)),
    [rows, focusedId],
  );
  const focusedRow = focusedIndex >= 0 ? rows[focusedIndex] : null;

  useEffect(() => {
    if (focusedIndex >= 0) lastIndexRef.current = focusedIndex;
  }, [focusedIndex]);

  /**
   * Re-seat the cursor when the focused row leaves the list — archived, trashed,
   * snoozed, or filtered out by a tab change. The row that slid into its place is
   * the one the user expects to be looking at.
   */
  useEffect(() => {
    if (focusedId === null || focusedIndex !== -1) return;
    if (rows.length === 0) {
      setFocusedId(null);
      lastIndexRef.current = -1;
      return;
    }
    const next = Math.min(Math.max(lastIndexRef.current, 0), rows.length - 1);
    lastIndexRef.current = next;
    setFocusedId(rows[next].id);
    scrollRef.current?.(next);
  }, [focusedId, focusedIndex, rows]);

  /** Follow the reading pane when it is opened from somewhere else — a click, a deep link. */
  useEffect(() => {
    if (selectedId === previousSelectedRef.current) return;
    previousSelectedRef.current = selectedId;
    if (selectedId === null) return;
    const index = rows.findIndex((row) => row.id === selectedId);
    if (index === -1) return;
    lastIndexRef.current = index;
    setFocusedId(selectedId);
  }, [selectedId, rows]);

  const focusRow = useCallback((id: string) => {
    const index = rowsRef.current.findIndex((row) => row.id === id);
    if (index >= 0) lastIndexRef.current = index;
    setFocusedId(id);
  }, []);

  const clearFocus = useCallback(() => {
    setFocusedId(null);
    lastIndexRef.current = -1;
  }, []);

  useKeyboardScope(SCOPE, { active });

  /**
   * Move the cursor by `delta`, clamped. From nothing focused, `j` lands on the
   * first row and `k` on the last. The reading pane follows the cursor only when
   * it is already open, so `j` on a fresh inbox moves a highlight rather than
   * marking messages read.
   */
  const move = (delta: number) => {
    if (rows.length === 0) return;
    const next =
      focusedIndex < 0
        ? delta > 0
          ? 0
          : rows.length - 1
        : Math.min(Math.max(focusedIndex + delta, 0), rows.length - 1);

    const row = rows[next];
    if (!row) return;

    lastIndexRef.current = next;
    setFocusedId(row.id);
    scrollRef.current?.(next);
    if (selectedId !== null) onOpen(row);
  };

  // Rebuilt every render; `useRegisterCommands` re-registers only when the
  // *shape* changes, and always calls the newest closure. That is what lets these
  // read `focusedRow` directly instead of through a ref.
  const commands: Command[] = [
    {
      id: 'inbox.next',
      label: 'Next conversation',
      group: 'Navigation',
      keys: ['j', 'arrowdown'],
      scope: SCOPE,
      hidden: true,
      enabled: () => rows.length > 0,
      run: () => move(1),
    },
    {
      id: 'inbox.previous',
      label: 'Previous conversation',
      group: 'Navigation',
      keys: ['k', 'arrowup'],
      scope: SCOPE,
      hidden: true,
      enabled: () => rows.length > 0,
      run: () => move(-1),
    },
    {
      id: 'inbox.open',
      label: 'Open conversation',
      group: 'Navigation',
      keys: ['enter', 'o'],
      scope: SCOPE,
      icon: 'envelopeOpen',
      keywords: ['read', 'expand', 'view'],
      enabled: () => focusedRow !== null,
      run: () => {
        if (focusedRow) onOpen(focusedRow);
      },
    },
    {
      id: 'inbox.close',
      label: 'Close conversation',
      group: 'Navigation',
      keys: 'escape',
      scope: SCOPE,
      hidden: true,
      // Only claims Escape when there is something to dismiss, so it falls
      // through to the sidebar drawer otherwise.
      enabled: () => selectedId !== null || focusedId !== null,
      run: () => {
        if (selectedId !== null) onClose();
        else clearFocus();
      },
    },
    {
      id: 'inbox.archive',
      label: 'Archive conversation',
      group: 'Conversation',
      keys: 'e',
      scope: SCOPE,
      icon: 'archive',
      description: 'Move out of the inbox — the cursor stays on the next thread',
      keywords: ['done', 'remove', 'clear'],
      enabled: () => focusedRow !== null,
      run: () => {
        // No explicit advance: the row leaves `rows`, and the re-seat effect
        // hands focus to whatever takes its index.
        if (focusedRow) void mutations.archive(focusedRow.id);
      },
    },
    {
      id: 'inbox.trash',
      label: 'Move conversation to trash',
      group: 'Conversation',
      keys: '#',
      scope: SCOPE,
      icon: 'trash',
      destructive: true,
      keywords: ['delete', 'bin', 'remove'],
      enabled: () => focusedRow !== null,
      run: () => {
        if (focusedRow) void mutations.trash(focusedRow.id);
      },
    },
    {
      id: 'inbox.star',
      label: 'Star conversation',
      group: 'Conversation',
      keys: 's',
      scope: SCOPE,
      icon: 'star',
      keywords: ['flag', 'pin', 'important'],
      enabled: () => focusedRow !== null,
      run: () => {
        if (focusedRow) void mutations.toggleStar(focusedRow.id);
      },
    },
    {
      id: 'inbox.toggleRead',
      label: focusedRow?.isRead === false ? 'Mark as read' : 'Mark as unread',
      group: 'Conversation',
      keys: 'u',
      scope: SCOPE,
      icon: 'envelopeOpen',
      keywords: ['unread', 'read', 'seen'],
      enabled: () => focusedRow !== null,
      run: () => {
        if (!focusedRow) return;
        if (focusedRow.isRead) void mutations.markUnread(focusedRow.id);
        else void mutations.markRead(focusedRow.id);
      },
    },
    {
      id: 'inbox.reply',
      label: 'Reply to conversation',
      group: 'Compose',
      keys: 'r',
      scope: SCOPE,
      icon: 'reply',
      keywords: ['respond', 'answer'],
      enabled: () => focusedRow !== null,
      run: () => {
        if (focusedRow) router.push(`/compose?replyTo=${encodeURIComponent(focusedRow.threadId)}`);
      },
    },
    {
      id: 'inbox.forward',
      label: 'Forward conversation',
      group: 'Compose',
      keys: 'f',
      scope: SCOPE,
      icon: 'forward',
      keywords: ['share', 'send on'],
      enabled: () => focusedRow !== null,
      run: () => {
        if (focusedRow) router.push(`/compose?forward=${encodeURIComponent(focusedRow.id)}`);
      },
    },
    {
      id: 'inbox.toggleSelect',
      label: 'Select conversation',
      group: 'Selection',
      keys: 'x',
      scope: SCOPE,
      icon: 'select',
      keywords: ['check', 'tick', 'multi'],
      enabled: () => focusedRow !== null,
      run: () => {
        if (focusedRow) onToggleSelect(focusedRow.id);
      },
    },
  ];

  useRegisterCommands(commands);

  return { focusedIndex, focusedId, focusRow, clearFocus };
}
