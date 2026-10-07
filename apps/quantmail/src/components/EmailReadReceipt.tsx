'use client';

import type { ComponentType } from 'react';
import { IconCheck, IconCheckDouble, IconCircle, type IconProps } from './icons';

interface EmailReadReceiptProps {
  status: 'sent' | 'delivered' | 'read' | 'unknown';
  readAt?: string;
  deliveredAt?: string;
}

/**
 * Email Read Receipt indicator — WhatsApp-style double-check marks.
 * Gmail has no read receipt indicator inline. We show delivery + read status
 * directly on the sent email row, just like messaging apps.
 *
 * `IconCheckDouble` is one glyph rather than two `✓` characters: the pair used
 * to be a string, so the two ticks inherited the text tracking and drifted apart
 * at small sizes instead of overlapping the way the shape is meant to read. The
 * `role="img"` is deliberate — here the mark genuinely is the only thing saying
 * what happened to the message, so it needs the label the icons otherwise hide.
 */
export function EmailReadReceipt({ status, readAt, deliveredAt }: EmailReadReceiptProps) {
  const config: Record<
    EmailReadReceiptProps['status'],
    { Icon: ComponentType<IconProps>; color: string; label: string }
  > = {
    sent: { Icon: IconCheck, color: '#6B6E76', label: 'Sent' },
    delivered: {
      Icon: IconCheckDouble,
      color: '#A1A4AC',
      label: `Delivered${deliveredAt ? ` at ${formatTime(deliveredAt)}` : ''}`,
    },
    read: {
      Icon: IconCheckDouble,
      color: '#4ade80',
      label: `Read${readAt ? ` at ${formatTime(readAt)}` : ''}`,
    },
    unknown: { Icon: IconCircle, color: '#3A3E48', label: 'Status unknown' },
  };

  const c = config[status];

  return (
    <span className="read-receipt" style={{ color: c.color }} title={c.label}>
      <c.Icon size={14} role="img" aria-hidden={false} aria-label={c.label} />
    </span>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
