/**
 * Thread detail helpers — Phase 1.4 (classic mail-detail surface).
 *
 * Pure functions only: no React, no I/O, no state, no fetch, no router,
 * no apiClient, no classification change. Every action in the detail
 * surface is a caller-owned callback; these helpers only shape labels,
 * subjects and previews. The patterns they serve (back-arrow subject
 * header, sender block, flat body, quick reactions above the bottom bar,
 * Reply dropdown / archive / delete, inline draft reply in-thread, full
 * reply with a quoted original block) are the already-documented Mobbin
 * Outlook iOS thread behaviours, rebuilt here in QuantWorkplace's own
 * code — no competitor screenshots, icons, logos or code copied.
 */

import type { Email, EmailAddress } from '../types';

/** Generic reaction chips for the detail surface (5, no custom set). */
export const THREAD_DETAIL_REACTIONS = ['👍', '❤️', '😂', '😮', '😢'] as const;

export type ThreadDetailReaction = (typeof THREAD_DETAIL_REACTIONS)[number];

function normalizedAddress(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Outbound test, mirroring the thread view's own per-message test:
 * sent status, sent flag, from address == current address, or from
 * address under the current handle. Case-insensitive throughout.
 */
export function isOutboundMessage(
  message: Email,
  currentEmail?: string,
  currentHandle?: string,
): boolean {
  const fromAddr = (
    message.from?.email ||
    (message as { fromAddress?: string }).fromAddress ||
    ''
  ).toLowerCase();
  if (message.status === 'sent') return true;
  if ((message as { isSent?: boolean }).isSent) return true;
  if (currentEmail && fromAddr && fromAddr === currentEmail.toLowerCase()) {
    return true;
  }
  if (
    currentHandle &&
    fromAddr &&
    fromAddr.startsWith(`${currentHandle.toLowerCase()}@`)
  ) {
    return true;
  }
  return false;
}

/**
 * Sender display name. Outbound reads as `me` (the thread view's own
 * convention); inbound as sender name, then address local part, then
 * `Unknown sender` — never a fabricated name.
 */
export function senderDisplayName(
  message: Email,
  currentEmail?: string,
  currentHandle?: string,
): string {
  if (isOutboundMessage(message, currentEmail, currentHandle)) return 'me';
  const name = (message.from?.name || '').trim();
  if (name) return name;
  const email = (message.from?.email || '').trim();
  if (email) return email.split('@')[0] || 'Unknown sender';
  const fallback = (message as { fromAddress?: string }).fromAddress || '';
  if (fallback.trim()) return fallback.trim().split('@')[0] || 'Unknown sender';
  return 'Unknown sender';
}

/**
 * `Name <address>` when the name says something the address does not
 * (a bare local part used to read as an incomplete address); otherwise
 * the bare address. Empty input yields ''.
 */
export function formatAddressList(
  addresses: EmailAddress[] | undefined | null,
): string {
  if (!addresses || addresses.length === 0) return '';
  return addresses
    .map((addr) => {
      const email = (addr.email ?? '').trim();
      const name = (addr.name ?? '').trim();
      if (!email) return name;
      const local = email.split('@')[0] ?? '';
      if (
        !name ||
        normalizedAddress(name) === normalizedAddress(email) ||
        normalizedAddress(name) === normalizedAddress(local)
      ) {
        return email;
      }
      return `${name} <${email}>`;
    })
    .filter(Boolean)
    .join(', ');
}

function withPrefixOnce(subject: string, prefix: string, emptyLabel: string): string {
  const trimmed = (subject ?? '').trim();
  if (!trimmed) return `${prefix}: ${emptyLabel}`;
  if (trimmed.toLowerCase().startsWith(`${prefix.toLowerCase()}:`)) {
    return trimmed;
  }
  return `${prefix}: ${trimmed}`;
}

/**
 * Mirror the thread view's compose entry points exactly: the prefix is
 * added once and kept if already present. Empty subject yields a
 * labelled subject rather than a bare prefix.
 */
export function buildReplySubject(subject: string | undefined | null): string {
  return withPrefixOnce(subject ?? '', 'Re', '(no subject)');
}

export function buildForwardSubject(subject: string | undefined | null): string {
  return withPrefixOnce(subject ?? '', 'Fwd', '(no subject)');
}

/**
 * The existing forwarded-message separator block. An empty original body
 * contributes nothing — no dangling separator.
 */
export function buildForwardBody(body: string | undefined | null): string {
  if (!body) return '';
  return `\n\n---------- Forwarded message ---------\n${body}`;
}

/**
 * Whitespace-collapsed preview of a body, capped at 80 characters.
 * Empty input yields `(No preview)`, never an empty string.
 */
export function quotedReplyPreview(body: string | undefined | null): string {
  const collapsed = (body ?? '').replace(/\s+/g, ' ').trim();
  if (!collapsed) return '(No preview)';
  if (collapsed.length > 80) return collapsed.slice(0, 80).trimEnd();
  return collapsed;
}
