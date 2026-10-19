'use client';

/**
 * Superhuman-style cursor and mail actions for the People home (`/` and
 * `/?lens=spam`) — the default QuantMail surface.
 *
 * A dedicated hook rather than a reuse of `useInboxKeyboard`, for three
 * reasons that reuse got wrong when it was tried:
 *
 * 1. **Rows are people, not threads.** `useInboxKeyboard`'s row contract is
 *    `InboxKeyboardRow` (`id`/`threadId`/`isRead`/`isStarred`); a person row's
 *    `id` would have been the `personKey` (an email address), which made the
 *    inherited `inbox.forward` push `/compose?forward=<email-address>` — a
 *    broken forward. Here every action expands to the conversation's real
 *    message ids and `f` forwards the latest message id.
 * 2. **People has no selection model.** There are no checkboxes on this
 *    surface, so `x` (inbox.toggleSelect) is deliberately NOT registered
 *    here — a key that promises "Select conversation" in the palette and does
 *    nothing on press is worse than an absent one. The `?` sheet keeps
 *    documenting `x` dimmed as "elsewhere", which is honest: it is a
 *    classic-inbox key.
 * 3. **The search box belongs to this surface.** `/` focuses the PeopleList
 *    search input (Gmail/Superhuman behaviour); the classic inbox has no
 *    `/` binding, so it lives only here as `people.focusSearch`.
 *
 * The triage labels, groups and keys are spread from
 * `INBOX_COMMAND_REFERENCE` exactly like `useInboxKeyboard` does, so the
 * command palette and the `?` shortcuts sheet cannot drift from what the
 * keys actually do — but the ids are `people.*`, NOT the inbox's `inbox.*`
 * (see `peopleCommand`), because the engine keys bindings by id and
 * same-id registrations clobber each other across the two surfaces that
 * share the `/` page.
 *
 * Desktop-viewport behaviour only in practice: the hook binds keys through
 * the engine, which never fires inside text inputs, and phones have no
 * physical keyboard. No mobile markup is touched.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useKeyboardScope, useRegisterCommands } from '../lib/keyboard/hooks';
import { inboxCommand, type InboxCommandId, type Command } from '../lib/keyboard/command-registry';
import { hasPendingUndo, runPendingUndo, showToast } from '../lib/toast-bus';
import { messageRowIds } from '../lib/threading';
import type { PersonConversation } from '../lib/peopleGrouping';
import type { MailMutations } from './useMailMutations';

const SCOPE = 'people';

/**
 * The People commands reuse the inbox reference's labels, keys, groups and
 * descriptions (spread per command) but carry their OWN `people.*` ids.
 *
 * Same ids were tried first and broke the page: the engine keys bindings by
 * id, so the people's `inbox.archive` registration REPLACED the inbox's live
 * `e` binding while both hooks were mounted on `/` (the page always mounts
 * `useInboxKeyboard`, even under the People home). Toggling the
 * MailboxViewToggle to the classic inbox then unmounted the People home,
 * whose release deleted the only remaining `inbox.archive` binding — `e`,
 * `j`/`k`, `#`, `u`, `s`, `f`, `r`, `x`, `c`, `z` all went dead in the
 * classic inbox until something re-registered them. Namespaced ids keep both
 * surfaces' bindings alive independently; the palette and the `?` sheet show
 * both rows and dim the out-of-scope one, the same convention the calendar
 * (`calendar.*` beside `inbox.*`) already uses.
 */
export function peopleCommand(id: InboxCommandId): Omit<Command, 'run' | 'scope'> {
  const reference = inboxCommand(id);
  return {
    id: `people.${id.slice('inbox.'.length)}`,
    label: reference.label,
    group: reference.group,
    keys: reference.keys,
    description: reference.description,
  };
}

export interface UsePeopleKeyboardOptions {
  /** The rows as rendered — world-filtered AND search-filtered, in order. */
  rows: PersonConversation[];
  /** Open a person's thread. Called by `Enter`/`o`. */
  onOpen: (row: PersonConversation) => void;
  mutations: MailMutations;
  /** Usually a scrollIntoView of the row's `[data-person-key]` element. */
  scrollToIndex?: (index: number) => void;
  /** Triggered by pressing `c`. Defaults to navigating to `/compose`. */
  onCompose?: () => void;
  /** Triggered by pressing `/`. Defaults to focusing the search input. */
  onFocusSearch?: () => void;
  /** Set `false` when the People home should not own the keys. */
  active?: boolean;
}

