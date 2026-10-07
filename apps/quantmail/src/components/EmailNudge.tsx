'use client';

import { motion } from 'framer-motion';
import type { ComponentType } from 'react';
import { IconBolt, IconCalendar, IconPaperclip, IconReply, IconX, type IconProps } from './icons';

interface EmailNudgeProps {
  type: 'reply_needed' | 'action_overdue' | 'meeting_soon' | 'attachment_missing';
  message: string;
  onDismiss: () => void;
  onAction?: () => void;
  actionLabel?: string;
}

const NUDGE_CONFIG: Record<
  EmailNudgeProps['type'],
  { Icon: ComponentType<IconProps>; color: string; bg: string }
> = {
  reply_needed: { Icon: IconReply, color: '#60a5fa', bg: 'rgba(96,165,250,0.04)' },
  action_overdue: { Icon: IconBolt, color: '#f87171', bg: 'rgba(248,113,113,0.04)' },
  meeting_soon: { Icon: IconCalendar, color: '#a78bfa', bg: 'rgba(167,139,250,0.04)' },
  attachment_missing: { Icon: IconPaperclip, color: '#fbbf24', bg: 'rgba(251,191,36,0.04)' },
};

/**
 * Smart Nudge — AI-powered contextual reminders.
 * Shows when:
 * - Someone is waiting for your reply (> 24h)
 * - You mentioned "attached" but didn't attach anything
 * - A meeting starts in 15 min and the thread is unread
 * - An action item from an email is overdue
 *
 * Gmail has NONE of these. We proactively help.
 */
export function EmailNudge({ type, message, onDismiss, onAction, actionLabel }: EmailNudgeProps) {
  const config = NUDGE_CONFIG[type];

  return (
    <motion.div
      className="email-nudge"
      style={{ background: config.bg, borderColor: `${config.color}22` }}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.2 }}
    >
      <span className="nudge-icon" style={{ color: config.color }}>
        <config.Icon size={15} />
      </span>
      <span className="nudge-message">{message}</span>
      {onAction && actionLabel && (
        <button
          type="button"
          className="nudge-action"
          style={{ color: config.color }}
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
      <button
        type="button"
        className="nudge-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss nudge"
      >
        <IconX size={14} />
      </button>
    </motion.div>
  );
}
