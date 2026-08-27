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
import { EmailLetterCard } from '../components/EmailLetterCard';
import { QuantyCopilotDrawer } from '../components/QuantyCopilotDrawer';
import { ConversationalThreadView } from '../components/ConversationalThreadView';
import { useInboxKeyboard } from '../hooks/useInboxKeyboard';
import { useMailMutations } from '../hooks/useMailMutations';
import { useScrollElement, useVirtualizer } from '../lib/virtual/useVirtualizer';
import { useAuth } from '../providers/auth-provider';
import type { Email, EmailCategory } from '../types';

/**
 * Starting height guess for a conversation row: `.mail-row`'s `min-height` of
 * 4.85rem plus its 1px border. Rows are measured for real once mounted, so this
 * only decides the scrollbar length before the first measurement pass.
 */
const ESTIMATED_ROW_HEIGHT = 80;

const TELEGRAM_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'groups', label: 'Groups' },
  { key: 'updates', label: 'Updates' },
  { key: 'promotions', label: 'Offers' },
  { key: 'pinned', label: 'Pinned' },
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

export interface ConversationThread {
  id: string;
  threadId: string;
  subject: string;
  normalizedSubject: string;
  latestEmail: Email;
  messages: Email[];
  count: number;
  sendersSummary: string;
  isRead: boolean;
  isStarred: boolean;
  receivedAt: string | Date;
  category: EmailCategory;
  priority?: string;
  labels: string[];
}

