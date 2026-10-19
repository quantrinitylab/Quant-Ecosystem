'use client';

import type { ComponentType } from 'react';
import { IconCheck, IconCheckDouble, IconCircle, IconEye, type IconProps } from './icons';

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
    sent: { Icon: IconCheck, color: 'var(--quant-text-muted)', label: 'Sent' },
    delivered: {
      Icon: IconCheckDouble,
      color: 'var(--quant-muted-foreground)',
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

interface OpenTrackingIndicatorProps {
  openCount: number;
  firstOpenedAt?: string;
  lastOpenedAt?: string;
}

/**
 * Open-tracking indicator — Superhuman-class "read statuses" for sent mail.
 * Renders next to EmailReadReceipt on outbound messages whose beacon fired
 * (openCount > 0). Mail-orange accent (the Mail per-app accent) keeps it
 * distinct from the green internal read ticks: orange = an EXTERNAL
 * recipient's client loaded the beacon; green = a QuantMail recipient opened
 * the thread. Zero opens renders nothing — an honest unknown, not a claim
 * of non-reading (recipients may block remote images).
 */
export function OpenTrackingIndicator({ openCount, firstOpenedAt, lastOpenedAt }: OpenTrackingIndicatorProps) {
  // Zero/non-positive counts render nothing — an honest unknown, not a claim
  // of non-reading (recipients may block remote images). Guarded here so the
  // honesty contract holds even when a caller forgets to check first.
  if (!Number.isFinite(openCount) || openCount <= 0) return null;
  const label =
    `Opened ${openCount} time${openCount === 1 ? '' : 's'}` +
    (firstOpenedAt ? `, first opened ${formatTime(firstOpenedAt)}` : '') +
    (lastOpenedAt && lastOpenedAt !== firstOpenedAt ? `, last ${formatTime(lastOpenedAt)}` : '');
  return (
    <span
      className="open-tracking-indicator inline-flex items-center gap-0.5 text-[var(--quant-primary)]"
      title={label}
      role="img"
      aria-label={label}
    >
      <IconEye size={13} aria-hidden={true} />
      <span className="text-[11px] font-medium leading-none">{openCount > 99 ? '99+' : openCount}</span>
    </span>
  );
}
