// ============================================================================
// QuantMail — Notifications center pure helpers (K10 / M15).
//
// Kept free of React so the formatting contract is unit-testable.
// ============================================================================

import type { NotificationPriority } from '../../hooks/useNotifications';

export function priorityTone(priority: NotificationPriority): string {
  switch (priority) {
    case 'URGENT':
      return 'border-red-500/40 bg-red-500/15 text-red-400';
    case 'HIGH':
      return 'border-amber-500/40 bg-amber-500/15 text-amber-400';
    default:
      return 'border-[var(--quant-border)] bg-[var(--quant-muted)] text-[var(--quant-muted-foreground)]';
  }
}

export function formatTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

/**
 * Security-flavoured notifications get a shield marker. The match is on the
 * backend's `type` string only — no invented classification.
 */
export function isSecurityType(type: string): boolean {
  return /secur|auth|login|password|2fa|breach/i.test(type);
}

/**
 * Only same-origin deep links are followed. Anything else (absolute external
 * URL, malformed) is refused so a notification can never bounce the user
 * off-app.
 */
export function safeInternalPath(actionUrl: string | null, origin: string): string | null {
  if (!actionUrl) return null;
  try {
    const parsed = new URL(actionUrl, origin);
    if (parsed.origin !== origin) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
