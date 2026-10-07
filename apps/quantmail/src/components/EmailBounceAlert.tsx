'use client';

import { motion } from 'framer-motion';
import { IconBan, IconMail, IconWarning } from './icons';

interface EmailBounceAlertProps {
  recipientEmail: string;
  bounceType: 'hard' | 'soft' | 'complaint';
  bounceMessage?: string;
  onRetry?: () => void;
  onRemoveRecipient?: () => void;
}

/**
 * Email Bounce Alert — shows when a sent email bounced.
 * Gmail shows a generic "delivery failed" email. We show a rich inline alert
 * with the specific bounce reason + actionable next steps.
 *
 * Each variant's glyph is a component rather than an emoji so it can take the
 * variant's own `color`: the three states are told apart by hue as much as by
 * shape, and a pictographic emoji ignores `currentColor` entirely.
 */
export function EmailBounceAlert({
  recipientEmail,
  bounceType,
  bounceMessage,
  onRetry,
  onRemoveRecipient,
}: EmailBounceAlertProps) {
  const config = {
    hard: {
      Icon: IconBan,
      title: 'Permanent delivery failure',
      description: `${recipientEmail} doesn't exist or permanently rejected the email.`,
      color: '#f87171',
      bg: 'rgba(248, 113, 113, 0.06)',
      border: 'rgba(248, 113, 113, 0.2)',
    },
    soft: {
      Icon: IconWarning,
      title: 'Temporary delivery issue',
      description: `${recipientEmail} temporarily rejected — mailbox may be full or server busy.`,
      color: '#fbbf24',
      bg: 'rgba(251, 191, 36, 0.05)',
      border: 'rgba(251, 191, 36, 0.18)',
    },
    complaint: {
      Icon: IconMail,
      title: 'Marked as spam by recipient',
      description: `${recipientEmail} marked your email as spam. Future emails may not deliver.`,
      color: '#f97316',
      bg: 'rgba(249, 115, 22, 0.05)',
      border: 'rgba(249, 115, 22, 0.18)',
    },
  };

  const c = config[bounceType];

  return (
    <motion.div
      className="bounce-alert"
      style={{ background: c.bg, borderColor: c.border }}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      role="alert"
    >
      <span className="bounce-icon" style={{ color: c.color }}>
        <c.Icon size={18} />
      </span>
      <div className="bounce-content">
        <strong style={{ color: c.color }}>{c.title}</strong>
        <p>{c.description}</p>
        {bounceMessage && <p className="bounce-detail">Reason: {bounceMessage}</p>}
      </div>
      <div className="bounce-actions">
        {bounceType === 'soft' && onRetry && (
          <button type="button" className="bounce-retry" onClick={onRetry}>
            Retry
          </button>
        )}
        {bounceType === 'hard' && onRemoveRecipient && (
          <button type="button" className="bounce-remove" onClick={onRemoveRecipient}>
            Remove from contacts
          </button>
        )}
      </div>
    </motion.div>
  );
}
