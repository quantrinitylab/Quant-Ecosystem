'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button, Skeleton } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { ErrorState, EmptyState } from '@quant/shared-ui';
import { AppSidebar } from '../../components/AppSidebar';
import { showToast } from '../../components/InboxToast';
import { useConfirm } from '../../hooks/useConfirm';
import { useInbox } from '../../hooks/useInbox';
import { apiClient } from '../../services/api-client';
import type { Email } from '../../types';

function relativeTime(value?: string | Date): string {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function DraftsPage() {
  const router = useRouter();
  const { data: emails, isLoading, error, refetch } = useInbox({ folderType: 'DRAFTS' });
  const { confirm, dialog } = useConfirm();

  const handleDraftClick = useCallback(
    (email: Email) => {
      router.push(`/compose?draftId=${email.id}`);
    },
    [router],
  );

  const handleDeleteDraft = useCallback(
    async (e: React.MouseEvent, id: string, subject?: string) => {
      e.stopPropagation();
      /*
       * This asked nothing at all before: one tap on a 44px target sitting beside
       * Resume threw away unsent writing with no undo. It is the only delete in the
       * app whose target has no trash to fall into.
       */
      const ok = await confirm({
        title: 'Discard this draft?',
        message: subject
          ? `"${subject}" is deleted without being sent. Drafts do not go to trash, so this cannot be undone.`
          : 'The draft is deleted without being sent. Drafts do not go to trash, so this cannot be undone.',
        confirmLabel: 'Discard draft',
        variant: 'destructive',
      });
      if (!ok) return;
      const response = await apiClient.deleteEmail(id);
      if (!response.success) {
        showToast({
          text: response.error?.message || 'Draft could not be deleted',
          type: 'error',
        });
        return;
      }
      showToast({ text: 'Draft discarded', type: 'info' });
      refetch();
    },
    [confirm, refetch],
  );

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <div className="workspace-page drafts-workspace flex flex-col h-full">
        <header className="sent-header">
          <div>
            <p className="sent-kicker">
              <span /> Work in progress
            </p>
            <h1>Drafts</h1>
            <p className="sent-subtitle">
              {emails?.length
                ? `${emails.length} unfinished message${emails.length !== 1 ? 's' : ''}`
                : "Drafts hold messages until you're ready to send"}
            </p>
          </div>
          <Button variant="primary" onClick={() => router.push('/compose')}>
            New draft
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="rect" width="100%" height="72px" />
              ))}
            </div>
          )}

          {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}

          {!isLoading && !error && (!emails || emails.length === 0) && (
            <EmptyState
              title="Start a draft when a message needs shaping"
              description="Drafts hold unfinished emails so you can return with the subject, recipients, and final details still in place."
              actionLabel="Compose draft"
              onAction={() => router.push('/compose')}
            />
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
                  className="draft-row"
                  onClick={() => handleDraftClick(email)}
                >
                  <div className="draft-indicator" aria-hidden="true" />
                  <div className="sent-row-content">
                    <div className="sent-row-meta">
                      <span className="draft-badge">Draft</span>
                      <span className="sent-row-recipients">
                        {email.to?.length
                          ? `To: ${email.to.map((t) => t.name || t.email).join(', ')}`
                          : 'No recipient yet'}
                      </span>
                      <time className="sent-row-time">{relativeTime(email.receivedAt)}</time>
                    </div>
                    <h3 className="sent-row-subject">{email.subject || '(no subject)'}</h3>
                    <p className="sent-row-snippet">
                      {email.snippet || email.bodyText?.slice(0, 120) || 'Empty draft'}
                    </p>
                  </div>
                  <div className="draft-actions">
                    <button
                      type="button"
                      className="draft-resume"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDraftClick(email);
                      }}
                      aria-label="Resume editing"
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      className="draft-delete"
                      onClick={(e) => void handleDeleteDraft(e, email.id, email.subject)}
                      aria-label="Delete draft"
                      title="Delete draft"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </motion.article>
              ))}
            </motion.div>
          )}
        </div>
        {dialog}
      </div>
    </AppShell>
  );
}
