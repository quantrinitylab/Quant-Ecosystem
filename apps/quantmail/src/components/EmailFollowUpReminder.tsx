'use client';

import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { showToast } from './InboxToast';
import { IconBell } from './icons';

interface EmailFollowUpReminderProps {
  emailId: string;
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
 * Gmail has no built-in follow-up tracker. We detect unanswered sent emails
 * and offer to set a reminder to follow up.
 */
export function EmailFollowUpReminder({
  emailId,
  subject,
  sentAt,
  hasReply,
}: EmailFollowUpReminderProps) {
  const [showOptions, setShowOptions] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [reminderSet, setReminderSet] = useState(false);

  const shouldShow = useMemo(() => {
    if (hasReply || dismissed || reminderSet) return false;
    if (!sentAt) return false;
    const hoursSince = (Date.now() - new Date(sentAt).getTime()) / (1000 * 60 * 60);
    return hoursSince > 48;
  }, [sentAt, hasReply, dismissed, reminderSet]);

  const handleSetReminder = useCallback((days: number) => {
    const reminderDate = new Date();
    reminderDate.setDate(reminderDate.getDate() + days);
    setReminderSet(true);
    setShowOptions(false);
    showToast({
      text: `Follow-up reminder set for ${reminderDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`,
      type: 'success',
    });
  }, []);

  if (!shouldShow) return null;

  return (
    <motion.div
      className="followup-reminder"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
    >
      <div className="followup-content">
        <span className="followup-icon inline-flex">
          <IconBell size={13} />
        </span>
        <span className="followup-text">No reply yet — want to follow up?</span>
      </div>
      <div className="followup-actions">
        <button type="button" className="followup-btn" onClick={() => setShowOptions((v) => !v)}>
          Set reminder
        </button>
        <button type="button" className="followup-dismiss" onClick={() => setDismissed(true)}>
          ×
        </button>
      </div>
      <AnimatePresence>
        {showOptions && (
          <motion.div
            className="followup-options"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {FOLLOW_UP_OPTIONS.map((opt) => (
              <button key={opt.days} type="button" onClick={() => handleSetReminder(opt.days)}>
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
