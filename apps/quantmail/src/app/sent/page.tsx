'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button, Skeleton } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { ErrorState, EmptyState } from '@quant/shared-ui';
import { AppSidebar } from '../../components/AppSidebar';
import { IdentityAvatar } from '../../components/IdentityAvatar';
import { PageTransition } from '../../components/PageTransition';
import { useInbox } from '../../hooks/useInbox';
import { apiClient } from '../../services/api-client';
import type { Email, EmailStatus } from '../../types';

function DeliveryStatus({ status, onResend }: { status: EmailStatus; onResend?: () => void }) {
  const config: Record<EmailStatus, { icon: string; label: string; className: string }> = {
    sent: { icon: '✓', label: 'Sent', className: 'status-sent' },
    delivered: { icon: '✓✓', label: 'Delivered', className: 'status-delivered' },
    failed: { icon: '✕', label: 'Failed', className: 'status-failed' },
    bounced: { icon: '↩', label: 'Bounced', className: 'status-bounced' },
    sending: { icon: '◌', label: 'Sending…', className: 'status-sending' },
    draft: { icon: '✎', label: 'Draft', className: 'status-draft' },
  };
  const c = config[status] || config.sent;
  return (
    <span className={`delivery-status ${c.className}`}>
      <span aria-hidden="true">{c.icon}</span>
      <span className="sr-only">{c.label}</span>
      <span className="delivery-status-label">{c.label}</span>
      {(status === 'failed' || status === 'bounced') && onResend && (
        <button
          type="button"
          className="delivery-resend"
          onClick={(e) => {
            e.stopPropagation();
            onResend();
          }}
          title="Retry sending"
        >
          Resend
        </button>
      )}
    </span>
  );
}

function formatSentDate(value?: string | Date) {
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

export default function SentPage() {
  const router = useRouter();
  const { data: emails, isLoading, error, refetch } = useInbox({ folderType: 'SENT' });

  const handleEmailClick = useCallback(
    (email: Email) => {
      router.push(`/thread/${email.threadId}`);
    },
    [router],
  );

  const handleResend = useCallback(
    async (emailId: string) => {
      try {
        await apiClient.sendEmail(emailId);
        refetch();
      } catch {
        // Could show a toast here
      }
    },
    [refetch],
  );

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page sent-workspace flex flex-col h-full">
        <header className="sent-header">
          <div>
            <p className="sent-kicker">
              <span /> Delivery trail
            </p>
            <h1>Sent</h1>
            <p className="sent-subtitle">
              {emails?.length
                ? `${emails.length} message${emails.length !== 1 ? 's' : ''} sent from your workspace`
                : 'Messages you send will appear here'}
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
            <EmptyState
              title="Your sent conversations will show up here"
              description="After you send a message, QuantMail keeps the delivery trail here so you can revisit what left your workspace and who received it."
              actionLabel="Compose email"
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
                  className="sent-row"
                  onClick={() => handleEmailClick(email)}
                >
                  <IdentityAvatar
                    name={email.to?.[0]?.name || email.to?.[0]?.email || '?'}
                    size="sm"
                  />
                  <div className="sent-row-content">
                    <div className="sent-row-meta">
                      <span className="sent-row-recipients">
                        {email.to?.map((t) => t.name || t.email).join(', ') || 'Unknown'}
                      </span>
                      <DeliveryStatus
                        status={email.status}
                        onResend={() => void handleResend(email.id)}
                      />
                      <time className="sent-row-time">{formatSentDate(email.receivedAt)}</time>
                    </div>
                    <h3 className="sent-row-subject">{email.subject || '(no subject)'}</h3>
                    <p className="sent-row-snippet">{email.snippet}</p>
                  </div>
                </motion.article>
              ))}
            </motion.div>
          )}
        </div>
      </PageTransition>
    </AppShell>
  );
}
