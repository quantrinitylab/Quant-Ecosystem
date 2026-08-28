'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from 'framer-motion';
import { ErrorState, Skeleton, Button } from '@quant/shared-ui';
import { AppShell } from '../components/AppShell';
import { useInbox } from '../hooks/useInbox';
import { useSearchEmails } from '../hooks/useSearchEmails';
import { AppSidebar } from '../components/AppSidebar';
import { EmailSafetyBanner } from '../components/EmailSafetyBanner';
import { EmailSnooze } from '../components/EmailSnooze';
import { HoverActions } from '../components/HoverActions';
import { IdentityAvatar } from '../components/IdentityAvatar';
import { InboxZeroState } from '../components/InboxZeroState';
import { showToast } from '../components/InboxToast';
import { ReadTimeEstimate } from '../components/ReadTimeEstimate';
import { QuantMailLogo } from '../components/QuantMailLogo';
import { Quanty } from '../components/Quanty';
import { SmartReplySuggestions } from '../components/SmartReplySuggestions';
import { EmailSenderHeader } from '../components/EmailSenderHeader';
import { QuantyCopilotDrawer } from '../components/QuantyCopilotDrawer';
import { ConversationalThreadView } from '../components/ConversationalThreadView';
import { ThreadKindBadge } from '../components/MessageKindBadge';
import { useInboxKeyboard } from '../hooks/useInboxKeyboard';
import { useMailMutations } from '../hooks/useMailMutations';
import { useScrollElement, useVirtualizer } from '../lib/virtual/useVirtualizer';
import {
  groupEmailsIntoThreads,
  sanitizeSnippetText,
  threadFocus,
  type ConversationThread,
} from '../lib/threading';
import { useAuth } from '../providers/auth-provider';
import { IconCheck, IconFilter, IconX } from '../components/icons';
import type { Email } from '../types';

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
 * `InboxFocus` partitions the list by who spoke last, which is the one thing
 * about a conversation this client can always answer from the messages already in
 * hand. The seven category chips it replaces could not: `Updates` and `Offers`
 * read `ConversationThread.category`, which resolves from the server's
 * `aiCategory` column — declared in `packages/database/prisma/schema.prisma`,
 * read in five places, and written in none. Every message ever stored therefore
 * arrives as `'primary'`, so both chips were permanently empty, and `Contacts`
 * (`!automated && (count <= 2 || category === 'primary')`) collapsed to "not
 * automated" and returned nearly everything. Three of seven tabs described a
 * classifier that was never built.
 *
 * `InboxFilter` keeps the narrowings that were always honest and makes them
 * *compose* with the partition — which the chip strip could not do, since
 * choosing `Unread` there discarded the category and vice versa. Each filter
 * reads a field the row itself renders, so it can never disagree with what is on
 * screen.
 */
type InboxFocus = 'needs_you' | 'waiting' | 'all';
type InboxFilter = 'unread' | 'starred' | 'attachment' | 'group';

const INBOX_FOCUSES: Array<{ key: InboxFocus; label: string; hint: string }> = [
  {
    key: 'needs_you',
    label: 'Needs you',
    hint: 'A person wrote last, so the next reply is yours',
  },
  { key: 'waiting', label: 'Waiting', hint: 'You wrote last, so you are waiting on them' },
  { key: 'all', label: 'All', hint: 'Every conversation, automated mail included' },
];

const INBOX_FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: 'unread', label: 'Unread' },
  { key: 'starred', label: 'Starred' },
  { key: 'attachment', label: 'Has attachment' },
  { key: 'group', label: 'Group thread' },
];

type MailIconName =
  | 'archive'
  | 'close'
  | 'compose'
  | 'mail'
  | 'search'
  | 'star'
  | 'pin'
  | 'trash'
  | 'reply'
  | 'forward'
  | 'sparkles'
  | 'shield';

