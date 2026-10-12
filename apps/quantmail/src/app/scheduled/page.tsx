'use client';

/*
 * Scheduled mailbox — the view the schedule-send feature was missing.
 *
 * Backend contract (backend/routes/emails.ts): GET /emails?folderType=SCHEDULED
 * filters `isSent = true, deliveryStatus = 'queued', sentAt > now` — a send
 * that fired into the outbox with a future sendAt, whose BullMQ delay has not
 * elapsed yet. `formatEmailRecord` bridges that fire time onto the wire as
 * `scheduledAt` (backend/lib/format-email.ts), so the page reads the
 * client's own `Email.scheduledAt` — no wire-shape special-casing.
 *
 * Every row can be cancelled (POST /emails/:id/cancel-send, the same handler
 * as undo-send: removes the delayed queue job and returns the mail to
 * Drafts) or edited (cancel the schedule, then open the restored draft in
 * the composer so the time can be changed and re-scheduled).
 *
 * Race honesty: the queue job can fire between the list render and the
 * click. A cancel that lands after the fire comes back 400 CANNOT_UNDO_SEND —
 * the page says so in plain words and points at Sent, instead of claiming
 * the cancel worked.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button, Skeleton } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { ErrorState, EmptyState } from '@quant/shared-ui';
import { AppSidebar } from '../../components/AppSidebar';
import { IdentityAvatar } from '../../components/IdentityAvatar';
import { showToast } from '../../components/InboxToast';
import { useInbox } from '../../hooks/useInbox';
import { apiClient } from '../../services/api-client';
import type { Email } from '../../types';
import { formatSentRecipientLine } from '../sent/recipients';

function formatScheduledDate(value?: string | Date | null): string {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round(
    (startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000,
  );
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
  const fullDate = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (dayDiff <= 0) return `Today ${time}`;
  if (dayDiff === 1) return `Tomorrow ${time}`;
  if (dayDiff < 7) return `${weekday} ${time}`;
  return `${fullDate}, ${time}`;
}

function scheduledAtOf(email: Email): string | Date | undefined {
  return email.scheduledAt;
}

export default function ScheduledPage() {
  const router = useRouter();
  const { data: emails, isLoading, error, refetch } = useInbox({ folderType: 'SCHEDULED' });
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // A scheduled send can fire while this page is open — the list would go
  // stale and the row's Cancel button would 400. Refresh on focus and on a
  // slow poll so a just-fired send disappears instead of lying.
  useEffect(() => {
    const onFocus = () => void refetch();
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(() => void refetch(), 60_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, [refetch]);

  const handleCancel = useCallback(
    async (email: Email) => {
      if (cancellingId || editingId) return;
      setCancellingId(email.id);
      try {
        const res = await apiClient.cancelSend(email.id);
        if (res.success) {
          showToast({ text: 'Scheduled send cancelled — back in Drafts.', type: 'success' });
          await refetch();
          return;
        }
        const code = res.error?.code;
        if (code === 'CANNOT_UNDO_SEND') {
          // The queue job fired between the list render and the click: the
          // mail is already on its way. Say exactly that — never claim the
          // cancel worked.
          showToast({
            text: 'Too late — this one already sent. Find it in Sent.',
            type: 'error',
          });
        } else {
          showToast({
            text: res.error?.message || 'Could not cancel the scheduled send.',
            type: 'error',
          });
        }
        await refetch();
      } catch {
        showToast({ text: 'Could not cancel the scheduled send.', type: 'error' });
      } finally {
        setCancellingId(null);
      }
    },
    [cancellingId, editingId, refetch],
  );

  const handleEdit = useCallback(
    async (email: Email) => {
      if (cancellingId || editingId) return;
      setEditingId(email.id);
      try {
        // Edit = take the schedule off first (this removes the delayed queue
        // job and returns the mail to Drafts), then open that draft in the
        // composer where the time can be changed and re-scheduled. Doing it
        // in this order means there is never a moment with two pending sends
        // of the same mail.
        const res = await apiClient.cancelSend(email.id);
        if (!res.success) {
          if (res.error?.code === 'CANNOT_UNDO_SEND') {
            showToast({
              text: 'Too late — this one already sent. Find it in Sent.',
              type: 'error',
            });
          } else {
            showToast({
              text: res.error?.message || 'Could not open this for editing.',
              type: 'error',
            });
          }
          await refetch();
          return;
        }
        router.push(`/compose?draftId=${encodeURIComponent(email.id)}`);
      } catch {
        showToast({ text: 'Could not open this for editing.', type: 'error' });
      } finally {
        setEditingId(null);
      }
    },
    [cancellingId, editingId, refetch, router],
  );

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <div className="workspace-page sent-workspace flex flex-col h-full">
        <header className="sent-header">
          <div>
            <p className="sent-kicker">
              <span /> Scheduled
            </p>
            <h1>Scheduled</h1>
            <p className="sent-subtitle">
              {emails?.length
                ? `${emails.length} message${emails.length !== 1 ? 's' : ''} waiting to send`
                : 'Messages you schedule will wait here until they go out'}
            </p>
          </div>
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
              title="Nothing scheduled"
              description="When you schedule a send, it waits here — you can still cancel it or change it before it goes out."
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
              role="list"
              aria-label="Scheduled sends"
            >
              {emails.map((email) => {
                const isCancelling = cancellingId === email.id;
                const isEditing = editingId === email.id;
                const busy = isCancelling || isEditing;
                return (
                  <motion.article
                    key={email.id}
                    variants={{ hidden: { opacity: 0, y: 4 }, visible: { opacity: 1, y: 0 } }}
                    className="sent-row"
                    role="listitem"
                  >
                    <IdentityAvatar
                      name={email.to?.[0]?.name || email.to?.[0]?.email || '?'}
                      size="sm"
                    />
                    <div className="sent-row-content">
                      <div className="sent-row-meta">
                        <span className="sent-row-recipients">
                          {formatSentRecipientLine(email.to)}
                        </span>
                        <span className="delivery-status status-sending">
                          Sends {formatScheduledDate(scheduledAtOf(email))}
                        </span>
                      </div>
                      <h3 className="sent-row-subject">{email.subject || '(no subject)'}</h3>
                      <p className="sent-row-snippet">{email.snippet}</p>
                      <div className="sent-row-actions">
                        <button
                          type="button"
                          className="delivery-resend"
                          disabled={busy}
                          onClick={() => void handleEdit(email)}
                          aria-label={`Edit scheduled send: ${email.subject || '(no subject)'}`}
                          title="Cancel the schedule and edit as a draft"
                        >
                          {isEditing ? 'Opening…' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          className="delivery-resend"
                          disabled={busy}
                          onClick={() => void handleCancel(email)}
                          aria-label={`Cancel scheduled send: ${email.subject || '(no subject)'}`}
                          title="Cancel the scheduled send"
                        >
                          {isCancelling ? 'Cancelling…' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </motion.div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
