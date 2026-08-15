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
import { ErrorState, Skeleton, useQuantSidekick } from '@quant/shared-ui';
import { AppShell } from '../components/AppShell';
import { useInbox } from '../hooks/useInbox';
import { useSearchEmails } from '../hooks/useSearchEmails';
import { AppSidebar } from '../components/AppSidebar';
import { EmailSnooze } from '../components/EmailSnooze';
import { HoverActions } from '../components/HoverActions';
import { IdentityAvatar } from '../components/IdentityAvatar';
import { InboxZeroState } from '../components/InboxZeroState';
import { showToast } from '../components/InboxToast';
import { Quanty } from '../components/Quanty';
import { QuantMailLogo } from '../components/QuantMailLogo';
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

type MailIconName = 'archive' | 'close' | 'mail' | 'search' | 'star';

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

/** Human-friendly "snoozed until" moment for toasts: "Sat, Aug 15, 9:00 AM". */
function formatSnoozeUntil(date: Date) {
  return `${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

/**
 * Normalize an email subject so we never display bare "Re:", "Fwd:", etc.
 * Strips leading reply/forward markers that leave nothing meaningful behind.
 */
function normalizeSubject(subject?: string | null): string {
  if (!subject) return '(no subject)';
  // Iteratively strip re:/fwd:/fw: so "Re: Fwd: " is handled too
  let s = subject.trim();
  for (let i = 0; i < 10; i++) {
    const next = s.replace(/^(re|fwd|fw):\s*/i, '').trim();
    if (next === s) break;
    s = next;
  }
  return s || '(no subject)';
}

/** True when a value is safe to place in a route segment or query param. */
function isValidRouteId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== 'null' && trimmed !== 'undefined';
}

/**
 * Resolves the id used for /thread/:id and reply deep links.
 * Some list payloads carry a missing/null threadId — fall back to the email id
 * so navigation never produces /thread/null or /thread/undefined.
 */
function resolveThreadTarget(email: Email): string | null {
  if (isValidRouteId(email.threadId)) return email.threadId;
  if (isValidRouteId(email.id)) return email.id;
  return null;
}

type EmailRowProps = {
  email: Email;
  isChecked: boolean;
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
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);
    if (info.offset.x < -96) void onArchive();
  };

  // Long-press (touch) opens the same quick-actions bar hover shows on desktop:
  // snooze / archive / delete / read / unread — user decision (msg#30 P06).
  const clearLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const handleTouchStart = () => {
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      setIsHovered(true);
      window.setTimeout(() => setIsHovered(false), 5200);
    }, 480);
  };

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
        onDragStart={() => {
          clearLongPress();
          setIsDragging(true);
        }}
        onDragEnd={handleDragEnd}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onTouchStart={handleTouchStart}
        onTouchMove={clearLongPress}
        onTouchEnd={clearLongPress}
        className={`mail-row ${email.isRead ? '' : 'is-unread'} ${email.isStarred ? 'is-pinned' : ''} ${isFocused ? 'is-focused' : ''}`}
        onClick={() => {
          if (isDragging) return;
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          onOpen();
        }}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={onToggleSelect}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Select email from ${email.from?.name || email.from?.email}`}
        />
        <IdentityAvatar name={email.from?.name || email.from?.email || ''} size="sm" />
        <div className="mail-row-copy">
          <div className="mail-row-meta">
            <strong>{email.from?.name || email.from?.email || 'Unknown'}</strong>
            {email.isStarred && (
              <span className="mail-pin-badge" aria-label="Starred — pinned to top">
                <MailIcon name="star" className="h-3 w-3" />
              </span>
            )}
            {!email.isRead && <span className="mail-unread-dot" aria-label="Unread" />}
            <time>{formatReceivedAt(email.receivedAt)}</time>
          </div>
          <h3>{normalizeSubject(email.subject)}</h3>
          <p>{email.snippet}</p>
        </div>
        {/* Quick actions — hover on desktop, long-press on touch. The clock button
            opens the SAME snooze menu as the always-there trigger. */}
        <AnimatePresence>
          {isHovered && !isDragging && (
            <HoverActions
              emailId={email.id}
              isRead={email.isRead}
              onArchive={onArchive}
              onDelete={onDelete}
              onMarkRead={onMarkRead}
              onMarkUnread={onMarkUnread}
              onSnooze={() => setSnoozeOpen(true)}
            />
          )}
        </AnimatePresence>
        {/* Star only visible when NOT hovered (hover shows the actions bar instead).
            Starring pins the conversation to the top of the inbox. */}
        {!isHovered && (
          <button
            type="button"
            className={`mail-star ${email.isStarred ? 'is-starred' : ''}`}
            onClick={onToggleStar}
            aria-label={email.isStarred ? 'Unstar email (unpins from top)' : 'Star email (pins to top)'}
            aria-pressed={email.isStarred}
          >
            <MailIcon name="star" />
          </button>
        )}
        {/* Snooze stays mounted so the hover-bar clock opens this same menu;
            its trigger hides while the hover bar covers the row's right edge. */}
        <EmailSnooze
          emailId={email.id}
          onSnooze={onSnooze}
          open={snoozeOpen}
          onOpenChange={setSnoozeOpen}
          triggerHidden={isHovered}
        />
      </motion.article>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lightweight pull-to-refresh — no extra dependency