function MailIcon({ name, className = 'h-4 w-4' }: { name: MailIconName; className?: string }) {
  const paths = {
    archive: (
      <>
        <path d="M4 7h16" />
        <path d="M5 7l1-3h12l1 3v12H5z" />
        <path d="M9 11h6" />
      </>
    ),
    close: <path d="m7 7 10 10M17 7 7 17" />,
    compose: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
    pin: (
      <>
        <line x1="12" y1="17" x2="12" y2="22" />
        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18" />
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      </>
    ),
    reply: <path d="M9 17 4 12l5-5M4 12h12a4 4 0 0 1 4 4v2" />,
    forward: <path d="m15 17 5-5-5-5M20 12H8a4 4 0 0 0-4 4v2" />,
    sparkles: (
      <>
        <path d="m12 3-1.9 4.8L5.3 9.7l4.8 1.9L12 16.4l1.9-4.8 4.8-1.9-4.8-1.9L12 3z" />
        <path d="m19 16-.9 2.1L16 19l2.1.9.9 2.1.9-2.1 2.1-.9-2.1-.9-.9-2.1z" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  };
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function formatReceivedAt(value?: string | Date) {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type EmailRowProps = {
  thread: ConversationThread;
  isChecked: boolean;
  isActive: boolean;
  isFocused: boolean;
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
  onToggleSelect,
  onToggleStar,
  onOpen,
  onArchive,
  onDelete,
  onMarkRead,
  onMarkUnread,
  onSnooze,
}: EmailRowProps) {
  const x = useMotionValue(0);
  const archiveOpacity = useTransform(x, [-108, -44], [1, 0]);
  const pinOpacity = useTransform(x, [44, 108], [0, 1]);
  const prefersReducedMotion = useReducedMotion();
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);
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

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);
    if (info.offset.x < -96) {
      void onArchive();
    } else if (info.offset.x > 96) {
      onToggleStar(null);
    }
  };

  const email = thread.latestEmail;
  const priorityLower = thread.priority?.toLowerCase();
  const isHighPriority =
    priorityLower === 'high' || priorityLower === 'urgent' || priorityLower === 'critical';
  const priorityColor =
    priorityLower === 'critical'
      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
      : 'bg-[#FF8C42]/15 text-[#FFB875] border-[#FF8C42]/30';

  return (
    <div className={`mail-row-shell relative ${showSnoozeMenu ? 'z-50' : ''}`}>
      <motion.div
        className="mail-archive-reveal"
        style={{ opacity: archiveOpacity }}
        aria-hidden="true"
      >
        <MailIcon name="archive" /> <span>Archive</span>
      </motion.div>
      <motion.div
        className="mail-pin-reveal absolute inset-y-0 left-0 flex items-center gap-2 pl-4 text-[#FF8C42] bg-[#FF8C42]/20 border-r border-[#FF8C42]/30 font-semibold text-xs"
        style={{ opacity: pinOpacity }}
        aria-hidden="true"
      >
        <MailIcon name="pin" className="size-4 text-[#FF8C42]" /> <span>Pin</span>
      </motion.div>
      <motion.article
        style={{ x }}
        drag={prefersReducedMotion ? false : 'x'}
        dragConstraints={{ left: -128, right: 128 }}
        dragElastic={0.08}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`mail-row ${thread.isRead ? '' : 'is-unread'} ${isActive ? 'is-active' : ''} ${isFocused ? 'is-focused' : ''}`}
        onClick={() => {
          if (!isDragging && !isLongPressRef.current) onOpen();
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
          aria-label={`Select conversation with ${thread.sendersSummary}`}
        />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelect(event);
          }}
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
          title="Select conversation"
          aria-label={`Select ${thread.sendersSummary}`}
        >
          <IdentityAvatar name={thread.sendersSummary || '?'} size="sm" />
        </button>
        <div className="mail-row-copy">
          <div className="mail-row-meta">
            <div className="flex items-center gap-1.5 min-w-0">
              <strong className="truncate text-[#F5F5F5] font-semibold">
                {thread.sendersSummary}
              </strong>
              {thread.count > 1 && (
                <span className="px-1.5 py-0.2 rounded-full bg-[#282C35] text-[10px] font-mono text-[#A1A4AC] shrink-0">
                  {thread.count}
                </span>
              )}
            </div>
            {!thread.isRead && <span className="mail-unread-dot" aria-label="Unread" />}
            {isHighPriority && (
              <span
                className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${priorityColor}`}
              >
                {priorityLower}
              </span>
            )}
            {/*
              Mail or chat, on the row itself. The glyph alone here: the meta line
              already carries a name, a count, a dot, a priority and a time, and
              `.mail-row-meta time` takes `margin-left: auto`, so every word added
              to its left eats into the subject beneath it. The word is still in the
              accessibility tree via the badge's `sr-only` text.
            */}
            <ThreadKindBadge mix={thread.kindMix} />
            <time>{formatReceivedAt(thread.receivedAt)}</time>
          </div>
          <h3 className="text-xs sm:text-sm font-medium text-[#A1A4AC] truncate">
            {sanitizeSnippetText(thread.subject) || '(no subject)'}
          </h3>
          <p className="text-xs text-[#A1A4AC] truncate">
            {sanitizeSnippetText(email.snippet || email.bodyText)}
          </p>
        </div>
        {/* Hover actions bar — quick actions on hover (Desktop) */}
        <AnimatePresence>
          {(isHovered || showSnoozeMenu) && !isDragging && (
            <HoverActions
              emailId={thread.id}
              isRead={thread.isRead}
              onArchive={onArchive}
              onDelete={onDelete}
              onMarkRead={onMarkRead}
              onMarkUnread={onMarkUnread}
              onSnooze={() => setShowSnoozeMenu((prev) => !prev)}
            />
          )}
        </AnimatePresence>
        {/* Snooze popup anchor */}
        <EmailSnooze
          emailId={email.id}
          onSnooze={onSnooze}
          open={showSnoozeMenu}
          onOpenChange={setShowSnoozeMenu}
          triggerHidden={true}
        />
        {/* Pin button */}
        {!isHovered && !showSnoozeMenu && (
          <button
            type="button"
            className={`p-1.5 rounded-xl transition-all ${
              email.isStarred
                ? 'text-[#FF8C42] fill-[#FF8C42] bg-[#FF8C42]/15'
                : 'text-[#6B6E76] hover:text-[#A1A4AC] hover:bg-[#282C35]/60'
            }`}
            onClick={onToggleStar}
            aria-label={email.isStarred ? 'Unpin email' : 'Pin email'}
            aria-pressed={email.isStarred}
            title={email.isStarred ? 'Pinned to top' : 'Pin to top'}
          >
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill={email.isStarred ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z" />
            </svg>
          </button>
        )}
      </motion.article>
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
}: {
  thread?: ConversationThread | null;
  email: Email | null;
  onClose: () => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
  onToggleStar?: (id: string) => void;
}) {
  if (!email && !thread) {
    return (
      <section className="reading-pane reading-pane-empty" aria-label="Message preview">
        <div className="reading-ambient" aria-hidden="true" />
        <div className="reading-empty-content">
          <QuantMailLogo />
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
      />
    </motion.aside>
  );
}

function CreateGroupModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (groupName: string, members: string[]) => void;
}) {
  const [groupName, setGroupName] = useState('');
  const [memberInput, setMemberInput] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleAddMember = () => {
    const trimmed = memberInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!trimmed.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    if (members.includes(trimmed)) {
      setError('Email already added');
      return;
    }
    setMembers((prev) => [...prev, trimmed]);
    setMemberInput('');
    setError('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddMember();
    }
  };

  const handleRemoveMember = (emailToRemove: string) => {
    setMembers((prev) => prev.filter((m) => m !== emailToRemove));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setError('Please enter a group name');
      return;
    }
    const finalMembers = [...members];
    if (
      memberInput.trim() &&
      memberInput.includes('@') &&
      !finalMembers.includes(memberInput.trim().toLowerCase())
    ) {
      finalMembers.push(memberInput.trim().toLowerCase());
    }
    if (finalMembers.length === 0) {
      setError('Please add at least one member email');
      return;
    }
    onCreated(groupName.trim(), finalMembers);
    setGroupName('');
    setMembers([]);
    setMemberInput('');
    setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-md bg-[#121622] border border-[#3A404D]/80 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-[#282C35] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-[#FF8C42]/20 border border-[#FF8C42]/40 flex items-center justify-center text-[#FF8C42]">
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Create New Group</h2>
              <p className="text-xs text-[#A1A4AC]">Group mailing list & shared conversation</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-lg text-[#A1A4AC] hover:text-white hover:bg-[#282C35] flex items-center justify-center transition-colors"
          >
            <MailIcon name="close" className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#A1A4AC] mb-1.5">
              Group Name <span className="text-[#FF8C42]">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Founders, Core Team, Project Alpha"
              value={groupName}
              onChange={(e) => {
                setGroupName(e.target.value);
                if (error) setError('');
              }}
              className="w-full bg-[#111318] border border-[#3A404D]/80 rounded-xl px-3 py-2 text-sm text-white placeholder-[#6B6E76] focus:outline-none focus:border-[#FF8C42]"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#A1A4AC] mb-1.5">
              Add Members (Emails) <span className="text-[#FF8C42]">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="email"
                placeholder="colleague@domain.com"
                value={memberInput}
                onChange={(e) => {
                  setMemberInput(e.target.value);
                  if (error) setError('');
                }}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-[#111318] border border-[#3A404D]/80 rounded-xl px-3 py-2 text-sm text-white placeholder-[#6B6E76] focus:outline-none focus:border-[#FF8C42]"
              />
              <button
                type="button"
                onClick={handleAddMember}
                className="px-3.5 py-2 rounded-xl bg-[#282C35] hover:bg-[#3A404D] text-xs font-semibold text-white transition-colors shrink-0"
              >
                + Add
              </button>
            </div>
            {members.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5 max-h-28 overflow-y-auto">
                {members.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#282C35]/90 border border-[#3A404D] text-xs text-[#F5F5F5]"
                  >
                    <span>{email}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(email)}
                      className="text-[#A1A4AC] hover:text-rose-400 ml-0.5 font-bold"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-rose-400 font-medium">{error}</p>}

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#282C35]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#16181D] border border-[#282C35] text-xs font-medium text-[#A1A4AC] hover:text-[#F5F5F5] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[#FF8C42] hover:bg-[#FF9B5A] active:bg-[#E8752F] text-xs font-semibold text-[#111111] shadow-sm transition-all"
            >
              Create Group & Compose
            </button>
          </div>
        </form>
      </div>
    </div>
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
          <span className="text-[11px] text-[#6B6E76] truncate">
            {isViewing
              ? `Viewing archived ${categoryLabel}`
              : `${count} archived conversation${count === 1 ? '' : 's'}`}
          </span>
        </span>
      </span>
      <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-[#2B1A11] text-[#FF8C42] border border-[#5C3016]">
        {count}
      </span>
    </button>
  );
}

export default function InboxPage() {
  const router = useRouter();
  const [activeFocus, setActiveFocus] = useState<InboxFocus>('all');
  const [activeFilters, setActiveFilters] = useState<Set<InboxFilter>>(() => new Set());
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showArchivedView, setShowArchivedView] = useState(false);
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
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
  const { data: searchResults, isLoading: isSearching } = useSearchEmails(
    debouncedQuery ? { query: debouncedQuery } : null,
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(searchQuery.trim()), 260);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const { user: currentUser } = useAuth();
  const currentEmail = currentUser?.email || '';

  const emails = debouncedQuery ? searchResults : allEmails;
  const threads = useMemo(
    () => groupEmailsIntoThreads(emails ?? [], currentEmail),
    [emails, currentEmail],
  );
  const allArchivedThreads = useMemo(
    () => groupEmailsIntoThreads(archivedEmails ?? [], currentEmail),
    [archivedEmails, currentEmail],
  );

  const isGroupThread = useCallback((t: ConversationThread) => {
    if (t.category === 'forums') return true;
    const msg = t.latestEmail;
    const toCount = Array.isArray(msg.to) ? msg.to.length : 0;
    const ccCount = Array.isArray(msg.cc) ? msg.cc.length : 0;
    return toCount + ccCount > 1 || (msg as any).isGroup === true;
  }, []);

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

  const matchesFilter = useCallback(
    (t: ConversationThread, filter: InboxFilter) => {
      if (filter === 'unread') return !t.isRead;
      if (filter === 'starred') return t.isStarred;
      if (filter === 'attachment') return threadHasAttachment(t);
      return isGroupThread(t);
    },
    [isGroupThread, threadHasAttachment],
  );

  /**
   * Narrow a list to one focus and every active filter.
   *
   * Filters are ANDed with each other and with the partition, so `Needs you` +
   * `Unread` + `Has attachment` means all three at once. The default view narrows
   * nothing and returns the array untouched.
   */
  const narrowThreads = useCallback(
    (list: ConversationThread[], focus: InboxFocus, filters: Set<InboxFilter>) => {
      const active = Array.from(filters);
      if (focus === 'all' && active.length === 0) return list;
      return list.filter(
        (t) =>
          (focus === 'all' || threadFocus(t, currentEmail) === focus) &&
          active.every((f) => matchesFilter(t, f)),
      );
    },
    [currentEmail, matchesFilter],
  );

  const resetInboxView = useCallback(() => {
    setActiveFocus('all');
    setActiveFilters(new Set());
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

  /** Dismiss the filter popover on an outside click or Escape. */
  useEffect(() => {
    if (!isFilterMenuOpen) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!filterMenuRef.current?.contains(event.target as Node)) setIsFilterMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFilterMenuOpen(false);
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
    () => (showArchivedView ? allArchivedThreads : (threads ?? [])),
    [showArchivedView, allArchivedThreads, threads],
  );

  /**
   * Focus counts, measured on the pool the active filters have already narrowed.
   *
   * Cross-tabulating is the whole reason the two controls can compose. A count
   * that ignored the other control would promise rows the list will not show: with
   * `Unread` on, `Needs you 12` has to mean twelve unread conversations waiting on
   * a reply, not twelve conversations of which some are already read.
   *
   * `needs_you + waiting` deliberately falls short of `all` — a receipt from
   * `no-reply@` is neither a reply you owe nor one you are owed. `heldBackCount`
   * says so out loud rather than leaving the gap to look like a bug.
   */
  const focusCounts = useMemo(() => {
    const pool = narrowThreads(activeThreadPool, 'all', activeFilters);
    const counts: Record<InboxFocus, number> = { needs_you: 0, waiting: 0, all: pool.length };
    for (const t of pool) {
      const focus = threadFocus(t, currentEmail);
      if (focus === 'needs_you') counts.needs_you += 1;
      else if (focus === 'waiting') counts.waiting += 1;
    }
    return counts;
  }, [activeThreadPool, activeFilters, narrowThreads, currentEmail]);

  /**
   * Each filter's count is "how many rows you would get by turning this on",
   * measured against the active focus and the *other* active filters. For a filter
   * already on, that is exactly the length of the list under it.
   */
  const filterCounts = useMemo(() => {
    const counts = { unread: 0, starred: 0, attachment: 0, group: 0 } as Record<
      InboxFilter,
      number
    >;
    for (const { key } of INBOX_FILTERS) {
      const others = new Set(activeFilters);
      others.delete(key);
      counts[key] = narrowThreads(activeThreadPool, activeFocus, others).filter((t) =>
        matchesFilter(t, key),
      ).length;
    }
    return counts;
  }, [activeThreadPool, activeFocus, activeFilters, narrowThreads, matchesFilter]);

  const heldBackCount =
    activeFocus === 'all' ? 0 : focusCounts.all - focusCounts.needs_you - focusCounts.waiting;

  /** What the archived shelf calls the population it is counting. */
  const viewLabel = useMemo(() => {
    const base =
      activeFocus === 'needs_you'
        ? 'conversations needing you'
        : activeFocus === 'waiting'
          ? 'conversations you are waiting on'
          : 'conversations';
    return activeFilters.size > 0 ? `filtered ${base}` : base;
  }, [activeFocus, activeFilters]);

  const currentArchivedThreads = useMemo(() => {
    return narrowThreads(allArchivedThreads, activeFocus, activeFilters);
  }, [allArchivedThreads, activeFocus, activeFilters, narrowThreads]);

  const displayThreads = useMemo(() => {
    const sourceThreads = narrowThreads(activeThreadPool, activeFocus, activeFilters);

    return [...sourceThreads].sort((a, b) => {
      if (a.isStarred !== b.isStarred) {
        return a.isStarred ? -1 : 1;
      }
      return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
    });
  }, [activeThreadPool, activeFocus, activeFilters, narrowThreads]);

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
  const showThreadList = !isLoading && !isSearching && !error && displayThreads.length > 0;

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
  }, [activeFocus, activeFilters, showArchivedView, debouncedQuery]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isGlobalQuantyOpen, setIsGlobalQuantyOpen] = useState(false);
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

  const batchAction = useCallback(
    async (action: 'archive' | 'delete') => {
      const ids = Array.from(selectedIds);
      setSelectedIds(new Set());
      await mutations.batch(action === 'archive' ? 'archive' : 'trash', ids);
    },
    [mutations, selectedIds],
  );

  const batchToggleStar = useCallback(
    async (ids: string[], allPinned: boolean) => {
      setSelectedIds(new Set());
      await Promise.all(ids.map((id) => mutations.toggleStar(id)));
      showToast({
        text: allPinned ? 'Unpinned selected messages' : 'Pinned selected messages to top',
        type: 'success',
      });
    },
    [mutations],
  );

  const batchMarkRead = useCallback(
    async (ids: string[], read: boolean) => {
      setSelectedIds(new Set());
      await Promise.all(
        ids.map((id) => (read ? mutations.markRead(id) : mutations.markUnread(id))),
      );
      showToast({
        text: `${ids.length} marked as ${read ? 'read' : 'unread'}`,
        type: 'info',
      });
    },
    [mutations],
  );

  const toggleStar = useCallback(
    async (event: React.MouseEvent | null, id: string) => {
      event?.stopPropagation();
      await mutations.toggleStar(id);
    },
    [mutations],
  );

  const archiveEmail = useCallback((id: string) => mutations.archive(id), [mutations]);

  const deleteEmail = useCallback((id: string) => mutations.trash(id), [mutations]);

  const markRead = useCallback((id: string) => mutations.markRead(id), [mutations]);

  const markUnread = useCallback((id: string) => mutations.markUnread(id), [mutations]);

  const snoozeEmail = useCallback(
    (emailId: string, snoozeUntil: Date) => mutations.snooze(emailId, snoozeUntil),
    [mutations],
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
      void mutations.markRead(email.id);
      const targetId = email.threadId || email.id;
      if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 900px)').matches) {
        router.push(`/thread/${targetId}`);
      }
    },
    [mutations, router, threads],
  );

  /**
   * Superhuman-style cursor and mail actions.
   *
   * This is handed `displayThreads` — the rows actually rendered — where it used to
   * be handed the flat, differently-ordered `emails` array. That mismatch is why
   * `j`/`k` highlighted one conversation while `e` archived another.
   */
  const { focusedIndex, focusRow } = useInboxKeyboard({
    rows: displayThreads,
    selectedId: selectedEmail?.id ?? null,
    onOpen: (thread) => openEmail(thread.latestEmail, thread),
    onClose: () => {
      setSelectedEmail(null);
      setSelectedThread(null);
    },
    onToggleSelect: (id) => toggleSelect(id),
    mutations,
    scrollToIndex: virtualizer.scrollToIndex,
  });

  const selectionHeader = (
    <header className="flex min-h-14 flex-none items-center justify-between gap-3 border-b border-[#282C35] bg-[#121622] px-3 sm:px-5 shadow-xl select-none sticky top-0 z-50">
      {/* Left: Close/Deselect button & Count */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => setSelectedIds(new Set())}
          className="size-9 inline-flex items-center justify-center rounded-xl text-[#A1A4AC] hover:text-white hover:bg-[#282C35] transition-all active:scale-95"
          title="Deselect all (Esc)"
          aria-label="Deselect all"
        >
          <svg
            className="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <span className="text-sm sm:text-base font-bold text-white tracking-wide">
          {selectedIds.size} selected
        </span>

        {/* Select All Visible toggle */}
        {selectedIds.size < (displayThreads?.length ?? 0) && (
          <button
            type="button"
            onClick={() => {
              const allVisibleIds = new Set(displayThreads.map((t) => t.id));
              setSelectedIds(allVisibleIds);
            }}
            className="ml-2 px-2.5 py-1 rounded-lg bg-[#282C35] hover:bg-[#3A404D] text-xs font-semibold text-[#FF8C42] transition-colors"
          >
            Select all {displayThreads.length}
          </button>
        )}
      </div>

      {/* Right Quick Action Icons (Clean, WhatsApp / Superhuman Style) */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Dynamic Pin / Unpin Toggle */}
        {(() => {
          const allPinned = Array.from(selectedIds).every((id) => {
            const thread = displayThreads.find(
              (t) => t.id === id || t.threadId === id || t.messages.some((m) => m.id === id),
            );
            return thread?.isStarred;
          });

          return (
            <button
              type="button"
              onClick={() => void batchToggleStar(Array.from(selectedIds), Boolean(allPinned))}
              className={`size-9 inline-flex items-center justify-center rounded-xl transition-all active:scale-95 ${
                allPinned
                  ? 'text-[#FF8C42] bg-[#FF8C42]/20 hover:bg-[#FF8C42]/30'
                  : 'text-[#A1A4AC] hover:text-[#FF8C42] hover:bg-[#282C35]'
              }`}
              title={allPinned ? 'Unpin selected (S)' : 'Pin selected (S)'}
              aria-label={allPinned ? 'Unpin selected' : 'Pin selected'}
            >
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill={allPinned ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z" />
              </svg>
            </button>
          );
        })()}

        {/* Mark Unread */}
        <button
          type="button"
          onClick={() => void batchMarkRead(Array.from(selectedIds), false)}
          className="size-9 inline-flex items-center justify-center rounded-xl text-[#A1A4AC] hover:text-[#FFB875] hover:bg-[#282C35] transition-all active:scale-95"
          title="Mark as unread (U)"
        >
          <svg
            className="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
            <circle cx="18" cy="6" r="2.5" fill="#FF8C42" stroke="none" />
          </svg>
        </button>

        {/* Mark Read */}
        <button
          type="button"
          onClick={() => void batchMarkRead(Array.from(selectedIds), true)}
          className="size-9 inline-flex items-center justify-center rounded-xl text-[#A1A4AC] hover:text-sky-400 hover:bg-[#282C35] transition-all active:scale-95"
          title="Mark as read"
        >
          <MailIcon name="mail" className="size-5" />
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={() => void batchAction('delete')}
          className="size-9 inline-flex items-center justify-center rounded-xl text-[#A1A4AC] hover:text-rose-400 hover:bg-[#282C35] transition-all active:scale-95"
          title="Move to Trash (#)"
        >
          <MailIcon name="trash" className="size-5" />
        </button>

        {/* Archive */}
        <button
          type="button"
          onClick={() => void batchAction('archive')}
          className="size-9 inline-flex items-center justify-center rounded-xl text-[#A1A4AC] hover:text-emerald-400 hover:bg-[#282C35] transition-all active:scale-95"
          title="Archive (E)"
        >
          <MailIcon name="archive" className="size-5" />
        </button>
      </div>
    </header>
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
        activeFilters.has('group') ? setIsCreateGroupModalOpen(true) : router.push('/compose')
      }
      mobileActions={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={`md:hidden inline-flex size-9 items-center justify-center rounded-lg transition-colors ${
              isSearchOpen
                ? 'bg-[#282C35] text-[#FF8C42]'
                : 'text-[#A1A4AC] hover:text-white hover:bg-[#282C35]'
            }`}
            onClick={() => setIsSearchOpen((prev) => !prev)}
            aria-label="Search messages"
          >
            <MailIcon name="search" className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => setIsGlobalQuantyOpen(true)}
            className="inline-flex size-9 items-center justify-center rounded-lg text-[#FF8C42] hover:bg-[#282C35] transition-colors"
            aria-label="Ask Quanty AI"
          >
            <Quanty size={24} expression="happy" bob={false} />
          </button>
        </div>
      }
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
                activeFilters.has('group')
                  ? setIsCreateGroupModalOpen(true)
                  : router.push('/compose')
              }
            >
              <MailIcon name="compose" /> {activeFilters.has('group') ? 'Create Group' : 'Compose'}
            </button>
          </header>

          {/* Unified Expandable Search Dropdown Tab (Mobile ONLY) */}
          <AnimatePresence>
            {isSearchOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="md:hidden overflow-hidden border-b border-[#282C35]/80 bg-[#090A0C] px-3 sm:px-4 py-2.5 flex items-center gap-2"
              >
                <div className="flex-1 flex items-center gap-2 bg-[#111318]/90 border border-[#3A404D]/80 rounded-xl px-3 py-1.5 shadow-inner">
                  <MailIcon name="search" className="size-4 text-[#A1A4AC] shrink-0" />
                  <input
                    id="mobile-search-input"
                    name="search"
                    type="search"
                    placeholder="Search messages, contacts, keywords…"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="w-full bg-transparent text-xs text-white placeholder-[#6B6E76] focus:outline-none"
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="text-[#A1A4AC] hover:text-white"
                      title="Clear search"
                    >
                      <MailIcon name="close" className="size-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchOpen(false);
                    setSearchQuery('');
                  }}
                  className="text-xs text-[#A1A4AC] hover:text-white font-medium px-2 py-1.5 rounded-lg hover:bg-[#282C35] transition-colors"
                >
                  Cancel
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/*
            Focus Bar. Left: which side of the conversation the ball is on, a
            partition derived from the messages in hand. Right: the filters that
            compose with it. See `InboxFocus` for why the category chips went.
          */}
          <div className="flex items-center gap-2 py-2 px-3 sm:px-4 border-b border-[#282C35] bg-[#090A0C]/95 backdrop-blur-md">
            <div
              role="tablist"
              aria-label="Conversation focus"
              className="flex-1 min-w-0 flex items-center gap-1 p-1 rounded-full bg-[#111318] border border-[#282C35] overflow-x-auto no-scrollbar select-none"
            >
              {INBOX_FOCUSES.map((focus) => {
                const isActive = activeFocus === focus.key;
                const count = focusCounts[focus.key];
                return (
                  <button
                    key={focus.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    title={focus.hint}
                    onClick={() => {
                      setActiveFocus(focus.key);
                      setShowArchivedView(false);
                    }}
                    className={`px-3.5 min-h-[40px] sm:min-h-[32px] rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-all inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                      isActive
                        ? 'bg-[#2B1A11] text-[#FF8C42] border border-[#5C3016] font-semibold'
                        : 'border border-transparent text-[#A1A4AC] hover:text-[#F5F5F5] hover:bg-[#1C1F26]'
                    }`}
                  >
                    <span>{focus.label}</span>
                    {count > 0 && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold leading-tight ${
                          isActive
                            ? 'bg-[#FF8C42]/20 text-[#FF9B5A]'
                            : 'bg-[#090A0C] text-[#6B6E76] border border-[#282C35]'
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="relative shrink-0" ref={filterMenuRef}>
              <button
                type="button"
                onClick={() => setIsFilterMenuOpen((prev) => !prev)}
                aria-expanded={isFilterMenuOpen}
                aria-label={
                  activeFilters.size > 0
                    ? `Filter conversations, ${activeFilters.size} active`
                    : 'Filter conversations'
                }
                className={`inline-flex items-center gap-1.5 px-3 min-h-[44px] sm:min-h-[34px] rounded-full text-xs font-medium border whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                  activeFilters.size > 0 || isFilterMenuOpen
                    ? 'bg-[#2B1A11] text-[#FF8C42] border-[#5C3016] font-semibold'
                    : 'bg-[#111318] text-[#A1A4AC] border-[#282C35] hover:text-[#F5F5F5] hover:bg-[#1C1F26]'
                }`}
              >
                <IconFilter size={14} />
                <span className="hidden sm:inline">Filter</span>
                {activeFilters.size > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold leading-tight bg-[#FF8C42]/20 text-[#FF9B5A]">
                    {activeFilters.size}
                  </span>
                )}
              </button>
              <AnimatePresence>
                {isFilterMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.14 }}
                    className="absolute right-0 top-full mt-2 z-30 w-64 rounded-2xl bg-[#16181D] border border-[#282C35] shadow-[0_4px_16px_rgba(0,0,0,0.6)] overflow-hidden"
                  >
                    <p className="px-3 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#6B6E76]">
                      Narrow this view
                    </p>
                    {INBOX_FILTERS.map((filter) => {
                      const isOn = activeFilters.has(filter.key);
                      return (
                        <button
                          key={filter.key}
                          type="button"
                          aria-pressed={isOn}
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
                          <span className="shrink-0 text-[10px] font-semibold text-[#6B6E76]">
                            {filterCounts[filter.key]}
                          </span>
                        </button>
                      );
                    })}
                    {activeFilters.size > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFilters(new Set());
                          setIsFilterMenuOpen(false);
                        }}
                        className="w-full min-h-[44px] px-3 flex items-center gap-2 text-left text-xs font-semibold text-[#A1A4AC] border-t border-[#282C35] transition-colors hover:bg-[#1C1F26] hover:text-[#F5F5F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF8C42]"
                      >
                        <IconX size={13} />
                        Clear {activeFilters.size} filter{activeFilters.size === 1 ? '' : 's'}
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
            aria-busy={isLoading || isSearching}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
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
            {!isLoading &&
              !isSearching &&
              !error &&
              displayThreads.length === 0 &&
              (debouncedQuery ? (
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
              ) : activeFilters.has('group') ? (
                <div className="mail-empty py-12 px-4 text-center space-y-3">
                  <div className="size-12 rounded-full bg-[#2B1A11] border border-[#5C3016] text-[#FF8C42] flex items-center justify-center mx-auto mb-1">
                    <svg
                      className="size-6"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-white">No group conversations yet</h3>
                  <p className="text-xs text-[#A1A4AC] max-w-xs mx-auto">
                    Create a group to start a shared multi-recipient thread or mailing list.
                  </p>
                  <div className="pt-2 flex justify-center">
                    <Button variant="primary" onClick={() => setIsCreateGroupModalOpen(true)}>
                      + Create New Group
                    </Button>
                  </div>
                </div>
              ) : activeFilters.has('unread') ? (
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
              ) : activeFocus !== 'all' || activeFilters.size > 0 ? (
                <div className="mail-empty py-12 px-4 text-center space-y-2">
                  <div className="size-12 rounded-full bg-[#16181D] border border-[#282C35] text-[#A1A4AC] flex items-center justify-center mx-auto mb-1">
                    <IconFilter size={22} />
                  </div>
                  <h3 className="text-base font-bold text-white">Nothing in this view</h3>
                  <p className="text-xs text-[#A1A4AC] max-w-xs mx-auto">
                    {activeFocus === 'needs_you'
                      ? 'No conversation is waiting on a reply from you.'
                      : activeFocus === 'waiting'
                        ? 'You are not waiting on a reply from anyone.'
                        : 'No conversation matches the filters you have on.'}
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
              ))}
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
                      <MailIcon name="star" className="size-3.5 shrink-0" />
                      <span>
                        {pinnedCount} starred {pinnedCount === 1 ? 'conversation is' : 'are'} held
                        at the top. The rest are newest first.
                      </span>
                    </p>
                  )}
                  {/*
                    `Needs you` and `Waiting` do not sum to `All`, and an
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
                          onClick={() => setActiveFocus('all')}
                          className="relative font-semibold text-[#FF8C42] underline decoration-dotted underline-offset-2 hover:text-[#FF9B5A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] rounded after:absolute after:-inset-y-[13px] after:-inset-x-[10px] after:content-['']"
                        >
                          Show all
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
                      >
                        <EmailRow
                          thread={thread}
                          isChecked={selectedIds.has(thread.id)}
                          isActive={
                            selectedEmail?.id === thread.id || selectedThread?.id === thread.id
                          }
                          isFocused={focusedIndex === item.index}
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
        />
      </div>

      <Quanty />

      <QuantyCopilotDrawer
        isOpen={isGlobalQuantyOpen}
        onClose={() => setIsGlobalQuantyOpen(false)}
        isInboxContext={true}
      />

      <CreateGroupModal
        isOpen={isCreateGroupModalOpen}
        onClose={() => setIsCreateGroupModalOpen(false)}
        onCreated={(groupName, members) => {
          setIsCreateGroupModalOpen(false);
          showToast({
            text: `Group "${groupName}" created with ${members.length} members!`,
            type: 'success',
          });
          router.push(
            `/compose?to=${encodeURIComponent(members.join(','))}&subject=${encodeURIComponent(`[${groupName}] `)}`,
          );
        }}
      />
    </AppShell>
  );
}
