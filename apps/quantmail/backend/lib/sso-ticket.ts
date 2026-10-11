/**
 * SSO handoff tickets — the replacement for the old `?token=` URL handoff.
 *
 * The old account-chooser flow redirected to the relying app with the user's
 * LIVE ACCESS TOKEN in the query string. Tokens in URLs end up in browser
 * history, server logs, analytics beacons and Referer headers; an access token
 * there is a session that cannot be taken back. The ticket below is none of
 * those things:
 *
 * - 256 bits of randomness, stored only as a SHA-256 digest (a leaked table
 *   is not a set of live tickets, same rule as password-reset links).
 * - Bound to one target origin (`audience`); verify refuses a ticket whose
 *   presenter does not name that origin.
 * - 60 seconds to live. Long enough for one redirect, short enough that a
 *   copied URL is stale before it can travel.
 * - Single-use under concurrency (updateMany compare-and-set on usedAt),
 *   exactly like the password-reset confirm path.
 * - Grants NOTHING by itself. The relying party must POST it back-channel to
 *   /oauth/sso-ticket/verify, which answers with the user profile; the app
 *   then mints its own session. Stealing the ticket buys at most a profile
 *   read inside a 60-second window, and only once.
 */

import { createHash, randomBytes } from 'node:crypto';
import prisma from '@quant/auth/lib/prisma';

/** One redirect, not a standing credential. */
export const SSO_TICKET_TTL_SECONDS = 60;
export const SSO_TICKET_BYTES = 32;

export const generateSsoTicket = (): string =>
  randomBytes(SSO_TICKET_BYTES).toString('base64url');

export const hashSsoTicket = (ticket: string): string =>
  createHash('sha256').update(ticket.trim()).digest('hex');

const TICKET_SHAPE = /^[A-Za-z0-9_-]{32,128}$/;
export const looksLikeSsoTicket = (value: unknown): value is string =>
  typeof value === 'string' && TICKET_SHAPE.test(value.trim());

export const ssoTicketExpiry = (nowMs: number = Date.now()): Date =>
  new Date(nowMs + SSO_TICKET_TTL_SECONDS * 1000);

export const isSsoTicketExpired = (expiresAt: Date, nowMs: number = Date.now()): boolean =>
  expiresAt.getTime() <= nowMs;

/**
 * Mint a ticket for `userId` aimed at `audience` (exact origin, e.g.
 * https://quantai.quantrinity.in). Old live tickets for the same user+audience
 * are cleared first so at most one is ever outstanding.
 */
export async function mintSsoTicket(opts: {
  userId: string;
  clientId: string;
  audience: string;
}): Promise<{ ticket: string; expiresAt: Date }> {
  const { userId, clientId, audience } = opts;
  await prisma.ssoTicket.deleteMany({ where: { userId, audience, usedAt: null } });
  // Housekeeping: expired tickets are worthless rows. Best-effort, never throws.
  await prisma.ssoTicket
    .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } } })
    .catch(() => undefined);
  const ticket = generateSsoTicket();
  const row = await prisma.ssoTicket.create({
    data: {
      userId,
      clientId,
      audience,
      ticketHash: hashSsoTicket(ticket),
      expiresAt: ssoTicketExpiry(),
    },
  });
  return { ticket, expiresAt: row.expiresAt };
}

export interface VerifiedSsoTicket {
  userId: string;
  clientId: string;
  audience: string;
}

/**
 * Consume a ticket exactly once. Returns null when the ticket is unknown,
 * expired, already used — or when `audience` does not match the origin the
 * ticket was minted for (a ticket copied to another app is dead on arrival).
 */
export async function consumeSsoTicket(
  ticket: unknown,
  audience: string,
): Promise<VerifiedSsoTicket | null> {
  if (!looksLikeSsoTicket(ticket)) return null;
  const row = await prisma.ssoTicket.findUnique({
    where: { ticketHash: hashSsoTicket(ticket) },
  });
  if (!row || row.usedAt || isSsoTicketExpired(row.expiresAt)) return null;
  if (row.audience !== audience) return null;

  const spent = await prisma.ssoTicket.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if ((spent?.count ?? 0) === 0) return null;

  return { userId: row.userId, clientId: row.clientId, audience: row.audience };
}
