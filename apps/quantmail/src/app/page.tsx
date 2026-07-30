'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { quantMailBrandLockup } from '../brand/identity';
import { AppShell } from '../components/AppShell';
import { useInbox } from '../hooks/useInbox';
import { useSearchEmails } from '../hooks/useSearchEmails';
import { AppSidebar } from '../components/AppSidebar';
import { IdentityAvatar } from '../components/IdentityAvatar';
import { QuantrinityMark } from '../components/QuantrinityMark';
import { apiClient } from '../services/api-client';
import type { Email, EmailCategory } from '../types';

const CATEGORIES: Array<{ key: EmailCategory; label: string }> = [
  { key: 'primary', label: 'Focus' },
  { key: 'updates', label: 'Updates' },
  { key: 'social', label: 'People' },
  { key: 'promotions', label: 'Offers' },
  { key: 'forums', label: 'Groups' },
];

type MailIconName = 'archive' | 'close' | 'compose' | 'mail' | 'search' | 'star';

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
  onToggleSelect: () => void;
  onToggleStar: (event: React.MouseEvent) => void;
  onOpen: () => void;
  onArchive: () => void;
};

function EmailRow({
  email,
  isChecked,
  isActive,
  onToggleSelect,
  onToggleStar,
  onOpen,
  onArchive,
}: EmailRowProps) {
  const x = useMotionValue(0);
  const archiveOpacity = useTransform(x, [-108, -44], [1, 0]);
  const prefersReducedMotion = useReducedMotion();
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);
    if (info.offset.x < -96) void onArchive();
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
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        className={`mail-row ${email.isRead ? '' : 'is-unread'} ${isActive ? 'is-active' : ''}`}
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
            <time>{formatReceivedAt(email.receivedAt)}</time>
          </div>
          <h3>{email.subject || '(no subject)'}</h3>
          <p>{email.snippet}</p>
        </div>
        <button
          type="button"
          className={`mail-star ${email.isStarred ? 'is-starred' : ''}`}
          onClick={onToggleStar}
          aria-label={email.isStarred ? 'Unstar email' : 'Star email'}
          aria-pressed={email.isStarred}
        >
          <MailIcon name="star" />
        </button>
      </motion.article>
    </div>
  );
}

