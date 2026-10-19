import type { Email } from '../types';

/**
 * Read-receipt status for a message bubble, WhatsApp-style.
 *
 * Shared by the two thread surfaces — the classic ConversationalThreadView
 * and the default PersonThread ("email with chat" people view) — so the
 * ticks say the same thing everywhere.
 *
 * Ticks only ever appear on YOUR messages (outbound) — inbound rows never get
 * them, exactly like a messaging app. Self-sends (notes to yourself) never get
 * them either: the only reader is the sender, so the ticks would say nothing.
 *
 * Backed by the read-receipt pipeline: `deliveredAt` is stamped when the
 * message reaches the recipient's mailbox (internal delivery) or the outbound
 * transport accepts it (external), and `readAt` is stamped on your sent copy
 * when a recipient opens the thread (POST /threads/:id/read). Single grey =
 * sent, double grey = delivered, double green = read.
 */
export interface ReadReceipt {
  status: 'sent' | 'delivered' | 'read' | 'unknown';
  readAt?: string;
  deliveredAt?: string;
}

export function receiptStatusOf(
  message: Email,
  isOutbound: boolean,
  viewerEmail?: string | null,
): ReadReceipt | null {
  if (!isOutbound) return null;
  // BB-P2-5: a note to self is outbound, but a read receipt on it says
  // nothing — the only reader is the sender. Suppress the ticks when every
  // recipient is the viewer.
  if (viewerEmail) {
    const me = viewerEmail.toLowerCase();
    const recipients = (message.to ?? [])
      .map((t) => String(t?.email ?? '').toLowerCase())
      .filter(Boolean);
    if (recipients.length > 0 && recipients.every((r) => r === me)) return null;
  }
  const readAt = message.readAt ? String(message.readAt) : undefined;
  const deliveredAt = message.deliveredAt ? String(message.deliveredAt) : undefined;
  if (readAt) return { status: 'read', readAt, deliveredAt };
  if (deliveredAt) return { status: 'delivered', deliveredAt };
  return { status: 'sent' };
}

/**
 * Open-tracking status for a sent message — the Superhuman-class "read
 * statuses" for EXTERNAL recipients, complementing the internal WhatsApp
 * ticks above. The beacon (GET /track/open/:token) stamps openCount /
 * firstOpenedAt / lastOpenedAt on the sender's Email row.
 *
 * Returns null when there is nothing honest to show:
 *  - tracking disabled and no opens (the common case), and
 *  - tracking enabled but zero opens — an honest UNKNOWN, not a zero: the
 *    recipient may block remote images (including QuantMail's own reader,
 *    which strips 1x1 pixels on inbound), so "not opened" must never render
 *    as a badge claiming non-reading.
 *
 * openCount > 0 is the only render trigger, which also keeps this safe on
 * every surface: inbound rows, self-sends, and internal copies never carry a
 * beacon in their bodies, so their counts can never move.
 */
export interface OpenStatus {
  openCount: number;
  firstOpenedAt?: string;
  lastOpenedAt?: string;
}

export function openStatusOf(message: Email): OpenStatus | null {
  const openCount =
    typeof message.openCount === 'number' && Number.isFinite(message.openCount)
      ? message.openCount
      : 0;
  if (openCount <= 0) return null;
  return {
    openCount,
    firstOpenedAt: message.firstOpenedAt ? String(message.firstOpenedAt) : undefined,
    lastOpenedAt: message.lastOpenedAt ? String(message.lastOpenedAt) : undefined,
  };
}
