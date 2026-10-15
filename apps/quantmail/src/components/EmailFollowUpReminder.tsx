'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { showToast } from './InboxToast';
import { IconBell } from './icons';
import { apiClient, type FollowUpReminder } from '../services/api-client';

interface EmailFollowUpReminderProps {
  emailId: string;
  threadId?: string;
  subject: string;
  sentAt?: string;
  hasReply?: boolean;
}

const FOLLOW_UP_OPTIONS = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 2 days', days: 2 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
  { label: 'In 2 weeks', days: 14 },
] as const;

/**
 * Follow-up reminder — nudges you when someone hasn't replied.
 *
 * fix/qm-followup-reminders: this used to be dead code — "Set reminder"
 * flipped local state and showed a toast, persisting nothing (the reminder
 * died on reload). It is now server-backed: setting a reminder POSTs to
 * /follow-up-reminders, the row survives reloads, and the People home
 * resurfaces due reminders at the top of the conversation list
 * (Superhuman/Gmail-nudge style). The backend upserts one active reminder
 * per (user, thread), so re-setting moves the reminder instead of stacking.
 */
export function EmailFollowUpReminder({
  emailId,
  threadId,
  subject,
  sentAt,
  hasReply,
}: EmailFollowUpReminderProps) {
  const [showOptions, setShowOptions] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [existing, setExisting] = useState<FollowUpReminder | null>(null);
  const [saving, setSaving] = useState(false);

  // Load the active reminder for this thread/email, so the banner reflects
  // the persisted state across reloads instead of local useState.
  useEffect(() => {
    let cancelled = false;
    void apiClient
      .listFollowUpReminders()
      .then((res) => {
        if (cancelled || !res.success || !res.data) return;
        const match = res.data.find((r) =>
          threadId ? r.threadId === threadId : r.emailId === emailId,
        );
        if (match) setExisting(match);
      })
      .catch(() => {
        // Honest degrade: a failed read must not block setting a reminder —
        // the POST upserts anyway, so the banner will converge on success.
      });
    return () => {
      cancelled = true;
    };
  }, [emailId, threadId]);

  const shouldShow = useMemo(() => {
    if (hasReply || dismissed) return false;
    if (!sentAt) return false;
    const hoursSince = (Date.now() - new Date(sentAt).getTime()) / (1000 * 60 * 60);
    return hoursSince > 48;
  }, [sentAt, hasReply, dismissed]);

  const handleSetReminder = useCallback(
    async (days: number) => {
      const reminderDate = new Date();
      reminderDate.setDate(reminderDate.getDate() + days);
      setSaving(true);
      setShowOptions(false);
      try {
        const res = await apiClient.setFollowUpReminder({
          emailId,
          threadId,
          subject,
          remindAt: reminderDate.toISOString(),
        });
        if (!res.success || !res.data) {
          throw new Error(res.error?.message || 'Could not save the reminder');
        }
        setExisting(res.data);
        showToast({
          text: `Follow-up reminder set for ${reminderDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`,
          type: 'success',
        });
      } catch (err) {
        // Honest error only: the old toast claimed success while persisting
        // nothing. A failure here must say it failed, not pretend it worked.
        showToast({
          text:
            err instanceof Error && err.message
              ? `Couldn't set the reminder — ${err.message}`
              : "Couldn't set the reminder — please try again",
          type: 'error',
        });
      } finally {
        setSaving(false);
      }
    },
    [emailId, threadId, subject],
  );

  const handleCancelReminder = useCallback(async () => {
    if (!existing) return;
    setSaving(true);
    try {
      const res = await apiClient.dismissFollowUpReminder(existing.id);
      if (!res.success) {
        throw new Error(res.error?.message || 'Could not cancel the reminder');
      }
      setExisting(null);
      showToast({ text: 'Follow-up reminder cancelled', type: 'success' });
    } catch (err) {
      showToast({
        text:
          err instanceof Error && err.message
            ? `Couldn't cancel the reminder — ${err.message}`
            : "Couldn't cancel the reminder — please try again",
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  }, [existing]);

  if (!shouldShow) return null;

  const setDateLabel = existing
    ? new Date(existing.remindAt).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <motion.div
      className="followup-reminder"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 'auto' }}
    >
      <div className="followup-content">
        <span className="followup-icon inline-flex">
          <IconBell size={13} />
        </span>
        <span className="followup-text">
          {existing
            ? `No reply yet — reminder set for ${setDateLabel}`
            : 'No reply yet — want to follow up?'}
        </span>
      </div>
      <div className="followup-actions">
        {existing ? (
          <button
            type="button"
            className="followup-btn"
            onClick={() => void handleCancelReminder()}
            disabled={saving}
          >
            {saving ? 'Working…' : 'Cancel reminder'}
          </button>
        ) : (
          <button
            type="button"
            className="followup-btn"
            onClick={() => setShowOptions((v) => !v)}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Set reminder'}
          </button>
        )}
        <button
          type="button"
          className="followup-dismiss"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss follow-up suggestion"
        >
          ×
        </button>
      </div>
      <AnimatePresence>
        {showOptions && !existing && (
          <motion.div
            className="followup-options"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {FOLLOW_UP_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                type="button"
                onClick={() => void handleSetReminder(opt.days)}
                disabled={saving}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