function sanitizeSnippetText(text?: string): string {
  if (!text) return '';
  let clean = text;
  try {
    clean = decodeURIComponent(escape(text));
  } catch {
    clean = text
      .replace(/ðŸŽ‰/g, '🎉')
      .replace(/ðŸ‘\s*[\x80-\xBF]?/g, '👍')
      .replace(/ðŸ”¥/g, '🔥')
      .replace(/ðŸš€/g, '🚀')
      .replace(/âœ…/g, '✅')
      .replace(/â ¤ï¸ ?/g, '❤️')
      .replace(/ðŸ˜Š/g, '😊')
      .replace(/ðŸ’¡/g, '💡')
      .replace(/ðŸ’¬/g, '💬')
      .replace(/âš\xa0ï¸ ?/g, '⚠️')
      .replace(/â€[™']/g, "'")
      .replace(/â€œ|â€ /g, '"')
      .replace(/â€“|â€”/g, '—')
      .replace(/â€¦/g, '…');
  }
  return clean
    .replace(/Â[\u00A0\s]?/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSubject(subject: string = ''): string {
  return sanitizeSnippetText(subject)
    .replace(/^(re|fwd|fw):\s*/i, '')
    .replace(/^(re|fwd|fw)\[\d+\]:\s*/i, '')
    .trim()
    .toLowerCase();
}

function groupEmailsIntoThreads(emails: Email[] = [], currentEmail?: string): ConversationThread[] {
  if (!emails || emails.length === 0) return [];

  const normMyEmail = (currentEmail || '').trim().toLowerCase();
  const myHandle = normMyEmail.split('@')[0];

  const threadMap = new Map<string, Email[]>();

  for (const email of emails) {
    const key =
      email.threadId ||
      (email.subject ? `subj:${normalizeSubject(email.subject)}` : `email:${email.id}`);
    const existing = threadMap.get(key) || [];
    existing.push(email);
    threadMap.set(key, existing);
  }

  const threads: ConversationThread[] = [];

  for (const [key, msgList] of threadMap.entries()) {
    msgList.sort(
      (a, b) =>
        new Date(a.receivedAt || a.createdAt || 0).getTime() -
        new Date(b.receivedAt || b.createdAt || 0).getTime(),
    );

    const latest = msgList[msgList.length - 1];
    const isRead = msgList.every((m) => m.isRead);
    const isStarred = msgList.some((m) => m.isStarred);

    const senderNames: string[] = [];
    let hasOther = false;
    for (const m of msgList) {
      const fromAddr = (m.from?.email || (m as any).fromAddress || '').toLowerCase();
      const isMe = Boolean(
        (normMyEmail &&
          (fromAddr === normMyEmail || (myHandle && fromAddr.startsWith(`${myHandle}@`)))) ||
        (m as any).isSent ||
        m.status === 'sent',
      );
      if (isMe) {
        if (!senderNames.includes('You')) senderNames.push('You');
      } else {
        hasOther = true;
        const name =
          m.from?.name ||
          (m as any).fromName ||
          m.from?.email?.split('@')[0] ||
          (m as any).fromAddress?.split('@')[0] ||
          'Sender';
        if (!senderNames.includes(name)) senderNames.push(name);
      }
    }
    let sendersSummary = senderNames.join(', ');
    if (senderNames.length === 0) sendersSummary = 'Conversation';
    else if (senderNames.length === 1 && senderNames[0] === 'You' && !hasOther)
      sendersSummary = 'You';

    threads.push({
      id: latest.id,
      threadId: latest.threadId || (key.startsWith('subj:') ? latest.id : key),
      subject: latest.subject || '(no subject)',
      normalizedSubject: normalizeSubject(latest.subject),
      latestEmail: latest,
      messages: msgList,
      count: msgList.length,
      sendersSummary,
      isRead,
      isStarred,
      receivedAt: latest.receivedAt || latest.createdAt || new Date(),
      category: latest.category || 'primary',
      priority: latest.priority,
      labels: Array.from(new Set(msgList.flatMap((m) => m.labels || []))),
    });
  }

  threads.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

  return threads;
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
      : 'bg-amber-500/15 text-amber-300 border-amber-500/30';

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
        className="mail-pin-reveal absolute inset-y-0 left-0 flex items-center gap-2 pl-4 text-amber-400 bg-amber-500/20 border-r border-amber-500/30 font-semibold text-xs"
        style={{ opacity: pinOpacity }}
        aria-hidden="true"
      >
        <MailIcon name="pin" className="size-4 text-amber-400" /> <span>Pin</span>
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
              <strong className="truncate text-zinc-100 font-semibold">
                {thread.sendersSummary}
              </strong>
              {thread.count > 1 && (
                <span className="px-1.5 py-0.2 rounded-full bg-zinc-800 text-[10px] font-mono text-zinc-400 shrink-0">
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
            <time>{formatReceivedAt(thread.receivedAt)}</time>
          </div>
          <h3 className="text-xs sm:text-sm font-medium text-zinc-300 truncate">
            {sanitizeSnippetText(thread.subject) || '(no subject)'}
          </h3>
          <p className="text-xs text-zinc-400 truncate">
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
                ? 'text-amber-400 fill-amber-400 bg-amber-500/15'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
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
        className="w-full max-w-md bg-[#121622] border border-zinc-700/80 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-[#FF7A00]/20 border border-[#FF7A00]/40 flex items-center justify-center text-[#FF7A00]">
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
              <p className="text-xs text-zinc-400">Group mailing list & shared conversation</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 flex items-center justify-center transition-colors"
          >
            <MailIcon name="close" className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Group Name <span className="text-[#FF7A00]">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Founders, Core Team, Project Alpha"
              value={groupName}
              onChange={(e) => {
                setGroupName(e.target.value);
                if (error) setError('');
              }}
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF7A00]"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Add Members (Emails) <span className="text-[#FF7A00]">*</span>
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
                className="flex-1 bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF7A00]"
              />
              <button
                type="button"
                onClick={handleAddMember}
                className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white transition-colors shrink-0"
              >
                + Add
              </button>
            </div>
            {members.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5 max-h-28 overflow-y-auto">
                {members.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800/90 border border-zinc-700 text-xs text-zinc-200"
                  >
                    <span>{email}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(email)}
                      className="text-zinc-400 hover:text-rose-400 ml-0.5 font-bold"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-rose-400 font-medium">{error}</p>}

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-800">
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
  const [activeCategoryTab, setActiveCategoryTab] = useState<string>('all');
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
  const { element: listElement, ref: listRef, elementRef: listElementRef } =
    useScrollElement<HTMLDivElement>();
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
  const allThreads = useMemo(
    () => groupEmailsIntoThreads(allEmails ?? [], currentEmail),
    [allEmails, currentEmail],
  );
  const threads = useMemo(
    () => groupEmailsIntoThreads(emails ?? [], currentEmail),
    [emails, currentEmail],
  );
  const allArchivedThreads = useMemo(
    () => groupEmailsIntoThreads(archivedEmails ?? [], currentEmail),
    [archivedEmails, currentEmail],
  );

  const isContactThread = useCallback((t: ConversationThread) => {
    const fromAddr = (
      t.latestEmail.from?.email ||
      (t.latestEmail as any).fromAddress ||
      ''
    ).toLowerCase();
    const isAutomated =
      /no-?reply|notification|alert|newsletter|marketing|updates?@|promo|mailer|support@|digest|bot@/i.test(
        fromAddr,
      );
    return !isAutomated && (t.count <= 2 || t.category === 'primary');
  }, []);

  const isGroupThread = useCallback((t: ConversationThread) => {
    if (t.category === 'forums') return true;
    const msg = t.latestEmail;
    const toCount = Array.isArray(msg.to) ? msg.to.length : 0;
    const ccCount = Array.isArray(msg.cc) ? msg.cc.length : 0;
    return toCount + ccCount > 1 || (msg as any).isGroup === true;
  }, []);

  const filterThreads = useCallback(
    (list: ConversationThread[], tab: string) => {
      if (tab === 'unread') return list.filter((t) => !t.isRead);
      if (tab === 'pinned') return list.filter((t) => t.isStarred);
      if (tab === 'contacts') return list.filter((t) => isContactThread(t));
      if (tab === 'groups') return list.filter((t) => isGroupThread(t));
      if (tab === 'updates') return list.filter((t) => t.category === 'updates');
      if (tab === 'promotions') return list.filter((t) => t.category === 'promotions');
      return list; // 'all'
    },
    [isContactThread, isGroupThread],
  );

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: allThreads.length,
      unread: allThreads.filter((t) => !t.isRead).length,
      contacts: allThreads.filter((t) => isContactThread(t)).length,
      groups: allThreads.filter((t) => isGroupThread(t)).length,
      updates: allThreads.filter((t) => t.category === 'updates').length,
      promotions: allThreads.filter((t) => t.category === 'promotions').length,
      pinned: allThreads.filter((t) => t.isStarred).length,
    };
    return counts;
  }, [allThreads, isContactThread, isGroupThread]);

  const currentArchivedThreads = useMemo(() => {
    return filterThreads(allArchivedThreads, activeCategoryTab);
  }, [allArchivedThreads, activeCategoryTab, filterThreads]);

  const displayThreads = useMemo(() => {
    const sourceThreads = showArchivedView
      ? currentArchivedThreads
      : filterThreads(threads ?? [], activeCategoryTab);

    return [...sourceThreads].sort((a, b) => {
      if (a.isStarred !== b.isStarred) {
        return a.isStarred ? -1 : 1;
      }
      return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
    });
  }, [showArchivedView, currentArchivedThreads, threads, activeCategoryTab, filterThreads]);

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

  const threadKey = useCallback((index: number) => displayThreads[index]?.id ?? index, [
    displayThreads,
  ]);

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
  }, [activeCategoryTab, showArchivedView, debouncedQuery]);

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

  const unreadCount = useMemo(() => allThreads.filter((t) => !t.isRead).length, [allThreads]);
  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<EmailCategory, number>> = {};
    allThreads.forEach((t) => {
      if (!t.isRead) counts[t.category] = (counts[t.category] ?? 0) + 1;
    });
    return counts;
  }, [allThreads]);

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
      await Promise.all(ids.map((id) => (read ? mutations.markRead(id) : mutations.markUnread(id))));
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
    <header className="flex min-h-14 flex-none items-center justify-between gap-3 border-b border-zinc-800 bg-[#121622] px-3 sm:px-5 shadow-xl select-none sticky top-0 z-50">
      {/* Left: Close/Deselect button & Count */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => setSelectedIds(new Set())}
          className="size-9 inline-flex items-center justify-center rounded-xl text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all active:scale-95"
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
            className="ml-2 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-[#FF7A00] transition-colors"
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
                  ? 'text-amber-400 bg-amber-500/20 hover:bg-amber-500/30'
                  : 'text-zinc-300 hover:text-amber-400 hover:bg-zinc-800'
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
          className="size-9 inline-flex items-center justify-center rounded-xl text-zinc-300 hover:text-amber-300 hover:bg-zinc-800 transition-all active:scale-95"
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
            <circle cx="18" cy="6" r="2.5" fill="#FF7A00" stroke="none" />
          </svg>
        </button>

        {/* Mark Read */}
        <button
          type="button"
          onClick={() => void batchMarkRead(Array.from(selectedIds), true)}
          className="size-9 inline-flex items-center justify-center rounded-xl text-zinc-300 hover:text-sky-400 hover:bg-zinc-800 transition-all active:scale-95"
          title="Mark as read"
        >
          <MailIcon name="mail" className="size-5" />
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={() => void batchAction('delete')}
          className="size-9 inline-flex items-center justify-center rounded-xl text-zinc-300 hover:text-rose-400 hover:bg-zinc-800 transition-all active:scale-95"
          title="Move to Trash (#)"
        >
          <MailIcon name="trash" className="size-5" />
        </button>

        {/* Archive */}
        <button
          type="button"
          onClick={() => void batchAction('archive')}
          className="size-9 inline-flex items-center justify-center rounded-xl text-zinc-300 hover:text-emerald-400 hover:bg-zinc-800 transition-all active:scale-95"
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
        activeCategoryTab === 'groups' ? setIsCreateGroupModalOpen(true) : router.push('/compose')
      }
      mobileActions={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={`md:hidden inline-flex size-9 items-center justify-center rounded-lg transition-colors ${
              isSearchOpen
                ? 'bg-zinc-800 text-[#FF7A00]'
                : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
            }`}
            onClick={() => setIsSearchOpen((prev) => !prev)}
            aria-label="Search messages"
          >
            <MailIcon name="search" className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => setIsGlobalQuantyOpen(true)}
            className="inline-flex size-9 items-center justify-center rounded-lg text-amber-400 hover:bg-zinc-800 transition-colors"
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
              <h1>Your Inbox</h1>
              <p>
                {unreadCount > 0
                  ? `${unreadCount} unread message${unreadCount === 1 ? '' : 's'} waiting for review.`
                  : 'You are completely caught up.'}
              </p>
            </div>
            <button
              type="button"
              className="hero-compose"
              onClick={() =>
                activeCategoryTab === 'groups'
                  ? setIsCreateGroupModalOpen(true)
                  : router.push('/compose')
              }
            >
              <MailIcon name="compose" />{' '}
              {activeCategoryTab === 'groups' ? 'Create Group' : 'Compose'}
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
                className="md:hidden overflow-hidden border-b border-zinc-800/80 bg-zinc-950 px-3 sm:px-4 py-2.5 flex items-center gap-2"
              >
                <div className="flex-1 flex items-center gap-2 bg-zinc-900/90 border border-zinc-700/80 rounded-xl px-3 py-1.5 shadow-inner">
                  <MailIcon name="search" className="size-4 text-zinc-400 shrink-0" />
                  <input
                    id="mobile-search-input"
                    name="search"
                    type="search"
                    placeholder="Search messages, contacts, keywords…"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="w-full bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none"
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="text-zinc-400 hover:text-white"
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
                  className="text-xs text-zinc-400 hover:text-white font-medium px-2 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Telegram-Style Sleek Horizontal Category Pill Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto py-3 px-3 sm:px-4 no-scrollbar select-none border-b border-[#282C35] bg-[#090A0C]/95 backdrop-blur-md">
            {TELEGRAM_CATEGORIES.map((cat) => {
              const isActive = activeCategoryTab === cat.key;
              const count = tabCounts[cat.key] || 0;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => {
                    setActiveCategoryTab(cat.key);
                    setShowArchivedView(false);
                  }}
                  className={`relative px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-all flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-[#2B1A11] text-[#FF8C42] border border-[#5C3016] font-semibold'
                      : 'bg-[#16181D] hover:bg-[#1C1F26] text-[#A1A4AC] hover:text-[#F5F5F5] border border-[#282C35]'
                  }`}
                >
                  <span>{cat.label}</span>
                  {count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold leading-tight ${
                        isActive
                          ? 'bg-[#FF8C42]/20 text-[#FF9B5A]'
                          : 'bg-[#111318] text-[#6B6E76] border border-[#282C35]'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Pull to Refresh Indicator Bar */}
          <AnimatePresence>
            {(pullDistance > 0 || isRefreshing) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: pullDistance > 0 ? pullDistance : 42, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden flex items-center justify-center gap-2.5 text-xs font-semibold text-amber-400 bg-amber-500/10 border-b border-amber-500/20 py-2 select-none"
              >
                <div
                  className={`size-4 rounded-full border-2 border-amber-400 border-t-transparent ${
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
                categoryLabel={activeCategoryTab === 'all' ? 'conversations' : activeCategoryTab}
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
              ) : activeCategoryTab === 'groups' ? (
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
                  <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                    Create a group to start a shared multi-recipient thread or mailing list.
                  </p>
                  <div className="pt-2 flex justify-center">
                    <Button variant="primary" onClick={() => setIsCreateGroupModalOpen(true)}>
                      + Create New Group
                    </Button>
                  </div>
                </div>
              ) : activeCategoryTab === 'unread' ? (
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
                  <p className="text-xs text-zinc-400">Zero unread messages in your inbox.</p>
                </div>
              ) : activeCategoryTab !== 'all' ? (
                <div className="mail-empty py-12 px-4 text-center space-y-2">
                  <div className="size-12 rounded-full bg-[#16181D] border border-[#282C35] text-[#A1A4AC] flex items-center justify-center mx-auto mb-1">
                    <svg
                      className="size-6"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-white">
                    No {activeCategoryTab} messages
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Emails categorized as {activeCategoryTab} will appear here.
                  </p>
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
                      categoryLabel={
                        activeCategoryTab === 'all' ? 'conversations' : activeCategoryTab
                      }
                      onToggle={() => setShowArchivedView((prev) => !prev)}
                    />
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