function ReadingPane({ email, onClose }: { email: Email | null; onClose: () => void }) {
  const router = useRouter();

  if (!email) {
    return (
      <section className="reading-pane reading-pane-empty" aria-label="Message preview">
        <div className="reading-ambient" aria-hidden="true" />
        <div className="reading-empty-content">
          <QuantrinityMark className="reading-empty-mark" label="Quantrinity infinity" />
          <p className="reading-eyebrow">Zero-noise workspace</p>
          <h2>
            Choose the signal.
            <br />
            We&apos;ll quiet the rest.
          </h2>
          <p>Select a message to preview it without leaving your flow.</p>
          <div className="reading-shortcuts" aria-label="Keyboard hints">
            <span>
              <kbd>J</kbd>
              <kbd>K</kbd> Move
            </span>
            <span>
              <kbd>R</kbd> Reply
            </span>
            <span>
              <kbd>E</kbd> Archive
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
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close preview"
          >
            <MailIcon name="close" />
          </button>
          <div className="reading-header-actions">
            <button
              type="button"
              className="quiet-button"
              onClick={() => router.push(`/compose?replyTo=${email.threadId}`)}
            >
              Reply
            </button>
            <button
              type="button"
              className="signal-button"
              onClick={() => router.push(`/thread/${email.threadId}`)}
            >
              Open thread <span aria-hidden="true">↗</span>
            </button>
          </div>
        </header>
        <div className="reading-content">
          <p className="reading-eyebrow">
            {email.category} · {email.priority} priority
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
          {email.aiSummary && (
            <aside className="reading-ai-summary">
              <span aria-hidden="true">✦</span>
              <div>
                <strong>QuantAI brief</strong>
                <p>{email.aiSummary}</p>
              </div>
            </aside>
          )}
          <div className="reading-message">{email.bodyText || email.snippet}</div>
          {email.attachments?.length > 0 && (
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
        <footer className="reading-reply-bar">
          <button type="button" onClick={() => router.push(`/compose?replyTo=${email.threadId}`)}>
            Reply with clarity…
          </button>
          <button
            type="button"
            className="reading-send-shortcut"
            onClick={() => router.push(`/compose?forward=${email.id}`)}
          >
            Forward <span aria-hidden="true">→</span>
          </button>
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

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const batchAction = useCallback(
    async (action: 'archive' | 'delete') => {
      const requests = Array.from(selectedIds, (id) =>
        action === 'archive' ? apiClient.archiveEmail(id) : apiClient.deleteEmail(id),
      );
      await Promise.all(requests);
      setSelectedIds(new Set());
      await refetch();
    },
    [refetch, selectedIds],
  );

  const toggleStar = useCallback(
    async (event: React.MouseEvent, id: string) => {
      event.stopPropagation();
      await apiClient.toggleStar(id);
      await refetch();
    },
    [refetch],
  );

  const openEmail = useCallback(
    (email: Email) => {
      if (window.matchMedia('(min-width: 900px)').matches) setSelectedEmail(email);
      else router.push(`/thread/${email.threadId}`);
    },
    [router],
  );

  const archiveEmail = useCallback(
    async (id: string) => {
      await apiClient.archiveEmail(id);
      if (selectedEmail?.id === id) setSelectedEmail(null);
      await refetch();
    },
    [refetch, selectedEmail],
  );

  return (
    <AppShell
      sidebar={<AppSidebar />}
      theme="dark"
      className="quantmail-shell"
      mobileTitle={
        <span className="mobile-brand">
          <QuantrinityMark compact label={quantMailBrandLockup.accessibleName} />
          <span aria-hidden="true">
            {quantMailBrandLockup.productName} <small>{quantMailBrandLockup.byline}</small>
          </span>
        </span>
      }
      mobileActions={
        <button
          type="button"
          className="mobile-compose"
          onClick={() => router.push('/compose')}
          aria-label="Compose message"
        >
          <MailIcon name="compose" />
        </button>
      }
      aria-label="QuantMail inbox"
    >
      <div className="inbox-workspace">
        <section className="inbox-list-pane" aria-label="Inbox messages">
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
            <button type="button" className="hero-compose" onClick={() => router.push('/compose')}>
              <MailIcon name="compose" /> Compose
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
                placeholder="Search people, subjects, or meaning…"
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
                  onClick={() => setSelectedIds(new Set())}
                  aria-label="Clear selection"
                >
                  <MailIcon name="close" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mail-list" aria-busy={isLoading || isSearching}>
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
              <div className="mail-empty">
                <span className="mail-empty-icon">
                  <MailIcon name={debouncedQuery ? 'search' : 'mail'} />
                </span>
                <p className="reading-eyebrow">
                  {debouncedQuery ? 'Search needs a clearer signal' : 'Inbox ready'}
                </p>
                <h2>{debouncedQuery ? 'No inbox match yet.' : 'Your inbox is clear.'}</h2>
                <p>
                  {debouncedQuery
                    ? `Nothing matched “${debouncedQuery}”. Try a sender, subject, or simpler phrase, or clear the search to return to your live inbox flow.`
                    : 'New conversations, replies, and priority updates will collect here first so you can triage the next important thread from one focused surface.'}
                </p>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  {debouncedQuery ? (
                    <>
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
                        Open advanced search
                      </Button>
                    </>
                  ) : (
                    <Button variant="primary" onClick={() => router.push('/compose')}>
                      Start a conversation
                    </Button>
                  )}
                </div>
              </div>
            )}
            {!isLoading && !isSearching && !error && emails && emails.length > 0 && (
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.025 } } }}
              >
                {emails.map((email) => (
                  <motion.div
                    key={email.id}
                    variants={{ hidden: { opacity: 0, y: 5 }, visible: { opacity: 1, y: 0 } }}
                  >
                    <EmailRow
                      email={email}
                      isChecked={selectedIds.has(email.id)}
                      isActive={selectedEmail?.id === email.id}
                      onToggleSelect={() => toggleSelect(email.id)}
                      onToggleStar={(event) => void toggleStar(event, email.id)}
                      onOpen={() => openEmail(email)}
                      onArchive={() => void archiveEmail(email.id)}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
          <footer className="inbox-list-footer">
            <span>{emails?.length ?? 0} conversations</span>
            <span>Protected {quantMailBrandLockup.byline}</span>
          </footer>
        </section>
        <ReadingPane email={selectedEmail} onClose={() => setSelectedEmail(null)} />
      </div>
    </AppShell>
  );
}