export interface PeopleKeyboardState {
  /** Index of the focused row in `rows`, or `-1` when nothing is focused. */
  focusedIndex: number;
  /** The focused row's personKey, or `null`. */
  focusedId: string | null;
  /** Move the cursor to a row, e.g. from a hover or a tap. */
  focusRow: (personKey: string) => void;
  clearFocus: () => void;
  /** Last archived person conversation, for instant undo. */
  lastArchivedConversation: { personKey: string; ids: string[] } | null;
  /** Revert the last archived person conversation. */
  undoLastArchive: () => void;
}

/**
 * Pure controller backing usePeopleKeyboard triaging, focus management,
 * archive capture, and instant Z undo restoration.
 */
export class PeopleKeyboardController {
  public options: UsePeopleKeyboardOptions;
  public focusedId: string | null = null;
  public lastIndex: number = -1;
  public lastArchivedConversation: { personKey: string; ids: string[] } | null = null;

  constructor(options: UsePeopleKeyboardOptions) {
    this.options = options;
  }

  public updateOptions(options: UsePeopleKeyboardOptions) {
    this.options = options;
  }

  public get focusedIndex(): number {
    if (this.focusedId === null) return -1;
    return this.options.rows.findIndex((row) => row.personKey === this.focusedId);
  }

  public get focusedRow(): PersonConversation | null {
    const idx = this.focusedIndex;
    return idx >= 0 ? this.options.rows[idx] : null;
  }

  public focusRow(personKey: string) {
    const index = this.options.rows.findIndex((row) => row.personKey === personKey);
    if (index >= 0) this.lastIndex = index;
    this.focusedId = personKey;
  }

  public clearFocus() {
    this.focusedId = null;
    this.lastIndex = -1;
  }

  public move(delta: number) {
    const { rows, scrollToIndex } = this.options;
    if (rows.length === 0) return;
    const currentIdx = this.focusedIndex;
    const next =
      currentIdx < 0
        ? delta > 0
          ? 0
          : rows.length - 1
        : Math.min(Math.max(currentIdx + delta, 0), rows.length - 1);

    const row = rows[next];
    if (!row) return;

    this.lastIndex = next;
    this.focusedId = row.personKey;
    scrollToIndex?.(next);
  }

  /**
   * Every message id the person's conversation stands for, collapsed-duplicate
   * twins included — `e`/`#`/`s`/`u` must reach the copy that stopped being
   * visible, or the row comes back to the list after the action.
   */
  public idsOf(row: PersonConversation): string[] {
    return messageRowIds(row.messages);
  }

  public archiveFocused(): boolean {
    const row = this.focusedRow;
    if (!row) return false;

    const ids = this.idsOf(row);
    this.lastArchivedConversation = { personKey: row.personKey, ids };
    void this.options.mutations.archive(ids);
    showToast({
      text: 'Conversation marked done. [Undo (Z)]',
      type: 'info',
      undoAction: () => this.undoLastArchive(),
    });
    return true;
  }

  public undoLastArchive(): boolean {
    const archived = this.lastArchivedConversation;
    if (!archived) return false;
    this.lastArchivedConversation = null;
    void this.options.mutations.unarchive(archived.ids);
    showToast({
      text: 'Action undone',
      type: 'success',
    });
    return true;
  }
}

