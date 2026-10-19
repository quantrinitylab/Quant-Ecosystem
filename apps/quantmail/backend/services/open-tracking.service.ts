// ============================================================================
// QuantMail - Outbound open tracking (Superhuman-class read statuses)
//
// The existing readAt/deliveredAt columns are the INTERNAL WhatsApp-style
// read-receipt pipeline: readAt is stamped on the sender's sent copy when a
// QuantMail recipient opens the thread (ThreadService.markThreadRead). It
// never fires for external recipients (Gmail, Outlook, ...), who never touch
// our thread view. This module closes that gap with an invisible beacon:
//
//   1. At send time (EmailService.send's flip), a per-message `openToken` is
//      minted when the sender left tracking enabled (the composer default;
//      per-message opt-out in the compose/send path).
//   2. At TRANSMIT time only — never in the stored bodyHtml — the beacon
//      `<img>` is appended to the outbound HTML handed to SES / the delivery
//      worker. The sender's own Sent/thread/people views render the stored
//      bodyHtml, so they can never self-trigger a count.
//   3. GET /track/open/:token (public; the recipient's mail client fetches it
//      with no QuantMail session) counts the load: openCount++,
//      firstOpenedAt (once), lastOpenedAt.
//
// Honesty notes, stated plainly:
//   - A "not opened" status is an honest unknown, not a proof of non-reading:
//     clients that block remote images (including QuantMail's own reader,
//     which strips 1x1 pixels on inbound) never load the beacon.
//   - Gmail-style image proxies fetch on open, which still counts as an open.
//     Prefetching proxies can over-count; the UI therefore shows first/last
//     opened times alongside the count so a single proxy burst reads as one
//     event, not N reads.
//   - Internal (QuantMail-to-QuantMail) copies never carry the beacon —
//     deliverInternally sends the stored bodyHtml — and are covered by the
//     existing readAt pipeline instead. The two mechanisms are complementary,
//     not double-counting.
// ============================================================================

import { randomBytes } from 'node:crypto';

export const OPEN_TRACKING_TOKEN_BYTES = 24; // 48 hex chars, unguessable
export const OPEN_TRACKING_TOKEN_RE = /^[0-9a-f]{48}$/;

/** 1x1 transparent GIF, the smallest honest beacon payload. */
export const OPEN_TRACKING_GIF: Buffer = Buffer.from(
  'R0lGODlhAQABAIAAAP///////yH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
  'base64',
);

/** Mint an unguessable per-message beacon token. */
export function mintOpenToken(): string {
  return randomBytes(OPEN_TRACKING_TOKEN_BYTES).toString('hex');
}

/**
 * Public base URL for the beacon image. The recipient's mail client is
 * external, so the URL must be absolute. Env override first, then the same
 * fallbacks the password-reset links use, then the production domain.
 */
export function openTrackingBaseUrl(): string {
  const raw =
    process.env['OPEN_TRACKING_BASE_URL'] ??
    process.env['PASSWORD_RESET_APP_URL'] ??
    process.env['WORKSPACE_APP_URL'] ??
    process.env['NEXT_PUBLIC_APP_URL'] ??
    'https://quantmail.in';
  return raw.replace(/\/+$/, '');
}

export function openTrackingBeaconUrl(token: string): string {
  return `${openTrackingBaseUrl()}/api/track/open/${token}`;
}

/**
 * Append the invisible beacon to outbound HTML. Returns the input unchanged
 * when there is no token (tracking disabled or token not minted) — callers
 * must not invent a token here; minting happens once at send time so a
 * re-send keeps the same identity.
 *
 * The pixel is a plain 1x1 <img>: deliberately NOT display:none (some
 * sanitizers strip display:none elements, which would silently untrack the
 * message) and deliberately NOT a known-tracker-domain URL (our own
 * /api/track/open path on our own domain).
 */
export function withOpenTrackingPixel(
  bodyHtml: string | null | undefined,
  token: string | null | undefined,
): string | undefined {
  if (!bodyHtml || bodyHtml.trim().length === 0) return bodyHtml ?? undefined;
  if (!token || !OPEN_TRACKING_TOKEN_RE.test(token)) return bodyHtml;
  // Idempotent: a body that already carries this message's beacon is left
  // alone, so a retry or double-pass never stacks pixels.
  if (bodyHtml.includes(`/api/track/open/${token}`)) return bodyHtml;
  const beacon =
    `<img src="${openTrackingBeaconUrl(token)}" width="1" height="1" border="0" alt=""` +
    ` style="width:1px;height:1px;border:0;" />`;
  return `${bodyHtml}\n${beacon}`;
}

export interface OpenTrackingStore {
  email: {
    findUnique(args: unknown): Promise<{ id: string; firstOpenedAt?: Date | null } | null>;
    update(args: unknown): Promise<unknown>;
  };
}

/**
 * Record one beacon load against the sender's Email row. Returns true when a
 * message owned the token, false for unknown/malformed tokens (the route
 * still answers 200 + GIF either way — token validity is never leaked).
 *
 * firstOpenedAt is set once (the first counted open); lastOpenedAt and
 * openCount advance on every load. A concurrent double-hit can race the
 * firstOpenedAt check by milliseconds — both writers stamp "now", which is
 * the first open within the same instant, so no lie is told either way.
 * Errors propagate to the caller, which decides whether a missed count is
 * worth failing the pixel over (it is not — the route swallows and still
 * serves the GIF).
 */
export async function recordOpen(
  prisma: OpenTrackingStore,
  token: string | null | undefined,
): Promise<boolean> {
  if (!token || !OPEN_TRACKING_TOKEN_RE.test(token)) return false;
  const row = await prisma.email.findUnique({ where: { openToken: token } });
  if (!row) return false;
  const now = new Date();
  await prisma.email.update({
    where: { id: row.id },
    data: {
      openCount: { increment: 1 },
      ...(row.firstOpenedAt ? {} : { firstOpenedAt: now }),
      lastOpenedAt: now,
    },
  });
  return true;
}
