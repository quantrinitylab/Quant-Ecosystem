'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { apiClient } from '../services/api-client';
import {
  ErrorState,
  Skeleton,
  Button,
  nextRovingIndex,
  useFocusTrap,
  useReducedMotion,
  useSwipeActions,
} from '@quant/shared-ui';
import { AppShell } from '../components/AppShell';
import { useInbox } from '../hooks/useInbox';
import { useSearchEmails } from '../hooks/useSearchEmails';
import { AppSidebar } from '../components/AppSidebar';
import { EmailSafetyBanner } from '../components/EmailSafetyBanner';
import { EmailSnooze, snoozeUntilNextMorning } from '../components/EmailSnooze';
import { AnchoredMenu } from '../components/AnchoredMenu';
import { HoverActions } from '../components/HoverActions';
import { IdentityAvatar } from '../components/IdentityAvatar';
import { InboxZeroState } from '../components/InboxZeroState';
import { showToast } from '../components/InboxToast';
import { MailIcon } from '../components/MailIcon';
import { ReadTimeEstimate } from '../components/ReadTimeEstimate';
import { QuantMailLogo } from '../components/QuantMailLogo';
import { SelectionHeader } from '../components/SelectionHeader';
import { SmartReplySuggestions } from '../components/SmartReplySuggestions';
import { EmailSenderHeader } from '../components/EmailSenderHeader';
import { ConversationalThreadView } from '../components/ConversationalThreadView';
import { GroupEditorModal, type GroupDraft } from '../components/GroupEditorModal';
import { ThreadKindBadge } from '../components/MessageKindBadge';
import { UnreadDot } from '../components/UnreadDot';
import { useInboxKeyboard } from '../hooks/useInboxKeyboard';
import { useMailMutations } from '../hooks/useMailMutations';
import { useScrollElement, useVirtualizer } from '../lib/virtual/useVirtualizer';
import {
  filterThreadsByQuery,
  findConversation,
  groupEmailsIntoThreads,
  sanitizeSnippetText,
  threadAddresses,
  threadFocus,
  threadMessageIds,
  type ConversationThread,
} from '../lib/threading';
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
type InboxLens =
  | 'all'
  | 'primary'
  | 'unread'
  | 'updates'
  | 'social'
  | 'promotions'
  | 'forums'
  | 'contacts'
  | 'groups'
  | 'snoozed'
  | 'spam';
type InboxTurn = 'any' | 'needs_you' | 'waiting';
type InboxFilter = 'starred' | 'attachment';