export function usePeopleKeyboard(options: UsePeopleKeyboardOptions): PeopleKeyboardState {
  const {
    rows,
    onOpen,
    mutations,
    scrollToIndex,
    onCompose,
    onFocusSearch,
    active = true,
  } = options;

  const router = useRouter();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [lastArchivedConversation, setLastArchivedConversation] = useState<{
    personKey: string;
    ids: string[];
  } | null>(null);
  const lastArchivedConversationRef = useRef<{
    personKey: string;
    ids: string[];
  } | null>(null);

  const undoLastArchive = useCallback(() => {
    const archived = lastArchivedConversationRef.current;
    if (!archived) return;
    lastArchivedConversationRef.current = null;
    setLastArchivedConversation(null);
    void mutations.unarchive(archived.ids);
    showToast({
      text: 'Action undone',
      type: 'success',
    });
  }, [mutations]);

  /** Where the focused row last sat, so a removal can hand focus to its successor. */
  const lastIndexRef = useRef(-1);
  const rowsRef = useRef(rows);
  const scrollRef = useRef(scrollToIndex);

  useEffect(() => {
    rowsRef.current = rows;
    scrollRef.current = scrollToIndex;
  });

  const focusedIndex = useMemo(
    () => (focusedId === null ? -1 : rows.findIndex((row) => row.personKey === focusedId)),
    [rows, focusedId],
  );
  const focusedRow = focusedIndex >= 0 ? rows[focusedIndex] : null;

  useEffect(() => {
    if (focusedIndex >= 0) lastIndexRef.current = focusedIndex;
  }, [focusedIndex]);

  /**
   * Re-seat the cursor when the focused row leaves the list — archived,
   * trashed, or filtered out by a world-tab/search change. The row that slid
   * into its place is the one the user expects to be looking at.
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
    setFocusedId(rows[next].personKey);
    scrollRef.current?.(next);
  }, [focusedId, focusedIndex, rows]);

  const focusRow = useCallback((personKey: string) => {
    const index = rowsRef.current.findIndex((row) => row.personKey === personKey);
    if (index >= 0) lastIndexRef.current = index;
    setFocusedId(personKey);
  }, []);

  const clearFocus = useCallback(() => {
    setFocusedId(null);
    lastIndexRef.current = -1;
  }, []);

  useKeyboardScope(SCOPE, { active });

  /**
   * Move the cursor by `delta`, clamped. From nothing focused, `j` lands on
   * the first row and `k` on the last. There is no reading pane on this
   * surface, so `j`/`k` never open anything — `Enter`/`o` opens the person.
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
    setFocusedId(row.personKey);
    scrollRef.current?.(next);
  };

  const idsOf = (row: PersonConversation): string[] => messageRowIds(row.messages);

  /** `z` must never fire while typing — the engine already skips text inputs, but `z` undoes a destructive action, so it carries the same explicit guard the inbox's undo does. */
  const isTypingTarget = (): boolean => {
    if (typeof document === 'undefined') return false;
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return (
      tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable
    );
  };

  // Rebuilt every render; `useRegisterCommands` re-registers only when the
  // *shape* changes, and always calls the newest closure. That is what lets these
  // read `focusedRow` directly instead of through a ref.
  const commands: Command[] = [
    {
      ...peopleCommand('inbox.next'),
      scope: SCOPE,
      hidden: true,
      enabled: () => rows.length > 0,
      run: () => move(1),
    },
    {
      ...peopleCommand('inbox.previous'),
      scope: SCOPE,
      hidden: true,
      enabled: () => rows.length > 0,
      run: () => move(-1),
    },
    {
      ...peopleCommand('inbox.open'),
      scope: SCOPE,
      icon: 'envelopeOpen',
      keywords: ['read', 'expand', 'view', 'person', 'thread'],
      enabled: () => focusedRow !== null,
      run: () => {
        if (focusedRow) onOpen(focusedRow);
      },
    },
    {
      ...peopleCommand('inbox.close'),
      scope: SCOPE,
      hidden: true,
      // People has no selection bar and no reading pane: Escape only clears
      // the cursor, and claims nothing otherwise so it falls through.
      enabled: () => focusedId !== null,
      run: () => clearFocus(),
    },
    {
      ...peopleCommand('inbox.archive'),
      scope: SCOPE,
      icon: 'archive',
      keywords: ['done', 'remove', 'clear'],
      enabled: () => focusedRow !== null,
      run: () => {
        // No explicit advance: the row leaves `rows`, and the re-seat effect
        // hands focus to whatever takes its index.
        if (!focusedRow) return;
        const ids = idsOf(focusedRow);
        const archived = { personKey: focusedRow.personKey, ids };
        lastArchivedConversationRef.current = archived;
        setLastArchivedConversation(archived);
        void mutations.archive(ids);
        showToast({
          text: 'Conversation marked done. [Undo (Z)]',
          type: 'info',
          undoAction: undoLastArchive,
        });
      },
    },
    {
      ...peopleCommand('inbox.undo'),
      scope: SCOPE,
      icon: 'undo',
      keywords: ['undo', 'restore', 'revert'],
      enabled: () => {
        // Either the toast bus has a pending undo (archive, trash, or any other
        // reversible action) or the archive ref is set. The engine skips text
        // inputs, but `z` undoes a destructive action — belt and suspenders.
        if (lastArchivedConversationRef.current === null && !hasPendingUndo()) return false;
        return !isTypingTarget();
      },
      run: () => {
        if (!runPendingUndo()) undoLastArchive();
      },
    },
    {
      ...peopleCommand('inbox.trash'),
      scope: SCOPE,
      icon: 'trash',
      keywords: ['delete', 'bin', 'remove'],
      enabled: () => focusedRow !== null,
      run: () => {
        if (focusedRow) void mutations.trash(idsOf(focusedRow));
      },
    },
    {
      ...peopleCommand('inbox.pin'),
      scope: SCOPE,
      icon: 'star',
      keywords: ['flag', 'pin', 'important', 'star'],
      enabled: () => focusedRow !== null,
      run: () => {
        if (focusedRow) void mutations.toggleStar(idsOf(focusedRow));
      },
    },
    {
      ...peopleCommand('inbox.toggleRead'),
      // The only label that cannot live in the reference: it names the effect of
      // pressing `u` on *this* row, and the sheet has no row to read.
      label: focusedRow && focusedRow.unreadCount === 0 ? 'Mark as unread' : 'Mark as read',
      scope: SCOPE,
      icon: 'envelopeOpen',
      keywords: ['unread', 'read', 'seen'],
      enabled: () => focusedRow !== null,
      run: () => {
        if (!focusedRow) return;
        const ids = idsOf(focusedRow);
        if (focusedRow.unreadCount > 0) void mutations.markRead(ids);
        else void mutations.markUnread(ids);
      },
    },
    {
      ...peopleCommand('inbox.reply'),
      scope: SCOPE,
      icon: 'reply',
      keywords: ['respond', 'answer'],
      enabled: () => focusedRow !== null,
      run: () => {
        if (focusedRow)
          router.push(`/compose?replyTo=${encodeURIComponent(focusedRow.lastMessage.threadId)}`);
      },
    },
    {
      ...peopleCommand('inbox.forward'),
      scope: SCOPE,
      icon: 'forward',
      keywords: ['share', 'send on'],
      enabled: () => focusedRow !== null,
      run: () => {
        // The latest message id — NOT the personKey: `/compose?forward=` takes
        // a message, and the key is an email address.
        if (focusedRow)
          router.push(`/compose?forward=${encodeURIComponent(focusedRow.lastMessage.id)}`);
      },
    },
    {
      ...peopleCommand('inbox.compose'),
      scope: SCOPE,
      icon: 'compose',
      keywords: ['compose', 'new', 'write', 'draft'],
      enabled: () => true,
      run: () => {
        if (onCompose) onCompose();
        else router.push('/compose');
      },
    },
    {
      // The one People-only key: the classic inbox has no `/`, but this
      // surface owns a search box and Gmail/Superhuman users reach for `/`
      // to get to it.
      id: 'people.focusSearch',
      label: 'Focus people search',
      group: 'Navigation',
      keys: '/',
      description: 'Jump to the search box above the people list',
      scope: SCOPE,
      hidden: true,
      enabled: () => true,
      run: () => {
        if (onFocusSearch) {
          onFocusSearch();
          return;
        }
        if (typeof document === 'undefined') return;
        const input = document.querySelector<HTMLInputElement>(
          'input[aria-label="Search people and messages"]',
        );
        input?.focus();
      },
    },
  ];

  useRegisterCommands(commands);

  return {
    focusedIndex,
    focusedId,
    focusRow,
    clearFocus,
    lastArchivedConversation,
    undoLastArchive,
  };
}
