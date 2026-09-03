'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button, EmptyState, ErrorState, Skeleton } from '@quant/shared-ui';
import { AppShell } from './AppShell';
import { AppSidebar } from './AppSidebar';
import { IdentityAvatar } from './IdentityAvatar';
import { showToast } from './InboxToast';
import { useInbox } from '../hooks/useInbox';
import { useAuth } from '../providers/auth-provider';
import {
  groupEmailsIntoThreads,
  threadMessageIds,
  type ConversationThread,
} from '../lib/threading';
import type { Email } from '../types';

/** True when a value is safe to place in a route segment or query param. */
function isValidRouteId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== 'null' && trimmed !== 'undefined';
}

function resolveThreadTarget(email: Email): string | null {
  if (isValidRouteId(email.threadId)) return email.threadId;
  if (isValidRouteId(email.id)) return email.id;
  return null;
}

function formatRowDate(value?: string | Date) {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export interface FolderRowAction {
  label: string;
  pendingLabel: string;
  successToast: string;
  /**
   * Run against one stored row, by id. The page calls it once for every row the
   * conversation is made of — a send and its delivery copy are two rows behind
   * one line in this list, and rescuing only the one the row is named after left
   * the other in the archive.
   */
  run: (id: string) => Promise<{ success: boolean; error?: { message?: string } }>;
}

export interface MailFolderPageProps {
  folderType: 'ARCHIVE' | 'SPAM' | 'STARRED' | 'SNOOZED';
  kicker: string;
  title: string;
  /** Completes the sentence "{n} conversations {subtitle}". */
  subtitle: string;
  emptyTitle: string;
  emptyDescription: string;
  rowAction?: FolderRowAction;
}

/**
 * Shared mailbox view for the flag/folder mailboxes (Starred, Snoozed,
 * Archive, Spam). Mirrors the Sent page pattern: header + list + empty state,
 * plus an optional per-row rescue action (unstar, wake, move to inbox…).
 *
 * Rows are conversations, grouped the same way the inbox groups them. Listing
 * stored rows instead counted the same conversation twice — the archive said
 * "2 conversations archived" for the one thread the inbox called "1 archived
 * conversation", because a self-sent message is stored twice, and it offered two
 * "Move to inbox" buttons for the one thing a person had archived.
 */
export function MailFolderPage({
  folderType,
  kicker,
  title,
  subtitle,
  emptyTitle,
  emptyDescription,
  rowAction,
}: MailFolderPageProps) {
  const router = useRouter();
  const { data: emails, isLoading, error, refetch } = useInbox({ folderType });
  const { user: currentUser } = useAuth();
  const currentEmail = currentUser?.email || '';
  const [pendingId, setPendingId] = useState<string | null>(null);

  const threads = useMemo(
    () => groupEmailsIntoThreads(emails ?? [], currentEmail),
    [emails, currentEmail],
  );

  const openThread = useCallback(
    (thread: ConversationThread) => {
      const target = resolveThreadTarget(thread.latestEmail);
      if (!target) {
        showToast({
          text: 'This conversation is still syncing — try again in a moment.',
          type: 'error',
        });
        return;
      }
      router.push(`/thread/${target}`);
    },
    [router],
  );

  const runRowAction = useCallback(
    async (thread: ConversationThread) => {
      if (!rowAction) return;
      const ids = threadMessageIds(thread);
      if (ids.length === 0) return;
      setPendingId(thread.id);
      try {
        // Sequential on purpose: these hit the same rows' folder and flags, and a
        // failure part-way through should stop rather than race the rest.
        for (const id of ids) {
          const response = await rowAction.run(id);
          if (!response.success) {
            showToast({
              text: response.error?.message || 'That did not work — try again.',
              type: 'error',
            });
            return;
          }
        }
        showToast({ text: rowAction.successToast, type: 'success' });
        await refetch();
      } finally {
        setPendingId(null);
      }
    },
    [refetch, rowAction],
  );

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <div className="workspace-page sent-workspace flex flex-col h-full">
        <header className="sent-header">
          <div>
            <p className="sent-kicker">
              <span /> {kicker}
            </p>
            <h1>{title}</h1>
            <p className="sent-subtitle">
              {threads.length
                ? `${threads.length} conversation${threads.length === 1 ? '' : 's'} ${subtitle}`
                : emptyTitle}
            </p>
          </div>
          {/*
            One header button here is four on the phone — /archive, /spam,
            /starred and /snoozed all render this component — each duplicating
            the shell's `md:hidden` compose FAB. Gating at the same breakpoint
            leaves exactly one create control at every width. The wrapper hides,
            not the Button, whose base styles already emit `inline-flex`.
          */}
          <div className="hidden md:block">
            <Button variant="secondary" onClick={() => router.push('/compose')}>
              Compose
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} variant="rect" width="100%" height="72px" />
              ))}
            </div>
          )}

          {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}

          {!isLoading && !error && threads.length === 0 && (
            <EmptyState title={emptyTitle} description={emptyDescription} />
          )}

          {!isLoading && !error && threads.length > 0 && (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.02 } } }}
              className="sent-list"
            >
              {threads.map((thread) => (
                <motion.article
                  key={thread.id}
                  variants={{ hidden: { opacity: 0, y: 4 }, visible: { opacity: 1, y: 0 } }}
                  className="sent-row"
                  onClick={() => openThread(thread)}
                >
                  <IdentityAvatar name={thread.participantsSummary || 'Unknown sender'} size="sm" />
                  <div className="sent-row-content">
                    <div className="sent-row-meta">
                      <span className="sent-row-recipients">
                        {thread.participantsSummary || 'Unknown sender'}
                      </span>
                      {thread.count > 1 && (
                        <span className="folder-row-count">{thread.count} messages</span>
                      )}
                      {!thread.isRead && <span className="mail-unread-dot" aria-label="Unread" />}
                      <time className="sent-row-time">{formatRowDate(thread.receivedAt)}</time>
                    </div>
                    <h3 className="sent-row-subject">{thread.subject || '(no subject)'}</h3>
                    <p className="sent-row-snippet">{thread.latestEmail.snippet}</p>
                  </div>
                  {rowAction && (
                    <button
                      type="button"
                      className="folder-row-action"
                      disabled={pendingId === thread.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        void runRowAction(thread);
                      }}
                    >
                      {pendingId === thread.id ? rowAction.pendingLabel : rowAction.label}
                    </button>
                  )}
                </motion.article>
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default MailFolderPage;
