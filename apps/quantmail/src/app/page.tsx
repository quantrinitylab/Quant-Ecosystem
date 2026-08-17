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

type EmailRowProps = {
  email: Email;
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
  email,
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

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);
    if (info.offset.x < -96) void onArchive();
  };

  const priorityColor =
    email.priority === 'high'
      ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
      : email.priority === 'low'
        ? 'bg-zinc-800 text-zinc-400 border-zinc-700/40'
        : 'bg-amber-500/10 text-amber-300/80 border-amber-500/20';

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
        className={`mail-row ${email.isRead ? '' : 'is-unread'} ${isActive ? 'is-active' : ''} ${isFocused ? 'is-focused' : ''}`}
        onClick={() => {
          if (!isDragging) onOpen();
        }}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={onToggleSelect}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Select email from ${email.from?.name || email.from?.email}`}
        />
        <IdentityAvatar name={email.from?.name || email.from?.email || '?'} size="sm" />
        <div className="mail-row-copy">
          <div className="mail-row-meta">
            <strong>{email.from?.name || email.from?.email}</strong>
            {!email.isRead && <span className="mail-unread-dot" aria-label="Unread" />}
            {email.priority && email.priority !== 'normal' && (
              <span
                className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${priorityColor}`}
              >
                {email.priority}
              </span>
            )}
            <time>{formatReceivedAt(email.receivedAt)}</time>
          </div>
          <h3>{email.subject || '(no subject)'}</h3>
          <p>{email.snippet}</p>
        </div>
        {/* Hover actions bar — quick actions on hover */}
        <AnimatePresence>
          {isHovered && !isDragging && (
            <HoverActions
              emailId={email.id}
              isRead={email.isRead}
              onArchive={onArchive}
              onDelete={onDelete}
              onMarkRead={onMarkRead}
              onMarkUnread={onMarkUnread}
              onSnooze={() => onSnooze(email.id, new Date(Date.now() + 3 * 3600 * 1000))}
            />
          )}
        </AnimatePresence>
        {/* Star + Snooze only visible when NOT hovered */}
        {!isHovered && (
          <>
            <button
              type="button"
              className={`mail-star ${email.isStarred ? 'is-starred' : ''}`}
              onClick={onToggleStar}
              aria-label={email.isStarred ? 'Unstar email' : 'Star email'}
              aria-pressed={email.isStarred}
            >
              <MailIcon name="star" />
            </button>
            <EmailSnooze emailId={email.id} onSnooze={onSnooze} />
          </>
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
    <AnimatePresence mode="wait">
      <motion.section
        key={email.id}
        className="reading-pane"
        aria-label={`Preview: ${email.subject}`}
        initial={{ opacity: 0, x: 14 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -10 }}
        transition={{ duration: 0.2 }}
      >
        <header className="reading-header">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label="Close preview"
            >
              <MailIcon name="close" />
            </button>
            {onArchive && (
              <button
                type="button"
                className="icon-button"
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
                className="icon-button"
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
                className={`icon-button ${email.isStarred ? 'text-[#ffb547]' : ''}`}
                onClick={() => onToggleStar(email.id)}
                title="Star (S)"
                aria-label="Star"
              >
                <MailIcon name="star" />
              </button>
            )}
          </div>

          <div className="reading-header-actions">
            <button
              type="button"
              className="quiet-button"
              onClick={() => router.push(`/compose?replyTo=${email.threadId || email.id}`)}
            >
              <MailIcon name="reply" className="h-3.5 w-3.5 inline mr-1" />
              Reply
            </button>
            <button
              type="button"
              className="signal-button"
              onClick={() => router.push(`/thread/${email.threadId || email.id}`)}
            >
              Open thread <span aria-hidden="true">↗</span>
            </button>
          </div>
        </header>

        <div className="reading-content">
          {/* Security & Verification Banner */}
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 mb-4 rounded-lg bg-[var(--quant-surface-subtle)] border border-[var(--quant-border-subtle)] text-[11px] text-[var(--quant-muted-foreground)]">
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <MailIcon name="shield" className="h-3.5 w-3.5" />
              Verified Sender · SPF Pass · DKIM Signed
            </span>
            <span className="font-mono text-[10px]">E2EE Encrypted</span>
          </div>

          <p className="reading-eyebrow">
            {email.category} · {email.priority} priority
            {(email.bodyText || email.snippet) && (
              <ReadTimeEstimate text={email.bodyText || email.snippet} className="ml-2" />
            )}
          </p>
          <h1>{email.subject || '(no subject)'}</h1>

          <div className="reading-sender">
            <IdentityAvatar name={email.from?.name || email.from?.email || '?'} size="lg" />
            <div>
              <strong>{email.from?.name || email.from?.email}</strong>
              <span>{email.from?.email}</span>
            </div>
            <time>{email.receivedAt ? new Date(email.receivedAt).toLocaleString() : ''}</time>
          </div>

          {/* QuantAI Brief & Summary */}
          {email.aiSummary ? (
            <aside className="reading-ai-summary">
              <span aria-hidden="true" className="text-[#ffad5c]">
                <MailIcon name="sparkles" className="h-4 w-4" />
              </span>
              <div>
                <strong>QuantAI Executive Brief</strong>
                <p>{email.aiSummary}</p>
              </div>
            </aside>
          ) : (
            <aside className="reading-ai-summary bg-opacity-40">
              <span aria-hidden="true" className="text-[#ffad5c]">
                <MailIcon name="sparkles" className="h-4 w-4" />
              </span>
              <div className="flex items-center justify-between w-full">
                <div>
                  <strong>QuantAI Copilot</strong>
                  <p className="text-xs text-[var(--quant-muted-foreground)]">
                    Auto-triage and thread context analyzed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/compose?replyTo=${email.threadId || email.id}&aiAssist=true`)
                  }
                  className="text-xs text-[#ffad5c] hover:underline font-semibold"
                >
                  Generate Draft ⚡
                </button>
              </div>
            </aside>
          )}

          <EmailSafetyBanner email={email} />
          <div className="reading-message">{email.bodyText || email.snippet}</div>

          {email.attachments && email.attachments.length > 0 && (
            <section className="reading-attachments" aria-label="Attachments">
              <h2>
                {email.attachments.length} attachment{email.attachments.length === 1 ? '' : 's'}
              </h2>
              <div>
                {email.attachments.map((attachment) => (
                  <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer">
                    <span>{attachment.filename}</span>
                    <small>{(attachment.size / 1024).toFixed(1)} KB</small>
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Inline Quick Reply & Smart Replies Footer */}
        <footer className="reading-reply-bar flex-col gap-2.5">
          <SmartReplySuggestions
            emailId={email.id}
            onSelectReply={(text) => {
              setQuickReplyText(text);
            }}
          />

          <div className="flex items-center gap-2 w-full">
            <input
              type="text"
              className="flex-1 bg-[#151517] border border-[var(--quant-border)] rounded-lg px-3.5 py-2 text-xs text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none focus:border-[#ff9933]/60 transition-colors"
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
                className="reading-send-shortcut px-4 py-2 text-xs font-semibold"
              >
                {isSendingQuickReply ? 'Sending…' : 'Send (↵)'}
              </button>
            ) : (
              <button
                type="button"
                className="quiet-button text-xs"
                onClick={() => router.push(`/compose?replyTo=${email.threadId || email.id}`)}
              >
                Full Composer
              </button>
            )}
            <button
              type="button"
              className="quiet-button text-xs"
              onClick={() => router.push(`/compose?forward=${email.id}`)}
            >
              Forward <span aria-hidden="true">→</span>
            </button>
          </div>
        </footer>
      </motion.section>
    </AnimatePresence>
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
  const unreadCount = useMemo(
    () => allEmails?.filter((email) => !email.isRead).length ?? 0,
    [allEmails],
  );
  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<EmailCategory, number>> = {};
    allEmails?.forEach((email) => {
      if (!email.isRead) counts[email.category] = (counts[email.category] ?? 0) + 1;
    });
    return counts;
  }, [allEmails]);

  const toggleSelect = useCallback(
    (id: string, event?: React.MouseEvent) => {
      setSelectedIds((current) => {
        const next = new Set(current);
        if (event?.shiftKey && emails && lastSelectedIndex.current >= 0) {
          const currentIndex = emails.findIndex((e) => e.id === id);
          if (currentIndex >= 0) {
            const start = Math.min(lastSelectedIndex.current, currentIndex);
            const end = Math.max(lastSelectedIndex.current, currentIndex);
            for (let i = start; i <= end; i++) {
              next.add(emails[i].id);
            }
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        if (emails) {
          const idx = emails.findIndex((e) => e.id === id);
          if (idx >= 0) lastSelectedIndex.current = idx;
        }
        return next;
      });
    },
    [emails],
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
      if (window.matchMedia('(min-width: 900px)').matches) setSelectedEmail(email);
      else router.push(`/thread/${email.threadId}`);
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
      mobileTitle={
        <span className="mobile-brand">
          <QuantMailLogo />
        </span>
      }
      mobileActions={
        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          onClick={() => router.push('/search')}
          aria-label="Search messages"
        >
          <MailIcon name="search" className="size-5" />
        </button>
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

          <div className="inbox-search-wrap">
            <label htmlFor="inbox-search" className="inbox-search">
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

          <div className="mail-list" ref={listRef} aria-busy={isLoading || isSearching}>
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
            {!isLoading && !isSearching && !error && emails && emails.length > 0 && (
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.025 } } }}
              >
                {emails.map((email, index) => (
                  <motion.div
                    key={email.id}
                    variants={{ hidden: { opacity: 0, y: 5 }, visible: { opacity: 1, y: 0 } }}
                  >
                    <EmailRow
                      email={email}
                      isChecked={selectedIds.has(email.id)}
                      isActive={selectedEmail?.id === email.id}
                      isFocused={focusedIndex === index}
                      onToggleSelect={() => toggleSelect(email.id)}
                      onToggleStar={(event) => void toggleStar(event, email.id)}
                      onOpen={() => openEmail(email)}
                      onArchive={() => void archiveEmail(email.id)}
                      onDelete={() => void deleteEmail(email.id)}
                      onMarkRead={() => void markRead(email.id)}
                      onMarkUnread={() => void markUnread(email.id)}
                      onSnooze={snoozeEmail}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
          <footer className="inbox-list-footer">
            <span>{emails?.length ?? 0} messages</span>
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
    </AppShell>
  );
}
