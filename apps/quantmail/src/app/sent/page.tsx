'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button, Skeleton } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { ErrorState, EmptyState } from '@quant/shared-ui';
import { AppSidebar } from '../../components/AppSidebar';
import { IdentityAvatar } from '../../components/IdentityAvatar';
import { useInbox } from '../../hooks/useInbox';
import { apiClient } from '../../services/api-client';
import type { Email, EmailStatus } from '../../types';

function DeliveryStatusIcon({ status }: { status: EmailStatus }) {
  switch (status) {
    case 'sent':
      return (
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case 'delivered':
      return (
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6 7 17l-5-5" />
          <path d="m22 10-7.5 7.5L13 16" />
        </svg>
      );
    case 'failed':
      return (
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      );
    case 'bounced':
      return (
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 14 4 9 9 4" />
          <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
        </svg>
      );
    case 'sending':
      return (
        <svg
          className="size-3.5 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      );
    case 'draft':
    default:
      return (
        <svg
          className="size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
      );
  }
}

function DeliveryStatus({ status, onResend }: { status: EmailStatus; onResend?: () => void }) {
  const config: Record<EmailStatus, { label: string; className: string }> = {
    sent: { label: 'Sent', className: 'status-sent' },
    delivered: { label: 'Delivered', className: 'status-delivered' },
    failed: { label: 'Failed', className: 'status-failed' },
    bounced: { label: 'Bounced', className: 'status-bounced' },
    sending: { label: 'Sending…', className: 'status-sending' },
    draft: { label: 'Draft', className: 'status-draft' },
  };
  const c = config[status] || config.sent;
  return (
    <span className={`delivery-status flex items-center gap-1 ${c.className}`}>
      <span aria-hidden="true">
        <DeliveryStatusIcon status={status} />
      </span>
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
      <div className="workspace-page sent-workspace flex flex-col h-full">
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
          {/*
            The shell's compose FAB is `md:hidden`, so this is its complement.
            Without the gate a phone showed two controls with the identical
            accessible name "Compose email" — the header button and the FAB —
            and a screen reader had no way to tell them apart. Hide the wrapper,
            not the Button: its base styles already set `inline-flex`.
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
      </div>
    </AppShell>
  );
}
