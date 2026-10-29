'use client';

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { apiClient, type EmailFolder } from '../services/api-client';
import {
  ErrorState,
  Skeleton,
  Button,
  nextRovingIndex,
  useFocusTrap,
  useReducedMotion,
} from '@quant/shared-ui';
import { AppShell } from '../components/AppShell';
import { QuickGroupChatDeck } from '../components/QuickGroupChatDeck';
import { useInbox } from '../hooks/useInbox';
import { useSearchEmails } from '../hooks/useSearchEmails';
import {
  inboxLensTarget,
  inboxResetTarget,
  normalizeSearchFolderParam,
  SEARCH_FOLDER_OPTIONS,
  syncSearchFolderParam,
  syncSearchParam,
  type SearchFolderScope,
} from '../lib/inbox-nav';
import {
  combinedLensKeys as combinedLensKeysHelper,
  mergeInFlightFolders,
  normalizeLensParam as normalizeLensParamLib,
  reconcileFolderLens,
  resolveLensSync,
} from '../lib/inbox-lens';
import {
  deriveCategoryPills,
  matchesCategories,
  removeCategory,
  type SelectableCategory,
} from '../lib/category-filter';
import { CategoryPicker } from '../components/CategoryPicker';
import { deriveFilterChip } from '../lib/filter-chip';
import { AppSidebar } from '../components/AppSidebar';
import { EmailSnooze } from '../components/EmailSnooze';
import { AnchoredMenu } from '../components/AnchoredMenu';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SwipeHint } from '../components/SwipeHint';
import { HoverActions } from '../components/HoverActions';
import { IdentityAvatar } from '../components/IdentityAvatar';
import { InboxZeroState } from '../components/InboxZeroState';
import { LabelQuickApply } from '../components/LabelQuickApply';
import { showToast } from '../components/InboxToast';
import { MailIcon } from '../components/MailIcon';
import { ReadTimeEstimate } from '../components/ReadTimeEstimate';
import { QuantMailLogo } from '../components/QuantMailLogo';
import { SelectionHeader } from '../components/SelectionHeader';
import { GroupEditorModal, type GroupDraft } from '../components/GroupEditorModal';
import { ThreadKindBadge } from '../components/MessageKindBadge';
import { UnreadCountPill } from '../components/UnreadCountPill';
import { useInboxKeyboard } from '../hooks/useInboxKeyboard';
import { useApplyLabel, useLabels, useRemoveLabel } from '../hooks/useLabels';
import { useMailMutations } from '../hooks/useMailMutations';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useTouchSwipe } from '../components/SwipeableEmailRow';
import { QuantMailShortcutDock } from '../components/QuantMailShortcutDock';
import { DockedComposer } from '../components/DockedComposer';
import { useKeyboardSurfaces } from '../components/KeyboardProvider';
import { useScrollElement, useVirtualizer } from '../lib/virtual/useVirtualizer';
import {
  filterThreadsByQuery,
  findConversation,
  groupEmailsIntoThreads,
  isDraftOnlyConversation,
  isFromMe,
  sanitizeSnippetText,
  threadAddresses,
  threadFocus,
  threadMessageIds,
  type ConversationThread,
} from '../lib/threading';
import { safeISODateTime } from '../lib/honest-date';
import { useAuth } from '../providers/auth-provider';
import { useContactDirectory } from '../hooks/useContacts';
import {
  useContactGroups,
  useCreateContactGroup,
  useDeleteContactGroup,
  useUpdateContactGroup,
} from '../hooks/useContactGroups';
import { IconCheck, IconFilter, IconSpam, IconX } from '../components/icons';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateMailLists } from '../lib/offline/folders';
import { reconcileStarredFilterParam } from '../lib/starredDeepLink';
import { AddFolderModal, type FolderDraft } from '../components/AddFolderModal';
import { PeopleHome } from '../components/PeopleHome';
import { MailboxViewToggle } from '../components/MailboxViewToggle';
import type { ContactGroup, Email, EmailCategory } from '../types';

export type { ConversationThread };

/**
 * Starting height guess for a conversation row: `.mail-row`'s `min-height` of
 * 4.85rem plus its 1px border. Rows are measured for real once mounted, so this
 * only decides the scrollbar length before the first measurement pass.
 */
const ESTIMATED_ROW_HEIGHT = 80;

/**
 * The two halves of the inbox's Focus Bar.
 *
 * `InboxLens` is the chip row: one partition at a time, each answering a question
 * this client can settle from what it already holds. `All` and `Unread` read a
 * field the row itself renders, so they can never disagree with what is on screen.
 * `Groups` reads the recipient count. `Contacts` joins the conversation's
 * addresses against the user's own address book — a real join, over
 * `GET /contacts/directory` — where the chip of that name used to test
 * `!automated && (count <= 2 || category === 'primary')`, which collapses to "not
 * automated" and returned nearly everything.
 *
 * The seven category chips this descends from could not answer their own
 * question. `Updates` and `Offers` read `ConversationThread.category`, which
 * resolves from the server's `aiCategory` column — declared in
 * `packages/database/prisma/schema.prisma`, read in five places, and written in
 * none. Every message ever stored therefore arrives as `'primary'`, so both chips
 * were permanently empty. They stay out until something writes that column.
 *
 * `InboxTurn` and `InboxFilter` live in the Filter popover, where they *compose*
 * with the lens — which the old chip strip could not do, since choosing `Unread`
 * there discarded the category and vice versa.
 *
 * `Spam` sits in the chip row as an inline lens, filtering junk messages directly
 * in the active thread pool without navigating away.
 */
export interface CustomFolder {
  id: string;
  name: string;
  color?: string;
  filterType: 'contact' | 'keyword' | 'standard';
  filterValue?: string;
  createdAt?: number;
}

type FolderFilterMeta = Pick<CustomFolder, 'filterType' | 'filterValue'>;

const FOLDERS_CACHE_KEY = 'quant_custom_folders';
const FOLDER_FILTERS_KEY = 'quant_folder_filters';

/**
 * The backend `/folders` API stores name/color/type but has no fields for the
 * client-side filter semantics (contact/keyword/standard + value). Those live
 * in this device-local sidecar keyed by backend folder id, so a folder created
 * here keeps its filter on this device while its name/color sync cross-device.
 */
function readFolderFilters(): Record<string, FolderFilterMeta> {
  if (typeof window === 'undefined') return {};
  try {
    const saved = localStorage.getItem(FOLDER_FILTERS_KEY);
    if (saved) return JSON.parse(saved) as Record<string, FolderFilterMeta>;
  } catch {
    // ignore
  }
  return {};
}

function writeFolderFilters(filters: Record<string, FolderFilterMeta>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(FOLDER_FILTERS_KEY, JSON.stringify(filters));
  } catch {
    // ignore
  }
}

function persistFoldersCache(folders: CustomFolder[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(FOLDERS_CACHE_KEY, JSON.stringify(folders));
  } catch {
    // ignore
  }
}

/** Map a backend folder row onto the client CustomFolder shape. */
function fromBackendFolder(
  backend: EmailFolder,
  filter?: FolderFilterMeta,
): CustomFolder {
  return {
    id: backend.id,
    name: backend.name,
    color: backend.color || 'var(--quant-primary)',
    filterType: filter?.filterType || 'standard',
    filterValue: filter?.filterValue || '',
    createdAt: backend.createdAt ? new Date(backend.createdAt).getTime() : Date.now(),
  };
}

type InboxLens =
  | 'all'
  | 'unread'
  | 'contacts'
  | 'spam'
  | 'primary'
  | 'important'
  | 'teams'
  | 'updates'
  | 'social'
  | 'promotions'
  | 'forums'
  | 'groups'
  | 'snoozed'
  | (string & {});
type InboxTurn = 'any' | 'needs_you' | 'waiting';
type InboxFilter = 'starred' | 'attachment';

const INBOX_LENSES: Array<{ key: InboxLens; label: string; hint: string }> = [
  { key: 'all', label: 'All', hint: 'Every conversation, automated mail included' },
  { key: 'unread', label: 'Unread', hint: 'Conversations you have not opened yet' },
  { key: 'contacts', label: 'Contacts', hint: 'Conversations with someone in your address book' },
  { key: 'spam', label: 'Spam', hint: 'Junk and suspicious messages' },
];

/**
 * Whose turn it is — the one thing about a conversation this client can always
 * answer from the messages already in hand.
 *
 * Named as a pair, `Your turn` / `Their turn`, so the axis reads off the labels.
 * `Needs you` / `Waiting` named the same split from two unrelated angles — one an
 * instruction, one a state — with nothing to say they were opposite halves of one
 * whole.
 */
const INBOX_TURNS: Array<{ key: InboxTurn; label: string; hint: string }> = [
  { key: 'any', label: 'Anyone', hint: 'Both sides of every conversation' },
  { key: 'needs_you', label: 'Your turn', hint: 'A person wrote last, so the next reply is yours' },
  { key: 'waiting', label: 'Their turn', hint: 'You wrote last, so you are waiting on them' },
];

const INBOX_FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: 'starred', label: 'Pinned' },
  { key: 'attachment', label: 'Has attachment' },
];

function formatReceivedAt(value?: string | Date) {
  if (!value) return '';
  const date = new Date(value);
  // Same family as formatMessageTime: an unparseable receivedAt degrades to
  // an empty string — never the literal "Invalid Date" under the row.
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    // `numeric`, not `2-digit`: "1:53 PM", the way Gmail and the clock write it.
    // `2-digit` padded rows to "01:53 PM".
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Maps raw error objects to user-friendly messages.
 * Never expose technical details (status codes, stack traces, API internals)
 * to end users.
 */
function getFriendlyErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();

  if (lower.includes('network') || lower.includes('fetch') || lower.includes('failed to fetch')) {
    return 'Could not connect. Check your internet connection and try again.';
  }
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('auth')) {
    return 'Your session expired. Please sign in again.';
  }
  if (lower.includes('403') || lower.includes('forbidden')) {
    return 'You do not have permission to view these emails.';
  }
  if (lower.includes('404') || lower.includes('not found')) {
    return 'The requested mailbox could not be found.';
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  if (lower.includes('500') || lower.includes('502') || lower.includes('503') || lower.includes('server')) {
    return 'Something went wrong on our side. Please try again in a moment.';
  }
  if (lower.includes('timeout')) {
    return 'The request took too long. Please try again.';
  }
  return 'Something went wrong loading your emails. Please try again.';
}

function SpamBanner({
  spamCount,
  onEmptySpam,
  isEmptying,
}: {
  spamCount: number;
  onEmptySpam: () => void;
  isEmptying: boolean;
}) {
  return (
    <div className="mx-3 sm:mx-4 my-2.5 px-3.5 py-2.5 rounded-xl bg-[#12141A] border border-[var(--quant-surface-elevated)] flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2 text-[#EDEDED] min-w-0">
        <IconSpam size={15} className="text-[var(--quant-primary)] shrink-0" />
        <span className="font-semibold text-xs text-[#EDEDED]">Spam</span>
      </div>
      {spamCount > 0 && (
        <button
          type="button"
          onClick={onEmptySpam}
          disabled={isEmptying}
          className="shrink-0 text-xs font-semibold text-[var(--quant-primary)] hover:text-[var(--quant-primary-hover)] disabled:opacity-50 transition-colors"
        >
          {isEmptying ? 'Emptying…' : 'Empty Spam now'}
        </button>
      )}
    </div>
  );
}

/*
 * The row is a two-sided swipe target again, and the three reasons the first
 * attempt was deleted are the three things this one is built around. They are
 * restated here because each is a way the feature can quietly rot back into what
 * was removed.
 *
 * The first attempt used framer's `drag="x"`, which claims the pointer on the
 * first horizontal pixel: a thumb travelling up the list at any angle off
 * vertical slid a row, and a slightly generous flick archived a message the
 * reader only meant to scroll past. `useTouchSwipe` (see
 * `../components/SwipeableEmailRow`, core in `../lib/touch-swipe-machine`)
 * claims nothing until the finger has travelled 10px horizontally *and* 1.2x
 * more horizontally than vertically; the moment vertical intent wins the touch
 * is latched out and cannot be reclaimed however the finger curves afterwards;
 * and there is no velocity path at all, so committing means crossing a fixed
 * ~80px, which no flick can reach.
 *
 * Second, the two ends are named and unequal on purpose: left files the
 * conversation away (Archive, green pane) and right opens the snooze time
 * picker (Snooze, blue pane). Archive goes through the optimistic mutation
 * and comes back from the toast's Undo; snooze never fires without the user
 * picking a time. Delete is not a swipe end at all — it lives in the row's …
 * menu and the thread view, always behind a confirmation dialog, which is
 * what makes the destructive action defensible.
 *
 * Third, the affordance was invisible. The revealed pane names the action from
 * the first few pixels, only reaches full strength past the commit line, and the
 * phone ticks exactly as that line is crossed — so a first half-drag teaches the
 * gesture and then lets go of it with nothing having happened.
 *
 * The buttons stay. The row menu, `HoverActions` for pointers: everything the
 * swipe reaches is reachable without it, which is what makes it an accelerator
 * rather than the only door.
 */
type EmailRowProps = {
  thread: ConversationThread;
  isChecked: boolean;
  isActive: boolean;
  isFocused: boolean;
  isSpamMode?: boolean;
  savedGroups?: ContactGroup[];
  onRescueSpam?: () => void;
  /**
   * The event is forwarded so the page can read `shiftKey` and extend the
   * selection from the last click. Omitted when the toggle comes from a long-press
   * or a keyboard command.
   */
  onToggleSelect: (event?: React.MouseEvent) => void;
  /**
   * `null` when the toggle came from a swipe rather than a click — there is no
   * mouse event to stop propagating on.
   */
  onToggleStar: (event: React.MouseEvent | null) => void;
  onTogglePin: (event: React.MouseEvent | null) => void;
  onOpen: () => void;
  onArchive: () => void;
  onUnarchive?: () => void;
  isArchiveView?: boolean;
  onDelete: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  /**
   * BB-P1-1: false when every message in the conversation is from the
   * signed-in user. Thread-level read state is definitionally "read" there
   * (see `groupEmailsIntoThreads`), so the mark read/unread toggle would be
   * a dead control whose label can never flip — the row hides it instead of
   * lying about it.
   */
  canToggleRead?: boolean;
  onSnooze: (emailId: string, snoozeUntil: Date) => void;
  /**
   * Avatar identity for a conversation with nobody else in it (a note to
   * self). Without it the row fell back to the literal label "me", so every
   * self-thread wore an "M" instead of the account's own initial.
   */
  selfName?: string;
};