const INBOX_LENSES: Array<{ key: InboxLens; label: string; hint: string }> = [
  /*
   * `All` leads because it is the default and the widest: a reader lands on the
   * full list and narrows from there, so the first chip should be the one already
   * selected rather than a partition they have to opt out of.
   */
  { key: 'all', label: 'All', hint: 'Every conversation, automated mail included' },
  { key: 'primary', label: 'Primary', hint: 'Direct person-to-person human correspondence' },
  { key: 'unread', label: 'Unread', hint: 'Conversations you have not opened yet' },
  {
    key: 'updates',
    label: 'Updates',
    hint: 'Receipts, confirmations, billing, and GitHub notices',
  },
  {
    key: 'social',
    label: 'Social',
    hint: 'Social networks, media platforms, and community notices',
  },
  { key: 'promotions', label: 'Promotions', hint: 'Newsletters, marketing, deals, and discounts' },
  {
    key: 'forums',
    label: 'Forums',
    hint: 'Mailing lists, group discussions, and community digests',
  },
  { key: 'contacts', label: 'Contacts', hint: 'Conversations with someone in your address book' },
  { key: 'groups', label: 'Groups', hint: 'Conversations with multiple people or saved groups' },
  { key: 'snoozed', label: 'Snoozed', hint: 'Conversations waiting for their wake time' },
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
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
    <div className="mx-3 sm:mx-4 my-2.5 px-3.5 py-2.5 rounded-xl bg-[#12141A] border border-[#282C35] flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2 text-[#EDEDED] min-w-0">
        <IconSpam size={15} className="text-[#FF8C42] shrink-0" />
        <span className="font-semibold text-xs text-[#EDEDED]">Spam</span>
      </div>
      {spamCount > 0 && (
        <button
          type="button"
          onClick={onEmptySpam}
          disabled={isEmptying}
          className="shrink-0 text-xs font-semibold text-[#FF8C42] hover:text-[#FF9B5A] disabled:opacity-50 transition-colors"
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
 * reader only meant to scroll past. `useSwipeActions` claims nothing until the
 * finger has travelled 14px horizontally *and* 1.6x more horizontally than
 * vertically; the moment vertical intent wins the touch is latched out and
 * cannot be reclaimed however the finger curves afterwards; and there is no
 * velocity path at all, so committing means crossing 35% of the row's own width,
 * floored at 88px, which no flick can reach.
 *
 * Second, the two ends were not peers: archive was destructive and pin was a
 * decoration, so one motion made the expensive action exactly as easy as the
 * cheap one. Both ends now file the conversation somewhere real and both come
 * back from the toast's Undo — left archives, right snoozes until tomorrow
 * morning. Pin stays a button, which is where a decoration belongs.
 *
 * Third, the affordance was invisible. The revealed pane names the action from
 * the first few pixels, only reaches full strength past the commit line, and the
 * phone ticks exactly as that line is crossed — so a first half-drag teaches the
 * gesture and then lets go of it with nothing having happened.
 *
 * The buttons stay. Archive at 44px on a phone, Pin at 44px, `HoverActions` for
 * pointers: everything the swipe reaches is reachable without it, which is what
 * makes it an accelerator rather than the only door.
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
  onOpen: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onSnooze: (emailId: string, snoozeUntil: Date) => void;
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
  onOpen,
  onArchive,
  onDelete,
  onMarkRead,
  onMarkUnread,
  onSnooze,
}: EmailRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);
  const [showRowMenu, setShowRowMenu] = useState(false);
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
        color: matched?.color ?? '#FF8C42',
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
            color: group.color ?? '#FF8C42',
          };
        }
      }
    }
    return null;
  }, [savedGroups, thread.messages, thread.subject]);

  /*
   * Left files the conversation away, right puts it down until tomorrow morning.
   * `snoozeUntilNextMorning` is the same function the snooze menu's `Tomorrow`
   * calls, so a gesture and a menu item that use one word can never mean two
   * different times.
   *
   * Off while the row is selected or its snooze menu is open: a selected row
   * belongs to the selection header's batch actions, and a row sliding out from
   * under an anchored menu would leave the menu pointing at nothing.
   */
  const swipe = useSwipeActions({
    left: { label: 'Archive', onCommit: onArchive },
    right: { label: 'Snooze', onCommit: () => onSnooze(email.id, snoozeUntilNextMorning()) },
    disabled: isChecked || showSnoozeMenu,
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
          className={`mail-row-swipe-pane ${swipe.armed ? 'is-armed' : ''} ${
            swipe.direction === 'left' ? 'is-trailing' : 'is-leading'
          }`}
        >
          <span className="mail-row-swipe-label" style={{ opacity: 0.45 + swipe.progress * 0.55 }}>
            <MailIcon name={swipe.direction === 'left' ? 'archive' : 'clock'} className="size-4" />
            {swipe.direction === 'left' ? 'Archive' : 'Snooze'}
          </span>
        </div>
      )}
      <article
        ref={swipe.ref}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
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
        className={`mail-row touch-pan-y ${swipe.direction || reducedMotion ? '' : 'is-swipe-settling'} ${thread.isRead ? '' : 'is-unread'} ${isActive ? 'is-active' : ''} ${isFocused ? 'is-focused' : ''}`}
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
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelect(event);
          }}
          className="flex shrink-0 items-center justify-center rounded-full min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
          title="Select conversation"
          aria-label={`Select ${groupInfo?.name ?? thread.participantsSummary}`}
        >
          {groupInfo ? (
            <span
              className="flex size-7 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm shrink-0"
              style={{ backgroundColor: groupInfo.color || '#FF8C42' }}
              aria-hidden="true"
            >
              {groupInfo.name
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join('') || 'GP'}
            </span>
          ) : (
            <IdentityAvatar name={thread.participants[0] || 'You'} size="sm" />
          )}
        </button>
        <div className="mail-row-copy">
          <div className="mail-row-meta">
            <div className="flex items-center gap-1.5 min-w-0">
              <strong className="truncate text-[#F5F5F5] font-semibold">
                {groupInfo?.name ?? thread.participantsSummary}
              </strong>
              {thread.count > 1 && (
                <span className="px-1.5 py-0.2 rounded-full bg-[#282C35] text-[10px] font-mono text-[#A1A4AC] shrink-0">
                  {thread.count}
                </span>
              )}
              {isSpamMode && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30 shrink-0">
                  Spam
                </span>
              )}
            </div>
            {!thread.isRead && <UnreadDot />}
            {thread.kindMix !== 'mail' && <ThreadKindBadge mix={thread.kindMix} />}
            <time>{formatReceivedAt(thread.receivedAt)}</time>
          </div>
          <h3 className="text-xs sm:text-sm font-medium text-[#A1A4AC] truncate">
            {groupInfo && thread.subject.toLowerCase() === `[group] ${groupInfo.name.toLowerCase()}`
              ? sanitizeSnippetText(email.snippet || email.bodyText) || '(no subject)'
              : sanitizeSnippetText(thread.subject) || '(no subject)'}
          </h3>
          <p className="text-xs text-[#A1A4AC] truncate">
            {sanitizeSnippetText(email.snippet || email.bodyText)}
          </p>
        </div>
        {/* Hover actions bar — quick actions on hover (Desktop) */}
        <AnimatePresence>
          {(isHovered || showSnoozeMenu) && (
            <HoverActions
              emailId={thread.id}
              isRead={thread.isRead}
              isStarred={email.isStarred}
              onArchive={onArchive}
              onDelete={onDelete}
              onMarkRead={onMarkRead}
              onMarkUnread={onMarkUnread}
              onSnooze={() => setShowSnoozeMenu((prev) => !prev)}
              onToggleStar={onToggleStar}
              isSpam={isSpamMode}
              onRescueSpam={onRescueSpam}
            />
          )}
        </AnimatePresence>
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
            className="flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-xl bg-[#FF8C42]/10 hover:bg-[#FF8C42]/20 text-[#FF8C42] hover:text-[#FFB875] border border-[#FF8C42]/30 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_0_12px_rgba(255,140,66,0.1)] text-xs font-semibold transition-all min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] z-10"
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
        {isSpamMode && !isHovered && !showSnoozeMenu && (
          <button
            type="button"
            className="flex items-center justify-center shrink-0 p-1.5 rounded-xl min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-[#A1A4AC] hover:text-rose-400 hover:bg-rose-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            onClick={(event) => {
              event.stopPropagation();
              void onDelete();
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
          Archive and Pin, the two row-level actions, as buttons rather than as
          the two ends of a drag. `sm:hidden` on Archive because a pointer already
          has it in `HoverActions` and a permanent button there would sit under the
          hover bar; a finger has no hover, so on a phone this is the only way to
          archive without opening the thread.
        */}
        {!isSpamMode && (
          <div className="sm:hidden shrink-0" onClick={(e) => e.stopPropagation()}>
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
              triggerClassName="flex items-center justify-center p-1.5 rounded-xl min-h-[44px] min-w-[44px] text-[#A1A4AC] hover:text-[#F5F5F5] hover:bg-[#282C35]/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
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
                      onToggleStar(e);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[#F5F5F5] hover:bg-[#1E2128] hover:text-[#FF8C42] rounded-lg transition-colors text-left"
                  >
                    <svg
                      className="size-3.5 shrink-0"
                      viewBox="0 0 24 24"
                      fill={email.isStarred ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <line x1="12" y1="17" x2="12" y2="22" />
                      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z" />
                    </svg>
                    <span>{email.isStarred ? 'Unpin from top' : 'Pin to top'}</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      close();
                      if (thread.isRead) onMarkUnread();
                      else onMarkRead();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[#F5F5F5] hover:bg-[#1E2128] rounded-lg transition-colors text-left"
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

                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      close();
                      setShowSnoozeMenu(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[#F5F5F5] hover:bg-[#1E2128] rounded-lg transition-colors text-left"
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

                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      close();
                      void onArchive();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[#F5F5F5] hover:bg-[#1E2128] rounded-lg transition-colors text-left"
                  >
                    <MailIcon name="archive" className="size-3.5 shrink-0" />
                    <span>Archive</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      close();
                      void onDelete();
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
        {/* Pin button: shown on resting row only when pinned, or on hover via HoverActions */}
        {!isSpamMode && email.isStarred && !isHovered && !showSnoozeMenu && (
          <button
            type="button"
            className="flex items-center justify-center shrink-0 p-1.5 rounded-xl transition-all min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] text-[#FF8C42] fill-[#FF8C42] bg-[#FF8C42]/15"
            onClick={onToggleStar}
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
      </article>
    </div>
  );
}

function ReadingPane({
  thread,
  email,
  onClose,
  onArchive,
  onDelete,
  onToggleStar,
  isSpam,
  onNotSpam,
}: {
  thread?: ConversationThread | null;
  email: Email | null;
  onClose: () => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
  onToggleStar?: (id: string) => void;
  isSpam?: boolean;
  onNotSpam?: (ids: string[]) => void;
}) {
  if (!email && !thread) {
    return (
      <section className="reading-pane reading-pane-empty" aria-label="Message preview">
        <div className="reading-ambient" aria-hidden="true" />
        <div className="reading-empty-content">
          <QuantMailLogo interactive={false} />
          <p className="reading-eyebrow mt-4">Zero-noise workspace</p>
          <h2>
            Choose the signal.
            <br />
            We&apos;ll quiet the rest.
          </h2>
          <p>Select a message to preview it or use keyboard shortcuts (J/K) to navigate.</p>
          <div className="reading-shortcuts" aria-label="Preview guidance">
            <span>
              <kbd>J</kbd> / <kbd>K</kbd> Navigate
            </span>
            <span>
              <kbd>E</kbd> Archive
            </span>
            <span>
              <kbd>S</kbd> Star
            </span>
            <span>
              <kbd>C</kbd> Compose
            </span>
          </div>
        </div>
      </section>
    );
  }

  const activeId = thread?.threadId || thread?.id || email?.threadId || email?.id || '';
  const initialEmails = thread?.messages || (email ? [email] : []);

  return (
    <motion.aside
      className="reading-pane overflow-hidden flex flex-col"
      aria-label="Message preview"
      initial={{ opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.2 }}
    >
      <ConversationalThreadView
        threadId={activeId}
        initialEmails={initialEmails}
        subject={thread?.subject || email?.subject || '(No Subject)'}
        isStarred={thread?.isStarred ?? email?.isStarred ?? false}
        onClose={onClose}
        onArchive={onArchive ? () => onArchive(activeId) : undefined}
        onDelete={onDelete ? () => onDelete(activeId) : undefined}
        onStarToggle={onToggleStar ? () => onToggleStar(activeId) : undefined}
        variant="pane"
        isSpam={isSpam}
        onNotSpam={onNotSpam}
      />
    </motion.aside>
  );
}

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
const GROUP_ACCENT_DEFAULT = '#FF8C42';

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
    <span className="shrink-0 inline-flex items-stretch rounded-full bg-[#111318] border border-[#282C35] overflow-hidden">
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
        className="min-h-touch pl-3 pr-2.5 inline-flex items-center gap-2 text-xs font-medium text-[#F5F5F5] hover:bg-[#1C1F26] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF8C42]"
      >
        <span
          aria-hidden="true"
          className="size-2 rounded-full shrink-0"
          style={{ background: accent }}
        />
        <span className="max-w-[10rem] truncate">{group.name}</span>
        <span className="text-[11px] font-semibold text-[#A1A4AC] tabular-nums">{count}</span>
      </button>
      <span aria-hidden="true" className="w-px bg-[#282C35]" />
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit group ${group.name}`}
        title={`Edit ${group.name}`}
        className="w-11 min-h-touch inline-flex items-center justify-center text-[#A1A4AC] hover:text-[#FF8C42] hover:bg-[#1C1F26] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF8C42]"
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
      className="w-full min-h-[44px] flex items-center justify-between gap-3 px-4 py-3 bg-[#111318] hover:bg-[#16181D] border-b border-[#282C35] transition-colors select-none group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] focus-visible:ring-inset"
    >
      <span className="flex items-center gap-3 min-w-0">
        <span className="size-8 shrink-0 rounded-full bg-[#16181D] border border-[#282C35] flex items-center justify-center text-[#A1A4AC] group-hover:text-[#FF8C42] transition-colors">
          <MailIcon name={isViewing ? 'mail' : 'archive'} className="size-4" />
        </span>
        <span className="flex flex-col min-w-0">
          <span className="text-sm font-semibold text-[#F5F5F5] truncate">
            {isViewing ? 'Back to inbox' : 'Archived'}
          </span>
          {/*
            The secondary tier, not the tertiary one: `#6B6E76` at 11px measures
            3.64:1 on this surface, under the 4.5:1 small text needs. It still
            reads as the quieter of the two lines because the line above it is
            larger and semibold.
          */}
          <span className="text-[11px] text-[#A1A4AC] truncate">
            {isViewing
              ? `Viewing archived ${categoryLabel}`
              : `${count} archived conversation${count === 1 ? '' : 's'}`}
          </span>
        </span>
      </span>
      <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-[#FF8C42]/15 text-[#FF8C42] border border-[#FF8C42]/30 shadow-[0_0_10px_rgba(255,140,66,0.12)]">
        {count}
      </span>
    </button>
  );
}

export default function InboxPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const lensParam = searchParams?.get('lens');
  const [activeLens, setActiveLens] = useState<InboxLens>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('lens');
      if (p === 'unread' || p === 'contacts' || p === 'groups' || p === 'snoozed' || p === 'spam')
        return p;
    }
    return 'all';
  });

  useEffect(() => {
    const p = searchParams?.get('lens');
    if (p === 'unread' || p === 'contacts' || p === 'groups' || p === 'snoozed' || p === 'spam') {
      setActiveLens(p);
    } else {
      setActiveLens('all');
    }
    setShowArchivedView(false);
  }, [searchParams]);

  const [activeTurn, setActiveTurn] = useState<InboxTurn>('any');
  const [activeFilters, setActiveFilters] = useState<Set<InboxFilter>>(() => new Set());
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
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showArchivedView, setShowArchivedView] = useState(false);
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
  const [isSendingQuickChat, setIsSendingQuickChat] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [selectedThread, setSelectedThread] = useState<ConversationThread | null>(null);
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
  const { data: allEmails, isLoading, error, refetch } = useInbox({ folderType: 'INBOX' });
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
  const savedGroups = contactGroups ?? [];

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
      router.push(`/compose?to=${encodeURIComponent(group.emails.join(','))}`);
    },
    [router],
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

  const { user: currentUser } = useAuth();
  const currentEmail = currentUser?.email || '';

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
   * What a query is answered from.
   *
   * Searching used to *replace* the corpus with the server's answer, which threw away
   * everything the client already had: the response is one page of loose messages, so
   * conversations lost the rest of their messages and the participants, counts and
   * focus computed from them. Now it widens instead — the mailbox already loaded, plus
   * the server hits it did not contain — and one grouping pass rebuilds whole
   * conversations from the union, exactly as the unsearched inbox does.
   *
   * Hits that are archived are left out on purpose: they belong to the archived shelf's
   * pool below, and adding them here would put an archived conversation in the inbox.
   */
  const searchedEmails = useMemo(() => {
    const local = allEmails ?? [];
    if (!debouncedQuery) return local;

    const archivedIds = new Set((archivedEmails ?? []).map((m) => m.id));
    const seen = new Set(local.map((m) => m.id));
    const corpus = [...local];

    for (const hit of searchResults ?? []) {
      if (!hit?.id || seen.has(hit.id) || archivedIds.has(hit.id)) continue;
      seen.add(hit.id);
      corpus.push(hit);
    }

    return corpus;
  }, [debouncedQuery, allEmails, archivedEmails, searchResults]);

  const groupedThreads = useMemo(
    () => groupEmailsIntoThreads(searchedEmails, currentEmail),
    [searchedEmails, currentEmail],
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
      if (lens === 'contacts') return isContactThread(t);
      if (lens === 'groups') return isGroupThread(t);
      if (lens === 'snoozed') return true;
      if (lens === 'spam') return true;
      return true;
    },
    [isContactThread, isGroupThread],
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
    ): ConversationThread[] => {
      const active = Array.from(filters);
      if (lens === 'all' && turn === 'any' && active.length === 0) return list;
      return list.filter(
        (t) =>
          matchesLens(t, lens) &&
          (turn === 'any' || threadFocus(t, currentEmail) === turn) &&
          active.every((f) => matchesFilter(t, f)),
      );
    },
    [currentEmail, matchesFilter, matchesLens],
  );

  const resetInboxView = useCallback(() => {
    setActiveLens('all');
    setActiveTurn('any');
    setActiveFilters(new Set());
    router.replace('/', { scroll: false });
  }, [router]);

  /**
   * Every narrowing control leaves the archived shelf, because the shelf is a
   * different pool: staying on it while the lens changes shows a count for one list
   * above a different one.
   */
  const selectLens = useCallback(
    (lens: InboxLens) => {
      setActiveLens(lens);
      setShowArchivedView(false);
      const target = lens === 'all' ? '/' : `/?lens=${lens}`;
      router.replace(target, { scroll: false });
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
   */
  const onLensKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const next = nextRovingIndex(event.key, index, INBOX_LENSES.length);
      if (next === null) return;
      event.preventDefault();
      const lens = INBOX_LENSES[next]?.key;
      if (lens) selectLens(lens);
      lensChipRefs.current[next]?.focus();
    },
    [selectLens],
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
      showArchivedView
        ? allArchivedThreads
        : activeLens === 'spam'
          ? allSpamThreads
          : activeLens === 'snoozed'
            ? allSnoozedThreads
            : (threads ?? []),
    [showArchivedView, allArchivedThreads, activeLens, allSpamThreads, allSnoozedThreads, threads],
  );

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
    const basePool = showArchivedView ? allArchivedThreads : (threads ?? []);
    const pool = narrowThreads(basePool, 'all', activeTurn, activeFilters);
    let allUnread = 0;
    let primaryUnread = 0;
    let updatesUnread = 0;
    let socialUnread = 0;
    let promotionsUnread = 0;
    let forumsUnread = 0;
    let groupsUnread = 0;
    let contactsUnread: number | null = isDirectoryPending ? null : 0;
    for (const t of pool) {
      if (!t.isRead) {
        allUnread += 1;
        if (t.category === 'primary') primaryUnread += 1;
        else if (t.category === 'updates') updatesUnread += 1;
        else if (t.category === 'social') socialUnread += 1;
        else if (t.category === 'promotions') promotionsUnread += 1;
        else if (t.category === 'forums') forumsUnread += 1;
        if (isGroupThread(t)) groupsUnread += 1;
        if (contactsUnread !== null && isContactThread(t)) contactsUnread += 1;
      }
    }
    const spamUnread = allSpamThreads.filter((t) => !t.isRead).length;
    const snoozedUnread = allSnoozedThreads.filter((t) => !t.isRead).length;
    const counts: Record<InboxLens, number | null> = {
      all: allUnread,
      primary: primaryUnread,
      unread: allUnread,
      updates: updatesUnread,
      social: socialUnread,
      promotions: promotionsUnread,
      forums: forumsUnread,
      contacts: contactsUnread,
      groups: groupsUnread,
      snoozed: snoozedUnread,
      spam: spamUnread,
    };
    return counts;
  }, [
    showArchivedView,
    allArchivedThreads,
    threads,
    allSpamThreads,
    allSnoozedThreads,
    activeTurn,
    activeFilters,
    narrowThreads,
    isGroupThread,
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
    const pool = narrowThreads(activeThreadPool, activeLens, 'any', activeFilters);
    const counts: Record<InboxTurn, number> = { any: pool.length, needs_you: 0, waiting: 0 };
    for (const t of pool) {
      const focus = threadFocus(t, currentEmail);
      if (focus === 'needs_you') counts.needs_you += 1;
      else if (focus === 'waiting') counts.waiting += 1;
    }
    return counts;
  }, [activeThreadPool, activeLens, activeFilters, narrowThreads, currentEmail]);

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
      counts[key] = narrowThreads(activeThreadPool, activeLens, activeTurn, others).filter((t) =>
        matchesFilter(t, key),
      ).length;
    }
    return counts;
  }, [activeThreadPool, activeLens, activeTurn, activeFilters, narrowThreads, matchesFilter]);

  const heldBackCount =
    activeTurn === 'any' ? 0 : turnCounts.any - turnCounts.needs_you - turnCounts.waiting;

  /** How many narrowings are on, for the Filter trigger's badge and its footer. */
  const narrowingCount = (activeTurn === 'any' ? 0 : 1) + activeFilters.size;

  /** What the archived shelf calls the population it is counting. */
  const viewLabel = useMemo(() => {
    // Named off the controls. These read `conversations needing you` / `conversations
    // you are waiting on` when the tabs still said `Needs you` / `Waiting`, and kept
    // saying it after the relabel — so the shelf described a partition by a name
    // that appeared nowhere on screen.
    const turnPart =
      activeTurn === 'needs_you'
        ? 'conversations on your turn'
        : activeTurn === 'waiting'
          ? 'conversations on their turn'
          : 'conversations';
    const lensPart =
      activeLens === 'unread'
        ? `unread ${turnPart}`
        : activeLens === 'contacts'
          ? `${turnPart} with your contacts`
          : activeLens === 'groups'
            ? `group ${turnPart}`
            : turnPart;
    return activeFilters.size > 0 ? `filtered ${lensPart}` : lensPart;
  }, [activeLens, activeTurn, activeFilters]);

  const currentArchivedThreads = useMemo(() => {
    return narrowThreads(allArchivedThreads, activeLens, activeTurn, activeFilters);
  }, [allArchivedThreads, activeLens, activeTurn, activeFilters, narrowThreads]);

  const displayThreads = useMemo(() => {
    const sourceThreads = narrowThreads(activeThreadPool, activeLens, activeTurn, activeFilters);

    return [...sourceThreads].sort((a, b) => {
      if (a.isStarred !== b.isStarred) {
        return a.isStarred ? -1 : 1;
      }
      return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
    });
  }, [activeThreadPool, activeLens, activeTurn, activeFilters, narrowThreads]);

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
    () => displayThreads.filter((t) => t.isStarred).length,
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

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const isHorizontalSwipe = useRef(false);

  useEffect(() => {
    const handleGlobalRefresh = async () => {
      setIsRefreshing(true);
      setPullDistance(40);
      try {
        await refetch();
        showToast({ text: 'Inbox up to date', type: 'info' });
      } finally {
        setTimeout(() => {
          setIsRefreshing(false);
          setPullDistance(0);
        }, 450);
      }
    };

    window.addEventListener('quant:refresh', handleGlobalRefresh);
    return () => window.removeEventListener('quant:refresh', handleGlobalRefresh);
  }, [refetch]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const listEl = listElementRef.current;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isHorizontalSwipe.current = false;

    if (listEl && listEl.scrollTop <= 5) {
      isPulling.current = true;
    } else {
      isPulling.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling.current || isRefreshing || isHorizontalSwipe.current) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = Math.abs(currentX - touchStartX.current);
    const diffY = currentY - touchStartY.current;

    // If user is swiping horizontally, cancel pull-to-refresh completely
    if (diffX > 8 && diffX > Math.abs(diffY)) {
      isHorizontalSwipe.current = true;
      isPulling.current = false;
      setPullDistance(0);
      return;
    }

    if (diffY > 15 && diffY > diffX * 1.5) {
      const distance = Math.min(diffY * 0.35, 50);
      setPullDistance(distance);
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchEnd = async () => {
    isHorizontalSwipe.current = false;
    if (!isPulling.current) {
      setPullDistance(0);
      return;
    }
    isPulling.current = false;
    if (pullDistance >= 36 && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(40);
      try {
        await refetch();
        showToast({ text: 'Inbox up to date', type: 'info' });
      } finally {
        setTimeout(() => {
          setIsRefreshing(false);
          setPullDistance(0);
        }, 450);
      }
    } else {
      setPullDistance(0);
    }
  };

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

  const heroTitle = showArchivedView
    ? 'Archived'
    : debouncedQuery
      ? 'Search results'
      : 'Your Inbox';

  const heroSummary = useMemo(() => {
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
    return unreadCount > 0 ? `${unread} waiting for review.` : 'You are completely caught up.';
  }, [activeThreadPool, debouncedQuery, showArchivedView, unreadCount]);

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
    async (action: 'archive' | 'delete') => {
      const ids = Array.from(selectedIds);
      setSelectedIds(new Set());
      // `ids.length` is the number of conversations, which is what the toast counts;
      // the request list is every message inside them.
      await mutations.batch(
        action === 'archive' ? 'archive' : 'trash',
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

  const archiveEmail = useCallback(
    (id: string) => mutations.archive(conversationIds(id)),
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
      if (!email) {
        setSelectedEmail(null);
        setSelectedThread(null);
        return;
      }
      setSelectedEmail(email);
      if (explicitThread) {
        setSelectedThread(explicitThread);
      } else {
        const matching = threads?.find(
          (t) =>
            t.id === email.id ||
            t.threadId === email.threadId ||
            t.messages.some((m) => m.id === email.id),
        );
        setSelectedThread(matching || null);
      }
      // The whole conversation, not the message that was tapped. `isRead` on a row
      // is an `every`, so clearing only the newest left the row bold after the user
      // had plainly just read it.
      void mutations.markRead(conversationIds(email.id));
      const targetId = email.threadId || email.id;
      if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 900px)').matches) {
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
  const { focusedIndex, focusedId, focusRow } = useInboxKeyboard({
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
          displayThreads.find(
            (t) => t.id === id || t.threadId === id || t.messages.some((m) => m.id === id),
          )?.isStarred,
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
      onTogglePin={() => void batchToggleStar(Array.from(selectedIds), allSelectedPinned)}
      onMarkRead={() => void batchMarkRead(Array.from(selectedIds), true)}
      onMarkUnread={() => void batchMarkRead(Array.from(selectedIds), false)}
      onMoveToCategory={(category) => void moveSelectedToCategory(category)}
      onArchive={() => void batchAction('archive')}
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
        activeLens === 'groups' ? setGroupEditorTarget('new') : router.push('/compose')
      }
      fabLabel={activeLens === 'groups' ? 'New group' : 'Compose email'}
      aria-label="QuantMail inbox"
    >
      <div className="inbox-workspace">
        <section className="inbox-list-pane" aria-label="Inbox messages">
          <header className="inbox-hero">
            <div>
              <p className="inbox-kicker">
                <span /> QuantMail Intelligence
              </p>
              <h1>{heroTitle}</h1>
              <p>{heroSummary}</p>
            </div>
            <button
              type="button"
              className="hero-compose"
              onClick={() =>
                activeLens === 'groups' ? setGroupEditorTarget('new') : router.push('/compose')
              }
            >
              <MailIcon name="compose" /> {activeLens === 'groups' ? 'New group' : 'Compose'}
            </button>
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
          <div className="relative z-30 flex items-center gap-2 py-2 px-3 sm:px-4 border-b border-[#282C35] bg-[#090A0C]/95 backdrop-blur-md">
            {/*
              One pill holds the four lenses and the spam link, because they are
              one row of destinations to a reader. The tablist is a nested group
              rather than the pill itself: a link is not a `role="tab"`, and a
              tablist containing something that is not a tab is a widget a screen
              reader cannot describe. The hairline says the last chip leaves.
            */}
            <div className="flex-1 min-w-0 flex items-center gap-1 p-1 rounded-full bg-[#111318] border border-[#282C35] overflow-x-auto no-scrollbar select-none">
              <div
                role="tablist"
                aria-label="Conversation lens"
                className="flex items-center gap-1 shrink-0"
              >
                {INBOX_LENSES.map((lens, index) => {
                  const isActive = activeLens === lens.key;
                  const count = lensCounts[lens.key];
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
                      title={lens.hint}
                      onClick={() => selectLens(lens.key)}
                      onKeyDown={(event) => onLensKeyDown(event, index)}
                      className={`px-3.5 min-h-[44px] sm:min-h-[32px] rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-all inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                        isActive
                          ? 'bg-[#FF8C42]/12 text-[#FF8C42] border border-[#FF8C42]/35 shadow-[0_0_14px_rgba(255,140,66,0.15),inset_0_1px_0_0_rgba(255,255,255,0.06)] font-semibold'
                          : 'border border-white/[0.07] bg-white/[0.02] text-[#A1A4AC] hover:text-[#F5F5F5] hover:bg-white/[0.05] hover:border-white/[0.12]'
                      }`}
                    >
                      <span>{lens.label}</span>
                      {typeof count === 'number' && count > 0 && (
                        <span
                          /*
                            The unselected count was `#6B6E76` on `#090A0C` — 3.88:1,
                            under the floor, on the one glyph in the pill that carries
                            information rather than a label.
                          */
                          className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold leading-tight ${
                            isActive
                              ? 'bg-[#FF8C42]/20 text-[#FF9B5A]'
                              : 'bg-[#090A0C] text-[#A1A4AC] border border-[#282C35]'
                          }`}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="relative shrink-0" ref={filterMenuRef}>
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
                className={`inline-flex items-center justify-center gap-1.5 px-3 min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-0 rounded-full text-xs font-medium border whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                  narrowingCount > 0 || isFilterMenuOpen
                    ? 'bg-[#FF8C42]/12 text-[#FF8C42] border-[#FF8C42]/35 shadow-[0_0_14px_rgba(255,140,66,0.15),inset_0_1px_0_0_rgba(255,255,255,0.06)] font-semibold'
                    : 'bg-[#111318] text-[#A1A4AC] border-white/[0.08] hover:text-[#F5F5F5] hover:bg-white/[0.04] hover:border-white/[0.14]'
                }`}
              >
                <IconFilter size={14} />
                <span className="hidden sm:inline">Filter</span>
                {narrowingCount > 0 && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full font-semibold leading-tight bg-[#FF8C42]/20 text-[#FF9B5A]">
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
                    className="absolute right-0 top-full mt-2 z-30 w-72 rounded-2xl bg-[#16181D] border border-[#282C35] shadow-[0_4px_16px_rgba(0,0,0,0.6)] overflow-hidden"
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
                      className="px-3 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#A1A4AC]"
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
                            className="w-full min-h-[44px] px-3 flex items-center gap-2.5 text-left text-xs transition-colors hover:bg-[#1C1F26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF8C42]"
                          >
                            <span
                              aria-hidden="true"
                              className={`size-[18px] shrink-0 rounded-full border inline-flex items-center justify-center transition-colors ${
                                isOn ? 'border-[#FF8C42]' : 'border-[#3A404D]'
                              }`}
                            >
                              <span
                                className={`size-2 rounded-full transition-colors ${
                                  isOn ? 'bg-[#FF8C42]' : 'bg-transparent'
                                }`}
                              />
                            </span>
                            <span
                              className={`flex-1 truncate ${isOn ? 'text-[#F5F5F5] font-semibold' : 'text-[#A1A4AC]'}`}
                            >
                              {turn.label}
                            </span>
                            <span className="shrink-0 text-[10px] font-semibold text-[#A1A4AC]">
                              {turnCounts[turn.key]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p
                      id={filterGroupLabelId}
                      className="mt-1 px-3 pt-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#A1A4AC] border-t border-[#282C35]"
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
                            className="w-full min-h-[44px] px-3 flex items-center gap-2.5 text-left text-xs transition-colors hover:bg-[#1C1F26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF8C42]"
                          >
                            <span
                              aria-hidden="true"
                              className={`size-[18px] shrink-0 rounded-md border inline-flex items-center justify-center transition-colors ${
                                isOn
                                  ? 'bg-[#FF8C42] border-[#FF8C42] text-[#090A0C]'
                                  : 'border-[#3A404D] text-transparent'
                              }`}
                            >
                              <IconCheck size={12} strokeWidth={2.4} />
                            </span>
                            <span
                              className={`flex-1 truncate ${isOn ? 'text-[#F5F5F5] font-semibold' : 'text-[#A1A4AC]'}`}
                            >
                              {filter.label}
                            </span>
                            <span className="shrink-0 text-[10px] font-semibold text-[#A1A4AC]">
                              {filterCounts[filter.key]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {narrowingCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTurn('any');
                          setActiveFilters(new Set());
                          setIsFilterMenuOpen(false);
                        }}
                        className="w-full min-h-[44px] px-3 flex items-center gap-2 text-left text-xs font-semibold text-[#A1A4AC] border-t border-[#282C35] transition-colors hover:bg-[#1C1F26] hover:text-[#F5F5F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF8C42]"
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
                className="overflow-hidden flex items-center justify-center gap-2.5 text-xs font-semibold text-[#FF8C42] bg-[#FF8C42]/10 border-b border-[#FF8C42]/20 py-2 select-none"
              >
                <div
                  className={`size-4 rounded-full border-2 border-[#FF8C42] border-t-transparent ${
                    isRefreshing ? 'animate-spin' : ''
                  }`}
                  style={{
                    transform: isRefreshing ? undefined : `rotate(${pullDistance * 6}deg)`,
                  }}
                />
                <span>
                  {isRefreshing
                    ? 'Refreshing inbox…'
                    : pullDistance >= 36
                      ? 'Release to refresh'
                      : 'Pull down to refresh'}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <div
            className="mail-list"
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
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
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
              <div className="mail-loading">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} variant="rect" width="100%" height="76px" />
                ))}
              </div>
            )}
            {error && (
              <div className="mail-error">
                <ErrorState message={error.message} onRetry={() => void refetch()} />
              </div>
            )}
            {!isLoading && !isSearching && !error && showGroupsView && (
              <section aria-label="Your groups" className="w-full border-b border-[#282C35]">
                <header className="flex items-center justify-between gap-3 border-b border-[#282C35] bg-[#0B0C0F] px-4 py-3">
                  <div>
                    <h2 className="text-sm font-bold text-[#F5F5F5]">Groups</h2>
                    <p className="mt-0.5 text-[11px] text-[#A1A4AC]">
                      Open an existing conversation or start a new group chat.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setGroupEditorTarget('new')}
                    className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-[#FF8C42] px-3.5 text-xs font-bold text-[#090A0C] transition-colors hover:bg-[#FF9B5A] active:bg-[#E8752F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] focus-visible:ring-offset-2 focus-visible:ring-offset-[#090A0C]"
                  >
                    <span aria-hidden="true" className="text-base leading-none">
                      +
                    </span>
                    New group
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
                    <h3 className="text-sm font-bold text-[#F5F5F5]">Groups could not be loaded</h3>
                    <p className="mt-1 text-xs text-[#A1A4AC]">
                      Your saved groups are safe. Try again in a moment.
                    </p>
                  </div>
                ) : savedGroups.length === 0 ? (
                  <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
                    <div className="flex size-14 items-center justify-center rounded-full border border-[#282C35] bg-[#16181D] text-[#FF8C42]">
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

                    <h3 className="mt-4 text-base font-bold text-[#F5F5F5]">
                      Create your first group
                    </h3>

                    <p className="mt-1 max-w-sm text-xs leading-5 text-[#A1A4AC]">
                      Save a set of addresses and keep every message in one unified conversation.
                    </p>

                    <button
                      type="button"
                      onClick={() => setGroupEditorTarget('new')}
                      className="mt-5 min-h-[44px] rounded-xl bg-[#FF8C42] px-5 text-xs font-bold text-[#090A0C] hover:bg-[#FF9B5A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                    >
                      + New group
                    </button>
                  </div>
                ) : (
                  <ul role="list" className="m-0 list-none divide-y divide-[#282C35] p-0">
                    {savedGroups.map((group) => {
                      const matchingThread = findGroupThread(group);
                      const latestMessage = matchingThread?.latestEmail;
                      const accent = group.color ?? '#FF8C42';
                      const memberCount = group.emails.length;

                      return (
                        <li key={group.id}>
                          <div className="group flex min-h-[78px] items-center gap-3 bg-[#111318] px-3 py-2 transition-colors hover:bg-[#16181D] sm:px-4">
                            <button
                              type="button"
                              onClick={() => {
                                if (matchingThread) {
                                  openEmail(matchingThread.latestEmail, matchingThread);
                                } else {
                                  setQuickGroupChatTarget(group);
                                }
                              }}
                              className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                              aria-label={
                                matchingThread
                                  ? `Open ${group.name} group conversation`
                                  : `Start a conversation with ${group.name}`
                              }
                            >
                              <span className="relative shrink-0">
                                <span
                                  className="flex size-12 items-center justify-center rounded-full text-sm font-black text-[#090A0C]"
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

                                <span className="absolute -bottom-1 -right-1 flex min-w-5 items-center justify-center rounded-full border-2 border-[#111318] bg-[#282C35] px-1 text-[9px] font-bold text-[#F5F5F5]">
                                  {memberCount}
                                </span>
                              </span>

                              <span className="min-w-0 flex-1">
                                <span className="flex items-center justify-between gap-3">
                                  <strong className="truncate text-sm text-[#F5F5F5]">
                                    {group.name}
                                  </strong>

                                  {matchingThread && (
                                    <time className="shrink-0 text-[10px] text-[#A1A4AC]">
                                      {formatReceivedAt(matchingThread.receivedAt)}
                                    </time>
                                  )}
                                </span>

                                <span className="mt-0.5 block truncate text-xs text-[#A1A4AC]">
                                  {matchingThread
                                    ? sanitizeSnippetText(
                                        latestMessage?.snippet ||
                                          latestMessage?.bodyText ||
                                          matchingThread.subject,
                                      )
                                    : `${memberCount} ${
                                        memberCount === 1 ? 'member' : 'members'
                                      } · Start the conversation`}
                                </span>
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setGroupEditorTarget(group)}
                              aria-label={`Edit group ${group.name}`}
                              className="flex size-11 shrink-0 items-center justify-center rounded-xl text-[#A1A4AC] transition-colors hover:bg-[#282C35] hover:text-[#FF8C42] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
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
                    className="border-t border-[#282C35]"
                  >
                    <div
                      role="list"
                      aria-label="Other group conversations"
                      className="divide-y divide-[#282C35]"
                    >
                      {unmatchedGroupThreads.map((thread) => {
                        const displayIndex = displayThreads.findIndex(
                          (candidate) => candidate.id === thread.id,
                        );

                        return (
                          <div key={thread.id} role="listitem">
                            <EmailRow
                              thread={thread}
                              isChecked={selectedIds.has(thread.id)}
                              isActive={
                                selectedEmail?.id === thread.id || selectedThread?.id === thread.id
                              }
                              isFocused={displayIndex >= 0 && focusedIndex === displayIndex}
                              isSpamMode={false}
                              savedGroups={savedGroups}
                              onToggleSelect={(event) => toggleSelect(thread.id, event)}
                              onToggleStar={(event) => void toggleStar(event, thread.id)}
                              onOpen={() => {
                                focusRow(thread.id);
                                openEmail(thread.latestEmail, thread);
                              }}
                              onArchive={() => void archiveEmail(thread.id)}
                              onDelete={() => void deleteEmail(thread.id)}
                              onMarkRead={() => void markRead(thread.id)}
                              onMarkUnread={() => void markUnread(thread.id)}
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
                      <div className="size-12 rounded-full bg-[#FF8C42]/10 border border-[#FF8C42]/30 text-[#FF8C42] shadow-[0_0_20px_rgba(255,140,66,0.15)] flex items-center justify-center mx-auto mb-1">
                        <MailIcon name="clock" className="size-6" />
                      </div>
                      <h3 className="text-base font-bold text-white">Nothing snoozed right now</h3>
                      <p className="text-xs text-[#A1A4AC] max-w-xs mx-auto">
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
                      <div className="size-12 rounded-full bg-[#16181D] border border-[#282C35] text-[#A1A4AC] flex items-center justify-center mx-auto mb-1">
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
                      <p className="text-xs text-[#A1A4AC]">Zero unread messages in your inbox.</p>
                    </div>
                  ) : activeLens === 'contacts' && narrowingCount === 0 ? (
                    <div className="mail-empty py-12 px-4 text-center space-y-3">
                      <div className="size-12 rounded-full bg-[#16181D] border border-[#282C35] text-[#A1A4AC] flex items-center justify-center mx-auto mb-1">
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
                      <p className="text-xs text-[#A1A4AC] max-w-xs mx-auto">
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
                      <div className="size-12 rounded-full bg-[#16181D] border border-[#282C35] text-[#A1A4AC] flex items-center justify-center mx-auto mb-1">
                        <IconFilter size={22} />
                      </div>
                      <h3 className="text-base font-bold text-white">Nothing in this view</h3>
                      <p className="text-xs text-[#A1A4AC] max-w-xs mx-auto">
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
              /**
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
                        className="size-3.5 shrink-0 text-[#FF8C42]"
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
                          className="relative font-semibold text-[#FF8C42] underline decoration-dotted underline-offset-2 hover:text-[#FF9B5A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] rounded after:absolute after:-inset-y-[13px] after:-inset-x-[10px] after:content-['']"
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
                        <EmailRow
                          thread={thread}
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
                          onOpen={() => {
                            focusRow(thread.id);
                            openEmail(thread.latestEmail, thread);
                          }}
                          onArchive={() => void archiveEmail(thread.id)}
                          onDelete={() => void deleteEmail(thread.id)}
                          onMarkRead={() => void markRead(thread.id)}
                          onMarkUnread={() => void markUnread(thread.id)}
                          onSnooze={snoozeEmail}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <footer className="inbox-list-footer">
            <span>
              {threads?.length ?? 0} conversation{threads?.length === 1 ? '' : 's'}
            </span>
            <span>Ecosystem connected · SES/DKIM active</span>
          </footer>
        </section>

        <ReadingPane
          thread={selectedThread}
          email={selectedEmail}
          onClose={() => {
            setSelectedEmail(null);
            setSelectedThread(null);
          }}
          onArchive={(id) => void archiveEmail(id)}
          onDelete={(id) => void deleteEmail(id)}
          onToggleStar={(id) => void toggleStar(null, id)}
          isSpam={
            activeLens === 'spam' ||
            selectedEmail?.isSpam ||
            selectedEmail?.category === 'spam' ||
            selectedEmail?.folderId === 'SPAM'
          }
          onNotSpam={async (messageIds) => {
            const id = messageIds[0] || selectedEmail?.id || selectedThread?.id;
            if (id) {
              await apiClient.markNotSpam(id);
              showToast({ text: 'Rescued from spam — moved back to inbox', type: 'success' });
              setSelectedEmail(null);
              setSelectedThread(null);
              await Promise.all([refetch(), refetchSpam()]);
            }
          }}
        />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-[#121622] border border-[#3A404D]/80 rounded-2xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.7)] flex flex-col">
            {/* Header with WhatsApp-style group info */}
            <div className="flex items-center justify-between gap-3 p-4 bg-[#16181D] border-b border-[#282C35]">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="size-11 rounded-full flex items-center justify-center text-[#111318] font-bold shrink-0 shadow"
                  style={{ background: quickGroupChatTarget.color ?? '#FF8C42' }}
                >
                  <svg
                    className="size-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">
                    {quickGroupChatTarget.name}
                  </h3>
                  <p className="text-[11px] text-[#A1A4AC] truncate">
                    {quickGroupChatTarget.emails.length} participants:{' '}
                    {quickGroupChatTarget.emails.join(', ')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickGroupChatTarget(null)}
                className="size-8 rounded-lg text-[#A1A4AC] hover:text-white hover:bg-[#282C35] flex items-center justify-center transition-colors"
                aria-label="Close group chat"
              >
                <MailIcon name="close" className="size-4" />
              </button>
            </div>

            {/* Chat conversation preview */}
            <div className="p-4 min-h-[140px] max-h-[240px] overflow-y-auto bg-[#090A0C]/70 flex flex-col justify-end space-y-3">
              <div className="mx-auto text-center px-3 py-1 rounded-full bg-[#16181D] border border-[#282C35] text-[10px] text-[#A1A4AC]">
                Delivered to all {quickGroupChatTarget.emails.length} group members
              </div>
              <div className="bg-[#16181D]/80 border border-[#282C35] rounded-xl p-3 text-xs text-[#A1A4AC] text-center">
                Send a quick message or update to everyone in{' '}
                <strong className="text-white">{quickGroupChatTarget.name}</strong>.
              </div>
            </div>

            {/* WhatsApp-style Input Deck */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!quickChatMessage.trim() || isSendingQuickChat) return;
                setIsSendingQuickChat(true);
                try {
                  const res = await apiClient.composeEmail({
                    to: quickGroupChatTarget.emails.map((email) => ({ email })),
                    subject: `[Group] ${quickGroupChatTarget.name}`,
                    bodyText: quickChatMessage.trim(),
                    bodyHtml: `<p>${quickChatMessage.trim()}</p>`,
                    isDraft: false,
                    messageKind: 'chat',
                  });
                  if (res.success && res.data?.id) {
                    await apiClient.sendEmail(res.data.id);
                    invalidateMailLists(queryClient);
                    showToast({
                      text: `Message sent to ${quickGroupChatTarget.name}`,
                      type: 'success',
                    });
                    setQuickChatMessage('');
                    setQuickGroupChatTarget(null);
                    await refetch();
                  } else {
                    throw new Error(res.error?.message || 'Failed to send message');
                  }
                } catch (err) {
                  showToast({
                    text: err instanceof Error ? err.message : 'Could not send message to group',
                    type: 'error',
                  });
                } finally {
                  setIsSendingQuickChat(false);
                }
              }}
              className="p-3 bg-[#111318] border-t border-[#282C35] flex items-center gap-2"
            >
              <input
                type="text"
                value={quickChatMessage}
                onChange={(e) => setQuickChatMessage(e.target.value)}
                placeholder={`Message ${quickGroupChatTarget.name}…`}
                autoFocus
                className="flex-1 min-h-touch bg-[#090A0C] border border-[#282C35] focus:border-[#FF8C42] rounded-xl px-3.5 py-2 text-xs text-white placeholder-[#A1A4AC] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!quickChatMessage.trim() || isSendingQuickChat}
                className="px-4 min-h-touch rounded-xl bg-[#FF8C42] hover:bg-[#FF9B5A] active:bg-[#E8752F] text-[#090A0C] text-xs font-bold transition-all disabled:opacity-40 flex items-center gap-1.5 shadow-sm"
              >
                {isSendingQuickChat ? (
                  'Sending…'
                ) : (
                  <>
                    <span>Send</span>
                    <svg
                      className="size-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                    >
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
