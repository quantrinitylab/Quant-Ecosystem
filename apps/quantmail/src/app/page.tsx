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
import { PostcardReader } from '../components/postcard/PostcardReader';
import { EmailSenderHeader } from '../components/EmailSenderHeader';
import { EmailLetterCard } from '../components/EmailLetterCard';
import { QuantyCopilotDrawer } from '../components/QuantyCopilotDrawer';
import { useInboxKeyboard } from '../hooks/useInboxKeyboard';
import { apiClient } from '../services/api-client';
import type { Email, EmailCategory } from '../types';

const CATEGORIES: Array<{ key: EmailCategory; label: string }> = [
  { key: 'primary', label: 'Focus' },
  { key: 'updates', label: 'Updates' },
  { key: 'social', label: 'People' },
  { key: 'promotions', label: 'Offers' },
  { key: 'forums', label: 'Groups' },
];

type MailIconName =
  | 'archive'
  | 'close'
  | 'compose'
  | 'mail'
  | 'search'
  | 'star'
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

export function normalizeSubject(subject: string = ''): string {
  return subject
    .replace(/^(re|fwd|fw):\s*/i, '')
    .replace(/^(re|fwd|fw)\[\d+\]:\s*/i, '')
    .trim()
    .toLowerCase();
}

export function groupEmailsIntoThreads(emails: Email[] = []): ConversationThread[] {
  if (!emails || emails.length === 0) return [];

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
    for (const m of msgList) {
      const name = m.from?.name || m.from?.email?.split('@')[0] || 'Unknown';
      if (!senderNames.includes(name)) senderNames.push(name);
    }
    const sendersSummary = senderNames.join(', ');

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
  onToggleSelect: () => void;
  onToggleStar: (event: React.MouseEvent) => void;
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
  const prefersReducedMotion = useReducedMotion();
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
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
    if (info.offset.x < -96) void onArchive();
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
    <div className="mail-row-shell">
      <motion.div
        className="mail-archive-reveal"
        style={{ opacity: archiveOpacity }}
        aria-hidden="true"
      >
        <MailIcon name="archive" /> <span>Archive</span>
      </motion.div>
      <motion.article
        style={{ x }}
        drag={prefersReducedMotion ? false : 'x'}
        dragConstraints={{ left: -128, right: 0 }}
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
          onChange={onToggleSelect}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Select conversation with ${thread.sendersSummary}`}
        />
        <IdentityAvatar name={thread.sendersSummary || '?'} size="sm" />
        <div className="mail-row-copy">
          <div className="mail-row-meta">
            <div className="flex items-center gap-1.5 min-w-0">
              <strong className="truncate text-zinc-100">{thread.sendersSummary}</strong>
              {thread.count > 1 && (
                <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-zinc-800 text-[#FF7A00] border border-zinc-700/80">
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
          <h3>{thread.subject || '(no subject)'}</h3>
          <p>{email.snippet}</p>
        </div>
        {/* Hover actions bar — quick actions on hover (Desktop) */}
        <AnimatePresence>
          {isHovered && !isDragging && (
            <HoverActions
              emailId={thread.id}
              isRead={thread.isRead}
              onArchive={onArchive}
              onDelete={onDelete}
              onMarkRead={onMarkRead}
              onMarkUnread={onMarkUnread}
              onSnooze={() => onSnooze(email.id, new Date(Date.now() + 3 * 3600 * 1000))}
            />
          )}
        </AnimatePresence>
        {/* Star button only (no snooze clutter) */}
        {!isHovered && (
          <button
            type="button"
            className={`mail-star ${email.isStarred ? 'is-starred' : ''}`}
            onClick={onToggleStar}
            aria-label={email.isStarred ? 'Unstar email' : 'Star email'}
            aria-pressed={email.isStarred}
          >
            <MailIcon name="star" />
          </button>
        )}
      </motion.article>
    </div>
  );
}

function ReadingPane({
  email,
  onClose,
  onArchive,
  onDelete,
  onToggleStar,
}: {
  email: Email | null;
  onClose: () => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
  onToggleStar?: (id: string) => void;
}) {
  const router = useRouter();
  const [quickReplyText, setQuickReplyText] = useState('');
  const [isSendingQuickReply, setIsSendingQuickReply] = useState(false);
  const [isQuantyDrawerOpen, setIsQuantyDrawerOpen] = useState(false);
  const isPostcard = email?.bodyText?.includes('<!-- QUANTMAIL_POSTCARD:');

  const handleSendQuickReply = async () => {
    if (!email || !quickReplyText.trim()) return;
    setIsSendingQuickReply(true);
    try {
      const res = await apiClient.replyToEmail(email.id, quickReplyText);
      if (res.success) {
        showToast({ text: 'Quick reply sent', type: 'success' });
        setQuickReplyText('');
      } else {
        showToast({ text: res.error?.message || 'Failed to send reply', type: 'error' });
      }
    } catch {
      showToast({ text: 'Failed to send reply', type: 'error' });
    } finally {
      setIsSendingQuickReply(false);
    }
  };

  if (!email) {
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

  return (
    <>
      <motion.aside
        className="reading-pane overflow-hidden flex flex-col"
        aria-label="Message preview"
        initial={{ opacity: 0, x: 14 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -10 }}
        transition={{ duration: 0.2 }}
      >
        <header className="reading-header bg-zinc-950/90 border-b border-zinc-800/80 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              onClick={onClose}
              aria-label="Close preview"
            >
              <MailIcon name="close" />
            </button>
            {onArchive && (
              <button
                type="button"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                onClick={() => onArchive(email.id)}
                title="Archive (E)"
                aria-label="Archive"
              >
                <MailIcon name="archive" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                onClick={() => onDelete(email.id)}
                title="Delete (#)"
                aria-label="Delete"
              >
                <MailIcon name="trash" />
              </button>
            )}
            {onToggleStar && (
              <button
                type="button"
                className={`p-1.5 rounded-lg transition-colors ${
                  email.isStarred
                    ? 'text-amber-400 bg-amber-400/10'
                    : 'text-zinc-400 hover:text-white'
                }`}
                onClick={() => onToggleStar(email.id)}
                title="Star (S)"
                aria-label="Star"
              >
                <MailIcon name="star" />
              </button>
            )}

            {/* Quanty Robo Button */}
            <button
              type="button"
              onClick={() => setIsQuantyDrawerOpen(true)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 text-xs font-bold transition-all ml-1"
              title="Ask Quanty AI"
            >
              <Quanty size={18} expression="happy" bob={false} />
              <span className="hidden sm:inline text-[11px]">Quanty</span>
            </button>
          </div>

          <div className="reading-header-actions flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-1 rounded-xl text-xs font-semibold bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white border border-zinc-700 transition-colors"
              onClick={() => router.push(`/compose?replyTo=${email.threadId || email.id}`)}
            >
              <MailIcon name="reply" className="h-3.5 w-3.5 inline mr-1" />
              Reply
            </button>
            <button
              type="button"
              className="px-3 py-1 rounded-xl text-xs font-semibold bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 transition-colors"
              onClick={() => router.push(`/thread/${email.threadId || email.id}`)}
            >
              Open thread <span aria-hidden="true">↗</span>
            </button>
          </div>
        </header>

        <div className="reading-content flex-1 overflow-y-auto p-4 space-y-4">
          {/* Sender Header Row with Expandable "to me ⌵" */}
          <EmailSenderHeader email={email} />

          {/* Email Body: Postcard or Luxury Letterhead */}
          {isPostcard ? <PostcardReader email={email} /> : <EmailLetterCard email={email} />}
        </div>

        {/* Inline Quick Reply & Smart Replies Footer */}
        <footer className="reading-reply-bar flex-col gap-2.5 p-3.5 bg-zinc-950/90 border-t border-zinc-800">
          <SmartReplySuggestions
            emailId={email.id}
            onSelectReply={(text) => {
              setQuickReplyText(text);
            }}
          />

          <div className="flex items-center gap-2 w-full">
            <input
              type="text"
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/70 transition-colors"
              placeholder="Type a quick reply or pick a suggestion above…"
              value={quickReplyText}
              onChange={(e) => setQuickReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSendQuickReply();
                }
              }}
            />
            {quickReplyText.trim() ? (
              <button
                type="button"
                disabled={isSendingQuickReply}
                onClick={() => void handleSendQuickReply()}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold transition-all"
              >
                {isSendingQuickReply ? 'Sending…' : 'Send (↵)'}
              </button>
            ) : (
              <button
                type="button"
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-all"
                onClick={() => router.push(`/compose?replyTo=${email.threadId || email.id}`)}
              >
                Full Composer
              </button>
            )}
            <button
              type="button"
              className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-all"
              onClick={() => router.push(`/compose?forward=${email.id}`)}
            >
              Forward <span aria-hidden="true">→</span>
            </button>
          </div>
        </footer>
      </motion.aside>

      <QuantyCopilotDrawer
        isOpen={isQuantyDrawerOpen}
        onClose={() => setIsQuantyDrawerOpen(false)}
        contextEmail={email}
        onInsertReply={(text) => setQuickReplyText(text)}
      />
    </>
  );
}

export default function InboxPage() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<EmailCategory>('primary');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const lastSelectedIndex = useRef<number>(-1);
  const { data: allEmails, isLoading, error, refetch } = useInbox({ category: activeCategory });
  const { data: searchResults, isLoading: isSearching } = useSearchEmails(
    debouncedQuery ? { query: debouncedQuery } : null,
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(searchQuery.trim()), 260);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const emails = debouncedQuery ? searchResults : allEmails;
  const allThreads = useMemo(() => groupEmailsIntoThreads(allEmails ?? []), [allEmails]);
  const threads = useMemo(() => groupEmailsIntoThreads(emails ?? []), [emails]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isGlobalQuantyOpen, setIsGlobalQuantyOpen] = useState(false);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);

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
    const listEl = listRef.current;
    if (listEl && listEl.scrollTop <= 5) {
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    } else {
      isPulling.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling.current || isRefreshing) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY.current;
    if (diff > 0) {
      const distance = Math.min(diff * 0.42, 60);
      setPullDistance(distance);
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchEnd = async () => {
    if (!isPulling.current) return;
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
    (id: string, event?: React.MouseEvent) => {
      setSelectedIds((current) => {
        const next = new Set(current);
        if (event?.shiftKey && threads && lastSelectedIndex.current >= 0) {
          const currentIndex = threads.findIndex((t) => t.id === id);
          if (currentIndex >= 0) {
            const start = Math.min(lastSelectedIndex.current, currentIndex);
            const end = Math.max(lastSelectedIndex.current, currentIndex);
            for (let i = start; i <= end; i++) {
              next.add(threads[i].id);
            }
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        if (threads) {
          const idx = threads.findIndex((t) => t.id === id);
          if (idx >= 0) lastSelectedIndex.current = idx;
        }
        return next;
      });
    },
    [threads],
  );

  const batchAction = useCallback(
    async (action: 'archive' | 'delete') => {
      const count = selectedIds.size;
      const responses = await Promise.all(
        Array.from(selectedIds, (id) =>
          action === 'archive' ? apiClient.archiveEmail(id) : apiClient.deleteEmail(id),
        ),
      );
      const failed = responses.find((response) => !response.success);
      if (failed) {
        showToast({
          text: failed.error?.message || `Selected conversations could not be ${action}d`,
          type: 'error',
        });
        return;
      }
      setSelectedIds(new Set());
      showToast({
        text: `${count} conversation${count === 1 ? '' : 's'} ${action === 'archive' ? 'archived' : 'deleted'}`,
        type: 'success',
      });
      await refetch();
    },
    [refetch, selectedIds],
  );

  const toggleStar = useCallback(
    async (event: React.MouseEvent | null, id: string) => {
      event?.stopPropagation();
      await apiClient.toggleStar(id);
      await refetch();
    },
    [refetch],
  );

  const archiveEmail = useCallback(
    async (id: string) => {
      const response = await apiClient.archiveEmail(id);
      if (!response.success) {
        showToast({
          text: response.error?.message || 'Conversation could not be archived',
          type: 'error',
        });
        return;
      }
      if (selectedEmail?.id === id) setSelectedEmail(null);
      showToast({
        text: 'Conversation archived',
        type: 'success',
        undoAction: async () => {
          const undoResponse = await apiClient.unarchiveEmail(id);
          if (!undoResponse.success) {
            showToast({
              text: undoResponse.error?.message || 'Archive could not be undone',
              type: 'error',
            });
            return;
          }
          await refetch();
        },
      });
      await refetch();
    },
    [refetch, selectedEmail],
  );

  const deleteEmail = useCallback(
    async (id: string) => {
      const response = await apiClient.deleteEmail(id);
      if (!response.success) {
        showToast({
          text: response.error?.message || 'Conversation could not be moved to trash',
          type: 'error',
        });
        return;
      }
      if (selectedEmail?.id === id) setSelectedEmail(null);
      showToast({ text: 'Conversation moved to trash', type: 'success' });
      await refetch();
    },
    [refetch, selectedEmail],
  );

  const markRead = useCallback(
    async (id: string) => {
      await apiClient.markAsRead?.(id).catch(() => {});
      await refetch();
    },
    [refetch],
  );

  const markUnread = useCallback(
    async (id: string) => {
      await apiClient.markAsUnread?.(id).catch(() => {});
      showToast({ text: 'Marked as unread', type: 'info' });
      await refetch();
    },
    [refetch],
  );

  const snoozeEmail = useCallback(
    async (emailId: string, snoozeUntil: Date) => {
      const response = await apiClient.snoozeEmail(emailId, snoozeUntil);
      if (!response.success) {
        showToast({ text: response.error?.message || 'Email could not be snoozed', type: 'error' });
        return;
      }
      if (selectedEmail?.id === emailId) setSelectedEmail(null);
      showToast({ text: `Email snoozed until ${snoozeUntil.toLocaleString()}`, type: 'info' });
      await refetch();
    },
    [refetch, selectedEmail],
  );

  const openEmail = useCallback(
    (email: Email | null) => {
      if (!email) {
        setSelectedEmail(null);
        return;
      }
      setSelectedEmail(email);
      void apiClient.markAsRead?.(email.id).catch(() => {});
      const targetId = email.threadId || email.id;
      if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 900px)').matches) {
        router.push(`/thread/${targetId}`);
      }
    },
    [router],
  );

  // Superhuman-style keyboard navigation
  const { focusedIndex, listRef } = useInboxKeyboard({
    emails,
    selectedEmail,
    onSelectEmail: openEmail,
    onArchive: (id) => void archiveEmail(id),
    onDelete: (id) => void deleteEmail(id),
    onToggleStar: (id) => void toggleStar(null, id),
    onToggleSelect: (id) => toggleSelect(id),
    onMarkRead: (id) => void markRead(id),
    onMarkUnread: (id) => void markUnread(id),
  });

  return (
    <AppShell
      sidebar={<AppSidebar />}
      theme="dark"
      className="quantmail-shell"
      mobileActions={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsGlobalQuantyOpen(true)}
            className="inline-flex size-9 items-center justify-center rounded-lg text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 transition-colors"
            aria-label="Ask Quanty AI"
          >
            <Quanty size={20} expression="happy" bob={false} />
          </button>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            onClick={() => router.push('/search')}
            aria-label="Search messages"
          >
            <MailIcon name="search" className="size-5" />
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
            <button type="button" className="hero-compose" onClick={() => router.push('/compose')}>
              <MailIcon name="compose" /> New Message
            </button>
          </header>

          <div className="inbox-search-wrap md:hidden flex items-center gap-2">
            <label htmlFor="inbox-search" className="inbox-search flex-1">
              <MailIcon name="search" />
              <input
                id="inbox-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search messages, contacts, keywords…"
              />
              <kbd>/</kbd>
            </label>
            <button
              type="button"
              onClick={() => setIsGlobalQuantyOpen(true)}
              className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 shrink-0"
              title="Ask Quanty AI"
            >
              <Quanty size={20} expression="happy" bob={false} />
            </button>
          </div>

          <nav className="inbox-categories" aria-label="Inbox categories">
            {CATEGORIES.map((category) => (
              <button
                key={category.key}
                type="button"
                onClick={() => setActiveCategory(category.key)}
                className={activeCategory === category.key ? 'is-active' : ''}
                aria-current={activeCategory === category.key ? 'page' : undefined}
              >
                {category.label}
                {categoryCounts[category.key] ? <span>{categoryCounts[category.key]}</span> : null}
              </button>
            ))}
          </nav>

          <AnimatePresence initial={false}>
            {selectedIds.size > 0 && (
              <motion.div
                className="batch-toolbar"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                <strong>{selectedIds.size} selected</strong>
                <button type="button" onClick={() => void batchAction('archive')}>
                  Archive
                </button>
                <button type="button" onClick={() => void batchAction('delete')}>
                  Delete
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await Promise.all(Array.from(selectedIds, (id) => apiClient.markAsRead(id)));
                    setSelectedIds(new Set());
                    showToast({ text: `${selectedIds.size} marked as read`, type: 'info' });
                    await refetch();
                  }}
                >
                  Mark read
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await Promise.all(Array.from(selectedIds, (id) => apiClient.markAsUnread(id)));
                    setSelectedIds(new Set());
                    showToast({ text: `${selectedIds.size} marked as unread`, type: 'info' });
                    await refetch();
                  }}
                >
                  Mark unread
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  aria-label="Clear selection"
                >
                  <MailIcon name="close" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

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
              (!emails || emails.length === 0) &&
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
              ) : (
                <InboxZeroState />
              ))}
            {!isLoading && !isSearching && !error && threads && threads.length > 0 && (
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.025 } } }}
              >
                {threads.map((thread, index) => (
                  <motion.div
                    key={thread.id}
                    variants={{ hidden: { opacity: 0, y: 5 }, visible: { opacity: 1, y: 0 } }}
                  >
                    <EmailRow
                      thread={thread}
                      isChecked={selectedIds.has(thread.id)}
                      isActive={selectedEmail?.id === thread.id}
                      isFocused={focusedIndex === index}
                      onToggleSelect={() => toggleSelect(thread.id)}
                      onToggleStar={(event) => void toggleStar(event, thread.id)}
                      onOpen={() => openEmail(thread.latestEmail)}
                      onArchive={() => void archiveEmail(thread.id)}
                      onDelete={() => void deleteEmail(thread.id)}
                      onMarkRead={() => void markRead(thread.id)}
                      onMarkUnread={() => void markUnread(thread.id)}
                      onSnooze={snoozeEmail}
                    />
                  </motion.div>
                ))}
              </motion.div>
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
          email={selectedEmail}
          onClose={() => setSelectedEmail(null)}
          onArchive={(id) => void archiveEmail(id)}
          onDelete={(id) => void deleteEmail(id)}
          onToggleStar={(id) => void toggleStar(null, id)}
        />
      </div>

      <Quanty />

      <QuantyCopilotDrawer
        isOpen={isGlobalQuantyOpen}
        onClose={() => setIsGlobalQuantyOpen(false)}
      />
    </AppShell>
  );
}
