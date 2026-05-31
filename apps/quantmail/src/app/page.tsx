'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { AppShell, SearchInput, Card, Badge, Button, Skeleton } from '@quant/shared-ui';
import { ErrorState, EmptyState } from '@quant/shared-ui';
import { spring } from '@quant/brand';
import { useInbox } from '../hooks/useInbox';
import { useSearchEmails } from '../hooks/useSearchEmails';
import { AppSidebar } from '../components/AppSidebar';
import { apiClient } from '../services/api-client';
import { listContainerVariants, listItemVariants } from '../lib/motion-variants';
import type { Email, EmailCategory } from '../types';

const CATEGORIES: { key: EmailCategory; label: string }[] = [
  { key: 'primary', label: 'Primary' },
  { key: 'social', label: 'Social' },
  { key: 'promotions', label: 'Promotions' },
  { key: 'updates', label: 'Updates' },
  { key: 'forums', label: 'Forums' },
];

export default function InboxPage() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<EmailCategory>('primary');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

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
      router.push(`/thread/${email.threadId}`);
    },
    [router],
  );

  return (
    <AppShell sidebar={<AppSidebar />}>
      <motion.div
        className="flex flex-col h-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        {/* Search */}
        <div className="p-4 border-b border-[var(--quant-border)]">
          <SearchInput placeholder="Search emails..." value={searchQuery} onChange={handleSearch} />
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[var(--quant-border)] overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              className={`px-3 py-1.5 min-h-touch text-sm rounded-md whitespace-nowrap transition-colors ${
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
                  <Card
                    padding="none"
                    className={`mx-4 my-2 p-4 cursor-pointer hover:bg-[var(--quant-muted)] transition-colors ${
                      !email.isRead ? 'border-l-4 border-l-[var(--quant-primary)]' : ''
                    }`}
                    onClick={() => handleEmailClick(email)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={selectedIds.has(email.id)}
                        onChange={() => handleToggleSelect(email.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 w-4 h-4 rounded border-[var(--quant-border)]"
                      />

                      {/* Star */}
                      <button
                        className={`mt-0.5 text-lg min-w-touch min-h-touch flex items-center justify-center ${email.isStarred ? 'text-yellow-500' : 'text-[var(--quant-muted-foreground)]'}`}
                        onClick={(e) => handleToggleStar(e, email.id)}
                        title={email.isStarred ? 'Unstar' : 'Star'}
                      >
                        {email.isStarred ? '\u2605' : '\u2606'}
                      </button>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm ${!email.isRead ? 'font-semibold' : 'font-normal'}`}
                          >
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
              ))}
            </motion.div>
          )}
        </div>
      </motion.div>
    </AppShell>
  );
}
