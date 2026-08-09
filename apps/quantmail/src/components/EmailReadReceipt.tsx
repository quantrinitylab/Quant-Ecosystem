'use client';

interface EmailReadReceiptProps {
  status: 'sent' | 'delivered' | 'read' | 'unknown';
  readAt?: string;
  deliveredAt?: string;
}

/**
 * Email Read Receipt indicator — WhatsApp-style double-check marks.
 * Gmail has no read receipt indicator inline. We show delivery + read status
 * directly on the sent email row, just like messaging apps.
 */
export function EmailReadReceipt({ status, readAt, deliveredAt }: EmailReadReceiptProps) {
  const config = {
    sent: { icon: '✓', color: '#666', label: 'Sent' },
    delivered: { icon: '✓✓', color: '#888', label: 'Delivered' },
    read: { icon: '✓✓', color: '#4ade80', label: `Read${readAt ? ` at ${new Date(readAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}` },
    unknown: { icon: '○', color: '#444', label: 'Status unknown' },
  };

  const c = config[status];

  return (
    <span
      className="read-receipt"
      style={{ color: c.color }}
      title={c.label}
      aria-label={c.label}
    >
      {c.icon}
    </span>
  );
}
