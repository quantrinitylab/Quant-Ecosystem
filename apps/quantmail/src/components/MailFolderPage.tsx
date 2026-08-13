'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button, EmptyState, ErrorState, Skeleton } from '@quant/shared-ui';
import { AppShell } from './AppShell';
import { AppSidebar } from './AppSidebar';
import { IdentityAvatar } from './IdentityAvatar';
import { showToast } from './InboxToast';
import { PageTransition } from './PageTransition';
import { useInbox } from '../hooks/useInbox';
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
  run: (email: Email) => Promise<{ success: boolean; error?: { message?: string } }>;
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
  const [pendingId, setPendingId] = useState<string | null>(null);

  const openEmail = useCallback(
    (email: Email) => {
      const target = resolveThreadTarget(email);
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
    async (email: Email) => {
      if (!rowAction) return;
      setPendingId(email.id);
      try {
        const response = await rowAction.run(email);
        if (!response.success) {
          showToast({
            text: response.error?.message || 'That did not work — try again.',
            type: 'error',
          });
          return;
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
      <PageTransition className="workspace-page sent-workspace flex flex-col h-full">
        <header className="sent-header">
          <div>
            <p className="sent-kicker">
              <span /> {kicker}
            </p>
            <h1>{title}</h1>
            <p className="sent-subtitle">
              {emails?.length
                ? `${emails.length} conversation${emails.length === 1 ? '' : 's'} ${subtitle}`
                : emptyTitle}
            </p>
          </div>
          <Button variant="secondary" onClick={() => router.push('/compose')}>
            Compose
          </Button>
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

          {!isLoading && !error && (!emails || emails.length === 0) && (
            <EmptyState title={emptyTitle} description={emptyDescription} />
          )}

          {!isLoading && !error && emails && emails.length > 0 && (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.02 } } }}
              className="sent-list"
            >
              {emails.map((email) => (
                <motion.article
                  key={email.id}
                  variants={{ hidden: { opacity: 0, y: 4 }, visible: { opacity: 1, y: 0 } }}
                  className="sent-row"
                  onClick={() => openEmail(email)}
                >
                  <IdentityAvatar
                    name={email.from?.name || email.from?.email || '?'}
                    size="sm"
                  />
                  <div className="sent-row-content">
                    <div className="sent-row-meta">
                      <span className="sent-row-recipients">
                        {email.from?.name || email.from?.email || 'Unknown sender'}
                      </span>
                      {!email.isRead && <span className="mail-unread-dot" aria-label="Unread" />}
                      <time className="sent-row-time">{formatRowDate(email.receivedAt)}</time>
                    </div>
                    <h3 className="sent-row-subject">{email.subject || '(no subject)'}</h3>
                    <p className="sent-row-snippet">{email.snippet}</p>
                  </div>
                  {rowAction && (
                    <button
                      type="button"
                      className="folder-row-action"
                      disabled={pendingId === email.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        void runRowAction(email);
                      }}
                    >
                      {pendingId === email.id ? rowAction.pendingLabel : rowAction.label}
                    </button>
                  )}
                </motion.article>
              ))}
            </motion.div>
          )}
        </div>
      </PageTransition>
    </AppShell>
  );
}

export default MailFolderPage;
