'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { Email } from '../types';
import { IconAlertCircle, IconBolt, IconCalendar, IconPaperclip, IconSparkle } from './icons';

interface InboxDigestProps {
  emails: Email[] | undefined;
  isVisible: boolean;
}

/**
 * AI-powered Inbox Digest — a quick summary card shown when you have unread mail.
 * Tells you at a glance: who wrote, what about, what's urgent.
 *
 * Neither Gmail nor Superhuman has this — they make you scan manually.
 */
export function InboxDigest({ emails, isVisible }: InboxDigestProps) {
  const digest = useMemo(() => {
    if (!emails || emails.length === 0) return null;

    const unread = emails.filter((e) => !e.isRead);
    if (unread.length === 0) return null;

    // Extract key signals
    const senders = new Map<string, number>();
    let urgentCount = 0;
    let meetingCount = 0;
    let actionCount = 0;
    let hasAttachments = 0;

    for (const email of unread) {
      const sender = email.from?.name || email.from?.email || 'Unknown';
      senders.set(sender, (senders.get(sender) ?? 0) + 1);

      const combined = `${email.subject ?? ''} ${email.snippet ?? ''}`.toLowerCase();
      if (
        combined.includes('urgent') ||
        combined.includes('asap') ||
        combined.includes('immediate')
      )
        urgentCount++;
      if (
        combined.includes('meeting') ||
        combined.includes('calendar') ||
        combined.includes('invite')
      )
        meetingCount++;
      if (combined.includes('action') || combined.includes('please') || combined.includes('review'))
        actionCount++;
      if (email.attachments?.length > 0) hasAttachments++;
    }

    // Top senders
    const topSenders = Array.from(senders.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return {
      total: unread.length,
      urgentCount,
      meetingCount,
      actionCount,
      hasAttachments,
      topSenders,
    };
  }, [emails]);

  if (!isVisible || !digest) return null;

  return (
    <motion.div
      className="inbox-digest"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
    >
      <div className="digest-header">
        <span className="digest-icon inline-flex" aria-hidden="true">
          <IconSparkle size={12} />
        </span>
        <strong>Inbox Digest</strong>
        <span className="digest-count">{digest.total} unread</span>
      </div>
      <div className="digest-insights">
        {digest.urgentCount > 0 && (
          <span className="digest-chip digest-chip--urgent inline-flex items-center gap-1">
            <IconAlertCircle size={11} />
            {digest.urgentCount} urgent
          </span>
        )}
        {digest.actionCount > 0 && (
          <span className="digest-chip digest-chip--action inline-flex items-center gap-1">
            <IconBolt size={11} />
            {digest.actionCount} need action
          </span>
        )}
        {digest.meetingCount > 0 && (
          <span className="digest-chip digest-chip--meeting inline-flex items-center gap-1">
            <IconCalendar size={11} />
            {digest.meetingCount} meeting{digest.meetingCount > 1 ? 's' : ''}
          </span>
        )}
        {digest.hasAttachments > 0 && (
          <span className="digest-chip digest-chip--attachment inline-flex items-center gap-1">
            <IconPaperclip size={11} />
            {digest.hasAttachments} with files
          </span>
        )}
      </div>
      <div className="digest-senders">
        <span className="digest-senders-label">Top senders:</span>
        {digest.topSenders.map(([name, count]) => (
          <span key={name} className="digest-sender">
            {name} ({count})
          </span>
        ))}
      </div>
    </motion.div>
  );
}
