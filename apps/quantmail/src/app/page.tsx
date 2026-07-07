'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { AppShell, SearchInput, Button, Skeleton } from '@quant/shared-ui';
import { ErrorState } from '@quant/shared-ui';
import { spring } from '@quant/brand';
import { useInbox } from '../hooks/useInbox';
import { useSearchEmails } from '../hooks/useSearchEmails';
import { AppSidebar } from '../components/AppSidebar';
import { IdentityAvatar } from '../components/IdentityAvatar';
import { apiClient } from '../services/api-client';
import {
  listContainerVariants,
  listItemVariants,
  swipeVariants,
  readingPaneVariants,
} from '../lib/motion-variants';
import type { Email, EmailCategory } from '../types';

const CATEGORIES: { key: EmailCategory; label: string }[] = [
  { key: 'primary', label: 'Primary' },
  { key: 'social', label: 'Social' },
  { key: 'promotions', label: 'Promotions' },
  { key: 'updates', label: 'Updates' },
  { key: 'forums', label: 'Forums' },
];

function SwipeableEmailCard({
  email,
  isSelected,
  onToggleSelect,
  onToggleStar,
  onClick,
  onArchive,
}: {
  email: Email;
  isSelected: boolean;
  onToggleSelect: () => void;
  onToggleStar: (e: React.MouseEvent) => void;
  onClick: () => void;
  onArchive: () => void;
}) {
  const x = useMotionValue(0);
  const archiveOpacity = useTransform(x, [-120, -60], [1, 0]);
  const [swiping, setSwiping] = useState(false);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setSwiping(false);
    if (info.offset.x < -100) {
      onArchive();
    }
  };

  return (
    <div className="relative overflow-hidden mx-4 my-2 rounded-lg">
      {/* Archive action background */}
      <motion.div
        className="absolute inset-0 flex items-center justify-end px-6 bg-green-600 rounded-lg"
        style={{ opacity: archiveOpacity }}
      >
        <span className="text-white font-medium text-sm">Archive</span>
      </motion.div>

      <motion.div
        style={{ x }}
        drag="x"
        dragConstraints={{ left: -150, right: 0 }}
        dragElastic={0.1}
        onDragStart={() => setSwiping(true)}
        onDragEnd={handleDragEnd}
        className="relative z-10"
      >
        <div
          className={`group relative flex items-start gap-3 rounded-xl border px-3.5 py-3 cursor-pointer transition-all ${
            email.isRead
              ? 'border-transparent hover:border-[var(--quant-border)] hover:bg-[var(--quant-muted)]'
              : 'border-[var(--quant-border)] bg-[var(--quant-surface)] hover:shadow-md'
          }`}
          onClick={() => {
            if (!swiping) onClick();
          }}
        >
          {/* Unread accent */}
          {!email.isRead && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r bg-gradient-to-b from-[var(--brand-primary)] to-[var(--quant-secondary)]" />
          )}
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            className="mt-2.5 h-4 w-4 flex-none rounded border-[var(--quant-border)] opacity-0 group-hover:opacity-100 checked:opacity-100 transition-opacity"
          />
          <IdentityAvatar name={email.from?.name || email.from?.email || '?'} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`truncate text-sm ${!email.isRead ? 'font-semibold text-[var(--quant-foreground)]' : 'text-[var(--quant-foreground)]'}`}
              >
                {email.from?.name || email.from?.email}
              </span>
              {!email.isRead && (
                <span className="h-1.5 w-1.5 flex-none rounded-full bg-[var(--brand-primary)]" />
              )}
              <span className="ml-auto flex-none text-xs text-[var(--quant-muted-foreground)]">
                {email.receivedAt
                  ? new Date(email.receivedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })
                  : ''}
              </span>
            </div>
            <h3
              className={`truncate text-sm mt-0.5 ${!email.isRead ? 'font-medium text-[var(--quant-foreground)]' : 'text-[var(--quant-foreground)]'}`}
            >
              {email.subject || '(no subject)'}
            </h3>
            <p className="truncate text-xs text-[var(--quant-muted-foreground)] mt-0.5">
              {email.snippet}
            </p>
          </div>
          <button
            className={`mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-md text-base transition-colors ${
              email.isStarred
                ? 'text-amber-400'
                : 'text-[var(--quant-muted-foreground)] opacity-0 group-hover:opacity-100 hover:text-amber-400'
            }`}
            onClick={onToggleStar}
            title={email.isStarred ? 'Unstar' : 'Star'}
          >
            {email.isStarred ? '\u2605' : '\u2606'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ReadingPane({ email, onClose }: { email: Email | null; onClose: () => void }) {
  const router = useRouter();

  if (!email) {
    return (
      <div className="flex-1 hidden md:flex items-center justify-center text-[var(--quant-muted-foreground)]">
        <div className="text-center">
          <p className="text-lg font-medium">No email selected</p>
          <p className="text-sm mt-1">Click an email to preview it here</p>
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={email.id}
        variants={readingPaneVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="flex-1 hidden md:flex flex-col border-l border-[var(--quant-border)] overflow-y-auto"
      >
        {/* Reading pane header */}
        <div className="flex items-center gap-3 p-4 border-b border-[var(--quant-border)]">
          <button
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-sm text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
            onClick={onClose}
          >
            Close
          </button>
          <Button variant="secondary" onClick={() => router.push(`/thread/${email.threadId}`)}>
            Open Full Thread
          </Button>
        </div>

        {/* Email content */}
        <div className="p-6 flex-1">
          <h2 className="text-lg font-semibold mb-3">{email.subject}</h2>
          <div className="flex items-center gap-3 mb-4">
            <IdentityAvatar name={email.from?.name || email.from?.email || '?'} size="md" />
            <div>
              <p className="text-sm font-medium">{email.from?.name || email.from?.email}</p>
              <p className="text-xs text-[var(--quant-muted-foreground)]">
                {email.receivedAt ? new Date(email.receivedAt).toLocaleString() : ''}
              </p>
            </div>
          </div>
          <div className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--quant-foreground)]">
            {email.bodyText || email.snippet}
          </div>

          {/* Attachments */}
          {email.attachments && email.attachments.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {email.attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--quant-muted)] text-sm"
                >
                  <span>{att.filename}</span>
                  <span className="text-xs text-[var(--quant-muted-foreground)]">
                    ({(att.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Quick actions */}
          <div className="flex gap-2 mt-6 pt-4 border-t border-[var(--quant-border)]">
            <Button
              variant="primary"
              onClick={() => router.push(`/compose?replyTo=${email.threadId}`)}
            >
              Reply
            </Button>
            <Button variant="secondary" onClick={() => router.push(`/compose?forward=${email.id}`)}>
              Forward
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function InboxPage() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<EmailCategory>('primary');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

  const { data: allEmails, isLoading, error, refetch } = useInbox({ category: activeCategory });
  const { data: searchResults, isLoading: isSearching } = useSearchEmails(
    debouncedQuery ? { query: debouncedQuery } : null,
  );

  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (debounceTimer) clearTimeout(debounceTimer);
      const timer = setTimeout(() => {
        setDebouncedQuery(value);
      }, 300);
      setDebounceTimer(timer);
    },
    [debounceTimer],
  );

  const emails = debouncedQuery ? searchResults : allEmails;

  const unreadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (allEmails) {
      for (const email of allEmails) {
        if (!email.isRead) {
          counts[email.category] = (counts[email.category] || 0) + 1;
        }
      }
    }
    return counts;
  }, [allEmails]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBatchArchive = useCallback(async () => {
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map((id) => apiClient.archiveEmail(id)));
    setSelectedIds(new Set());
    refetch();
  }, [selectedIds, refetch]);

  const handleBatchDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map((id) => apiClient.deleteEmail(id)));
    setSelectedIds(new Set());
    refetch();
  }, [selectedIds, refetch]);

  const handleToggleStar = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      await apiClient.toggleStar(id);
      refetch();
    },
    [refetch],
  );

  const handleEmailClick = useCallback(
    (email: Email) => {
      // On desktop (md+), show in reading pane; on mobile, navigate to thread
      if (typeof window !== 'undefined' && window.innerWidth >= 768) {
        setSelectedEmail(email);
      } else {
        router.push(`/thread/${email.threadId}`);
      }
    },
    [router],
  );

  const handleArchiveEmail = useCallback(
    async (id: string) => {
      await apiClient.archiveEmail(id);
      if (selectedEmail?.id === id) setSelectedEmail(null);
      refetch();
    },
    [selectedEmail, refetch],
  );

  return (
    <AppShell sidebar={<AppSidebar />}>
      <motion.div
        className="flex h-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        {/* Email list pane */}
        <div className="flex flex-col flex-1 md:max-w-[50%] lg:max-w-[45%] md:min-w-[320px] h-full">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 pt-4">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--quant-foreground)]">
              Inbox
            </h1>
            <button
              onClick={() => router.push('/compose')}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[var(--brand-primary)] to-[var(--quant-secondary)] px-3.5 py-2 text-sm font-semibold text-white shadow-md shadow-[var(--brand-primary)]/20 transition-all hover:shadow-lg active:scale-[0.99]"
            >
              <span className="text-base leading-none">&#9997;</span>
              Compose
            </button>
          </div>
          {/* Search */}
          <div className="p-4">
            <SearchInput
              placeholder="Search mail — sender, subject, keywords…"
              value={searchQuery}
              onChange={handleSearch}
            />
          </div>

          {/* Category tabs */}
          <div className="flex items-center gap-1 px-4 py-2 border-b border-[var(--quant-border)] overflow-x-auto">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                className={`px-3 py-1.5 min-h-[44px] text-sm rounded-md whitespace-nowrap transition-colors ${
                  activeCategory === cat.key
                    ? 'bg-[var(--quant-primary)] text-white'
                    : 'text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-muted)]'
                }`}
                onClick={() => setActiveCategory(cat.key)}
              >
                {cat.label}
                {unreadCounts[cat.key] ? (
                  <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs rounded-full bg-[var(--quant-destructive)] text-white">
                    {unreadCounts[cat.key]}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {/* Batch toolbar */}
          <AnimatePresence>
            {selectedIds.size > 0 && (
              <motion.div
                className="flex items-center gap-2 px-4 py-2 bg-[var(--quant-muted)] border-b border-[var(--quant-border)]"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: 'spring', ...spring.snappy }}
              >
                <span className="text-sm font-medium">{selectedIds.size} selected</span>
                <Button variant="secondary" onClick={handleBatchArchive}>
                  Archive All
                </Button>
                <Button variant="secondary" onClick={handleBatchDelete}>
                  Delete All
                </Button>
                <Button variant="secondary" onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Email list */}
          <div className="flex-1 overflow-y-auto">
            {(isLoading || isSearching) && (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} variant="rect" width="100%" height="80px" />
                ))}
              </div>
            )}
            {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}
            {!isLoading && !isSearching && !error && (!emails || emails.length === 0) && (
              <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
                <div
                  className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--brand-primary), var(--quant-secondary))',
                  }}
                >
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M3 7l9 6 9-6M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7M3 7a2 2 0 012-2h14a2 2 0 012 2"
                      stroke="white"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-[var(--quant-foreground)]">
                  {debouncedQuery ? 'No results found' : 'Your inbox is all clear'}
                </h3>
                <p className="mt-1.5 max-w-xs text-sm text-[var(--quant-muted-foreground)]">
                  {debouncedQuery
                    ? 'Try a different search — sender, subject, or keywords.'
                    : 'New mail will land here. Start a conversation or invite someone to QuantMail.'}
                </p>
                {!debouncedQuery && (
                  <button
                    onClick={() => router.push('/compose')}
                    className="mt-6 rounded-xl bg-gradient-to-r from-[var(--brand-primary)] to-[var(--quant-secondary)] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[var(--brand-primary)]/25 transition-all hover:shadow-xl active:scale-[0.99]"
                  >
                    Compose your first email
                  </button>
                )}
              </div>
            )}
            {!isLoading && !isSearching && !error && emails && emails.length > 0 && (
              <motion.div variants={listContainerVariants} initial="hidden" animate="visible">
                {emails.map((email) => (
                  <motion.div key={email.id} variants={listItemVariants}>
                    <SwipeableEmailCard
                      email={email}
                      isSelected={selectedIds.has(email.id)}
                      onToggleSelect={() => handleToggleSelect(email.id)}
                      onToggleStar={(e) => handleToggleStar(e, email.id)}
                      onClick={() => handleEmailClick(email)}
                      onArchive={() => handleArchiveEmail(email.id)}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </div>

        {/* Reading pane (desktop only) */}
        <ReadingPane email={selectedEmail} onClose={() => setSelectedEmail(null)} />
      </motion.div>
    </AppShell>
  );
}
