// ============================================================================
// QuantChat - message display helpers
// Pure functions for bubble timestamp formatting and delivery-status mapping.
// ============================================================================

export type DeliveryStatus = 'sent' | 'delivered' | 'read';

/**
 * Format a message timestamp for the bubble: "14:32" for today's messages,
 * "Oct 9, 14:32" for older ones. Empty/invalid input renders nothing.
 * (The backend stores Prisma `createdAt`, not a `timestamp` field.)
 */
export function formatMessageTime(value: unknown): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (sameDay) return time;
  const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${day}, ${time}`;
}

/**
 * Map the backend message status onto the bubble's tick states. 'sending' and
 * 'failed' collapse to 'sent' — failed sends get their own retry UI, never a
 * misleading tick.
 */
export function toDeliveryStatus(status: unknown): DeliveryStatus {
  if (status === 'delivered' || status === 'read' || status === 'sent') return status;
  return 'sent';
}

/**
 * Resolve whether a message is ours. Backend records carry `senderId`
 * (and `createdAt`) — there is no `sender: 'self' | 'other'` field.
 * Comparing against the authenticated user's id is the only real signal;
 * guessing from list position would fabricate alignment and ticks.
 */
export function resolveMessageSender(
  msg: { senderId?: string; userId?: string; sender?: string },
  myUserId: string | null,
): 'self' | 'other' {
  const rawId = msg.senderId ?? msg.userId ?? null;
  if (rawId && myUserId) return rawId === myUserId ? 'self' : 'other';
  // Realtime payloads sometimes carry the raw user id in `sender`.
  if (msg.sender && myUserId && msg.sender !== 'self' && msg.sender !== 'other') {
    return msg.sender === myUserId ? 'self' : 'other';
  }
  if (msg.sender === 'self' || msg.sender === 'other') return msg.sender;
  return 'other';
}