// Returns a ref to attach to the scrollable list container.
// ---------------------------------------------------------------------------
function usePullToRefresh(onRefresh: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const pulling = useRef(false);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const THRESHOLD = 72;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop !== 0) return;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0 && el.scrollTop === 0) {
        setReady(dy >= THRESHOLD);
      } else {
        pulling.current = false;
        setReady(false);
      }
    };

    const onTouchEnd = async () => {
      if (!pulling.current) return;
      pulling.current = false;
      if (ready) {
        setRefreshing(true);
        setReady(false);
        try { onRefresh(); } finally {
          window.setTimeout(() => setRefreshing(false), 800);
        }
      } else {
        setReady(false);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [onRefresh, ready]);

  return { containerRef, ready, refreshing };
}

export default function InboxPage() {
  const router = useRouter();
  const { toggle: toggleCopilot, isOpen: copilotOpen } = useQuantSidekick();
  const [aiHover, setAiHover] = useState(false);
  const [activeCategory, setActiveCategory] = useState<EmailCategory>('primary');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastSelectedIndex = useRef<number>(-1);
  const { data: allEmails, isLoading, error, refetch } = useInbox({ category: activeCategory });
  const { data: searchResults, isLoading: isSearching } = useSearchEmails(
    debouncedQuery ? { query: debouncedQuery } : null,
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(searchQuery.trim()), 260);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // Starred conversations pin to the top of the list (user decision, msg#30 —
  // there is no separate Starred page; the star IS the pin).
  const emails = useMemo(() => {
    const list = debouncedQuery ? searchResults : allEmails;
    if (!list) return list;
    const starred = list.filter((email) => email.isStarred);
    const rest = list.filter((email) => !email.isStarred);
    return [...starred, ...rest];
  }, [debouncedQuery, searchResults, allEmails]);

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

  const handleRefetch = useCallback(() => { void refetch(); }, [refetch]);
  const { containerRef: ptrRef, ready: ptrReady, refreshing: ptrRefreshing } =
    usePullToRefresh(handleRefetch);

  const toggleSelect = useCallback(
    (id: string, event?: React.MouseEvent) => {
      setSelectedIds((current) => {
        const next = new Set(current);
        if (event?.shiftKey && emails && lastSelectedIndex.current >= 0) {
          const currentIndex = emails.findIndex((e) => e.id === id);
          if (currentIndex >= 0) {
            const start = Math.min(lastSelectedIndex.current, currentIndex);
            const end = Math.max(lastSelectedIndex.current, currentIndex);
            for (let i = start; i <= end; i++) next.add(emails[i].id);
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
        showToast({ text: response.error?.message || 'Conversation could not be archived', type: 'error' });
        return;
      }
      showToast({
        text: 'Conversation archived',
        type: 'success',
        undoAction: async () => {
          const undoResponse = await apiClient.unarchiveEmail(id);
          if (!undoResponse.success) {
            showToast({ text: undoResponse.error?.message || 'Archive could not be undone', type: 'error' });
            return;
          }
          await refetch();
        },
      });
      await refetch();
    },
    [refetch],
  );

  const deleteEmail = useCallback(
    async (id: string) => {
      const response = await apiClient.deleteEmail(id);
      if (!response.success) {
        showToast({ text: response.error?.message || 'Conversation could not be moved to trash', type: 'error' });
        return;
      }
      showToast({ text: 'Conversation moved to trash', type: 'success' });
      await refetch();
    },
    [refetch],
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

  const markAllRead = useCallback(async () => {
    const response = await apiClient.markAllRead(activeCategory);
    if (!response.success) {
      showToast({ text: response.error?.message || 'Could not mark everything as read', type: 'error' });
      return;
    }
    const updated = response.data?.updated ?? 0;
    showToast({
      text: updated > 0 ? `${updated} conversation${updated === 1 ? '' : 's'} marked as read` : 'Already caught up',
      type: 'success',
    });
    await refetch();
  }, [activeCategory, refetch]);

  const snoozeEmail = useCallback(
    async (emailId: string, snoozeUntil: Date) => {
      const response = await apiClient.snoozeEmail(emailId, snoozeUntil);
      if (!response.success) {
        showToast({ text: response.error?.message || 'Email could not be snoozed', type: 'error' });
        return;
      }
      showToast({
        text: `Snoozed until ${formatSnoozeUntil(snoozeUntil)}`,
        type: 'info',
        undoAction: async () => {
          const undoResponse = await apiClient.unsnoozeEmail(emailId);
          if (!undoResponse.success) {
            showToast({ text: undoResponse.error?.message || 'Snooze could not be undone', type: 'error' });
            return;
          }
          await refetch();
        },
      });
      await refetch();
    },
    [refetch],
  );

  // One-pane everywhere (user decision, msg#30 P04): opening a conversation
  // always goes to the full thread view — reply, forward, everything in one place.
  const openEmail = useCallback(
    (email: Email | null) => {
      if (!email) return;
      if (!email.isRead) {
        void apiClient.markAsRead(email.id).then(() => refetch()).catch(() => {});
      }
      const target = resolveThreadTarget(email);
      if (!target) {
        showToast({ text: 'This conversation is still syncing — try again in a moment.', type: 'error' });
        return;
      }
      router.push(`/thread/${target}`);
    },
    [router, refetch],
  );

  const { focusedIndex, listRef } = useInboxKeyboard({
    emails,
    selectedEmail: null,
    onSelectEmail: openEmail,
    onArchive: (id) => void archiveEmail(id),
    onDelete: (id) => void deleteEmail(id),
    onToggleStar: (id) => void toggleStar(null, id),
    onToggleSelect: (id) => toggleSelect(id),
    onMarkRead: (id) => void markRead(id),
    onMarkUnread: (id) => void markUnread(id),
  });

  // Merge list ref (keyboard nav) + ptrRef (pull-to-refresh) onto the same element
  const mailListRef = useCallback(
    (node: HTMLDivElement | null) => {
      (listRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      (ptrRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [listRef, ptrRef],
  );

  return (
    <AppShell
      sidebar={<AppSidebar />}
      theme="dark"
      className="quantmail-shell"
      mobileTitle={
        <div className="mobile-nav-search">
          {/* Mobile nav = search bar with the QuantMail logo inside (user design,
              msg#30 P03) + Quanty beside it. One bar, no wasted space. */}
          <label htmlFor="inbox-search-mobile" className="inbox-search inbox-search-nav">
            <span className="inbox-search-logo" aria-hidden="true">
              <QuantMailLogo size={20} blink={false} shine={false} />
            </span>
            <input
              id="inbox-search-mobile"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search in QuantMail"
              aria-label="Search in QuantMail"
            />
          </label>
          <button
            type="button"
            className="inbox-ai-trigger is-bare is-nav"
            onClick={toggleCopilot}
            aria-label="Ask Quanty — QuantAI"
            aria-expanded={copilotOpen}
            title="Ask Quanty"
          >
            <Quanty expression={copilotOpen ? 'happy' : 'idle'} size={34} bob />
          </button>
        </div>
      }
      aria-label="QuantMail inbox"
    >
      <div className="inbox-workspace is-single">
        <section className="inbox-list-pane" aria-label="Inbox messages">
          {/* inbox-hero is hidden on mobile via shell.css; the AppShell bar carries
              search there. Compose lives ONLY in the global floating + button. */}
          <header className="inbox-hero">
            <div>
              <p className="inbox-kicker">
                <span /> Inbox intelligence
              </p>
              <h1>Your signal.</h1>
              <p>
                {unreadCount > 0
                  ? `${unreadCount} unread message${unreadCount === 1 ? '' : 's'} need your attention.`
                  : 'You are fully caught up.'}
              </p>
            </div>
          </header>

          <div className="inbox-search-wrap">
            <label htmlFor="inbox-search" className="inbox-search">
              <span className="inbox-search-logo" aria-hidden="true">
                <QuantMailLogo size={20} blink={false} shine={false} />
              </span>
              <MailIcon name="search" />
              <input
                id="inbox-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search people, subjects, or meaning…"
              />
            </label>
            {/* Quanty — THE QuantAI face beside search; bare robot, no box behind
                (user decision, msg#30 P01). Idle he blinks; hover winks; open = happy. */}
            <button
              type="button"
              className="inbox-ai-trigger is-bare"
              onClick={toggleCopilot}
              onMouseEnter={() => setAiHover(true)}
              onMouseLeave={() => setAiHover(false)}
              aria-label="Ask Quanty — QuantAI"
              aria-expanded={copilotOpen}
              title="Ask Quanty — your QuantAI"
            >
              <Quanty expression={copilotOpen ? 'happy' : aiHover ? 'wink' : 'idle'} size={44} bob />
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

          {/* One-click inbox zero for the current tab — appears only when something is unread */}
          {unreadCount > 0 && !debouncedQuery && (
            <div className="inbox-list-tools">
              <button type="button" className="mark-all-read-btn" onClick={() => void markAllRead()}>
                <MailIcon name="mail" className="h-3.5 w-3.5" />
                Mark all as read
              </button>
            </div>
          )}

          <AnimatePresence initial={false}>
            {selectedIds.size > 0 && (
              <motion.div
                className="batch-toolbar"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                <strong>{selectedIds.size} selected</strong>
                <button type="button" onClick={() => void batchAction('archive')}>Archive</button>
                <button type="button" onClick={() => void batchAction('delete')}>Delete</button>
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
                <button type="button" onClick={() => setSelectedIds(new Set())} aria-label="Clear selection">
                  <MailIcon name="close" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mail-list" ref={mailListRef} aria-busy={isLoading || isSearching}>
            {/* Pull-to-refresh indicator */}
            <div className={`ptr-indicator${ptrReady || ptrRefreshing ? ' ptr-ready' : ''}`} aria-hidden="true">
              <span className="ptr-spinner" />
              <span>{ptrRefreshing ? 'Refreshing…' : 'Release to refresh'}</span>
            </div>

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
            {!isLoading && !isSearching && !error && (!emails || emails.length === 0) && (
              <InboxZeroState query={debouncedQuery || undefined} />
            )}
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
            <span>{emails?.length ?? 0} conversations</span>
          </footer>
        </section>
      </div>
    </AppShell>
  );
}