function EmailRow({
  thread,
  isChecked,
  isActive,
  isFocused,
  isSpamMode = false,
  savedGroups,
  onRescueSpam,
  onToggleSelect,
  onToggleStar,
  onTogglePin,
  onOpen,
  onArchive,
  onUnarchive,
  isArchiveView,
  onDelete,
  onMarkRead,
  onMarkUnread,
  canToggleRead = true,
  onSnooze,
  selfName = 'me',
}: EmailRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  /*
   * Keyboard users get the same quick actions a pointer gets on hover: the
   * row reveals `HoverActions` while it (or one of its action buttons) holds
   * focus. Without this the bar is mouse-only, which is the same unreachable
   * class of bug as hover-only on touch.
   */
  const [isRowFocused, setIsRowFocused] = useState(false);
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);
  const [showRowMenu, setShowRowMenu] = useState(false);
  /** Row-level delete always asks first — no silent deletes from the row. */
  const [confirmDeleteRow, setConfirmDeleteRow] = useState(false);
  /**
   * The label picker is opened from two doors — the hover bar's "Add label"
   * button (pointer/keyboard) and the touch "…" menu's "Label…" item — and
   * lives outside the hover AnimatePresence so the pointer leaving the row
   * doesn't kill an open picker.
   */
  const [showLabelMenu, setShowLabelMenu] = useState(false);
  const { data: availableLabels = [] } = useLabels();
  const applyLabelMutation = useApplyLabel();
  const removeLabelMutation = useRemoveLabel();
  /**
   * Label actions fan out to every message in the conversation, the same way
   * archive/mark-read treat the row as the whole conversation (and the way
   * the thread view's label flow already does). The picker toasts its own
   * success; here we only surface failures honestly and rethrow so the
   * picker doesn't claim a success that didn't happen.
   */
  const handleRowApplyLabel = useCallback(
    async (_emailId: string, labelId: string) => {
      const ids = thread.messages.map((m) => m.id);
      if (ids.length === 0) return;
      const results = await Promise.allSettled(
        ids.map((id) => applyLabelMutation.mutateAsync({ emailId: id, labelId })),
      );
      if (results.some((r) => r.status === 'rejected')) {
        showToast({ text: 'Could not apply label', type: 'error' });
        throw new Error('label apply failed');
      }
    },
    [thread.messages, applyLabelMutation],
  );
  const handleRowRemoveLabel = useCallback(
    async (_emailId: string, labelId: string) => {
      const ids = thread.messages.map((m) => m.id);
      if (ids.length === 0) return;
      const results = await Promise.allSettled(
        ids.map((id) => removeLabelMutation.mutateAsync({ emailId: id, labelId })),
      );
      if (results.some((r) => r.status === 'rejected')) {
        showToast({ text: 'Could not remove label', type: 'error' });
        throw new Error('label remove failed');
      }
    },
    [thread.messages, removeLabelMutation],
  );
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);

  const handleTouchStart = () => {
    isLongPressRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      onToggleSelect();
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(35);
      }
    }, 450);
  };

  const handleTouchMove = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const email = thread.latestEmail;
  const reducedMotion = useReducedMotion();

  const groupInfo = useMemo(() => {
    const groupSubjectMatch = thread.subject.match(/^\[group\]\s*(.+)$/i);
    if (groupSubjectMatch) {
      const parsedName = groupSubjectMatch[1].trim();
      const matched = savedGroups?.find(
        (g) => g.name.trim().toLowerCase() === parsedName.toLowerCase(),
      );
      return {
        isGroup: true,
        name: matched?.name ?? parsedName,
        color: matched?.color ?? 'var(--quant-primary)',
      };
    }
    if (savedGroups && savedGroups.length > 0) {
      const addresses = new Set(
        thread.messages
          .flatMap((m) => [m.from?.email, ...(m.to ?? []).map((t) => t.email)])
          .filter(Boolean)
          .map((e) => e.trim().toLowerCase()),
      );
      for (const group of savedGroups) {
        if (!group.emails || group.emails.length === 0) continue;
        const groupEmails = new Set(
          group.emails.map((e) => e.trim().toLowerCase()).filter(Boolean),
        );
        if (
          groupEmails.size > 0 &&
          groupEmails.size === addresses.size &&
          [...groupEmails].every((e) => addresses.has(e))
        ) {
          return {
            isGroup: true,
            name: group.name,
            color: group.color ?? 'var(--quant-primary)',
          };
        }
      }
    }
    return null;
  }, [savedGroups, thread.messages, thread.subject]);

  /*
   * Left files the conversation away (Archive), right opens the snooze time
   * picker. Delete is not a swipe action — it lives in the row's … menu and
   * the thread view, always behind a confirmation dialog. Both fire the row's
   * existing callbacks in the same frame as the visual commit.
   *
   * Off while the row is selected or either anchored menu is open: a selected
   * row belongs to the selection header's batch actions, and a row sliding out
   * from under an anchored menu would leave the menu pointing at nothing.
   */
  const swipe = useTouchSwipe({
    onArchive,
    onSnooze: () => setShowSnoozeMenu(true),
    disabled: isChecked || showSnoozeMenu || showRowMenu || showLabelMenu,
    reducedMotion,
  });

  return (
    <div className={`mail-row-shell relative ${showSnoozeMenu ? 'z-50' : ''}`}>
      {/*
        Declared before the row and given no `z-index`: two positioned siblings
        paint in source order, so the row's own opaque background covers this
        until the finger moves it. `.mail-row-shell` already clips and already
        carries the row's radius, so the pane needs neither.

        `aria-hidden` because this is the gesture's picture of itself rather than
        a control. The same two actions are named on the row's Archive button and
        in the selection header, which is where a screen reader reaches them.
      */}
      {swipe.direction && (
        <div
          aria-hidden="true"
          className={`mail-row-swipe-pane ${swipe.direction === 'archive' ? 'is-archive' : 'is-snooze'} ${
            swipe.armed ? 'is-armed' : ''
          }`}
        >
          <span className="mail-row-swipe-label" style={{ opacity: 0.45 + swipe.progress * 0.55 }}>
            {swipe.direction === 'archive' ? (
              <>
                <svg
                  className="size-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="2" y="3" width="20" height="5" rx="1" />
                  <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                  <path d="M10 12h4" />
                </svg>
                Archive
              </>
            ) : (
              <>
                <svg
                  className="size-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="13" r="8" />
                  <path d="M12 9v4l2 2" />
                </svg>
                Snooze
              </>
            )}
          </span>
        </div>
      )}
      <article
        /*
         * A11y (nested interactives): this row used to carry role=button
         * semantics, which nested real buttons — the checkbox, hover-bar
         * actions, the … menu trigger, pin/star badges — inside a button, so
         * AT announced one button containing buttons. The row is a plain
         * article now; articles may contain interactive descendants. It stays
         * a tab stop with Enter/Space handling (and the j/k cursor + Enter/o
         * shortcut system still opens rows), so keyboard users lose nothing.
         */
        tabIndex={0}
        aria-label={`Open email: ${thread.subject}`}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen();
          }
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsRowFocused(true)}
        onBlur={(event) => {
          // Focus moving between the row and its own action buttons keeps the
          // bar open; only focus leaving the row entirely closes it.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsRowFocused(false);
          }
        }}
        onTouchStart={(event) => {
          handleTouchStart();
          swipe.handlers.onTouchStart(event);
        }}
        onTouchMove={(event) => {
          handleTouchMove();
          swipe.handlers.onTouchMove(event);
        }}
        onTouchEnd={(event) => {
          handleTouchEnd();
          swipe.handlers.onTouchEnd(event);
        }}
        onTouchCancel={(event) => {
          handleTouchEnd();
          swipe.handlers.onTouchCancel(event);
        }}
        // `touch-pan-y` is what makes the gesture legal rather than a fight: the
        // browser keeps vertical scrolling and hands over the horizontal axis.
        // React binds `touchmove` passively at the root, so `preventDefault` is
        // not available to do this job — the CSS is the only lever.
        //
        // `is-swipe-settling` carries the release animation as a class instead of
        // an inline `transition`, so it cannot clobber the row's own background
        // and border transitions. It is absent exactly while a finger is down,
        // which is what keeps travel 1:1 under the thumb.
        className={`mail-row touch-pan-y ${swipe.phase === 'tracking' && !reducedMotion ? '' : 'is-swipe-settling'} ${thread.isRead ? '' : 'is-unread'} ${isActive ? 'is-active' : ''} ${isFocused ? 'is-focused' : ''} ${isHovered || showSnoozeMenu || isRowFocused ? 'has-hover-actions' : ''}`}
        style={
          swipe.offset === 0 ? undefined : { transform: `translate3d(${swipe.offset}px, 0, 0)` }
        }
        onClick={() => {
          if (!isLongPressRef.current && !swipe.wasSwipe()) onOpen();
        }}
      >
        <input
          type="checkbox"
          checked={isChecked}
          // Handled on click rather than change so the modifier keys are readable:
          // a `change` event carries no `shiftKey`. `readOnly` keeps React from
          // warning about a controlled field with no `onChange`; the box still
          // tracks `isChecked`, which the click updates.
          readOnly
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelect(event);
          }}
          aria-label={`Select conversation with ${thread.participantsSummary}`}
        />
        {/*
          Decorative avatar: tapping it opens the thread like any other part of
          the row. Selection is the checkbox's job alone (Gmail-style) — the old
          "tap avatar to select" button was a 44px mis-tap magnet that made
          single taps feel like they selected instead of opened.
        */}
        <span
          aria-hidden="true"
          className="flex shrink-0 items-center justify-center rounded-full min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
        >
          {groupInfo ? (
            <span
              className="mail-row-avatar flex size-7 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm shrink-0"
              style={{ backgroundColor: groupInfo.color || 'var(--quant-primary)' }}
              aria-hidden="true"
            >
              {groupInfo.name
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join('') || 'GP'}
            </span>
          ) : (
            <IdentityAvatar name={thread.participants[0] || selfName} size="sm" className="mail-row-avatar" />
          )}
        </span>
        <div className="mail-row-copy">
          <div className="mail-row-meta">
            <div className="flex items-center gap-1.5 min-w-0">
              {/*
                Gmail/WhatsApp contract: an unread conversation's sender is
                bold, a read one's is not. Weight is the read state — no badge
                needed to say it twice.
              */}
              <strong
                className={`truncate text-[var(--quant-foreground)] ${thread.isRead ? 'font-medium' : 'font-bold'}`}
              >
                {groupInfo?.name ?? thread.participantsSummary}
              </strong>
              {thread.count > 1 && (
                <span className="px-1.5 py-px rounded-full bg-[var(--quant-surface-elevated)] text-[10px] font-mono text-[var(--quant-muted-foreground)] shrink-0">
                  {thread.count}
                </span>
              )}
              {isSpamMode && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30 shrink-0">
                  Spam
                </span>
              )}
              {/* Unsent writing reads as a draft everywhere it surfaces (search,
                  All mail) — the same badge the Drafts tab uses. */}
              {email?.isDraft && <span className="draft-badge shrink-0">Draft</span>}
            </div>
            {/*
              Green unread pill with the thread's REAL unread count (wired from
              `ConversationThread.unreadCount` in `lib/threading` — never
              hardcoded). Replaces the bare dot: WhatsApp's contract is a
              number, not a decoration.
            */}
            {!thread.isRead && <UnreadCountPill count={thread.unreadCount} />}
            {/* P2-3: badge renders for all three mixes (mail/chat/mixed). */}
            {<ThreadKindBadge mix={thread.kindMix} />}
            {/* P1 [thread-people]: dateTime uses the guarded helper — a raw
                toISOString() THROWS on an unparseable receivedAt and took the
                whole row down; undefined omits the attribute instead. */}
            <time dateTime={safeISODateTime(thread.receivedAt)}>
              {formatReceivedAt(thread.receivedAt)}
            </time>
          </div>
          <h3 className="text-xs sm:text-sm font-medium text-[var(--quant-muted-foreground)] truncate">
            {groupInfo && thread.subject.toLowerCase() === `[group] ${groupInfo.name.toLowerCase()}`
              ? sanitizeSnippetText(email.snippet || email.bodyText) || '(no subject)'
              : sanitizeSnippetText(thread.subject) || '(no subject)'}
          </h3>
          <p className="text-xs text-[var(--quant-muted-foreground)] truncate">
            {sanitizeSnippetText(email.snippet || email.bodyText)}
          </p>
        </div>
        {/* Hover actions bar — quick actions on hover (pointer) or focus (keyboard).
            Touch devices get the same actions through the row's "…" menu below,
            because a finger has no hover. */}
        <AnimatePresence>
          {(isHovered || showSnoozeMenu || isRowFocused) && (
            <HoverActions
              emailId={thread.id}
              isRead={thread.isRead}
              isStarred={email.isStarred}
              isPinned={(email as { isPinned?: boolean }).isPinned}
              isArchived={isArchiveView || email.isArchived === true}
              onArchive={onArchive}
              onUnarchive={onUnarchive}
              onDelete={onDelete}
              onMarkRead={onMarkRead}
              onMarkUnread={onMarkUnread}
              hideReadToggle={!canToggleRead}
              onSnooze={() => setShowSnoozeMenu((prev) => !prev)}
              onToggleStar={onToggleStar}
              onTogglePin={onTogglePin}
              onLabel={() => setShowLabelMenu(true)}
              isSpam={isSpamMode}
              onRescueSpam={onRescueSpam}
            />
          )}
        </AnimatePresence>
        {/*
          Label picker — the "Add label" door for the row. Opened from the
          hover bar (pointer/keyboard) and from the touch "…" menu below.
          Rendered OUTSIDE the hover AnimatePresence so the pointer leaving
          the row doesn't kill an open picker mid-search.
        */}
        <div className="row-label-picker" onClick={(e) => e.stopPropagation()}>
          <LabelQuickApply
            emailId={thread.id}
            currentLabels={thread.labels ?? []}
            availableLabels={availableLabels}
            onApply={handleRowApplyLabel}
            onRemove={handleRowRemoveLabel}
            open={showLabelMenu}
            onOpenChange={setShowLabelMenu}
            hideTrigger
          />
        </div>
        {/* Snooze popup anchor */}
        <EmailSnooze
          // The row closes over its own id; `EmailSnooze` no longer takes one back,
          // because the selection header snoozes many conversations and had nothing
          // to hand in. `snoozeEmail` stays a shared, stable callback rather than a
          // per-row closure, so the id is bound here instead of in the props.
          onSnooze={(snoozeUntil) => onSnooze(email.id, snoozeUntil)}
          open={showSnoozeMenu}
          onOpenChange={setShowSnoozeMenu}
          triggerHidden={true}
        />
        {/* In Spam mode: prominent Not Spam rescue button directly visible on row */}
        {isSpamMode && onRescueSpam && (
          <button
            type="button"
            className="flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-xl bg-[var(--quant-primary)]/10 hover:bg-[var(--quant-primary)]/20 text-[var(--quant-primary)] hover:text-[var(--brand-accent)] border border-[var(--quant-primary)]/30 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_0_12px_rgba(255,140,66,0.1)] text-xs font-semibold transition-all min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] z-10"
            onClick={(event) => {
              event.stopPropagation();
              onRescueSpam();
            }}
            aria-label={`Rescue conversation with ${thread.participantsSummary} from spam`}
            title="Not spam — rescue to inbox"
          >
            <svg
              className="size-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="M3 10h10a5 5 0 0 1 5 5v2" />
              <path d="M7 6L3 10l4 4" />
            </svg>
            <span className="hidden sm:inline">Not spam</span>
          </button>
        )}
        {/* In Spam mode: quick delete button */}
        {isSpamMode && !isHovered && !showSnoozeMenu && !isRowFocused && (
          <button
            type="button"
            className="flex items-center justify-center shrink-0 p-1.5 rounded-xl min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-[var(--quant-muted-foreground)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
            onClick={(event) => {
              event.stopPropagation();
              setConfirmDeleteRow(true);
            }}
            aria-label="Delete permanently"
            title="Delete permanently (#)"
          >
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        )}
        {/*
          The row's "…" menu: the touch (and extra keyboard) door to the same
          quick actions the hover bar offers a pointer — Pin, Star, Mark
          read/unread, Snooze, Label, Archive, Move to Trash (behind a
          confirmation).
          Visibility is NOT width-gated: `.row-touch-menu` (shell.css) hides
          only on `(hover: hover) and (pointer: fine)`, where the hover bar
          already covers everything. A coarse pointer at ANY width — phone,
          landscape tablet, touch laptop — gets the menu, because the hover
          bar is CSS-hidden there and the row would otherwise offer zero
          actions. Swipe (Archive/Snooze) and long-press (select → bulk
          actions) remain as accelerators, not the only door.
        */}
        {!isSpamMode && (
          <div className="row-touch-menu shrink-0" onClick={(e) => e.stopPropagation()}>
            <AnchoredMenu
              icon={
                <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="12" cy="19" r="1.5" />
                </svg>
              }
              triggerLabel={`More actions for conversation with ${thread.participantsSummary}`}
              triggerTitle="More actions"
              triggerClassName="flex items-center justify-center p-1.5 rounded-xl min-h-[44px] min-w-[44px] text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-elevated)]/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
              menuLabel="Conversation actions"
              open={showRowMenu}
              onOpenChange={setShowRowMenu}
              scope="row-actions"
            >
              {(close) => (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      close();
                      onTogglePin(e);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-elevated)] hover:text-[var(--quant-primary)] rounded-lg transition-colors text-left"
                  >
                    <svg
                      className="size-3.5 shrink-0"
                      viewBox="0 0 24 24"
                      fill={
                        (email as { isPinned?: boolean }).isPinned ? 'currentColor' : 'none'
                      }
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <line x1="12" y1="17" x2="12" y2="22" />
                      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z" />
                    </svg>
                    <span>
                      {(email as { isPinned?: boolean }).isPinned
                        ? 'Unpin from top'
                        : 'Pin to top'}
                    </span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      close();
                      onToggleStar(e);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-elevated)] hover:text-[#FFC531] rounded-lg transition-colors text-left"
                  >
                    <svg
                      className="size-3.5 shrink-0"
                      viewBox="0 0 24 24"
                      fill={email.isStarred ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    >
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    <span>{email.isStarred ? 'Unstar' : 'Star'}</span>
                  </button>

                  {/* BB-P1-1: no read toggle on all-self conversations — the
                      action cannot change thread-level read state there, so
                      the item would be a dead control with a lying label. */}
                  {canToggleRead && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      close();
                      if (thread.isRead) onMarkUnread();
                      else onMarkRead();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-elevated)] rounded-lg transition-colors text-left"
                  >
                    <svg
                      className="size-3.5 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="m3 7 9 6 9-6" />
                    </svg>
                    <span>{thread.isRead ? 'Mark as unread' : 'Mark as read'}</span>
                  </button>
                  )}

                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      close();
                      setShowSnoozeMenu(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-elevated)] rounded-lg transition-colors text-left"
                  >
                    <svg
                      className="size-3.5 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="13" r="8" />
                      <path d="M12 9v4l2 2" />
                    </svg>
                    <span>Snooze…</span>
                  </button>

                  {/*
                    The label door for touch: the hover bar's "Add label"
                    button is CSS-hidden on coarse pointers, so without this
                    item the picker would be unreachable on touch.
                  */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      close();
                      setShowLabelMenu(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-elevated)] rounded-lg transition-colors text-left"
                  >
                    <svg
                      className="size-3.5 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                      <line x1="7" y1="7" x2="7.01" y2="7" />
                    </svg>
                    <span>Label…</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      close();
                      if (isArchiveView && onUnarchive) void onUnarchive();
                      else void onArchive();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-elevated)] rounded-lg transition-colors text-left"
                  >
                    <MailIcon
                      name={isArchiveView ? 'mail' : 'archive'}
                      className="size-3.5 shrink-0"
                    />
                    <span>{isArchiveView ? 'Move to inbox' : 'Archive'}</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      close();
                      setConfirmDeleteRow(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors text-left"
                  >
                    <svg
                      className="size-3.5 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                    <span>Move to Trash</span>
                  </button>
                </>
              )}
            </AnchoredMenu>
          </div>
        )}
        {/* Pin button: shown on resting row only when pinned, or on hover/focus via HoverActions */}
        {!isSpamMode &&
          (email as { isPinned?: boolean }).isPinned &&
          !isHovered &&
          !showSnoozeMenu &&
          !isRowFocused && (
            <button
              type="button"
              className="flex items-center justify-center shrink-0 p-1.5 rounded-xl transition-all min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] text-[var(--quant-primary)] fill-[var(--quant-primary)] bg-[var(--quant-primary)]/15"
              onClick={onTogglePin}
              aria-label="Unpin email"
              aria-pressed={true}
              title="Pinned to top"
            >
              <svg
                className="size-4"
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z" />
              </svg>
            </button>
          )}
        {/* Star badge: shown on resting row when starred (independent from pin) */}
        {!isSpamMode && email.isStarred && !isHovered && !showSnoozeMenu && !isRowFocused && (
          <button
            type="button"
            className="flex items-center justify-center shrink-0 p-1.5 rounded-xl transition-all min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC531] text-[#FFC531] fill-[#FFC531] bg-[#FFC531]/15"
            onClick={onToggleStar}
            aria-label="Unstar email"
            aria-pressed={true}
            title="Starred"
          >
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        )}
      </article>
      {/* Delete confirmation: no silent deletes from the row. Plain copy —
        it moves to Trash, it is not gone forever. */}
      <ConfirmDialog
        isOpen={confirmDeleteRow}
        title="Move conversation to Trash?"
        message="The conversation will be moved to Trash."
        confirmLabel="Move to Trash"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={() => {
          setConfirmDeleteRow(false);
          void onDelete();
        }}
        onCancel={() => setConfirmDeleteRow(false)}
      />
    </div>
  );
}

/**
 * Memoized inbox row.
 *
 * The parent renders per-row handler closures (`(event) => toggleSelect(thread.id,
 * event)`, …) that get fresh identities on every render, so a default shallow
 * `memo` would never bail out. The custom comparator ignores function-identity
 * churn on purpose: every handler delegates to a stable `useCallback`'d parent
 * function and closes over nothing but `thread.id`, which is covered by the
 * `thread` reference check below — a new closure over the same thread id behaves
 * identically. Rows therefore re-render only when their data actually changes.
 */
const MemoizedEmailRow = memo(
  EmailRow,
  (prev, next) =>
    prev.thread === next.thread &&
    prev.isChecked === next.isChecked &&
    prev.isActive === next.isActive &&
    prev.isFocused === next.isFocused &&
    prev.isSpamMode === next.isSpamMode &&
    prev.savedGroups === next.savedGroups &&
    prev.canToggleRead === next.canToggleRead &&
    prev.onRescueSpam === next.onRescueSpam &&
    prev.isArchiveView === next.isArchiveView &&
    prev.selfName === next.selfName,
);


/**
 * The accents a group chip can carry.
 *
 * A fixed set rather than an `<input type="color">`, which is how a strict palette
 * turns into a rainbow. Every value here already appears in this app (rose marks
 * this dialog's own errors, emerald the caught-up state), so a coloured chip still
 * belongs to the same product.
 *
 * `null` is first and is brand orange — the same colour a chip paints when the
 * group has no accent of its own. There is deliberately no separate "Orange"
 * entry: two swatches of one colour would be two controls a reader cannot tell
 * apart, and one of them would have to be labelled by something other than colour.
 */
const GROUP_ACCENTS: Array<{ value: string | null; label: string }> = [
  { value: null, label: 'Default orange' },
  { value: '#34D399', label: 'Green' },
  { value: '#60A5FA', label: 'Blue' },
  { value: '#A78BFA', label: 'Violet' },
  { value: '#FB7185', label: 'Rose' },
  { value: '#FBBF24', label: 'Amber' },
];

/** What a chip paints when the group has no accent of its own. */
const GROUP_ACCENT_DEFAULT = 'var(--quant-primary)';

/**
 * Create or edit one group.
 *
 * One dialog for both, because the fields are the same three and a separate
 * "edit group" surface is how the two drift into disagreeing about what a valid
 * name is. `group === null` creates.
 *
 * Mount it conditionally and key it on the group's id — `useState` initialisers
 * then seed the draft and there is no reset effect to get wrong. It also means the
 * focus trap's return target is captured while the button that opened it still has
 * focus, which is what sends focus back to that button on Escape.
 *
 * `onSave` and `onDelete` return promises. The dialog stays open and shows the
 * server's own message when one rejects — a duplicate name comes back as
 * `You already have a group called "Family"`, which is the sentence the user needs
 * and one this component could not write on its own.
 */
/**
 * One saved group in the strip: a wide button that writes to it, and a narrow one
 * that edits it.
 *
 * Two controls rather than one with a menu, because both are one-tap actions a
 * person repeats, and the split is what keeps composing at a single tap. They sit
 * inside one bordered shell so the pair still reads as a single chip.
 */
function GroupChip({
  group,
  onCompose,
  onEdit,
}: {
  group: ContactGroup;
  onCompose: () => void;
  onEdit: () => void;
}) {
  const count = group.emails.length;
  const accent = group.color ?? GROUP_ACCENT_DEFAULT;
  return (
    <span className="shrink-0 inline-flex items-stretch rounded-full bg-[var(--quant-surface)] border border-[var(--quant-surface-elevated)] overflow-hidden">
      <button
        type="button"
        onClick={onCompose}
        /*
          Named explicitly because the content alone announces as "Family 3" — a
          number with no unit, attached to a control whose purpose is invisible.
          The label overrides that content, so the bare count stays visible for
          sighted readers without being read as part of the name.
        */
        aria-label={
          count === 0
            ? `${group.name} — no members yet, add some to write to it`
            : `Write to ${group.name}, ${count} ${count === 1 ? 'member' : 'members'}`
        }
        title={
          count === 0
            ? `${group.name} has no members yet — add some to write to it`
            : `Write to ${group.name}: ${group.emails.slice(0, 4).join(', ')}${count > 4 ? `, +${count - 4} more` : ''}`
        }
        className="min-h-touch pl-3 pr-2.5 inline-flex items-center gap-2 text-xs font-medium text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-elevated)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--quant-primary)]"
      >
        <span
          aria-hidden="true"
          className="size-2 rounded-full shrink-0"
          style={{ background: accent }}
        />
        <span className="max-w-[10rem] truncate">{group.name}</span>
        <span className="text-[11px] font-semibold text-[var(--quant-muted-foreground)] tabular-nums">{count}</span>
      </button>
      <span aria-hidden="true" className="w-px bg-[var(--quant-surface-elevated)]" />
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit group ${group.name}`}
        title={`Edit ${group.name}`}
        className="w-11 min-h-touch inline-flex items-center justify-center text-[var(--quant-muted-foreground)] hover:text-[var(--quant-primary)] hover:bg-[var(--quant-surface-elevated)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--quant-primary)]"
      >
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
    </span>
  );
}

/**
 * WhatsApp-style archived shelf that sits above the first conversation.
 *
 * Extracted from the page body because it now has two call sites: it scrolls
 * with the virtualized list (rendered inside the sized container and measured
 * into the virtualizer's `paddingStart`), and it still has to appear on its own
 * above the loading, error and empty states, where there is no sized container.
 */
function ArchivedFolderRow({
  count,
  isViewing,
  categoryLabel,
  onToggle,
}: {
  count: number;
  isViewing: boolean;
  categoryLabel: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isViewing}
      className="w-full min-h-[44px] flex items-center justify-between gap-3 px-4 py-3 bg-[var(--quant-surface)] md:bg-black hover:bg-[var(--quant-surface-elevated)] md:hover:bg-[#0A0B0D] border-b md:border-b-0 border-[var(--quant-surface-elevated)] transition-colors select-none group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] focus-visible:ring-inset"
    >
      <span className="flex items-center gap-3 min-w-0">
        <span className="size-8 shrink-0 rounded-full bg-[var(--quant-surface-elevated)] border border-[var(--quant-surface-elevated)] flex items-center justify-center text-[var(--quant-muted-foreground)] group-hover:text-[var(--quant-primary)] transition-colors">
          <MailIcon name={isViewing ? 'mail' : 'archive'} className="size-4" />
        </span>
        <span className="flex flex-col min-w-0">
          <span className="text-sm font-semibold text-[var(--quant-foreground)] truncate">
            {isViewing ? 'Back to inbox' : 'Archived'}
          </span>
          {/*
            The secondary tier, not the tertiary one: `#6B6E76` at 11px measures
            3.64:1 on this surface, under the 4.5:1 small text needs. It still
            reads as the quieter of the two lines because the line above it is
            larger and semibold.
          */}
          <span className="text-[11px] text-[var(--quant-muted-foreground)] truncate">
            {isViewing
              ? `Viewing archived ${categoryLabel}`
              : `${count} archived conversation${count === 1 ? '' : 's'}`}
          </span>
        </span>
      </span>
      <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--quant-primary)]/15 text-[var(--quant-primary)] border border-[var(--quant-primary)]/30 shadow-[0_0_10px_rgba(255,140,66,0.12)]">
        {count}
      </span>
    </button>
  );
}

function InboxPageContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { openPalette } = useKeyboardSurfaces();
  const lensParam = searchParams?.get('lens');
  /**
   * Normalises a `lens` query param into the lens it selects. The top strip
   * (QuantPillarTopBar) spells two of its lenses differently from the inbox's
   * own vocabulary — `promos` for `promotions` — and adds `important` and
   * `teams`, which the inbox now understands. Anything unrecognised selects
   * `all` rather than stranding the list on a lens that filters nothing.
   *
   * U3.1: a `folder_*` key is accepted syntactically here, without checking
   * it against the loaded folders — the normaliser runs before the folder
   * list exists (initial state and the sync effect both precede the load),
   * so validating here would bounce every folder deep link against an empty
   * list. Existence is reconciled after load by the folders-loaded effect
   * below instead. `drafts` is deliberately NOT accepted: the Drafts pill is
   * gone and drafts live at /drafts, so a stale `?lens=drafts` is redirected
   * to the canonical All view by the sync effect, not silently mapped.
   */
  const normalizeLensParam = (p: string | null): InboxLens =>
    normalizeLensParamLib(p) as InboxLens;
  const [activeLens, setActiveLens] = useState<InboxLens>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('lens');
      return normalizeLensParam(p);
    }
    return 'all';
  });

  const tabParam = searchParams?.get('tab');
  /**
   * Tracks whether the current Pinned (starred) filter chip was applied by the
   * ?filter=starred deep link (see the effect below). The chip is also user-
   * toggleable, so the "clear" branch below must only fire when the deep link
   * was the one that set it — a blanket clear would wipe a hand-picked filter
   * on any param change (e.g. switching lens tabs).
   */
  const deepLinkedStarredFilterRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'inbox' | 'archive'>(() => {
    if (typeof window !== 'undefined') {
      const t = new URLSearchParams(window.location.search).get('tab');
      if (t === 'archive') return t;
    }
    return 'inbox';
  });

  useEffect(() => {
    // U3.1: a leftover `?lens=drafts` deep link (or saved state) must not sit
    // in the address bar while the list shows All — the Drafts pill is gone
    // and drafts live at /drafts. Replace to the canonical All view instead
    // of leaving a stale param, and return early: the next pass runs with the
    // clean URL and handles tab/starred from there. Only `drafts` gets this
    // redirect; garbage lenses keep the default->all state mapping with the
    // URL untouched. Replace, never push, so Back does not step through it.
    if (resolveLensSync(searchParams?.get('lens')).redirectToAll) {
      setActiveLens('all');
      router.replace(inboxResetTarget(), { scroll: false });
      return;
    }
    setActiveLens(normalizeLensParam(searchParams?.get('lens')));
    const t = searchParams?.get('tab');
    if (t === 'archive') {
      setActiveTab('archive');
      setShowArchivedView(true);
    } else {
      setActiveTab('inbox');
      setShowArchivedView(false);
    }
    // Deep-link support: ?filter=starred applies the Pinned filter chip. Clear
    // it again only when the deep link was the one that applied it (see
    // deepLinkedStarredFilterRef) — navigating from /?view=inbox&filter=starred
    // back to a plain /?view=inbox must not leave the Pinned filter stuck on.
    const decision = reconcileStarredFilterParam(
      searchParams?.get('filter'),
      deepLinkedStarredFilterRef.current,
    );
    if (decision === 'apply') {
      setActiveFilters(new Set(['starred' as InboxFilter]));
      deepLinkedStarredFilterRef.current = true;
    } else if (decision === 'clear') {
      setActiveFilters(new Set());
      deepLinkedStarredFilterRef.current = false;
    }
  }, [searchParams, router]);

  /*
   * CUST-P1-4: `x` (select) in a thread view navigates here with
   * `?view=inbox&selected=<threadId>` (see inboxSelectTarget), plus
   * `&lens=spam` when the source thread was opened in the spam lens — the
   * pre-select only matches rows in the current lens corpus, so without the
   * lens a spam-only thread would pre-select nothing. Pre-select that
   * conversation for bulk actions, then drop the param so a refresh does not
   * re-select.
   */
  useEffect(() => {
    const selected = searchParams?.get('selected');
    if (!selected) return;
    setSelectedIds(new Set([selected]));
    const url = new URL(window.location.href);
    url.searchParams.delete('selected');
    router.replace(url.pathname + url.search + url.hash, { scroll: false });
  }, [searchParams, router]);

  useEffect(() => {
    const handleSubtabChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ pillar?: string; tabId?: string }>;
      if (customEvent.detail?.pillar === 'mail') {
        const id = customEvent.detail.tabId;
        if (id === 'archive') {
          setActiveTab('archive');
          setShowArchivedView(true);
          // Keep ?view=inbox — dropping it renders the People view at /.
          router.push('/?view=inbox&tab=archive');
        } else if (id === 'inbox') {
          setActiveTab('inbox');
          setShowArchivedView(false);
          router.push('/?view=inbox');
        }
      }
    };
    window.addEventListener('quant:subtab-change', handleSubtabChange);
    return () => window.removeEventListener('quant:subtab-change', handleSubtabChange);
  }, [router]);

  const [activeTurn, setActiveTurn] = useState<InboxTurn>('any');
  const [activeFilters, setActiveFilters] = useState<Set<InboxFilter>>(() => new Set());
  /**
   * U3.4: the committed category narrowing. It persists across lens
   * changes exactly like turn/filters (lens switches clear `q` only),
   * and it is NOT in the URL — same as turn/filters. The picker
   * edits a draft (`draftCategories`) that only becomes this state
   * on Apply; Cancel/X abandons the draft.
   */
  const [activeCategories, setActiveCategories] = useState<Set<SelectableCategory>>(() => new Set());
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [draftCategories, setDraftCategories] = useState<Set<SelectableCategory>>(() => new Set());
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  /**
   * Closing the popover has to put focus back where it came from. Escape on a menu
   * that leaves focus on a detached node drops a keyboard user at the top of the
   * document, which is a longer way back to the list than they were before they
   * opened it.
   */
  const filterTriggerRef = useRef<HTMLButtonElement | null>(null);
  const turnGroupLabelId = useId();
  /**
   * The popover's other two names. `turnGroupLabelId` already ties `Whose turn` to
   * its radiogroup; `filterGroupLabelId` does the same for `Narrow this view`,
   * which was a heading in name only — the toggles under it were loose siblings
   * of a paragraph, so a reader met them one at a time with nothing saying what
   * they had in common or where the group ended.
   *
   * `filterPanelId` is what the trigger points `aria-controls` at, and it is
   * attached only while the panel is mounted: the popover unmounts on close, so a
   * permanent `aria-controls` would be an IDREF to nothing for as long as the
   * inbox is at rest.
   */
  const filterGroupLabelId = useId();
  const filterPanelId = useId();
  /**
   * SIA-P2-6: the search-folder scope chip. Search answers from the whole
   * mailbox by default ("All mail"); the chip narrows back to one folder.
   * The menu is the same disclosure pattern as the filter popover (button +
   * absolutely positioned radiogroup, outside-click/Escape dismiss below).
   */
  const [searchFolder, setSearchFolder] = useState<SearchFolderScope>(() =>
    typeof window === 'undefined'
      ? 'all'
      : normalizeSearchFolderParam(new URLSearchParams(window.location.search).get('sf')),
  );
  const [isScopeMenuOpen, setIsScopeMenuOpen] = useState(false);
  const scopeMenuRef = useRef<HTMLDivElement | null>(null);
  const scopeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const scopePanelId = useId();
  /**
   * The tablist's other half. A `role="tab"` owes a reader the thing it controls —
   * `aria-controls` is required on a tab, not advisory — and without it the chips
   * announce "Unread, tab, 2 of 4, selected" attached to nothing: no relationship
   * to the list below, and no "move to controlled element" jump in NVDA or JAWS.
   *
   * One panel for four tabs, because the tabs swap one list in place rather than
   * revealing four. The panel is the scroll container, which is the element that
   * always exists — the windowed list, the six skeletons, the error and all five
   * empty states come and go inside it, so an id on any of those would dangle for
   * most of the inbox's life. Its label follows the selection, so entering the
   * region says which slice you are about to read.
   */
  const lensPanelId = useId();
  const lensTabBaseId = useId();
  const lensTabId = useCallback((lens: InboxLens) => `${lensTabBaseId}-${lens}`, [lensTabBaseId]);
  /**
   * The chips are a tablist and the turn rows are a radiogroup, so one arrow key
   * must move the selection along each — a `role="tablist"` whose members are only
   * reachable by Tab is a lie to a screen reader and a slower path for everyone
   * else. Focus has to be moved imperatively after the state change, which needs
   * the elements.
   */
  const lensChipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const turnRowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  /*
   * REG-3: the inbox header search filters inline and never touched the URL,
   * so ?q= stayed bare quantmail.in/ (BB-P1-10's fix only covered the
   * dedicated /search page). Seed from ?q= at mount and keep it in sync on
   * the debounced value — replace, not push, so typing doesn't stack
   * history entries. Seeded via the state initializer (SSR-safe) instead of
   * a mount-only useEffect, so no react-hooks/exhaustive-deps disable
   * comment is needed (that plugin isn't configured in this repo).
   */
  const [searchQuery, setSearchQuery] = useState<string>(() =>
    typeof window === 'undefined'
      ? ''
      : (new URLSearchParams(window.location.search).get('q') ?? ''),
  );
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showArchivedView, setShowArchivedView] = useState(false);
  /*
   * BB-P2-6: the archived view used to live only in client state, so opening
   * a thread (which navigates to /thread/:id?returnTo=...) and coming back,
   * refreshing, or sharing the link silently dropped the user in the inbox —
   * and the thread view's back button always said "Back to inbox" even when
   * the user came from Archived. `archived=1` makes the view addressable:
   * the thread page's returnTo preserves it, and the back button can label
   * the real destination. The URL is the source of truth (so the People|Inbox
   * toggle link, which navigates without the param, also exits the view);
   * the second effect writes toggles back with replace, never pushing history.
   */
  const archivedParam = searchParams?.get('archived') === '1';
  useEffect(() => {
    setShowArchivedView(archivedParam);
  }, [archivedParam]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (showArchivedView) url.searchParams.set('archived', '1');
    else if (url.searchParams.has('archived')) url.searchParams.delete('archived');
    else return;
    router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  }, [showArchivedView, router]);
  /**
   * What the group editor is open on: `null` closed, `'new'` creating, a group to
   * edit that one. One tri-state rather than an `isOpen` plus a nullable target,
   * because those two can disagree — open with no target, or a stale target left
   * behind after a close — and the dialog is mounted from this value alone.
   */
  const [groupEditorTarget, setGroupEditorTarget] = useState<ContactGroup | 'new' | null>(null);
  /** Instant WhatsApp-style quick group chat target */
  const [quickGroupChatTarget, setQuickGroupChatTarget] = useState<ContactGroup | null>(null);
  const [quickChatMessage, setQuickChatMessage] = useState('');
  // NOTE: the in-flight flag for the quick group-chat deck lives inside
  // QuickGroupChatDeck now (the deck sends through the shared undo queue,
  // so the API call fires up to 10s after Send is pressed).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [selectedThread, setSelectedThread] = useState<ConversationThread | null>(null);
  const selectedThreadId = selectedThread?.id || selectedEmail?.id || null;

  // Custom Folders & Filter Lenses
  // Backend (`/api/folders`) is the source of truth so folders sync
  // cross-device; localStorage stays as an offline cache plus the device-local
  // filter sidecar (see `readFolderFilters`). The mount effect below replaces
  // this cache with the backend list and migrates any legacy local-only
  // folders up to the server.
  const [customFolders, setCustomFolders] = useState<CustomFolder[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(FOLDERS_CACHE_KEY);
        if (saved) return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return [];
  });
  const [isAddFolderModalOpen, setIsAddFolderModalOpen] = useState(false);
  /**
   * U3.1: gates the folder-lens reconciliation below. The initial list is the
   * localStorage cache, which may be stale (a folder deleted on another
   * device) or empty (first load) — reconciling against it would bounce
   * valid folder deep links. Only the backend load completing, or failing
   * outright (in which case the cache is the best list available), counts
   * as loaded; it is never set while the fetch is still in flight.
   */
  const [foldersLoaded, setFoldersLoaded] = useState(false);

  /**
   * U3.1 F1: folders created optimistically in this mount session while the
   * mount load effect below is still in flight. The load effect reads its
   * localStorage snapshot before its async migration finishes, so a folder
   * created after that read would otherwise be lost when the effect calls
   * setCustomFolders(merged), and reconciliation would then bounce its lens
   * to All. This ref holds only this-session optimistic rows (temp
   * `custom_<ts>` ids, replaced by the saved backend id on create success),
   * never the cache snapshot — so it cannot resurrect a folder deleted on
   * another device, which a naive union with the stale cache would. Entries
   * are consumed (and cleared) by the load effect's merge; entries added
   * after the load has finished are inert, because the effect runs once.
   */
  const inFlightOptimisticFoldersRef = useRef<Map<string, CustomFolder>>(new Map());

  /**
   * Load folders from the backend on mount and migrate legacy device-local
   * folders (`custom_*` ids, created before the backend sync existed) up to
   * the server. Backend wins on name conflicts; anything that fails to migrate
   * stays local so no user data is ever dropped.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let backendFolders: EmailFolder[];
      try {
        const res = await apiClient.getFolders();
        if (!res.success || !res.data) {
          // U3.1: load failed — the cache is the best list available.
          setFoldersLoaded(true);
          return;
        }
        backendFolders = res.data.filter((f) => f.type === 'CUSTOM');
      } catch {
        // U3.1: load failed — the cache is the best list available.
        setFoldersLoaded(true);
        return;
      }
      if (cancelled) return;

      const filters = readFolderFilters();
      let localCache: CustomFolder[] = [];
      try {
        const saved = localStorage.getItem(FOLDERS_CACHE_KEY);
        if (saved) localCache = JSON.parse(saved);
      } catch {
        // ignore
      }

      // Migrate legacy local-only folders to the backend.
      const legacy = localCache.filter((f) => f.id.startsWith('custom_'));
      const migratedIds = new Set<string>();
      for (const folder of legacy) {
        if (cancelled) return;
        if (
          backendFolders.some((b) => b.name.toLowerCase() === folder.name.toLowerCase())
        ) {
          // Backend already has this name — adopt the backend row, keep the
          // local filter metadata under the backend id.
          const match = backendFolders.find(
            (b) => b.name.toLowerCase() === folder.name.toLowerCase(),
          )!;
          filters[match.id] = {
            filterType: folder.filterType,
            filterValue: folder.filterValue,
          };
          migratedIds.add(folder.id);
          continue;
        }
        try {
          const created = await apiClient.createFolder({
            name: folder.name,
            color: folder.color,
          });
          if (created.success && created.data) {
            backendFolders.push(created.data);
            filters[created.data.id] = {
              filterType: folder.filterType,
              filterValue: folder.filterValue,
            };
            migratedIds.add(folder.id);
          }
        } catch {
          // Keep it local; a later mount retries.
        }
      }
      if (cancelled) return;

      let merged = backendFolders.map((b) => fromBackendFolder(b, filters[b.id]));
      // Preserve legacy folders that failed to migrate so nothing is lost.
      for (const folder of legacy) {
        if (!migratedIds.has(folder.id)) merged.push(folder);
      }
      // U3.1 F1: preserve in-flight optimistic rows created after the
      // localCache read above (see inFlightOptimisticFoldersRef). These are
      // this-session creations only, not cache entries, so no deleted folder
      // is resurrected. Consumed here; the ref is cleared after the merge.
      // Delegates to src/lib/inbox-lens.ts (pinned by the U3.1 tests).
      merged = mergeInFlightFolders(merged, inFlightOptimisticFoldersRef.current.values());
      inFlightOptimisticFoldersRef.current.clear();
      writeFolderFilters(filters);
      persistFoldersCache(merged);
      setCustomFolders(merged);
      // U3.1: the merged backend list is now the list to reconcile against.
      setFoldersLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * U3.1: post-load folder-lens reconciliation (companion to the syntactic
   * prefix-accept in `normalizeLensParam`). Once the folder list has actually
   * loaded, a `folder_<id>` lens whose id is in no loaded folder — a deleted
   * folder's deep link, a stale saved state — is reset to All with a clean
   * replace to /?view=inbox, instead of sitting on a lens that filters
   * nothing while the URL claims a folder. Gated on `foldersLoaded`, never
   * on the initial (possibly empty or stale-cache) list. Once `foldersLoaded`
   * is true, a just-created folder cannot bounce: in-flight optimistic rows
   * are preserved into the merged list via `inFlightOptimisticFoldersRef`
   * (U3.1 F1), so the lens id is present when reconciliation runs. Replace,
   * never push, so Back does not step through the reset.
   */
  useEffect(() => {
    if (reconcileFolderLens(activeLens, foldersLoaded, customFolders) === 'keep') return;
    setActiveLens('all');
    router.replace(inboxResetTarget(), { scroll: false });
  }, [foldersLoaded, activeLens, customFolders, router]);

  /**
   * U3.1: folder-tab overflow. At most four folder tabs render inline; the
   * rest live in the "+N more" menu, which holds menu items, not duplicate
   * tabs. The active folder is never hidden: if it would fall past the cut,
   * it is promoted into the visible four, displacing the last visible folder
   * into the menu, and the overflow count reflects the menu size after that
   * promotion. Presentation only — no counts, no sidecar, no lens-key change.
   */
  const MAX_VISIBLE_FOLDER_TABS = 4;
  const { visibleFolders, overflowFolders } = useMemo(() => {
    const visible = customFolders.slice(0, MAX_VISIBLE_FOLDER_TABS);
    const activeFolderId =
      typeof activeLens === 'string' && activeLens.startsWith('folder_')
        ? activeLens.replace('folder_', '')
        : null;
    const activeFolder = activeFolderId
      ? customFolders.find((folder) => folder.id === activeFolderId)
      : undefined;
    if (activeFolder && !visible.some((folder) => folder.id === activeFolder.id)) {
      const promoted = [...customFolders.slice(0, MAX_VISIBLE_FOLDER_TABS - 1), activeFolder];
      const visibleIds = new Set(promoted.map((folder) => folder.id));
      return {
        visibleFolders: promoted,
        overflowFolders: customFolders.filter((folder) => !visibleIds.has(folder.id)),
      };
    }
    const visibleIds = new Set(visible.map((folder) => folder.id));
    return {
      visibleFolders: visible,
      overflowFolders: customFolders.filter((folder) => !visibleIds.has(folder.id)),
    };
  }, [customFolders, activeLens]);

  /**
   * U3.1: the single roving index space for the tablist — the four lens pills
   * followed by the visible folder tabs. Overflow menu items are not tabs and
   * are not in this space; the menu has its own arrow handling. The pill and
   * folder refs share `lensChipRefs` in this order, so `onLensKeyDown` walks
   * one continuous strip.
   */
  const combinedLensKeys = useMemo(
    () =>
      combinedLensKeysHelper(
        INBOX_LENSES.map((lens) => lens.key),
        visibleFolders,
      ),
    [visibleFolders],
  );

  const handleCreateFolder = useCallback(async (draft: FolderDraft) => {
    const tempId = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const optimistic: CustomFolder = {
      id: tempId,
      name: draft.name.trim(),
      color: draft.color || 'var(--quant-primary)',
      filterType: draft.filterType,
      filterValue: draft.filterValue?.trim() || '',
      createdAt: Date.now(),
    };

    // Optimistic add so the UI feels instant. U3.1 F1: register the row in
    // the in-flight ref so the mount load effect's merge cannot drop it
    // if that effect finishes after this creation.
    inFlightOptimisticFoldersRef.current.set(tempId, optimistic);
    setCustomFolders((prev) => {
      const next = [...prev, optimistic];
      persistFoldersCache(next);
      return next;
    });
    setIsAddFolderModalOpen(false);
    setActiveLens(`folder_${tempId}`);

    try {
      const res = await apiClient.createFolder({
        name: optimistic.name,
        color: optimistic.color,
      });
      if (!res.success || !res.data) {
        throw new Error(res.error?.message || 'Could not save folder');
      }
      const saved = fromBackendFolder(res.data, {
        filterType: optimistic.filterType,
        filterValue: optimistic.filterValue,
      });
      const filters = readFolderFilters();
      filters[saved.id] = {
        filterType: optimistic.filterType,
        filterValue: optimistic.filterValue,
      };
      writeFolderFilters(filters);
      // U3.1 F1: the saved id replaces the temp id in the in-flight ref, so
      // a load-effect merge finishing after this success preserves the saved
      // row (and the new lens id) instead of the temp row.
      inFlightOptimisticFoldersRef.current.delete(tempId);
      inFlightOptimisticFoldersRef.current.set(saved.id, saved);
      setCustomFolders((prev) => {
        const next = prev.map((f) => (f.id === tempId ? saved : f));
        persistFoldersCache(next);
        return next;
      });
      setActiveLens(`folder_${saved.id}`);
      showToast({ text: `Folder "${saved.name}" created`, type: 'success' });
    } catch (error) {
      // Roll back the optimistic add — the folder was never saved. U3.1 F1:
      // drop it from the in-flight ref too, so a later load-effect merge
      // cannot resurrect it and reconciliation can reset the lens to All.
      inFlightOptimisticFoldersRef.current.delete(tempId);
      setCustomFolders((prev) => {
        const next = prev.filter((f) => f.id !== tempId);
        persistFoldersCache(next);
        return next;
      });
      const message = error instanceof Error ? error.message : 'Could not save folder';
      showToast({ text: `Couldn't create folder: ${message}`, type: 'error' });
    }
  }, []);

  /** Conversation the next shift-click extends from. See `toggleSelect`. */
  const selectionAnchorId = useRef<string | null>(null);
  // The scroll container is needed as state by the virtualizer (so it re-measures
  // the moment the list mounts behind the loading state) and as a ref by the
  // pull-to-refresh touch handler, which reads `scrollTop` synchronously.
  const {
    element: listElement,
    ref: listRef,
    elementRef: listElementRef,
  } = useScrollElement<HTMLDivElement>();
  const {
    data: allEmails,
    isLoading,
    error,
    refetch,
    loadMore,
    hasMore,
    isLoadingMore,
  } = useInbox({
    folderType: 'INBOX',
  });
  const { data: archivedEmails } = useInbox({ folderType: 'ARCHIVE' });
  const { data: spamEmails, refetch: refetchSpam } = useInbox({ folderType: 'SPAM' });
  const { data: snoozedEmails, refetch: refetchSnoozed } = useInbox({ folderType: 'SNOOZED' });
  const { data: searchResults, isLoading: isSearching } = useSearchEmails(
    debouncedQuery ? { query: debouncedQuery } : null,
  );
  /**
   * The address book, for the `Contacts` lens.
   *
   * Fetched eagerly rather than on first use of that chip, because the chip carries
   * a count and a count that appears a round trip after the chip is a worse lie
   * than a slightly wider first paint: one unpaginated projection of addresses, a
   * five-minute `staleTime`, and no polling, against two inbox queries that poll
   * every thirty seconds.
   *
   * `isPending` is kept because "no contacts in this view" and "the address book
   * has not arrived" are different statements and the count badge must not make
   * the second look like the first.
   */
  const { data: contactDirectory, isPending: isDirectoryPending } = useContactDirectory();
  const savedContactsList = useMemo(() => {
    if (!contactDirectory) return [];
    return Array.from(contactDirectory.keys()).map((email) => ({ email }));
  }, [contactDirectory]);
  /**
   * The saved groups, for the strip inside the `Groups` lens.
   *
   * Fetched with the page rather than on first use of that chip for the same reason
   * as the directory above: the strip carries a count per group, and a count that
   * arrives a round trip after the chip is worse than a marginally wider first
   * paint. One unpaginated list, a five-minute `staleTime`, no polling.
   *
   * `isPending` is kept apart from `length === 0` because "you have no groups" and
   * "your groups have not arrived" are different sentences, and the empty state
   * below invites the user to create their first group — an invitation that must
   * not appear while the answer is still in flight.
   */
  const {
    data: contactGroups,
    isPending: areGroupsPending,
    error: groupsError,
  } = useContactGroups();
  const createGroup = useCreateContactGroup();
  const updateGroup = useUpdateContactGroup();
  const deleteGroup = useDeleteContactGroup();
  // `?? []` allocates a fresh empty array every render, which would defeat the
  // EmailRow memo comparator — memoize it so row props stay referentially stable.
  const savedGroups = useMemo(() => contactGroups ?? [], [contactGroups]);

  useEffect(() => {
    const handleEditGroup = (event: Event) => {
      const customEvent = event as CustomEvent<{ groupId?: string }>;
      const groupId = customEvent.detail?.groupId;

      if (!groupId) return;

      const group = savedGroups.find((candidate) => candidate.id === groupId);
      if (group) setGroupEditorTarget(group);
    };

    window.addEventListener('quantmail:edit-contact-group', handleEditGroup as EventListener);

    return () => {
      window.removeEventListener('quantmail:edit-contact-group', handleEditGroup as EventListener);
    };
  }, [savedGroups]);

  // Superhuman Docked Composer State
  const [isDockedComposerOpen, setIsDockedComposerOpen] = useState(false);
  const [dockedComposerInitialTo, setDockedComposerInitialTo] = useState('');
  const [dockedComposerInitialSubject, setDockedComposerInitialSubject] = useState('');
  const [dockedComposerInitialBody, setDockedComposerInitialBody] = useState('');
  const [dockedComposerReplyToId, setDockedComposerReplyToId] = useState<string | undefined>(undefined);
  const [dockedComposerInitialKind, setDockedComposerInitialKind] = useState<'mail' | 'chat'>('mail');

  const handleOpenCompose = useCallback(
    (options?: { to?: string; subject?: string; body?: string; replyToId?: string; kind?: 'mail' | 'chat' }) => {
      const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
      if (isDesktop) {
        if (options?.to !== undefined) setDockedComposerInitialTo(options.to);
        if (options?.subject !== undefined) setDockedComposerInitialSubject(options.subject);
        if (options?.body !== undefined) setDockedComposerInitialBody(options.body);
        if (options?.replyToId !== undefined) setDockedComposerReplyToId(options.replyToId);
        setDockedComposerInitialKind(options?.kind === 'chat' ? 'chat' : 'mail');
        setIsDockedComposerOpen(true);
      } else {
        let url = '/compose';
        const params = new URLSearchParams();
        if (options?.to) params.set('to', options.to);
        if (options?.subject) params.set('subject', options.subject);
        if (options?.replyToId) params.set('replyTo', options.replyToId);
        if (options?.kind === 'chat') params.set('kind', 'chat');
        const q = params.toString();
        if (q) url += `?${q}`;
        router.push(url);
      }
    },
    [router],
  );

  useEffect(() => {
    const onComposeEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ to?: string; subject?: string; body?: string; replyToId?: string }>;
      handleOpenCompose(customEvent.detail);
    };
    window.addEventListener('quant:compose:open', onComposeEvent);
    return () => window.removeEventListener('quant:compose:open', onComposeEvent);
  }, [handleOpenCompose]);

  /**
   * Write to a group. The chip is the compose surface, so this is what "using" a
   * saved group means.
   *
   * No subject is injected. The version this replaced pushed
   * `?subject=[GroupName]%20`, which was the app writing the user's subject line
   * for them — it existed because a create flow that stored nothing had to do
   * *something* on submit to look like it had worked.
   *
   * A group with no members opens the editor instead of composing to nobody.
   */
  const composeToGroup = useCallback(
    (group: ContactGroup) => {
      if (group.emails.length === 0) {
        showToast({
          text: `"${group.name}" has no members yet — add some to write to it`,
          type: 'warning',
          subject: `group:${group.id}`,
        });
        setGroupEditorTarget(group);
        return;
      }
      handleOpenCompose({ to: group.emails.join(',') });
    },
    [handleOpenCompose],
  );

  /**
   * Create or update, then close.
   *
   * Rejections are left to propagate: the dialog awaits this, and a duplicate name
   * is a correctable mistake, so it stays open showing the server's own sentence
   * rather than closing and discarding everything typed into it.
   */
  const handleSaveGroup = useCallback(
    async (draft: GroupDraft) => {
      const editing = groupEditorTarget && groupEditorTarget !== 'new' ? groupEditorTarget : null;
      if (editing) {
        const saved = await updateGroup.mutateAsync({ id: editing.id, data: draft });
        setGroupEditorTarget(null);
        showToast({
          text: `Saved "${saved.name}"`,
          type: 'success',
          subject: `group:${saved.id}`,
        });
        return;
      }
      const created = await createGroup.mutateAsync(draft);
      setGroupEditorTarget(null);
      showToast({
        text: `Group "${created.name}" saved with ${created.emails.length} member${
          created.emails.length === 1 ? '' : 's'
        }`,
        type: 'success',
        subject: `group:${created.id}`,
      });
    },
    [createGroup, groupEditorTarget, updateGroup],
  );

  /**
   * Delete, with the group recoverable from the toast and from `z`.
   *
   * Undo re-creates rather than un-deletes, because the row is gone — there is no
   * soft delete on `contact_groups`. The rebuilt group gets a new id, which matters
   * to nothing the user can see: a group here *is* its name, its members and its
   * accent, and all three come back. The failure branch says so out loud instead of
   * letting a silent rejection look like a successful undo.
   */
  const handleDeleteGroup = useCallback(
    async (group: ContactGroup) => {
      await deleteGroup.mutateAsync(group.id);
      setGroupEditorTarget(null);
      showToast({
        text: `Deleted "${group.name}"`,
        type: 'info',
        subject: `group:${group.id}`,
        undoAction: () => {
          createGroup
            .mutateAsync({
              name: group.name,
              emails: group.emails,
              color: group.color ?? null,
            })
            .then(() => {
              showToast({
                text: `Restored "${group.name}"`,
                type: 'success',
                subject: `group:${group.id}`,
              });
            })
            .catch((restoreError: unknown) => {
              showToast({
                text:
                  restoreError instanceof Error
                    ? restoreError.message
                    : `Could not restore "${group.name}"`,
                type: 'error',
                subject: `group:${group.id}`,
              });
            });
        },
      });
    },
    [createGroup, deleteGroup],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(searchQuery.trim()), 260);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  /*
   * Keep ?q= in sync on the debounced value — replace, not push, so typing
   * doesn't stack history entries. The pure decision (set vs drop vs no-op)
   * lives in `syncSearchParam` so the CUST-P1-6 contract is unit-tested.
   */
  useEffect(() => {
    const target = syncSearchParam(window.location.href, debouncedQuery);
    if (target !== null) router.replace(target, { scroll: false });
  }, [debouncedQuery, router]);

  /*
   * SIA-P2-6: every freshly typed search starts at "All mail" — the scope chip
   * then reflects only the user's deliberate narrowing, never a stale scope
   * from the previous search. The ref is seeded from ?q= so a deep-linked
   * search (?q=…&sf=…) isn't mistaken for a brand-new one on mount.
   */
  const prevQueryForScopeRef = useRef<string>(
    typeof window === 'undefined'
      ? ''
      : (new URLSearchParams(window.location.search).get('q') ?? ''),
  );
  useEffect(() => {
    if (prevQueryForScopeRef.current === '' && debouncedQuery !== '') {
      setSearchFolder('all');
    }
    prevQueryForScopeRef.current = debouncedQuery;
  }, [debouncedQuery]);

  /*
   * SIA-P2-6: keep `sf` coherent with `q` — the same replace-not-push contract
   * as `syncSearchParam` (pure decision in `syncSearchFolderParam`, unit-tested).
   * The scope is meaningless without a query, so it is only written while one
   * is active; dropping the query drops the scope with it. The `searchQuery`
   * guard skips the run where a query is typed but not yet debounced, so a
   * deep-linked ?q=…&sf=… isn't stripped and re-added on mount.
   */
  useEffect(() => {
    if (!debouncedQuery && searchQuery) return;
    const target = syncSearchFolderParam(
      window.location.href,
      debouncedQuery ? searchFolder : 'all',
    );
    if (target !== null) router.replace(target, { scroll: false });
  }, [debouncedQuery, searchFolder, searchQuery, router]);

  const { user: currentUser } = useAuth();
  const currentEmail = currentUser?.email || '';
  // Same precedence as the sidebar AccountBadge, so "you" looks the same
  // everywhere your own avatar appears.
  const selfAvatarName =
    currentUser?.displayName || currentUser?.username || currentEmail.split('@')[0] || 'me';

  /**
   * The ids the server matched.
   *
   * The server searches the whole mailbox and reads full message bodies; the client
   * holds two folders and mostly snippets. So a server hit is authoritative even when
   * the local match fails, and it is passed to `filterThreadsByQuery` to be kept.
   */
  const serverHitIds = useMemo(() => {
    if (!debouncedQuery) return undefined;
    return new Set((searchResults ?? []).map((m) => m.id).filter(Boolean));
  }, [debouncedQuery, searchResults]);

  /**
   * SIA-P2-6: what a query is answered from — the whole mailbox, not the
   * current view's pool.
   *
   * The backend (`GET /search/emails`) is folder-agnostic — no folder param on
   * the request, no folder filter in the query — so the client's four folder
   * queries plus the server hits are the full answer. The old corpus widened
   * only the *inbox* pool (and deliberately dropped archived hits), so an
   * Archive-view search never saw inbox results and an Inbox search never saw
   * archived ones: the bug this fixes.
   *
   * One grouping pass still rebuilds whole conversations from the union,
   * exactly as the unsearched inbox does — the response is one page of loose
   * messages, so replacing the corpus with it would lose the rest of each
   * conversation and the participants, counts and focus computed from them.
   */
  const searchCorpus = useMemo(() => {
    if (!debouncedQuery) return null;
    const seen = new Set<string>();
    const corpus: Email[] = [];
    const add = (list: Email[] | undefined) => {
      for (const m of list ?? []) {
        if (!m?.id || seen.has(m.id)) continue;
        seen.add(m.id);
        corpus.push(m);
      }
    };
    add(allEmails);
    add(archivedEmails);
    add(spamEmails);
    add(snoozedEmails);
    add(searchResults);
    return corpus;
  }, [debouncedQuery, allEmails, archivedEmails, spamEmails, snoozedEmails, searchResults]);

  /**
   * Folder attribution for the scope chip, by membership in the folder
   * queries — the client's ground truth. A server hit the client holds in no
   * folder (e.g. past the first page of a folder query) is unknown-folder:
   * it appears under "All mail" and under no narrowed scope, because a
   * narrowed scope must only claim mail it knows is in that folder.
   */
  const searchFolderIdSets = useMemo(
    () => ({
      inbox: new Set((allEmails ?? []).map((m) => m.id)),
      archive: new Set((archivedEmails ?? []).map((m) => m.id)),
      spam: new Set((spamEmails ?? []).map((m) => m.id)),
      snoozed: new Set((snoozedEmails ?? []).map((m) => m.id)),
    }),
    [allEmails, archivedEmails, spamEmails, snoozedEmails],
  );

  /**
   * The search answer: whole-mailbox threads matching the query (local text
   * match or a server hit), narrowed to the scope chip's folder when the user
   * narrowed. A conversation can span folders — a reply archived while the
   * original sits in the inbox — so a folder owns the threads it has mail in,
   * and each view keeps its conversations whole.
   */
  const searchThreads = useMemo(() => {
    if (!searchCorpus) return null;
    const grouped = groupEmailsIntoThreads(searchCorpus, currentEmail);
    const matched = filterThreadsByQuery(grouped, debouncedQuery, currentEmail, serverHitIds);
    if (searchFolder === 'all') return matched;
    const ids = searchFolderIdSets[searchFolder];
    return matched.filter((t) => t.messages.some((m) => ids.has(m.id)));
  }, [searchCorpus, debouncedQuery, currentEmail, serverHitIds, searchFolder, searchFolderIdSets]);

  const groupedThreads = useMemo(
    () => groupEmailsIntoThreads(allEmails ?? [], currentEmail),
    [allEmails, currentEmail],
  );
  const threads = useMemo(
    () => filterThreadsByQuery(groupedThreads, debouncedQuery, currentEmail, serverHitIds),
    [groupedThreads, debouncedQuery, currentEmail, serverHitIds],
  );
  const groupedArchivedThreads = useMemo(
    () => groupEmailsIntoThreads(archivedEmails ?? [], currentEmail),
    [archivedEmails, currentEmail],
  );
  // The archived shelf gets the same filter, so its count keeps describing the list
  // under it while a search is running.
  const allArchivedThreads = useMemo(
    () => filterThreadsByQuery(groupedArchivedThreads, debouncedQuery, currentEmail, serverHitIds),
    [groupedArchivedThreads, debouncedQuery, currentEmail, serverHitIds],
  );
  const groupedSpamThreads = useMemo(
    () => groupEmailsIntoThreads(spamEmails ?? [], currentEmail),
    [spamEmails, currentEmail],
  );
  const allSpamThreads = useMemo(
    () => filterThreadsByQuery(groupedSpamThreads, debouncedQuery, currentEmail, serverHitIds),
    [groupedSpamThreads, debouncedQuery, currentEmail, serverHitIds],
  );
  const groupedSnoozedThreads = useMemo(
    () => groupEmailsIntoThreads(snoozedEmails ?? [], currentEmail),
    [snoozedEmails, currentEmail],
  );
  const allSnoozedThreads = useMemo(
    () => filterThreadsByQuery(groupedSnoozedThreads, debouncedQuery, currentEmail, serverHitIds),
    [groupedSnoozedThreads, debouncedQuery, currentEmail, serverHitIds],
  );

  const isGroupThread = useCallback((t: ConversationThread) => {
    if (t.category === 'forums') return true;
    const msg = t.latestEmail;
    const toCount = Array.isArray(msg.to) ? msg.to.length : 0;
    const ccCount = Array.isArray(msg.cc) ? msg.cc.length : 0;
    return toCount + ccCount > 1 || (msg as any).isGroup === true;
  }, []);

  /**
   * The `Important` lens: high-priority or starred mail. Mirrors the shell's
   * `isImportantEmail` on raw rows, lifted to the thread level via the latest
   * message plus the thread's own flags.
   */
  const isImportantThread = useCallback((t: ConversationThread) => {
    const latest = t.latestEmail;
    return (
      t.isStarred ||
      latest?.isStarred === true ||
      latest?.priority === 'high' ||
      t.priority === 'high'
    );
  }, []);

  const findGroupThread = useCallback(
    (group: ContactGroup): ConversationThread | null => {
      const expectedAddresses = new Set(
        group.emails.map((email) => email.trim().toLowerCase()).filter(Boolean),
      );

      if (expectedAddresses.size === 0) return null;

      const normalizedGroupName = group.name.trim().toLowerCase();

      const candidates = (threads ?? []).filter((thread) => {
        const addresses = new Set(
          threadAddresses(thread.messages, currentEmail).map((email) => email.trim().toLowerCase()),
        );

        const exactMemberMatch =
          addresses.size === expectedAddresses.size &&
          [...expectedAddresses].every((email) => addresses.has(email));

        const normalizedSubject = thread.subject
          .replace(/^(?:re|fwd):\s*/gi, '')
          .replace(/^\[group\]\s*/i, '')
          .trim()
          .toLowerCase();

        return exactMemberMatch || normalizedSubject === normalizedGroupName;
      });

      return (
        candidates.sort(
          (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
        )[0] ?? null
      );
    },
    [currentEmail, threads],
  );

  /**
   * A conversation carries an attachment when any message in it does — not just
   * the latest, since the file you are hunting for is usually the one someone sent
   * three replies ago.
   */
  const threadHasAttachment = useCallback(
    (t: ConversationThread) =>
      t.messages.some((m) => Array.isArray(m.attachments) && m.attachments.length > 0),
    [],
  );

  /**
   * Is this conversation with somebody in the address book?
   *
   * The chip this replaces asked `!automated && (count <= 2 || category ===
   * 'primary')`, which is "not automated" wearing a costume — `category` is always
   * `'primary'` — so it matched nearly every conversation and told the reader
   * nothing. This asks the address book.
   *
   * `threadAddresses` rather than `t.participants`, because `participants` holds
   * display *names*: `identityOf` keys on the address and returns the name, so the
   * key never reaches the caller. Senders and recipients from every message, not
   * just the latest, so a conversation counts when the person you know joined it
   * three replies in.
   *
   * An empty book matches nothing, which is the honest answer for someone who has
   * saved no contacts and is also what the badge then reports. A *pending* book is
   * not the same statement, and the callers below keep them apart.
   */
  const isContactThread = useCallback(
    (t: ConversationThread) => {
      if (!contactDirectory || contactDirectory.size === 0) return false;
      return threadAddresses(t.messages, currentEmail).some((a) => contactDirectory.has(a));
    },
    [contactDirectory, currentEmail],
  );

  const matchesLens = useCallback(
    (t: ConversationThread, lens: InboxLens) => {
      if (lens === 'all') return true;
      if (lens === 'primary') return t.category === 'primary';
      if (lens === 'updates') return t.category === 'updates';
      if (lens === 'social') return t.category === 'social';
      if (lens === 'promotions') return t.category === 'promotions';
      if (lens === 'forums') return t.category === 'forums';
      if (lens === 'unread') return !t.isRead;
      if (lens === 'drafts') return isDraftOnlyConversation(t.latestEmail, t.messages) || t.messages.some((m) => Boolean(m.isDraft));
      if (lens === 'important') return isImportantThread(t);
      if (lens === 'teams') return isGroupThread(t);
      if (lens === 'contacts') return isContactThread(t);
      if (lens === 'groups') return isGroupThread(t);
      if (lens === 'snoozed') return true;
      if (lens === 'spam') return true;
      if (typeof lens === 'string' && lens.startsWith('folder_')) {
        const folderId = lens.replace('folder_', '');
        const folder = customFolders.find((f) => f.id === folderId);
        if (!folder) return true;
        if (folder.filterType === 'contact') {
          if (folder.filterValue) {
            const query = folder.filterValue.toLowerCase();
            return threadAddresses(t.messages, currentEmail).some((a) =>
              a.toLowerCase().includes(query),
            );
          }
          return isContactThread(t);
        }
        if (folder.filterType === 'keyword') {
          const query = folder.filterValue?.toLowerCase() || '';
          return (
            t.subject.toLowerCase().includes(query) ||
            t.messages.some((m) =>
              (m.snippet || m.bodyText || '').toLowerCase().includes(query),
            )
          );
        }
        return true;
      }
      return true;
    },
    [customFolders, currentEmail, isContactThread, isGroupThread, isImportantThread],
  );

  const matchesFilter = useCallback(
    (t: ConversationThread, filter: InboxFilter) =>
      filter === 'starred' ? t.isStarred : threadHasAttachment(t),
    [threadHasAttachment],
  );

  /**
   * Narrow a list to one lens, one turn, and every active filter.
   *
   * All three compose, ANDed: `Contacts` + `Your turn` + `Has attachment` means all
   * three at once, where the old chip strip made the first two mutually exclusive.
   * The default view narrows nothing and returns the array untouched, so the
   * unfiltered inbox pays nothing for the machinery.
   */
  const narrowThreads = useCallback(
    (
      list: ConversationThread[],
      lens: InboxLens,
      turn: InboxTurn,
      filters: Set<InboxFilter>,
      // U3.4: optional so every pre-existing call site keeps working
      // unchanged; call sites that render a list pass activeCategories.
      // Categories are OR within themselves and AND with lens + turn +
      // filters, via the pure `matchesCategories` helper.
      categories: ReadonlySet<SelectableCategory> = new Set(),
    ): ConversationThread[] => {
      const active = Array.from(filters);
      if (lens === 'all' && turn === 'any' && active.length === 0 && categories.size === 0) return list;
      return list.filter(
        (t) =>
          matchesLens(t, lens) &&
          (turn === 'any' || threadFocus(t, currentEmail) === turn) &&
          active.every((f) => matchesFilter(t, f)) &&
          matchesCategories(t.category, categories),
      );
    },
    [currentEmail, matchesFilter, matchesLens],
  );

  const resetInboxView = useCallback(() => {
    setActiveLens('all');
    setActiveTurn('any');
    setActiveFilters(new Set());
    // U3.4: view-all resets categories too — a reset that left a
    // category narrowing on would not be "all conversations".
    setActiveCategories(new Set());
    // CUST-P1-6: the reset drops ?q from the URL, so the search state is
    // cleared alongside — otherwise the URL says no-search while the
    // searchbox still shows the old text and the panel stays in search mode.
    setSearchQuery('');
    setDebouncedQuery('');
    // Stay in the classic inbox: dropping ?view=inbox would render the People
    // view at / (2026-10-10 button audit).
    router.replace(inboxResetTarget(), { scroll: false });
  }, [router]);

  /**
   * Every narrowing control leaves the archived shelf, because the shelf is a
   * different pool: staying on it while the lens changes shows a count for one list
   * above a different one.
   *
   * The classic inbox lives at /?view=inbox — the lens param must ride along
   * with it, or the navigation lands on the People view (2026-10-10 button audit).
   */
  const selectLens = useCallback(
    (lens: InboxLens) => {
      setActiveLens(lens);
      setShowArchivedView(false);
      // CUST-P1-6: a lens switch is a new query context — clear the search so
      // the URL (no `q`, see inboxLensTarget), the searchbox, and the panel
      // stay in sync. Without the clear, the debounced query kept driving the
      // panel's search-mode render ("No messages matched …") against a URL
      // that no longer had `q`, while the searchbox still showed the old text.
      // Both states clear at once (same as the panel's own "Clear search"
      // button) so the panel exits search mode immediately instead of 260ms
      // later when the debounce would catch up.
      setSearchQuery('');
      setDebouncedQuery('');
      router.replace(inboxLensTarget(lens), { scroll: false });
    },
    [router],
  );

  const selectTurn = useCallback((turn: InboxTurn) => {
    setActiveTurn(turn);
    setShowArchivedView(false);
  }, []);

  const toggleFilter = useCallback((filter: InboxFilter) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
    setShowArchivedView(false);
  }, []);

  /**
   * Arrow keys along the lens tablist, per the WAI-ARIA tabs pattern: the chips are
   * one tab stop and Left/Right (plus Home/End) move between them, selecting as
   * they go. Without this a `role="tablist"` announces a widget whose keyboard
   * contract does not exist.
   *
   * `preventDefault` keeps those keys off the horizontal scroller the row becomes
   * on a narrow screen, which would otherwise slide the pill under the moving
   * focus ring.
   *
   * The arithmetic is `@quant/shared-ui`'s `nextRovingIndex`, left at its
   * `'horizontal'` default on purpose. The vertical modes exist, but `ArrowDown`
   * on a focused chip scrolls the mail list, and taking that away from someone
   * reading their inbox is a worse trade than the one extra key press.
   *
   * U3.1: the strip is pills AND visible folder tabs in one roving space
   * (`combinedLensKeys`), so arrows cross the pill/folder boundary instead of
   * stopping at the last pill. Wrapping matches the pre-U3.1 pill behaviour:
   * `nextRovingIndex` wraps past either end into a ring. Overflow menu items
   * are not in this space — the menu handles its own arrows.
   */
  const onLensKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const next = nextRovingIndex(event.key, index, combinedLensKeys.length);
      if (next === null) return;
      event.preventDefault();
      const lens = combinedLensKeys[next];
      if (lens) selectLens(lens);
      lensChipRefs.current[next]?.focus();
    },
    [selectLens, combinedLensKeys],
  );

  /** The same contract for the popover's turn group, which is a radiogroup. */
  const onTurnKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const next = nextRovingIndex(event.key, index, INBOX_TURNS.length);
      if (next === null) return;
      event.preventDefault();
      const turn = INBOX_TURNS[next]?.key;
      if (turn) selectTurn(turn);
      turnRowRefs.current[next]?.focus();
    },
    [selectTurn],
  );

  /** Dismiss the filter popover on an outside click or Escape. */
  useEffect(() => {
    if (!isFilterMenuOpen) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!filterMenuRef.current?.contains(event.target as Node)) setIsFilterMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsFilterMenuOpen(false);
      // Escape is a keyboard gesture, so it has to leave focus somewhere a
      // keyboard can work from. An outside click does not: the pointer has
      // already moved on, and yanking focus back to the trigger would fight it.
      filterTriggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isFilterMenuOpen]);

  /**
   * U3.4: closing the Filter popover abandons any unapplied picker
   * draft with it. Without this, reopening the popover would show
   * the picker section still open over a stale draft the user never
   * applied — the draft must be re-seeded from the committed
   * selection on every open instead.
   */
  useEffect(() => {
    if (!isFilterMenuOpen) setIsCategoryPickerOpen(false);
  }, [isFilterMenuOpen]);

  /** Dismiss the search-scope popover on an outside click or Escape. */
  useEffect(() => {
    if (!isScopeMenuOpen) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!scopeMenuRef.current?.contains(event.target as Node)) setIsScopeMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsScopeMenuOpen(false);
      // Same contract as the filter popover: Escape is a keyboard gesture,
      // so focus goes back to the trigger it came from.
      scopeTriggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isScopeMenuOpen]);

  /**
   * The population the visible list is drawn from, before the category tab
   * narrows it.
   *
   * Everything that counts conversations for the user now counts *this* array,
   * because three counters used to read three different sources: the chip counts
   * and the hero's unread total were both computed from the unsearched inbox
   * while the rows came from the search-aware list or from the archive. So a
   * search for one word left `All 431` above four rows, and opening the
   * archived view left the chips describing the inbox you had just navigated away
   * from. A count that does not describe the list under it is worse than no count.
   */
  const activeThreadPool = useMemo(
    () =>
      // SIA-P2-6: an active search answers from the whole mailbox (the scope
      // chip narrows it), regardless of which tab the query was typed in — a
      // query typed in the Archive tab no longer misses inbox results.
      debouncedQuery
        ? (searchThreads ?? [])
        : showArchivedView
          ? allArchivedThreads
          : activeLens === 'spam'
            ? allSpamThreads
            : activeLens === 'snoozed'
              ? allSnoozedThreads
              : (threads ?? []),
    [debouncedQuery, searchThreads, showArchivedView, allArchivedThreads, activeLens, allSpamThreads, allSnoozedThreads, threads],
  );

  // True when the windowed list is showing the inbox pool itself (not the
  // archived shelf or the spam/snoozed pools). The swipe tip and the cursor
  // "load more" belong to that pool: they extend the INBOX query, and the
  // other pools are separate queries with their own first pages.
  const isInboxPool = !showArchivedView && activeLens !== 'spam' && activeLens !== 'snoozed';

  /**
   * Lens counts, measured on the pool the turn and the active filters have already
   * narrowed.
   *
   * Cross-tabulating is the whole reason the controls can compose. A count that
   * ignored the others would promise rows the list will not show: with `Your turn`
   * on, `Contacts 12` has to mean twelve conversations from people you know that are
   * waiting on a reply, not twelve conversations of which some are settled.
   *
   * `contacts` is left at `null` while the address book is in flight. Zero there
   * would read as "nobody you know has written", which is a different and possibly
   * false statement; the chip shows no badge until it can show a true one.
   */
  const lensCounts = useMemo(() => {
    // SIA-P2-6: when a query is active the chips count the search answer, not
    // the folder pool — a count that ignores the query would promise rows the
    // list will not show.
    const basePool = debouncedQuery
      ? (searchThreads ?? [])
      : showArchivedView
        ? allArchivedThreads
        : (threads ?? []);
    const pool = narrowThreads(basePool, 'all', activeTurn, activeFilters, activeCategories);
    let allUnread = 0;
    let allTotal = 0;
    let primaryUnread = 0;
    let primaryTotal = 0;
    let updatesUnread = 0;
    let updatesTotal = 0;
    let socialUnread = 0;
    let socialTotal = 0;
    let promotionsUnread = 0;
    let promotionsTotal = 0;
    let forumsUnread = 0;
    let forumsTotal = 0;
    let groupsUnread = 0;
    let groupsTotal = 0;
    let importantUnread = 0;
    let importantTotal = 0;
    let contactsUnread: number | null = isDirectoryPending ? null : 0;
    let contactsTotal: number | null = isDirectoryPending ? null : 0;

    for (const t of pool) {
      allTotal += 1;
      if (t.category === 'primary') primaryTotal += 1;
      else if (t.category === 'updates') updatesTotal += 1;
      else if (t.category === 'social') socialTotal += 1;
      else if (t.category === 'promotions') promotionsTotal += 1;
      else if (t.category === 'forums') forumsTotal += 1;
      if (isGroupThread(t)) groupsTotal += 1;
      if (isImportantThread(t)) importantTotal += 1;
      if (contactsTotal !== null && isContactThread(t)) contactsTotal += 1;

      if (!t.isRead) {
        allUnread += 1;
        if (t.category === 'primary') primaryUnread += 1;
        else if (t.category === 'updates') updatesUnread += 1;
        else if (t.category === 'social') socialUnread += 1;
        else if (t.category === 'promotions') promotionsUnread += 1;
        else if (t.category === 'forums') forumsUnread += 1;
        if (isGroupThread(t)) groupsUnread += 1;
        if (isImportantThread(t)) importantUnread += 1;
        if (contactsUnread !== null && isContactThread(t)) contactsUnread += 1;
      }
    }
    const spamUnread = allSpamThreads.filter((t) => !t.isRead).length;
    const spamTotal = allSpamThreads.length;
    const snoozedUnread = allSnoozedThreads.filter((t) => !t.isRead).length;
    const snoozedTotal = allSnoozedThreads.length;

    const counts: Record<string, any> = {
      all: allUnread,
      primary: primaryUnread,
      unread: allUnread,
      important: importantUnread,
      teams: groupsUnread,
      updates: updatesUnread,
      social: socialUnread,
      promotions: promotionsUnread,
      forums: forumsUnread,
      contacts: contactsUnread,
      groups: groupsUnread,
      snoozed: snoozedUnread,
      spam: spamUnread,
      unreadCounts: {
        all: allUnread,
        primary: primaryUnread,
        unread: allUnread,
        important: importantUnread,
        teams: groupsUnread,
        updates: updatesUnread,
        social: socialUnread,
        promotions: promotionsUnread,
        forums: forumsUnread,
        contacts: contactsUnread,
        groups: groupsUnread,
        snoozed: snoozedUnread,
        spam: spamUnread,
      },
      totalCounts: {
        all: allTotal,
        primary: primaryTotal,
        unread: allUnread,
        important: importantTotal,
        teams: groupsTotal,
        updates: updatesTotal,
        social: socialTotal,
        promotions: promotionsTotal,
        forums: forumsTotal,
        contacts: contactsTotal,
        groups: groupsTotal,
        snoozed: snoozedTotal,
        spam: spamTotal,
      },
    };
    return counts;
  }, [
    debouncedQuery,
    searchThreads,
    showArchivedView,
    allArchivedThreads,
    threads,
    allSpamThreads,
    allSnoozedThreads,
    activeTurn,
    activeFilters,
    activeCategories,
    narrowThreads,
    isGroupThread,
    isImportantThread,
    isContactThread,
    isDirectoryPending,
  ]);

  /**
   * Each turn's count is "how many rows you would get by choosing this", measured
   * against the active lens and filters.
   *
   * `needs_you + waiting` deliberately falls short of `any` — a receipt from
   * `no-reply@` is neither a reply you owe nor one you are owed. `heldBackCount`
   * says so out loud rather than leaving the gap to look like a bug.
   */
  const turnCounts = useMemo(() => {
    const pool = narrowThreads(activeThreadPool, activeLens, 'any', activeFilters, activeCategories);
    const counts: Record<InboxTurn, number> = { any: pool.length, needs_you: 0, waiting: 0 };
    for (const t of pool) {
      const focus = threadFocus(t, currentEmail);
      if (focus === 'needs_you') counts.needs_you += 1;
      else if (focus === 'waiting') counts.waiting += 1;
    }
    return counts;
  }, [activeThreadPool, activeLens, activeFilters, activeCategories, narrowThreads, currentEmail]);

  /**
   * Each filter's count is "how many rows you would get by turning this on",
   * measured against the active lens and turn and the *other* active filters. For a
   * filter already on, that is exactly the length of the list under it.
   */
  const filterCounts = useMemo(() => {
    const counts = { starred: 0, attachment: 0 } as Record<InboxFilter, number>;
    for (const { key } of INBOX_FILTERS) {
      const others = new Set(activeFilters);
      others.delete(key);
      counts[key] = narrowThreads(activeThreadPool, activeLens, activeTurn, others, activeCategories).filter((t) =>
        matchesFilter(t, key),
      ).length;
    }
    return counts;
  }, [activeThreadPool, activeLens, activeTurn, activeFilters, activeCategories, narrowThreads, matchesFilter]);

  const heldBackCount =
    activeTurn === 'any' ? 0 : turnCounts.any - turnCounts.needs_you - turnCounts.waiting;

  /** How many narrowings are on, for the Filter trigger's badge and its footer. */
  // U3.4: categories count exactly like a filter — one per selected
  // bucket — so the badge, the footer, and the filtered-empty
  // branches all see a category narrowing, and Clear resets it.
  const narrowingCount = (activeTurn === 'any' ? 0 : 1) + activeFilters.size + activeCategories.size;
  /** U3.4: the category pills, derived by the pure helper (canonical order). */
  const categoryPills = useMemo(() => deriveCategoryPills(activeCategories), [activeCategories]);

  /**
   * U3.2: the single active chip beside the Filter trigger. Derived
   * solely from `activeTurn` + `activeFilters` (see `filter-chip.ts`):
   * it holds no state, filters nothing, and is `null` — unrendered —
   * at zero narrowings. Search `q` and the active lens are not inputs,
   * so the chip never counts a search and persists across lens changes
   * (lens switches clear `q` only, not turn/filters). Activating it
   * only opens the existing Filter popover below; the footer's
   * "Clear N narrowing(s)" remains the sole clear path.
   */
  const filterChip = useMemo(
    () => deriveFilterChip(activeTurn, activeFilters, narrowingCount),
    [activeTurn, activeFilters, narrowingCount],
  );

  /** What the archived shelf calls the population it is counting. */
  const viewLabel = useMemo(() => {
    const turnPart =
      activeTurn === 'needs_you'
        ? 'conversations on your turn'
        : activeTurn === 'waiting'
          ? 'conversations on their turn'
          : 'conversations';
    const lensPart =
      activeLens === 'unread'
        ? `unread ${turnPart}`
        : activeLens === 'primary'
          ? `primary ${turnPart}`
          : activeLens === 'updates'
            ? `update ${turnPart}`
            : activeLens === 'social'
              ? `social ${turnPart}`
              : activeLens === 'promotions'
                ? `promotional ${turnPart}`
                : activeLens === 'forums'
                  ? `forum ${turnPart}`
                  : activeLens === 'contacts'
                    ? `${turnPart} with your contacts`
                    : activeLens === 'groups'
                      ? `group ${turnPart}`
                      : activeLens === 'important'
                        ? `important ${turnPart}`
                        : activeLens === 'teams'
                          ? `team ${turnPart}`
                          : turnPart;
    // U3.4: a category narrowing also makes the shelf "filtered".
    return activeFilters.size > 0 || activeCategories.size > 0 ? `filtered ${lensPart}` : lensPart;
  }, [activeLens, activeTurn, activeFilters, activeCategories]);

  const currentArchivedThreads = useMemo(() => {
    return narrowThreads(allArchivedThreads, activeLens, activeTurn, activeFilters, activeCategories);
  }, [allArchivedThreads, activeLens, activeTurn, activeFilters, activeCategories, narrowThreads]);

  const displayThreads = useMemo(() => {
    const sourceThreads = narrowThreads(activeThreadPool, activeLens, activeTurn, activeFilters, activeCategories);

    return [...sourceThreads].sort((a, b) => {
      const aPinned = (a as { isPinned?: boolean }).isPinned === true;
      const bPinned = (b as { isPinned?: boolean }).isPinned === true;
      if (aPinned !== bPinned) {
        return aPinned ? -1 : 1;
      }
      return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
    });
  }, [activeThreadPool, activeLens, activeTurn, activeFilters, activeCategories, narrowThreads]);

  /**
   * Whether to say out loud that starred conversations are held at the top.
   *
   * The sort above is two-level — starred first, then newest — and nothing on
   * screen said so, so a list whose first three rows were from last week read as
   * a broken date sort rather than as a pin the user had asked for themselves.
   * The caption appears only when the pin actually moved something: not under the
   * `Starred` filter, where every row is starred, and not when nothing is starred
   * or everything is.
   */
  const pinnedCount = useMemo(
    () => displayThreads.filter((t) => (t as { isPinned?: boolean }).isPinned).length,
    [displayThreads],
  );
  const showPinnedNotice =
    !activeFilters.has('starred') && pinnedCount > 0 && pinnedCount < displayThreads.length;

  /**
   * The archived toggle scrolls with the list, so the virtualizer has to know how
   * much room it takes before the first row. It is rendered out of flow inside the
   * sized container and accounted for as `paddingStart`, which keeps the rows'
   * offsets exact instead of relying on overscan to hide a constant shift.
   */
  const [listHeaderHeight, setListHeaderHeight] = useState(0);
  const measureListHeader = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      setListHeaderHeight(0);
      return;
    }
    setListHeaderHeight(node.offsetHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setListHeaderHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const threadKey = useCallback(
    (index: number) => displayThreads[index]?.id ?? index,
    [displayThreads],
  );

  /**
   * True when the windowed list owns the scroll area. The loading, error and empty
   * states each replace it entirely, and the archived shelf has to move with it,
   * so the condition is named once rather than repeated at every branch.
   */
  const showGroupsView = activeLens === 'groups' && !debouncedQuery && narrowingCount === 0;

  const showThreadList =
    !showGroupsView && !isLoading && !isSearching && !error && displayThreads.length > 0;

  const unmatchedGroupThreads = useMemo(() => {
    if (!showGroupsView) return [];

    const matchedIdentifiers = new Set<string>();
    for (const group of savedGroups) {
      const thread = findGroupThread(group);
      if (!thread) continue;
      if (thread.id) matchedIdentifiers.add(thread.id);
      if (thread.threadId) matchedIdentifiers.add(thread.threadId);
      for (const msg of thread.messages ?? []) {
        if (msg.id) matchedIdentifiers.add(msg.id);
        if (msg.threadId) matchedIdentifiers.add(msg.threadId);
      }
    }

    return displayThreads.filter((thread) => {
      if (matchedIdentifiers.has(thread.id)) return false;
      if (thread.threadId && matchedIdentifiers.has(thread.threadId)) return false;
      return !thread.messages?.some(
        (msg) =>
          matchedIdentifiers.has(msg.id) ||
          Boolean(msg.threadId && matchedIdentifiers.has(msg.threadId)),
      );
    });
  }, [displayThreads, findGroupThread, savedGroups, showGroupsView]);

  const virtualizer = useVirtualizer({
    count: displayThreads.length,
    scrollElement: listElement,
    // `.mail-row` is `min-height: 4.85rem` plus a 1px border; every row is then
    // measured for real, so this only sets the initial scrollbar length.
    estimateSize: ESTIMATED_ROW_HEIGHT,
    getItemKey: threadKey,
    paddingStart: listHeaderHeight,
    overscan: 8,
  });

  /**
   * Return to the top when the view changes. Without this the scroll offset
   * carries over between tabs, and because the list is windowed that means
   * switching from a long tab to a short one lands the user in the middle of it
   * rather than at the newest message.
   */
  useEffect(() => {
    virtualizer.scrollToTop();
    // `scrollToTop` is stable for a given scroll container; re-running on every
    // virtualizer commit would fight the user's own scrolling.
  }, [activeLens, activeTurn, activeFilters, showArchivedView, debouncedQuery]);

  /**
   * Pull-to-refresh, touch-only: arms only when the list is scrolled to the
   * very top, fires the real inbox refetch on release. `refetch` is the
   * react-query one, so `isLoading` stays false while cached rows are on
   * screen — the rows stay mounted under the spinner (no skeleton wall) and
   * the content morphs in place when the new data lands. The spinner holds
   * until the fetch settles. See `../hooks/usePullToRefresh` and
   * `../lib/pull-to-refresh-machine` for the gesture core and its tests.
   */
  const { listProps: ptrListProps, pullDistance, isRefreshing, triggerRefresh } = usePullToRefresh({
    onRefresh: async () => {
      await refetch();
      showToast({ text: 'Inbox up to date', type: 'info' });
    },
  });

  useEffect(() => {
    const handleGlobalRefresh = () => triggerRefresh();
    window.addEventListener('quant:refresh', handleGlobalRefresh);
    return () => window.removeEventListener('quant:refresh', handleGlobalRefresh);
  }, [triggerRefresh]);

  /**
   * Title and one-line summary for the hero, describing the list actually below
   * it.
   *
   * The hero used to read "Your Inbox" and "N unread messages waiting for
   * review" in every state, including the archived view and mid-search — so the
   * two lines that frame the screen named a mailbox the user had navigated away
   * from. `unreadCount` is drawn from the same pool as the rows and the chips, so
   * all three agree by construction.
   */
  const unreadCount = useMemo(
    () => activeThreadPool.filter((t) => !t.isRead).length,
    [activeThreadPool],
  );

  const heroTitle = debouncedQuery
    ? 'Search results'
    : showArchivedView
      ? 'Archived'
      : 'Your Inbox';

  /**
   * SIA-P2-12: honest context kickers. The hero's kicker used to read
   * "QuantMail Intelligence" in every state — branding over a context label.
   * The kicker now names the list below it: Mail over the inbox list, Search
   * over results, Spam/Snoozed/Trash over their folder views, Archive over
   * archived mail. It matches `heroTitle`'s state branches by construction.
   */
  const heroKicker = debouncedQuery
    ? 'Search'
    : showArchivedView
      ? 'Archive'
      : activeLens === 'spam'
        ? 'Spam'
        : activeLens === 'snoozed'
          ? 'Snoozed'
          : activeLens === 'trash'
            ? 'Trash'
            : 'Mail';

  const heroSummary = useMemo(() => {
    // SIA-P1-1: "caught up" is a true-zero state only. Conversations on screen
    // with zero unread are "all read", never "completely caught up".
    // While the pool is loading/searching (or errored) it is empty by
    // definition — claiming "caught up" then would contradict the rows the
    // moment they arrive, so the hero stays silent until the data is real.
    if (isLoading || isSearching || error) return '';
    const total = activeThreadPool.length;
    const conversations = `${total} conversation${total === 1 ? '' : 's'}`;
    const unread = `${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`;

    if (debouncedQuery) {
      if (total === 0) return `Nothing matched "${debouncedQuery}".`;
      return unreadCount > 0
        ? `${conversations} matching "${debouncedQuery}", ${unread}.`
        : `${conversations} matching "${debouncedQuery}".`;
    }
    if (showArchivedView) {
      return total === 0 ? 'Nothing archived yet.' : `${conversations} out of the way.`;
    }
    // SIA-P1-1: "caught up" is a true-zero state only. Conversations on screen
    // with zero unread are "all read", never "completely caught up".
    if (unreadCount > 0) return `${unread} waiting for review.`;
    if (total === 0) return 'You are completely caught up.';
    return `${conversations}, all read.`;
  }, [activeThreadPool, debouncedQuery, showArchivedView, unreadCount, isLoading, isSearching, error]);

  const toggleSelect = useCallback(
    (id: string, event?: React.MouseEvent | null) => {
      setSelectedIds((current) => {
        const next = new Set(current);

        // Shift-click extends from the last plain click to here, over the rows as
        // *rendered*. Anchoring on an id rather than an index matters because
        // `displayThreads` re-sorts when a message is starred or a tab changes, so
        // a stored index can point at a different conversation by the time the
        // second click arrives.
        if (event?.shiftKey && selectionAnchorId.current !== null) {
          const from = displayThreads.findIndex((t) => t.id === selectionAnchorId.current);
          const to = displayThreads.findIndex((t) => t.id === id);
          if (from >= 0 && to >= 0) {
            for (let i = Math.min(from, to); i <= Math.max(from, to); i += 1) {
              next.add(displayThreads[i].id);
            }
            return next;
          }
        }

        if (next.has(id)) next.delete(id);
        else next.add(id);
        selectionAnchorId.current = id;
        return next;
      });
    },
    [displayThreads],
  );

  /**
   * Optimistic mailbox mutations.
   *
   * Every handler below used to `await apiClient.x(id)` and then `await refetch()`:
   * two sequential round trips before the row moved, and one full inbox refetch
   * per keystroke while holding `e` down the list. Now the cache moves in the same
   * frame and the request goes out behind the user through the offline outbox, so
   * archiving works with no connection at all and replays on reconnect.
   */
  const mutations = useMailMutations({
    onRemoved: (ids) => {
      if (selectedEmail && ids.includes(selectedEmail.id)) {
        setSelectedEmail(null);
        setSelectedThread(null);
      }
      setSelectedIds((current) => {
        if (!ids.some((id) => current.has(id))) return current;
        const next = new Set(current);
        for (const id of ids) next.delete(id);
        return next;
      });
    },
  });

  /**
   * Every message id the conversation an action was aimed at is made of.
   *
   * The handlers below used to be handed `thread.id`, which is the *newest
   * message's* id. So archiving a row that counted eleven moved one message and
   * left ten in the inbox: the row came straight back, one shorter. Marking read
   * was worse — a row is unread while any inbound message in it is, so opening a
   * conversation cleared the newest and left the row bold with nothing to press.
   *
   * Resolved against both pools, because the same handlers serve the archived
   * shelf. Falls back to the id itself so an action can never become a no-op just
   * because the pools have not settled yet.
   */
  const conversationIds = useCallback(
    (id: string): string[] => {
      const thread =
        findConversation(threads, id) ??
        findConversation(allArchivedThreads, id) ??
        findConversation(allSpamThreads, id);
      const ids = threadMessageIds(thread);
      return ids.length > 0 ? ids : [id];
    },
    [threads, allArchivedThreads, allSpamThreads],
  );

  const [isEmptyingSpam, setIsEmptyingSpam] = useState(false);

  const handleRescueSpamThread = useCallback(
    async (thread: ConversationThread) => {
      const emailId = thread.latestEmail?.id || thread.id;
      if (!emailId) return;
      try {
        await apiClient.markNotSpam(emailId);
        showToast({
          text: 'Rescued from spam — moved to inbox',
          type: 'success',
        });
        await Promise.all([refetch(), refetchSpam()]);
      } catch (err) {
        showToast({
          text: err instanceof Error ? err.message : 'Failed to rescue email',
          type: 'error',
        });
      }
    },
    [refetch, refetchSpam],
  );

  const handleEmptySpam = useCallback(async () => {
    if (allSpamThreads.length === 0) return;
    const count = allSpamThreads.length;
    setIsEmptyingSpam(true);
    try {
      const allIds = allSpamThreads.flatMap((t) => threadMessageIds(t));
      await Promise.all(allIds.map((id) => apiClient.deleteEmail(id)));
      showToast({
        text: `Cleared ${count} spam conversation${count === 1 ? '' : 's'}`,
        type: 'success',
      });
      await refetchSpam();
    } catch (err) {
      showToast({
        text: err instanceof Error ? err.message : 'Failed to empty spam quarantine',
        type: 'error',
      });
    } finally {
      setIsEmptyingSpam(false);
    }
  }, [allSpamThreads, refetchSpam]);

  const batchAction = useCallback(
    async (action: 'archive' | 'delete' | 'unarchive') => {
      const ids = Array.from(selectedIds);
      setSelectedIds(new Set());
      // `ids.length` is the number of conversations, which is what the toast counts;
      // the request list is every message inside them.
      await mutations.batch(
        action === 'delete' ? 'trash' : action,
        ids.flatMap(conversationIds),
        ids.length,
      );
    },
    [mutations, selectedIds, conversationIds],
  );

  const batchToggleStar = useCallback(
    async (ids: string[], allPinned: boolean) => {
      setSelectedIds(new Set());
      await Promise.all(ids.map((id) => mutations.toggleStar(conversationIds(id))));
      showToast({
        text: allPinned
          ? 'Unpinned selected conversations'
          : 'Pinned selected conversations to top',
        type: 'success',
      });
    },
    [mutations, conversationIds],
  );

  const batchTogglePin = useCallback(
    async (ids: string[], allPinned: boolean) => {
      setSelectedIds(new Set());
      await Promise.all(ids.map((id) => mutations.togglePin(conversationIds(id))));
      showToast({
        text: allPinned
          ? 'Unpinned selected conversations'
          : 'Pinned selected conversations to top',
        type: 'success',
      });
    },
    [mutations, conversationIds],
  );

  /**
   * Snooze the whole selection, which is the action the bulk bar was missing —
   * a phone's only route to snooze is long-press to select, so its absence here
   * meant a finger could not snooze at all.
   *
   * One `mutations.snooze` call, not a `Promise.all` over the ids like the two
   * batches above: it takes an array, does a single optimistic patch, and rolls
   * the whole thing back as one unit if the server refuses. `ids.length` counts
   * the conversations, which is what the toast says; the request list is every
   * message inside them.
   */
  const batchSnooze = useCallback(
    async (until: Date) => {
      const ids = Array.from(selectedIds);
      setSelectedIds(new Set());
      await mutations.snooze(ids.flatMap(conversationIds), until, ids.length);
    },
    [mutations, selectedIds, conversationIds],
  );

  const batchMarkRead = useCallback(
    async (ids: string[], read: boolean) => {
      setSelectedIds(new Set());
      await Promise.all(
        ids.map((id) =>
          read
            ? mutations.markRead(conversationIds(id))
            : mutations.markUnread(conversationIds(id)),
        ),
      );
      showToast({
        text: `${ids.length} marked as ${read ? 'read' : 'unread'}`,
        type: 'info',
      });
    },
    [mutations, conversationIds],
  );

  const moveSelectedToCategory = useCallback(
    async (category: Exclude<EmailCategory, 'spam'>) => {
      const selected = Array.from(selectedIds);
      if (selected.length !== 1) return;
      const saved = await mutations.moveToCategory(conversationIds(selected[0]), category);
      if (saved) setSelectedIds(new Set());
    },
    [conversationIds, mutations, selectedIds],
  );

  const toggleStar = useCallback(
    async (event: React.MouseEvent | null, id: string) => {
      event?.stopPropagation();
      await mutations.toggleStar(conversationIds(id));
    },
    [mutations, conversationIds],
  );

  const togglePin = useCallback(
    async (event: React.MouseEvent | null, id: string) => {
      event?.stopPropagation();
      await mutations.togglePin(conversationIds(id));
    },
    [mutations, conversationIds],
  );

  const archiveEmail = useCallback(
    (id: string) => mutations.archive(conversationIds(id)),
    [mutations, conversationIds],
  );

  const unarchiveEmail = useCallback(
    (id: string) => mutations.unarchive(conversationIds(id)),
    [mutations, conversationIds],
  );

  const deleteEmail = useCallback(
    (id: string) => mutations.trash(conversationIds(id)),
    [mutations, conversationIds],
  );

  const markRead = useCallback(
    (id: string) => mutations.markRead(conversationIds(id)),
    [mutations, conversationIds],
  );

  const markUnread = useCallback(
    (id: string) => mutations.markUnread(conversationIds(id)),
    [mutations, conversationIds],
  );

  const snoozeEmail = useCallback(
    (emailId: string, snoozeUntil: Date) => mutations.snooze(conversationIds(emailId), snoozeUntil),
    [mutations, conversationIds],
  );

  const openEmail = useCallback(
    (email: Email | null, explicitThread?: ConversationThread | null) => {
      // A conversation is selectable even when its latest-email reference is
      // unavailable: the reading pane renders from the thread's own messages.
      // The old early-return cleared the whole selection here, which left the
      // pane stuck on its "Choose the signal" placeholder after a tap that had
      // clearly selected a conversation.
      const thread =
        explicitThread ??
        (email
          ? threads?.find(
              (t) =>
                t.id === email.id ||
                t.threadId === email.threadId ||
                t.messages.some((m) => m.id === email.id),
            )
          : undefined) ??
        null;
      const resolvedEmail =
        email ?? thread?.latestEmail ?? thread?.messages[thread.messages.length - 1] ?? null;
      if (!resolvedEmail && !thread) {
        setSelectedEmail(null);
        setSelectedThread(null);
        return;
      }
      // A draft-only row is unsent writing, not a conversation: resume it in
      // the composer (as the Drafts tab does) instead of opening a thread view
      // with nothing in it but the draft.
      if (resolvedEmail && isDraftOnlyConversation(resolvedEmail, thread?.messages)) {
        router.push(`/compose?draftId=${encodeURIComponent(resolvedEmail.id)}`);
        return;
      }
      setSelectedEmail(resolvedEmail);
      setSelectedThread(thread);
      // The whole conversation, not the message that was tapped. `isRead` on a row
      // is an `every`, so clearing only the newest left the row bold after the user
      // had plainly just read it.
      if (resolvedEmail) {
        void mutations.markRead(conversationIds(resolvedEmail.id));
      }
      const targetId =
        resolvedEmail?.threadId || resolvedEmail?.id || thread?.threadId || thread?.id;
      // Gmail-style navigation (user decision 2026-10-07): tapping an email
      // ALWAYS opens the full thread view, on desktop and mobile alike.
      // The old desktop split-view reading pane was removed — no more
      // selecting into a side preview.
      if (targetId && typeof window !== 'undefined') {
        const currentPath = window.location.pathname + window.location.search;
        router.push(`/thread/${targetId}?returnTo=${encodeURIComponent(currentPath)}`);
      }
    },
    [mutations, router, threads, conversationIds],
  );

  /**
   * Superhuman-style cursor and mail actions.
   *
   * This is handed `displayThreads` — the rows actually rendered — where it used to
   * be handed the flat, differently-ordered `emails` array. That mismatch is why
   * `j`/`k` highlighted one conversation while `e` archived another.
   */
  const { focusedIndex, focusedId, focusRow, lastArchivedThread, undoLastArchive } =
    useInboxKeyboard({
      rows: displayThreads,
      selectedId: selectedEmail?.id ?? null,
      onOpen: (thread) => openEmail(thread.latestEmail, thread),
      onClose: () => {
        setSelectedEmail(null);
        setSelectedThread(null);
      },
      onToggleSelect: (id) => toggleSelect(id),
      // Escape's innermost layer. The selection bar replaces the shell's own header
      // and is the loudest thing on screen, so it is what Escape has to answer to
      // before it closes a reader — which is what the bar's tooltip has always
      // promised. See `inbox.close`.
      selectionCount: selectedIds.size,
      onClearSelection: () => setSelectedIds(new Set()),
      mutations,
      // `e` and `#` act on the conversation the cursor is on, all of it.
      expandIds: threadMessageIds,
      scrollToIndex: virtualizer.scrollToIndex,
      onCompose: () => handleOpenCompose(),
    });

  /**
   * The `j`/`k` cursor, said out loud.
   *
   * The cursor is a class on a row — `is-focused` — and the rows are deliberately
   * not tab stops, because navigation here is the keys rather than Tab. So DOM
   * focus never moves, and a screen reader is told nothing at all when the cursor
   * advances. `aria-current` on the row makes it identifiable to a reader that
   * arrives there on its own terms; this makes the *move* audible, which is the
   * half that matters when the keys are the whole interaction.
   *
   * Keyed on the row's id, not its index. Archiving hands the cursor to whatever
   * slides into that index — a different conversation at the same number, which
   * must be announced — while a re-sort moves the same conversation to a new
   * number, which must not be. Silent on mount, because an announcer that speaks
   * on load teaches people to ignore it.
   */
  const [cursorAnnouncement, setCursorAnnouncement] = useState('');
  const announcedCursorRef = useRef<string | null>(null);
  useEffect(() => {
    if (focusedId === announcedCursorRef.current) return;
    announcedCursorRef.current = focusedId;
    if (focusedId === null) {
      setCursorAnnouncement('');
      return;
    }
    const index = displayThreads.findIndex((thread) => thread.id === focusedId);
    if (index === -1) return;
    const thread = displayThreads[index];
    // Who and what first; the arithmetic last, so a reader hears the useful half
    // before it has to sit through "4 of 312". Full stops between the three groups
    // rather than commas throughout, because `participantsSummary` is itself a
    // comma list — "Shipping, ops, billing, Shipment 88214…" has no seam in it.
    const tail: string[] = [];
    if (!thread.isRead) tail.push('unread');
    if (thread.count > 1) tail.push(`${thread.count} messages`);
    tail.push(`${index + 1} of ${displayThreads.length}`);
    setCursorAnnouncement(
      `${thread.participantsSummary || 'No sender'}. ${thread.subject || 'No subject'}. ${tail.join(', ')}`,
    );
  }, [focusedId, displayThreads]);

  /**
   * Whether every selected conversation is already pinned, which is what turns the
   * menu's one Pin row into `Unpin`. Two rows for one boolean state would be the
   * duplicate affordance this audit is removing.
   *
   * Hoisted out of the header's JSX, where it was an inline IIFE. `every` over an
   * empty set is `true`, and the bar is only mounted above zero, so the vacuous
   * case never reaches a label.
   */
  const allSelectedPinned = useMemo(
    () =>
      Array.from(selectedIds).every(
        (id) =>
          (
            displayThreads.find(
              (t) => t.id === id || t.threadId === id || t.messages.some((m) => m.id === id),
            ) as { isPinned?: boolean } | undefined
          )?.isPinned,
      ),
    [selectedIds, displayThreads],
  );

  const selectionHeader = (
    <SelectionHeader
      count={selectedIds.size}
      totalVisible={displayThreads.length}
      allPinned={allSelectedPinned}
      onDeselectAll={() => setSelectedIds(new Set())}
      onSelectAllVisible={() => setSelectedIds(new Set(displayThreads.map((t) => t.id)))}
      onTogglePin={() => void batchTogglePin(Array.from(selectedIds), allSelectedPinned)}
      onMarkRead={() => void batchMarkRead(Array.from(selectedIds), true)}
      onMarkUnread={() => void batchMarkRead(Array.from(selectedIds), false)}
      onMoveToCategory={(category) => void moveSelectedToCategory(category)}
      onArchive={() => void batchAction('archive')}
      onUnarchive={() => void batchAction('unarchive')}
      isArchiveView={showArchivedView}
      onDelete={() => void batchAction('delete')}
      onSnooze={(until) => void batchSnooze(until)}
    />
  );

  return (
    <AppShell
      sidebar={<AppSidebar />}
      theme="dark"
      className="quantmail-shell"
      customHeader={selectedIds.size > 0 ? selectionHeader : undefined}
      searchValue={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search in QuantMail (sender, subject, keyword)…"
      onFabClick={() =>
        activeLens === 'groups' ? setGroupEditorTarget('new') : handleOpenCompose()
      }
      fabLabel={activeLens === 'groups' ? 'New Group' : 'Compose email'}
      aria-label="QuantMail inbox"
    >
      <div className="inbox-workspace">
        <section className="inbox-list-pane" aria-label="Inbox messages">
          {/*
            Mailbox view switcher (People | Inbox). In-flow, right-aligned —
            deliberately NOT fixed/overlay: the 2026-10-11 P1 was the toggle
            pill sitting on top of the hero's "New chat" button and
            intercepting its clicks/taps. See components/MailboxViewToggle.tsx.
          */}
          <div className="mailbox-view-row">
            <MailboxViewToggle isInbox />
          </div>
          <header className="inbox-hero">
            <div>
              <p className="inbox-kicker">
                <span /> {heroKicker}
              </p>
              <h1>{heroTitle}</h1>
              <p>{heroSummary}</p>
              {/*
                SIA-P2-6: the search-folder scope chip. Search answers from the
                whole mailbox by default; the chip narrows back to one folder.
                Only rendered while a query is active — a scope without a query
                is meaningless, and the `sf` sync effect drops it with the query.
                The wrapper is `relative z-30` so the popover paints above the
                mail rows below (same paint-order contract as the filter row's
                `relative z-30`): the rows carry `will-change: transform`, and a
                static hero would let the panel render underneath them.
              */}
              {debouncedQuery !== '' && (
                <div className="relative z-30 mt-2 w-fit" ref={scopeMenuRef}>
                  <button
                    type="button"
                    ref={scopeTriggerRef}
                    onClick={() => setIsScopeMenuOpen((prev) => !prev)}
                    aria-expanded={isScopeMenuOpen}
                    aria-controls={isScopeMenuOpen ? scopePanelId : undefined}
                    aria-label={`Search folder: ${SEARCH_FOLDER_OPTIONS.find((option) => option.key === searchFolder)?.label}. Change search folder.`}
                    data-testid="search-scope-button"
                    className={`inline-flex items-center gap-1.5 px-3 min-h-[44px] sm:min-h-[32px] rounded-full text-xs font-medium border whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] ${
                      searchFolder !== 'all' || isScopeMenuOpen
                        ? 'bg-[var(--quant-primary)]/12 text-[var(--quant-primary)] border-[var(--quant-primary)]/35 font-semibold'
                        : 'bg-[var(--quant-surface)] text-[var(--quant-muted-foreground)] border-white/[0.08] hover:text-[var(--quant-foreground)] hover:bg-white/[0.04] hover:border-white/[0.14]'
                    }`}
                  >
                    <span>{SEARCH_FOLDER_OPTIONS.find((option) => option.key === searchFolder)?.label}</span>
                    <svg
                      className={`size-3.5 transition-transform ${isScopeMenuOpen ? 'rotate-180' : ''}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  <AnimatePresence>
                    {isScopeMenuOpen && (
                      <motion.div
                        id={scopePanelId}
                        role="group"
                        aria-label="Search folder scope"
                        data-testid="search-scope-menu"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.14 }}
                        className="absolute left-0 top-full mt-2 z-30 w-60 rounded-2xl bg-[var(--quant-surface-elevated)] border border-[var(--quant-surface-elevated)] shadow-[0_4px_16px_rgba(0,0,0,0.6)] overflow-hidden"
                      >
                        <p className="px-3 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--quant-muted-foreground)]">
                          Search in
                        </p>
                        <div role="radiogroup" aria-label="Search in folder">
                          {SEARCH_FOLDER_OPTIONS.map((option) => {
                            const isOn = searchFolder === option.key;
                            return (
                              <button
                                key={option.key}
                                type="button"
                                role="radio"
                                aria-checked={isOn}
                                onClick={() => {
                                  setSearchFolder(option.key);
                                  setIsScopeMenuOpen(false);
                                }}
                                className="w-full min-h-[44px] px-3 flex items-center gap-2.5 text-left text-xs transition-colors hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--quant-primary)]"
                              >
                                <span
                                  aria-hidden="true"
                                  className={`size-[18px] shrink-0 rounded-full border inline-flex items-center justify-center transition-colors ${
                                    isOn ? 'border-[var(--quant-primary)]' : 'border-[#3A404D]'
                                  }`}
                                >
                                  <span
                                    className={`size-2 rounded-full transition-colors ${
                                      isOn ? 'bg-[var(--quant-primary)]' : 'bg-transparent'
                                    }`}
                                  />
                                </span>
                                <span
                                  className={`flex-1 truncate ${isOn ? 'text-[var(--quant-foreground)] font-semibold' : 'text-[var(--quant-muted-foreground)]'}`}
                                >
                                  {option.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
            {/*
              SIA-P1-2: one primary Compose per screen. The left-nav Compose
              (docked composer on this route, FAB on mobile) is the primary —
              the hero keeps only the actions the nav cannot do.
            */}
            <div className="hero-compose-row">
              {activeLens === 'groups' ? (
                <button
                  type="button"
                  className="hero-compose"
                  onClick={() => setGroupEditorTarget('new')}
                >
                  <MailIcon name="compose" /> New Group
                </button>
              ) : (
                <button
                  type="button"
                  className="hero-compose hero-compose-chat"
                  onClick={() => handleOpenCompose({ kind: 'chat' })}
                  title="Start a new chat thread"
                  aria-label="Start a new chat"
                >
                  <MailIcon name="chat" /> New chat
                </button>
              )}
            </div>
          </header>

          {/*
            The mobile search row used to live here, hand-rolled: an
            `AnimatePresence` height animation, a 44px field, a real Cancel button.
            It was right, and it was right on exactly one route — Drive, Contacts
            and Calendar all pass `onSearchChange` and all three had no search at
            all under 768px, because the shell's only field is `hidden md:flex`.

            So the row moved into `AppShell`, which is where the desktop bar
            already lives, and the animation moved to `grid-template-rows` on the
            way — the shell is on every route and one collapsing row does not
            justify framer-motion in the first chunk.
          */}

          {/*
            Focus Bar. Left: the lens — which slice of the inbox is on screen,
            plus a link out to the spam folder. Right: the narrowings that
            compose with it. See `InboxLens` for why the category chips went and
            why Spam is a link rather than a fifth tab.
          */}
          {/*
           * `relative z-30` is load-bearing, not decoration. `backdrop-blur-md`
           * makes this row a stacking context, and a *static* stacking context
           * paints with the in-flow blocks — below every stacking context that
           * follows it in the DOM. The virtualiser below carries
           * `will-change: transform`, so the mail rows are one such context, and
           * the filter popover's own `z-30` was being resolved inside a box that
           * had already lost the paint order: the panel rendered *behind* the
           * rows and could not be tapped. Positioning this row lifts its whole
           * subtree into the positioned layer, where the z-indexes mean what
           * they say. Any popover added to this row inherits the fix.
           */}
          <div className="relative z-30 flex items-center gap-2 py-2 px-3 sm:px-4 border-b md:border-b-0 border-[var(--quant-surface-elevated)] bg-[var(--quant-background)]/95 md:bg-black/95 backdrop-blur-md">
            {/*
              One pill holds the four lens tabs (All, Unread, Contacts, Spam)
              and the visible folder tabs, because they are one row of
              destinations to a reader. The tablist is a nested group rather
              than the pill itself: a link is not a `role="tab"`, and a tablist
              containing something that is not a tab is a widget a screen
              reader cannot describe — so the "+N more" overflow trigger and
              the Drafts link sit outside the tablist, and the overflow menu
              holds menu items, not duplicate tabs. Drafts is a link, not a
              tab, because drafts live at /drafts. The hairline says the last
              chip leaves.
            */}
            <div className="flex-1 min-w-0 flex items-center gap-1 p-1 rounded-full bg-[var(--quant-surface)] border border-[var(--quant-surface-elevated)] overflow-x-auto no-scrollbar select-none">
              <div
                role="tablist"
                aria-label="Conversation lens"
                className="flex items-center gap-1 shrink-0"
              >
                {INBOX_LENSES.map((lens, index) => {
                  const isActive = activeLens === lens.key;
                  const count = lensCounts[lens.key];
                  const unreadCount = lensCounts.unreadCounts[lens.key];
                  const totalCount = lensCounts.totalCounts[lens.key];
                  const hasUnread = typeof unreadCount === 'number' && unreadCount > 0;
                  const hasTotal = typeof totalCount === 'number' && totalCount > 0;
                  const badgeCount = hasUnread ? unreadCount : hasTotal ? totalCount : null;

                  return (
                    <button
                      key={lens.key}
                      type="button"
                      role="tab"
                      id={lensTabId(lens.key)}
                      aria-selected={isActive}
                      aria-controls={lensPanelId}
                      // Roving focus: the selected tab is the row's single tab
                      // stop, and the arrow keys move between the rest.
                      tabIndex={isActive ? 0 : -1}
                      ref={(node) => {
                        lensChipRefs.current[index] = node;
                      }}
                      title={`${lens.hint}${
                        typeof totalCount === 'number'
                          ? ` (${unreadCount ?? 0} unread, ${totalCount} total)`
                          : ''
                      }`}
                      aria-label={`${lens.label}${badgeCount !== null ? ` (${badgeCount})` : ''}`}
                      onClick={() => selectLens(lens.key)}
                      onKeyDown={(event) => onLensKeyDown(event, index)}
                      className={`px-3.5 min-h-[44px] sm:min-h-[32px] rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-all inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] ${
                        isActive
                          ? 'bg-[var(--quant-primary)]/12 text-[var(--quant-primary)] border border-[var(--quant-primary)]/35 shadow-[0_0_14px_rgba(255,140,66,0.15),inset_0_1px_0_0_rgba(255,255,255,0.06)] font-semibold'
                          : 'border border-white/[0.07] bg-white/[0.02] text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] hover:bg-white/[0.05] hover:border-white/[0.12]'
                      }`}
                    >
                      <span>{lens.label}</span>
                      {badgeCount !== null && (
                        <span
                          className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold leading-tight ${
                            isActive
                              ? 'bg-[var(--quant-primary)]/20 text-[var(--quant-primary-hover)]'
                              : hasUnread
                                ? 'bg-[var(--quant-primary)]/15 text-[var(--quant-primary-hover)] border border-[var(--quant-primary)]/30'
                                : 'bg-[var(--quant-background)] text-[var(--quant-muted-foreground)] border border-[var(--quant-surface-elevated)]'
                          }`}
                        >
                          {badgeCount}
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* Custom Folders — U3.1: only the visible slice renders as
                    tabs; the rest live in the "+N more" menu below the tablist.
                    Folder tabs share the pills' roving space (combined index),
                    and their id is lensTabId(lensKey) so the panel's
                    aria-labelledby resolves to the actual active tab — the old
                    lens-folder-<id> id did not, and is gone. */}
                {visibleFolders.map((folder, visibleIndex) => {
                  const lensKey = `folder_${folder.id}`;
                  const isActive = activeLens === lensKey;
                  const index = INBOX_LENSES.length + visibleIndex;
                  return (
                    <button
                      key={folder.id}
                      type="button"
                      role="tab"
                      id={lensTabId(lensKey)}
                      aria-selected={isActive}
                      aria-controls={lensPanelId}
                      tabIndex={isActive ? 0 : -1}
                      ref={(node) => {
                        lensChipRefs.current[index] = node;
                      }}
                      onClick={() => selectLens(lensKey)}
                      onKeyDown={(event) => onLensKeyDown(event, index)}
                      className={`px-3.5 min-h-[44px] sm:min-h-[32px] rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-all inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] ${
                        isActive
                          ? 'bg-[var(--quant-primary)]/12 text-[var(--quant-primary)] border border-[var(--quant-primary)]/35 shadow-[0_0_14px_rgba(255,140,66,0.15),inset_0_1px_0_0_rgba(255,255,255,0.06)] font-semibold'
                          : 'border border-white/[0.07] bg-white/[0.02] text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] hover:bg-white/[0.05] hover:border-white/[0.12]'
                      }`}
                    >
                      <span
                        className="size-2 rounded-full shrink-0"
                        style={{ backgroundColor: folder.color || 'var(--quant-primary)' }}
                        aria-hidden="true"
                      />
                      <span>{folder.name}</span>
                    </button>
                  );
                })}

                {/* + New Group Button */}
                <button
                  type="button"
                  onClick={() => setIsAddFolderModalOpen(true)}
                  data-testid="add-folder-button"
                  className="px-3 min-h-[44px] sm:min-h-[32px] rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all inline-flex items-center gap-1.5 border border-dashed border-[#3A404D] bg-[var(--quant-surface-elevated)]/60 text-[var(--quant-muted-foreground)] hover:text-[var(--quant-primary)] hover:border-[var(--quant-primary)]/50 hover:bg-[var(--quant-primary)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
                  title="Create a new group"
                  aria-label="New Group"
                >
                  <svg
                    className="size-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  {/* The plus icon above is the "+"; the label is just the noun. */}
                  <span>New Group</span>
                </button>
                {/* Trailing spacer: padding-right collapses inside overflow-x-auto,
                    so the last lens chip would otherwise sit flush-cut at the edge. */}
                <div aria-hidden="true" className="shrink-0 w-1" />
              </div>
              {/*
                U3.1 folder overflow: deliberately OUTSIDE the tablist above, so
                the tablist holds only tabs (the pre-existing New Group button
                inside it is left as-is, out of scope). The trigger is a plain
                disclosure button, not a role="tab", and the menu holds menu
                items, not duplicate tabs. The menu is fixed-position
                (AnchoredMenu), so it escapes this row's overflow-x-auto clip.
                Activating an item selects that folder, closes the menu, and
                returns focus to this trigger; Escape does the same via
                AnchoredMenu. The newly active folder is promoted into the
                visible tabs by the slice above, so it is on screen afterwards.
              */}
              {overflowFolders.length > 0 && (
                <AnchoredMenu
                  icon={<span>{`+${overflowFolders.length} more`}</span>}
                  triggerLabel={`${overflowFolders.length} more folders`}
                  triggerTitle={`${overflowFolders.length} more folders`}
                  triggerClassName="px-3 min-h-[44px] sm:min-h-[32px] rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all inline-flex items-center gap-1.5 border border-white/[0.07] bg-white/[0.02] text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] hover:bg-white/[0.05] hover:border-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
                  menuLabel="More folders"
                  menuClassName="w-52 overflow-hidden rounded-2xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] py-1 shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
                  wrapperClassName="inline-flex shrink-0"
                  scope="folder-overflow-menu"
                >
                  {(close) => (
                    <>
                      {overflowFolders.map((folder) => {
                        const lensKey = `folder_${folder.id}`;
                        return (
                          <button
                            key={folder.id}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              selectLens(lensKey);
                              close();
                            }}
                            className="w-full px-3 py-2.5 text-xs font-medium text-left whitespace-nowrap inline-flex items-center gap-1.5 text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--quant-primary)]"
                          >
                            <span
                              className="size-2 rounded-full shrink-0"
                              style={{ backgroundColor: folder.color || 'var(--quant-primary)' }}
                              aria-hidden="true"
                            />
                            <span>{folder.name}</span>
                          </button>
                        );
                      })}
                    </>
                  )}
                </AnchoredMenu>
              )}
            </div>
            {/*
              U3.1: Drafts is no longer a pill tab — drafts live at /drafts, and
              no in-page link to it existed, so this plain link beside the pill
              row keeps it discoverable without re-adding a tab. It is a link,
              not a role="tab", and sits outside the tablist. Sidebar, bottom
              nav, and keyboard routes to /drafts are unchanged.
            */}
            <Link
              href="/drafts"
              className="shrink-0 px-2 min-h-[44px] sm:min-h-[32px] inline-flex items-center text-xs font-medium whitespace-nowrap text-[var(--quant-muted-foreground)] hover:text-[var(--quant-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] rounded-full"
            >
              Drafts
            </Link>
            {/*
              U3.4: the category pills, in the U3.3 pill direction —
              one pill per selected category, outside the tablist
              (categories are narrowings, not destinations), beside
              the Filter trigger. The row itself scrolls horizontally
              (`overflow-x-auto` gives a flex item a zero automatic
              minimum size) and every pill is `shrink-0`, so pills
              can never push the trigger or the lens row off the
              strip at 390px; a +N overflow menu was rejected
              because it would hide the X buttons. A pill's label
              opens the Filter popover with the picker open; its X
              removes only that category. Turn/filter pills belong
              to U3.3 (open PR #1728, not in this tree) and are
              deliberately NOT duplicated here — when U3.3 merges,
              this row becomes the category section of its pill row.
            */}
            {categoryPills.length > 0 && (
              <div
                role="list"
                aria-label="Active categories"
                className="flex items-center gap-1.5 overflow-x-auto min-w-0"
              >
                {categoryPills.map((pill) => {
                  const category = pill.key.slice('category:'.length) as SelectableCategory;
                  return (
                    <span
                      key={pill.key}
                      role="listitem"
                      className="inline-flex shrink-0 items-center h-[34px] rounded-full border border-[var(--quant-primary)]/35 bg-[var(--quant-primary)]/12 text-[var(--quant-primary)]"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setDraftCategories(new Set(activeCategories));
                          setIsCategoryPickerOpen(true);
                          setIsFilterMenuOpen(true);
                        }}
                        aria-label={`Edit categories, ${pill.label} selected`}
                        title="Edit categories"
                        className="inline-flex items-center h-full px-2.5 text-xs font-semibold whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--quant-primary)] rounded-l-full"
                      >
                        {pill.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveCategories((prev) => removeCategory(prev, category))}
                        aria-label={`Remove ${pill.label} category`}
                        title={`Remove ${pill.label}`}
                        className="inline-flex items-center justify-center size-[28px] shrink-0 rounded-r-full hover:bg-[var(--quant-primary)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--quant-primary)]"
                      >
                        <IconX size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="relative shrink-0 flex items-center gap-1.5" ref={filterMenuRef}>
              {/*
                U3.2: one active chip beside the Filter trigger, rendered
                only while a narrowing is on. It is a second disclosure
                for the SAME popover, not a second trigger: it sets the
                same `isFilterMenuOpen` state, points at the same panel
                id, and is dismissed by the same outside-click/Escape
                effect (Escape returns focus to the Filter trigger, as
                before). It clears nothing and filters nothing.
                390px: the label truncates with an ellipsis inside a
                capped chip (full label in `title` + aria-label) so the
                chip cannot push the trigger or the U3.1 folder row off
                the strip; the count badge never truncates.
              */}
              {filterChip && (
                <button
                  type="button"
                  onClick={() => setIsFilterMenuOpen(true)}
                  aria-expanded={isFilterMenuOpen}
                  aria-controls={isFilterMenuOpen ? filterPanelId : undefined}
                  aria-label={`Show active filters: ${filterChip.label}, ${filterChip.count} narrowing${filterChip.count === 1 ? '' : 's'}`}
                  title={filterChip.label}
                  className="inline-flex items-center gap-1.5 px-2.5 min-h-[34px] max-w-[160px] sm:max-w-none rounded-full text-xs font-semibold whitespace-nowrap bg-[var(--quant-primary)]/12 text-[var(--quant-primary)] border border-[var(--quant-primary)]/35 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
                >
                  <IconFilter size={13} className="shrink-0" />
                  <span className="truncate">{filterChip.label}</span>
                  <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded-full font-semibold leading-tight bg-[var(--quant-primary)]/20 text-[var(--quant-primary-hover)]">
                    {filterChip.count}
                  </span>
                </button>
              )}
              <button
                type="button"
                ref={filterTriggerRef}
                onClick={() => setIsFilterMenuOpen((prev) => !prev)}
                aria-expanded={isFilterMenuOpen}
                /*
                  No `aria-haspopup`. In ARIA it is not a generic "there is a
                  popover here" flag — `true` is exactly synonymous with `menu`,
                  and this is not a menu: it holds a radiogroup and a set of
                  checkboxes, so a reader told "has popup menu" arrives expecting
                  `menuitem` children, arrow-key traversal of the whole panel and
                  typeahead, and finds a form instead. `aria-expanded` plus
                  `aria-controls` is the disclosure pattern, which is what this
                  actually is: a button that reveals the controls next to it.
                */
                aria-controls={isFilterMenuOpen ? filterPanelId : undefined}
                aria-label={
                  narrowingCount > 0
                    ? `Filter conversations, ${narrowingCount} active`
                    : 'Filter conversations'
                }
                className={`inline-flex items-center justify-center gap-1.5 px-3 min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-0 rounded-full text-xs font-medium border whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] ${
                  narrowingCount > 0 || isFilterMenuOpen
                    ? 'bg-[var(--quant-primary)]/12 text-[var(--quant-primary)] border-[var(--quant-primary)]/35 shadow-[0_0_14px_rgba(255,140,66,0.15),inset_0_1px_0_0_rgba(255,255,255,0.06)] font-semibold'
                    : 'bg-[var(--quant-surface)] text-[var(--quant-muted-foreground)] border-white/[0.08] hover:text-[var(--quant-foreground)] hover:bg-white/[0.04] hover:border-white/[0.14]'
                }`}
              >
                <IconFilter size={14} />
                <span className="hidden sm:inline">Filter</span>
                {narrowingCount > 0 && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full font-semibold leading-tight bg-[var(--quant-primary)]/20 text-[var(--quant-primary-hover)]">
                    {narrowingCount}
                  </span>
                )}
              </button>
              <AnimatePresence>
                {isFilterMenuOpen && (
                  <motion.div
                    id={filterPanelId}
                    /*
                      A named group, not a bare box. Without a role the panel is
                      three unrelated things in a row to a reader — a heading, a
                      radiogroup, some buttons — and nothing says they are one
                      control surface or that leaving it means leaving the filter.
                      `group` rather than `dialog` because nothing here is modal:
                      focus is not trapped, the list behind stays live, and Tab
                      walks out the far side on purpose.
                    */
                    role="group"
                    aria-label="Filter conversations"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.14 }}
                    className="absolute right-0 top-full mt-2 z-30 w-72 rounded-2xl bg-[var(--quant-surface-elevated)] border border-[var(--quant-surface-elevated)] shadow-[0_4px_16px_rgba(0,0,0,0.6)] overflow-hidden"
                  >
                    {/*
                      Two groups, two indicator shapes: a circle for the one-of
                      turn, a square for the any-of filters. That is the only
                      thing on screen telling a reader that picking `Their turn`
                      drops `Your turn` while ticking `Starred` drops nothing, and
                      it is the shape convention they already know from every
                      other form they have used.

                      Rows rather than a horizontal segment because three labels
                      with counts do not fit across a popover at any width a
                      phone has, and a 44px row is a target either thumb can hit.
                    */}
                    <p
                      id={turnGroupLabelId}
                      className="px-3 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--quant-muted-foreground)]"
                    >
                      Whose turn
                    </p>
                    <div role="radiogroup" aria-labelledby={turnGroupLabelId}>
                      {INBOX_TURNS.map((turn, index) => {
                        const isOn = activeTurn === turn.key;
                        return (
                          <button
                            key={turn.key}
                            type="button"
                            role="radio"
                            aria-checked={isOn}
                            tabIndex={isOn ? 0 : -1}
                            ref={(node) => {
                              turnRowRefs.current[index] = node;
                            }}
                            title={turn.hint}
                            onClick={() => selectTurn(turn.key)}
                            onKeyDown={(event) => onTurnKeyDown(event, index)}
                            className="w-full min-h-[44px] px-3 flex items-center gap-2.5 text-left text-xs transition-colors hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--quant-primary)]"
                          >
                            <span
                              aria-hidden="true"
                              className={`size-[18px] shrink-0 rounded-full border inline-flex items-center justify-center transition-colors ${
                                isOn ? 'border-[var(--quant-primary)]' : 'border-[#3A404D]'
                              }`}
                            >
                              <span
                                className={`size-2 rounded-full transition-colors ${
                                  isOn ? 'bg-[var(--quant-primary)]' : 'bg-transparent'
                                }`}
                              />
                            </span>
                            <span
                              className={`flex-1 truncate ${isOn ? 'text-[var(--quant-foreground)] font-semibold' : 'text-[var(--quant-muted-foreground)]'}`}
                            >
                              {turn.label}
                            </span>
                            <span className="shrink-0 text-[10px] font-semibold text-[var(--quant-muted-foreground)]">
                              {turnCounts[turn.key]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p
                      id={filterGroupLabelId}
                      className="mt-1 px-3 pt-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--quant-muted-foreground)] border-t border-[var(--quant-surface-elevated)]"
                    >
                      Narrow this view
                    </p>
                    {/*
                      The second half of the pair the indicator shapes promise. A
                      circle for the one-of turn, a square for the any-of filters —
                      and now the roles say the same thing the shapes do:
                      `radiogroup`/`radio` above, `group`/`checkbox` here. These
                      were `aria-pressed` toggle buttons, which announces "toggle
                      button, pressed" beside a drawn checkbox and leaves the eye
                      and the ear describing two different controls.

                      The group is what makes `Narrow this view` a heading rather
                      than decoration: without it a reader meets the checkboxes as
                      loose siblings of a paragraph, with nothing saying what they
                      share or where the set ends.
                    */}
                    <div role="group" aria-labelledby={filterGroupLabelId}>
                      {INBOX_FILTERS.map((filter) => {
                        const isOn = activeFilters.has(filter.key);
                        return (
                          <button
                            key={filter.key}
                            type="button"
                            role="checkbox"
                            aria-checked={isOn}
                            onClick={() => toggleFilter(filter.key)}
                            className="w-full min-h-[44px] px-3 flex items-center gap-2.5 text-left text-xs transition-colors hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--quant-primary)]"
                          >
                            <span
                              aria-hidden="true"
                              className={`size-[18px] shrink-0 rounded-md border inline-flex items-center justify-center transition-colors ${
                                isOn
                                  ? 'bg-[var(--quant-primary)] border-[var(--quant-primary)] text-[var(--quant-background)]'
                                  : 'border-[#3A404D] text-transparent'
                              }`}
                            >
                              <IconCheck size={12} strokeWidth={2.4} />
                            </span>
                            <span
                              className={`flex-1 truncate ${isOn ? 'text-[var(--quant-foreground)] font-semibold' : 'text-[var(--quant-muted-foreground)]'}`}
                            >
                              {filter.label}
                            </span>
                            <span className="shrink-0 text-[10px] font-semibold text-[var(--quant-muted-foreground)]">
                              {filterCounts[filter.key]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {/*
                      U3.4: the categories entry. It is a button, not
                      a checkbox row, because the picker below is a
                      section with its own draft — ticking a category
                      here would commit it immediately, which breaks
                      the picker's Apply/abandon contract. Opening it
                      seeds the draft from the committed selection
                      every time, so a previously abandoned draft can
                      never resurface.
                    */}
                    <button
                      type="button"
                      onClick={() => {
                        setDraftCategories(new Set(activeCategories));
                        setIsCategoryPickerOpen((prev) => !prev);
                      }}
                      aria-expanded={isCategoryPickerOpen}
                      className="w-full min-h-[44px] px-3 flex items-center gap-2.5 text-left text-xs transition-colors hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--quant-primary)] border-t border-[var(--quant-surface-elevated)]"
                    >
                      <span className="flex-1 truncate text-[var(--quant-muted-foreground)]">
                        Categories
                        {activeCategories.size > 0 && (
                          <span className="text-[var(--quant-primary)] font-semibold">
                            {` · ${activeCategories.size} selected`}
                          </span>
                        )}
                      </span>
                      <span aria-hidden="true" className="text-[var(--quant-muted-foreground)]">
                        {isCategoryPickerOpen ? '▴' : '▾'}
                      </span>
                    </button>
                    <CategoryPicker
                      open={isCategoryPickerOpen}
                      draft={draftCategories}
                      onDraftChange={setDraftCategories}
                      onApply={() => {
                        setActiveCategories(new Set(draftCategories));
                        setIsCategoryPickerOpen(false);
                      }}
                      onCancel={() => setIsCategoryPickerOpen(false)}
                    />
                    {narrowingCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTurn('any');
                          setActiveFilters(new Set());
                          // U3.4: the footer is clear-ALL — categories
                          // and any picker draft go with it.
                          setActiveCategories(new Set());
                          setIsCategoryPickerOpen(false);
                          setIsFilterMenuOpen(false);
                        }}
                        className="w-full min-h-[44px] px-3 flex items-center gap-2 text-left text-xs font-semibold text-[var(--quant-muted-foreground)] border-t border-[var(--quant-surface-elevated)] transition-colors hover:bg-[var(--quant-surface-elevated)] hover:text-[var(--quant-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--quant-primary)]"
                      >
                        <IconX size={13} />
                        {/*
                          "Narrowing" rather than "filter", because the count now
                          includes the turn, which is not one of the things this
                          menu calls a filter. A footer reading `Clear 2 filters`
                          above one ticked filter is a number the reader cannot
                          account for.
                        */}
                        Clear {narrowingCount} narrowing{narrowingCount === 1 ? '' : 's'}
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Pull to Refresh Indicator Bar */}
          <AnimatePresence>
            {(pullDistance > 0 || isRefreshing) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: pullDistance > 0 ? pullDistance : 42, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden flex items-center justify-center gap-2.5 text-xs font-semibold text-[var(--quant-primary)] bg-[var(--quant-primary)]/10 border-b border-[var(--quant-primary)]/20 py-2 select-none"
              >
                <div
                  className={`size-4 rounded-full border-2 border-[var(--quant-primary)] border-t-transparent ${
                    isRefreshing ? 'animate-spin' : ''
                  }`}
                  style={{
                    transform: isRefreshing ? undefined : `rotate(${pullDistance * 6}deg)`,
                  }}
                />
                <span>
                  {isRefreshing
                    ? 'Refreshing inbox…'
                    : pullDistance >= 56
                      ? 'Release to refresh'
                      : 'Pull down to refresh'}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <div
            className="mail-list pb-20"
            ref={listRef}
            /*
              The lens tablist's panel. See `lensPanelId` for why one panel serves
              four tabs and why it is this element.

              `tabIndex={0}` for two reasons that happen to want the same thing.
              A tab panel has to be reachable from its tab, and this one's contents
              are not always focusable — the loading skeletons and `All caught up!`
              hold nothing at all, and the rows are driven by `j`/`k` rather than
              by Tab. It is also a real scroll container (`overflow-y: auto`), and
              a scroller no one can put the caret into cannot be scrolled from the
              keyboard. Deliberately unconditional: a tab stop that appears only
              when the list happens to be empty is worse than one that is always
              in the same place.
            */
            role="tabpanel"
            id={lensPanelId}
            aria-labelledby={lensTabId(activeLens)}
            tabIndex={0}
            aria-busy={isLoading || isSearching}
            onTouchStart={ptrListProps.onTouchStart}
            onTouchMove={ptrListProps.onTouchMove}
            onTouchEnd={ptrListProps.onTouchEnd}
            onTouchCancel={ptrListProps.onTouchCancel}
          >
            {/*
              Where the cursor is, for a reader. Mounted unconditionally, and inside
              the one element that always exists, because a live region inserted at
              the moment it has something to say is a live region readers miss.
            */}
            <p className="sr-only" role="status" aria-live="polite">
              {cursorAnnouncement}
            </p>
            {/*
              The archived shelf scrolls with the conversations, so when the list
              is windowed it belongs inside the sized container (below). Here it
              only covers the states that replace the list entirely.
            */}
            {!showThreadList && currentArchivedThreads.length > 0 && (
              <ArchivedFolderRow
                count={currentArchivedThreads.length}
                isViewing={showArchivedView}
                categoryLabel={viewLabel}
                onToggle={() => setShowArchivedView((prev) => !prev)}
              />
            )}

            {(isLoading || isSearching) && (
              <div className="mail-loading" role="status" aria-label="Loading emails">
                {Array.from({ length: 6 }, (_, index) => (
                  <div key={index} aria-hidden="true">
                    <Skeleton variant="rect" width="100%" height="76px" />
                  </div>
                ))}
              </div>
            )}
            {error && (
              <div className="mail-error">
                <ErrorState
                  message={getFriendlyErrorMessage(error)}
                  onRetry={() => void refetch()}
                />
              </div>
            )}
            {!isLoading && !isSearching && !error && showGroupsView && (
              <section aria-label="Your groups" className="w-full border-b md:border-b-0 border-[var(--quant-surface-elevated)]">
                <header className="flex items-center justify-between gap-3 border-b md:border-b-0 border-[var(--quant-surface-elevated)] bg-[#0B0C0F] md:bg-black px-4 py-3">
                  <div>
                    <h2 className="text-sm font-bold text-[var(--quant-foreground)]">Groups</h2>
                    <p className="mt-0.5 text-[11px] text-[var(--quant-muted-foreground)]">
                      Open an existing conversation or start a new group chat.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setGroupEditorTarget('new')}
                    className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-[var(--quant-primary)] px-3.5 text-xs font-bold text-[var(--quant-background)] transition-colors hover:bg-[var(--quant-primary-hover)] active:bg-[var(--brand-primary-pressed)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--quant-background)]"
                  >
                    <span aria-hidden="true" className="text-base leading-none">
                      +
                    </span>
                    New Group
                  </button>
                </header>

                {areGroupsPending ? (
                  <div className="space-y-2 p-3">
                    {[0, 1, 2].map((index) => (
                      <Skeleton
                        key={index}
                        variant="rect"
                        width="100%"
                        height="76px"
                        aria-label={index === 0 ? 'Loading groups' : undefined}
                      />
                    ))}
                  </div>
                ) : groupsError ? (
                  <div className="px-6 py-14 text-center">
                    <h3 className="text-sm font-bold text-[var(--quant-foreground)]">Groups could not be loaded</h3>
                    <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">
                      Your saved groups are safe. Try again in a moment.
                    </p>
                  </div>
                ) : savedGroups.length === 0 ? (
                  <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
                    <div className="flex size-14 items-center justify-center rounded-full border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] text-[var(--quant-primary)]">
                      <svg
                        className="size-6"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden="true"
                      >
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </div>

                    <h3 className="mt-4 text-base font-bold text-[var(--quant-foreground)]">
                      Create your first group
                    </h3>

                    <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--quant-muted-foreground)]">
                      Save a set of addresses and keep every message in one unified conversation.
                    </p>

                    <button
                      type="button"
                      onClick={() => setGroupEditorTarget('new')}
                      className="mt-5 min-h-[44px] rounded-xl bg-[var(--quant-primary)] px-5 text-xs font-bold text-[var(--quant-background)] hover:bg-[var(--quant-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
                    >
                      + New Group
                    </button>
                  </div>
                ) : (
                  <ul role="list" className="m-0 list-none divide-y divide-[var(--quant-surface-elevated)] md:divide-y-0 md:space-y-1 p-0">
                    {savedGroups.map((group) => {
                      const matchingThread = findGroupThread(group);
                      const latestMessage = matchingThread?.latestEmail;
                      const accent = group.color ?? 'var(--quant-primary)';
                      const memberCount = group.emails.length;

                      return (
                        <li key={group.id}>
                          <div className="group flex min-h-[78px] items-center gap-3 bg-[var(--quant-surface)] px-3 py-2 transition-colors hover:bg-[var(--quant-surface-elevated)] sm:px-4">
                            <button
                              type="button"
                              onClick={() => {
                                if (matchingThread) {
                                  openEmail(matchingThread.latestEmail, matchingThread);
                                } else {
                                  setQuickGroupChatTarget(group);
                                }
                              }}
                              className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
                              aria-label={
                                matchingThread
                                  ? `Open ${group.name} group conversation`
                                  : `Start a conversation with ${group.name}`
                              }
                            >
                              <span className="relative shrink-0">
                                <span
                                  className="flex size-12 items-center justify-center rounded-full text-sm font-black text-[var(--quant-background)]"
                                  style={{ backgroundColor: accent }}
                                  aria-hidden="true"
                                >
                                  {group.name
                                    .replace(/[._-]+/g, ' ')
                                    .split(/\s+/)
                                    .filter(Boolean)
                                    .slice(0, 2)
                                    .map((part) => part[0])
                                    .join('')
                                    .toUpperCase()}
                                </span>

                                <span className="absolute -bottom-1 -right-1 flex min-w-5 items-center justify-center rounded-full border-2 border-[var(--quant-surface)] bg-[var(--quant-surface-elevated)] px-1 text-[var(--q-type-xs)] font-bold text-[var(--quant-foreground)]">
                                  {memberCount}
                                </span>
                              </span>

                              <span className="min-w-0 flex-1">
                                <span className="flex items-center justify-between gap-3">
                                  <strong className="truncate text-sm text-[var(--quant-foreground)]">
                                    {group.name}
                                  </strong>

                                  {matchingThread && (
                                    <time
                                      className="shrink-0 text-[10px] text-[var(--quant-muted-foreground)]"
                                      dateTime={safeISODateTime(
                                        matchingThread.receivedAt,
                                      )}
                                    >
                                      {formatReceivedAt(matchingThread.receivedAt)}
                                    </time>
                                  )}
                                </span>

                                <span className="mt-0.5 block truncate text-xs text-[var(--quant-muted-foreground)]">
                                  {matchingThread
                                    ? sanitizeSnippetText(
                                        latestMessage?.snippet ||
                                          latestMessage?.bodyText ||
                                          matchingThread.subject,
                                      )
                                    : `${memberCount} ${memberCount === 1 ? 'member' : 'members'} · Start the conversation`}
                                </span>
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setGroupEditorTarget(group)}
                              aria-label={`Edit group ${group.name}`}
                              className="flex size-11 shrink-0 items-center justify-center rounded-xl text-[var(--quant-muted-foreground)] transition-colors hover:bg-[var(--quant-surface-elevated)] hover:text-[var(--quant-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
                            >
                              <svg
                                className="size-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                              </svg>
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {unmatchedGroupThreads.length > 0 && (
                  <section
                    aria-labelledby="other-group-conversations-title"
                    className="border-t border-[var(--quant-surface-elevated)]"
                  >
                    <div
                      role="list"
                      aria-label="Other group conversations"
                      className="divide-y divide-[var(--quant-surface-elevated)] md:divide-y-0 md:space-y-1"
                    >
                      {unmatchedGroupThreads.map((thread) => {
                        const displayIndex = displayThreads.findIndex(
                          (candidate) => candidate.id === thread.id,
                        );

                        return (
                          <div key={thread.id} role="listitem">
                            <MemoizedEmailRow
                              thread={thread}
                              selfName={selfAvatarName}
                              isChecked={selectedIds.has(thread.id)}
                              isActive={
                                selectedEmail?.id === thread.id || selectedThread?.id === thread.id
                              }
                              isFocused={displayIndex >= 0 && focusedIndex === displayIndex}
                              isSpamMode={false}
                              savedGroups={savedGroups}
                              onToggleSelect={(event) => toggleSelect(thread.id, event)}
                              onToggleStar={(event) => void toggleStar(event, thread.id)}
                              onTogglePin={(event) => void togglePin(event, thread.id)}
                              onOpen={() => {
                                focusRow(thread.id);
                                openEmail(thread.latestEmail, thread);
                              }}
                              onArchive={() => void archiveEmail(thread.id)}
                              onUnarchive={() => void unarchiveEmail(thread.id)}
                              isArchiveView={showArchivedView}
                              onDelete={() => void deleteEmail(thread.id)}
                              onMarkRead={() => void markRead(thread.id)}
                              onMarkUnread={() => void markUnread(thread.id)}
                              canToggleRead={thread.messages.some((m) => !isFromMe(m, currentEmail))}
                              onSnooze={snoozeEmail}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
              </section>
            )}

            {!isLoading &&
              !isSearching &&
              !error &&
              !showGroupsView &&
              displayThreads.length === 0 && (
                <div className="w-full flex-1 min-h-[420px] flex flex-col items-center justify-center py-6">
                  {debouncedQuery ? (
                    <div className="mail-empty">
                      <span className="mail-empty-icon">
                        <MailIcon name="search" />
                      </span>
                      <p className="reading-eyebrow">Search query</p>
                      <h2>No matching messages.</h2>
                      <p>
                        No messages matched "{debouncedQuery}". Try searching for another keyword,
                        email, or subject.
                      </p>
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <Button
                          variant="primary"
                          onClick={() => {
                            setSearchQuery('');
                            setDebouncedQuery('');
                          }}
                        >
                          Clear search
                        </Button>
                        <Button variant="secondary" onClick={() => router.push('/search')}>
                          Advanced search
                        </Button>
                      </div>
                    </div>
                  ) : activeLens === 'snoozed' && narrowingCount === 0 ? (
                    <div className="mail-empty py-12 px-4 text-center space-y-3">
                      <div className="size-12 rounded-full bg-[var(--quant-primary)]/10 border border-[var(--quant-primary)]/30 text-[var(--quant-primary)] shadow-[0_0_20px_rgba(255,140,66,0.15)] flex items-center justify-center mx-auto mb-1">
                        <MailIcon name="clock" className="size-6" />
                      </div>
                      <h3 className="text-base font-bold text-white">Nothing snoozed right now</h3>
                      <p className="text-xs text-[var(--quant-muted-foreground)] max-w-xs mx-auto">
                        Conversations you snooze will wait here until their wake time.
                      </p>
                      <div className="pt-2 flex justify-center">
                        <Button variant="secondary" onClick={() => selectLens('all')}>
                          Back to Inbox
                        </Button>
                      </div>
                    </div>
                  ) : activeLens === 'spam' && narrowingCount === 0 ? (
                    <div className="mail-empty py-12 px-4 text-center space-y-3">
                      <div className="size-12 rounded-full bg-[var(--quant-surface-elevated)] border border-[var(--quant-surface-elevated)] text-[var(--quant-muted-foreground)] flex items-center justify-center mx-auto mb-1">
                        <IconSpam size={22} />
                      </div>
                      <h3 className="text-base font-bold text-white">No spam messages</h3>
                      <div className="pt-2 flex justify-center">
                        <Button variant="secondary" onClick={() => selectLens('all')}>
                          Back to Inbox
                        </Button>
                      </div>
                    </div>
                  ) : activeLens === 'unread' && narrowingCount === 0 ? (
                    <div className="mail-empty py-12 px-4 text-center space-y-2">
                      <div className="size-12 rounded-full bg-emerald-950/40 border border-emerald-800/60 text-emerald-400 flex items-center justify-center mx-auto mb-1">
                        <svg
                          className="size-6"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                      <h3 className="text-base font-bold text-white">All caught up!</h3>
                      <p className="text-xs text-[var(--quant-muted-foreground)]">Zero unread messages in your inbox.</p>
                    </div>
                  ) : activeLens === 'contacts' && narrowingCount === 0 ? (
                    <div className="mail-empty py-12 px-4 text-center space-y-3">
                      <div className="size-12 rounded-full bg-[var(--quant-surface-elevated)] border border-[var(--quant-surface-elevated)] text-[var(--quant-muted-foreground)] flex items-center justify-center mx-auto mb-1">
                        <svg
                          className="size-6"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        >
                          <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
                          <circle cx="9" cy="11" r="2.2" />
                          <path d="M5.6 16.6c.5-1.7 1.9-2.6 3.4-2.6s2.9.9 3.4 2.6" />
                          <path d="M15.6 10.4h2.8M15.6 13.6h2.8" />
                        </svg>
                      </div>
                      <h3 className="text-base font-bold text-white">
                        {contactDirectory && contactDirectory.size === 0
                          ? 'No saved contacts yet'
                          : 'No conversations with contacts yet'}
                      </h3>
                      <p className="text-xs text-[var(--quant-muted-foreground)] max-w-xs mx-auto">
                        {contactDirectory && contactDirectory.size === 0
                          ? 'Save someone to your address book and their conversations collect here.'
                          : 'Messages from people in your address book will appear here.'}
                      </p>
                      <div className="pt-2 flex justify-center">
                        <Button variant="secondary" onClick={() => router.push('/contacts')}>
                          Open Contacts
                        </Button>
                      </div>
                    </div>
                  ) : activeLens !== 'all' || narrowingCount > 0 ? (
                    <div className="mail-empty py-12 px-4 text-center space-y-2">
                      <div className="size-12 rounded-full bg-[var(--quant-surface-elevated)] border border-[var(--quant-surface-elevated)] text-[var(--quant-muted-foreground)] flex items-center justify-center mx-auto mb-1">
                        <IconFilter size={22} />
                      </div>
                      <h3 className="text-base font-bold text-white">Nothing in this view</h3>
                      <p className="text-xs text-[var(--quant-muted-foreground)] max-w-xs mx-auto">
                        {activeTurn === 'needs_you'
                          ? 'Nothing here is on your turn — no one is waiting on a reply from you.'
                          : activeTurn === 'waiting'
                            ? 'Nothing here is on their turn — you are not waiting on a reply from anyone.'
                            : 'No conversation matches everything you have on.'}
                        {heldBackCount > 0 &&
                          ` ${heldBackCount} automated ${
                            heldBackCount === 1 ? 'conversation is' : 'conversations are'
                          } held out of this view.`}
                      </p>
                      <div className="pt-2 flex justify-center">
                        <Button variant="secondary" onClick={resetInboxView}>
                          Show all conversations
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <InboxZeroState />
                  )}
                </div>
              )}
            {showThreadList && (
              /*
               * Windowed list. Only the visible rows plus an overscan margin are
               * mounted, so ten thousand conversations cost the same as thirty.
               *
               * The entry animation this replaces used `staggerChildren: 0.025`,
               * which delayed the Nth row by N×25ms — row 400 appeared ten seconds
               * in. Rows now mount and unmount as the window moves, so an entry
               * animation would re-fire on every scroll; the list is deliberately
               * static and the motion lives in the swipe gesture instead.
               *
               * Offsets are measured from the top of this container, which sits
               * `.mail-list`'s 0.45rem of padding below the scroll origin. That
               * constant bias affects only which rows are picked for the window
               * (absorbed by the overscan) and never where a row is painted, since
               * the height and the translate share one coordinate space.
               */
              <div className="relative w-full" style={{ height: `${virtualizer.totalSize}px` }}>
                {/* Out of flow so the rows' offsets stay exact; its height is fed
                    back to the virtualizer as `paddingStart`. */}
                <div ref={measureListHeader} className="absolute inset-x-0 top-0">
                  {isInboxPool && <SwipeHint />}
                  {activeLens === 'spam' && (
                    <SpamBanner
                      spamCount={allSpamThreads.length}
                      onEmptySpam={handleEmptySpam}
                      isEmptying={isEmptyingSpam}
                    />
                  )}
                  {currentArchivedThreads.length > 0 && (
                    <ArchivedFolderRow
                      count={currentArchivedThreads.length}
                      isViewing={showArchivedView}
                      categoryLabel={viewLabel}
                      onToggle={() => setShowArchivedView((prev) => !prev)}
                    />
                  )}
                  {showPinnedNotice && (
                    <p className="mail-pinned-notice">
                      <svg
                        className="size-3.5 shrink-0 text-[var(--quant-primary)]"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <line x1="12" y1="17" x2="12" y2="22" />
                        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z" />
                      </svg>
                      <span>
                        {pinnedCount} pinned {pinnedCount === 1 ? 'conversation is' : 'are'} held at
                        the top. The rest are newest first.
                      </span>
                    </p>
                  )}
                  {/*
                    `Your turn` and `Their turn` do not sum to `Anyone`, and an
                    unexplained gap between two counts reads as a bug. Say where
                    the difference went, and offer the one click that shows it.
                  */}
                  {heldBackCount > 0 && (
                    <p className="mail-pinned-notice">
                      <IconFilter size={13} className="shrink-0" />
                      <span>
                        {heldBackCount} automated{' '}
                        {heldBackCount === 1 ? 'conversation is' : 'conversations are'} held out of
                        this view — no one is waiting on a reply to them.{' '}
                        <button
                          type="button"
                          onClick={() => selectTurn('any')}
                          className="relative font-semibold text-[var(--quant-primary)] underline decoration-dotted underline-offset-2 hover:text-[var(--quant-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] rounded after:absolute after:-inset-y-[13px] after:-inset-x-[10px] after:content-['']"
                        >
                          Show both sides
                        </button>
                      </span>
                    </p>
                  )}
                </div>

                <div
                  role="list"
                  aria-label={showArchivedView ? 'Archived conversations' : 'Conversations'}
                  style={{
                    transform: `translateY(${virtualizer.offsetTop}px)`,
                    willChange: 'transform',
                  }}
                >
                  {virtualizer.items.map((item) => {
                    const thread = displayThreads[item.index];
                    if (!thread) return null;

                    return (
                      <div
                        key={item.key}
                        ref={virtualizer.measureRow(item.index)}
                        data-index={item.index}
                        role="listitem"
                        // Only the visible window is in the DOM, so the list's own
                        // length would understate the mailbox. These tell a screen
                        // reader "12 of 9,431" instead of "12 of 30".
                        aria-setsize={displayThreads.length}
                        aria-posinset={item.index + 1}
                        // The `j`/`k` cursor. `aria-current` is what says "this is
                        // the one" to a reader arriving here on its own terms; the
                        // `is-focused` class beside it only says that to an eye.
                        aria-current={focusedIndex === item.index ? 'true' : undefined}
                      >
                        <MemoizedEmailRow
                          thread={thread}
                          selfName={selfAvatarName}
                          isChecked={selectedIds.has(thread.id)}
                          isActive={
                            selectedEmail?.id === thread.id || selectedThread?.id === thread.id
                          }
                          isFocused={focusedIndex === item.index}
                          isSpamMode={activeLens === 'spam'}
                          savedGroups={savedGroups}
                          onRescueSpam={() => void handleRescueSpamThread(thread)}
                          onToggleSelect={(event) => toggleSelect(thread.id, event)}
                          onToggleStar={(event) => void toggleStar(event, thread.id)}
                          onTogglePin={(event) => void togglePin(event, thread.id)}
                          onOpen={() => {
                            focusRow(thread.id);
                            openEmail(thread.latestEmail, thread);
                          }}
                          onArchive={() => void archiveEmail(thread.id)}
                          onUnarchive={() => void unarchiveEmail(thread.id)}
                          isArchiveView={showArchivedView}
                          onDelete={() => void deleteEmail(thread.id)}
                          onMarkRead={() => void markRead(thread.id)}
                          onMarkUnread={() => void markUnread(thread.id)}
                          canToggleRead={thread.messages.some((m) => !isFromMe(m, currentEmail))}
                          onSnooze={snoozeEmail}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {showThreadList && isInboxPool && hasMore && (
            <div className="flex justify-center px-4 py-3">
              <Button
                variant="secondary"
                onClick={() => void loadMore()}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? 'Loading…' : 'Load more conversations'}
              </Button>
            </div>
          )}
          <footer className="inbox-list-footer">
            <span>
            {/* BB-P2-1: count the list the footer sits under. `displayThreads`
                is exactly what the virtualizer renders above — the old
                `threads` pool described a different list in the archived view
                or under any lens/filter narrowing. */}
              {displayThreads.length} conversation{displayThreads.length === 1 ? '' : 's'}
            </span>
            <span>Ecosystem connected · SES/DKIM active</span>
          </footer>
        </section>
        {/*
          Gmail-style navigation (user decision 2026-10-07): the desktop
          split-view reading pane was removed. Tapping an email navigates to
          the full /thread/[id] view instead of selecting into a side preview.
        */}
      </div>

      {/*
        Mounted only while open, and keyed on what it is editing.

        The key is what makes `useState` initialisers the whole reset story: pick a
        different group and the dialog remounts with that group's fields. The
        alternative — one long-lived instance with a `useEffect` that copies the
        `group` prop into state — clobbers a half-typed draft every time a
        background refetch hands back a new object identity for the same group.

        Conditional mounting is safe for the focus trap because it captures its
        return-focus target during render, not in the activation effect: the first
        render still happens while the chip that opened it holds focus.
      */}
      {groupEditorTarget !== null && (
        <GroupEditorModal
          key={groupEditorTarget === 'new' ? 'new' : groupEditorTarget.id}
          group={groupEditorTarget === 'new' ? null : groupEditorTarget}
          onClose={() => setGroupEditorTarget(null)}
          onSave={handleSaveGroup}
          onDelete={handleDeleteGroup}
        />
      )}

      {/* WhatsApp-Style Quick Group Chat Modal */}
      {quickGroupChatTarget !== null && (
        <QuickGroupChatDeck
          target={quickGroupChatTarget}
          message={quickChatMessage}
          onMessageChange={setQuickChatMessage}
          onClose={() => setQuickGroupChatTarget(null)}
          onRestore={(restoredTarget, restoredMessage) => {
            // Undo (or a failed send) hands the words back: reopen this exact
            // deck with the message intact, so nothing is silently eaten.
            setQuickGroupChatTarget(restoredTarget);
            setQuickChatMessage((prev) => (prev.trim() ? prev : restoredMessage));
          }}
          onSent={() => {
            void refetch();
          }}
        />
      )}
      {/* Superhuman Docked Composer */}
      <DockedComposer
        isOpen={isDockedComposerOpen}
        onClose={() => setIsDockedComposerOpen(false)}
        initialTo={dockedComposerInitialTo}
        initialSubject={dockedComposerInitialSubject}
        initialBody={dockedComposerInitialBody}
        replyToId={dockedComposerReplyToId}
        initialMessageKind={dockedComposerInitialKind}
        onSendSuccess={() => {
          refetch();
        }}
        onDiscard={() => {
          setDockedComposerInitialTo('');
          setDockedComposerInitialSubject('');
          setDockedComposerInitialBody('');
          setDockedComposerReplyToId(undefined);
          setDockedComposerInitialKind('mail');
        }}
      />

      {/* New Group / Contact Filter Modal */}
      {isAddFolderModalOpen && (
        <AddFolderModal
          isOpen={isAddFolderModalOpen}
          onClose={() => setIsAddFolderModalOpen(false)}
          onSave={handleCreateFolder}
          existingContacts={savedContactsList}
        />
      )}

      {/* QuantMail Shortcut Dock (Floating at bottom center, auto-collapsing to bottom-left rail when thread is open) */}
      <QuantMailShortcutDock
        onCommandPalette={openPalette}
        onUndo={undoLastArchive}
        initialCollapsed
        selectedThreadId={selectedThreadId}
        isThreadOpen={Boolean(selectedThreadId)}
      />
    </AppShell>
  );
}

/**
 * People view launch (2026-10-10): the root route defaults to the unified
 * People home — one place for every conversation with a person. The classic
 * inbox stays fully intact and reachable at `/?view=inbox` (power layer:
 * Sent, Drafts, labels, archive, search — untouched).
 *
 * This wrapper only switches which tree renders. `InboxPageContent` above
 * is the exact same inbox component, byte-for-byte unchanged. The
 * People|Inbox toggle pill lives in-flow at the top of each view
 * (see components/MailboxViewToggle.tsx) — never as a fixed overlay, so it
 * can never cover a primary action again (2026-10-11 P1).
 */

export default function RootPage() {
  const searchParams = useSearchParams();
  const isInbox = searchParams?.get('view') === 'inbox';
  return <>{isInbox ? <InboxPageContent /> : <PeopleHome />}</>;
}
