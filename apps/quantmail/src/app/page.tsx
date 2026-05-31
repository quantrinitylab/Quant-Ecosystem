'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { AppShell, SearchInput, Card, Badge, Button, Skeleton, Avatar } from '@quant/shared-ui';
import { ErrorState, EmptyState } from '@quant/shared-ui';
import { spring } from '@quant/brand';
import { useInbox } from '../hooks/useInbox';
import { useSearchEmails } from '../hooks/useSearchEmails';
import { AppSidebar } from '../components/AppSidebar';
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
        <Card
          padding="none"
          className={`p-4 cursor-pointer hover:bg-[var(--quant-muted)] transition-colors ${
            !email.isRead ? 'border-l-4 border-l-[var(--quant-primary)]' : ''
          }`}
          onClick={() => {
            if (!swiping) onClick();
          }}
        >
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              onClick={(e) => e.stopPropagation()}
              className="mt-1 w-4 h-4 rounded border-[var(--quant-border)]"
            />
            <button
              className={`mt-0.5 text-lg min-w-[44px] min-h-[44px] flex items-center justify-center ${email.isStarred ? 'text-yellow-500' : 'text-[var(--quant-muted-foreground)]'}`}
              onClick={onToggleStar}
              title={email.isStarred ? 'Unstar' : 'Star'}
            >
              {email.isStarred ? '\u2605' : '\u2606'}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm ${!email.isRead ? 'font-semibold' : 'font-normal'}`}>
                  {email.from?.name || email.from?.email}
                </span>
                {!email.isRead && <Badge variant="info">New</Badge>}
              </div>
              <h3 className={`text-sm mt-1 ${!email.isRead ? 'font-semibold' : ''}`}>
                {email.subject}
              </h3>
              <p className="text-xs text-[var(--quant-muted-foreground)] mt-1 truncate">
                {email.snippet}
              </p>
            </div>
            <span className="text-xs text-[var(--quant-muted-foreground)] whitespace-nowrap ml-4">
              {email.receivedAt ? new Date(email.receivedAt).toLocaleDateString() : ''}
            </span>
          </div>
        </Card>
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
            <Avatar name={email.from?.name || email.from?.email || '?'} size="sm" src={undefined} />
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
          {/* Search */}
          <div className="p-4 border-b border-[var(--quant-border)]">
            <SearchInput
              placeholder="Search emails..."
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
              <EmptyState
                title={debouncedQuery ? 'No results found' : 'Inbox is empty'}
                description={debouncedQuery ? 'Try a different search query' : 'No emails to show'}
              />
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
