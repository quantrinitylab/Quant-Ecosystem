/**
 * Email verification, as primitives.
 *
 * Registration used to hardcode `emailVerified: true` and the client carried a
 * `verifyEmail()` method pointing at a route that never existed — verification
 * was a claim, not a flow. What lives here makes it a flow:
 *
 * - 256-bit single-use links, digest-only storage, 24h TTL (same rules as the
 *   password-reset links, because a verification link in a mailbox is the same
 *   shape of credential).
 * - Dispatch through the real mail pipeline (SES). When SES is not
 *   configured the send is logged, never thrown, and the request endpoint
 *   says so honestly instead of claiming a mail went out.
 */

import { createHash, randomBytes } from 'node:crypto';
import { isSesConfigured, sendViaSes } from './ses-sender';
import { appUrl } from './password-reset';

export const VERIFY_TOKEN_TTL_SECONDS = 86_400; // 24h
export const VERIFY_TOKEN_BYTES = 32;

export const generateVerifyToken = (): string =>
  randomBytes(VERIFY_TOKEN_BYTES).toString('base64url');

export const hashVerifyToken = (token: string): string =>
  createHash('sha256').update(token.trim()).digest('hex');

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,128}$/;
export const looksLikeVerifyToken = (value: unknown): value is string =>
  typeof value === 'string' && TOKEN_SHAPE.test(value.trim());

export const verifyTokenExpiry = (nowMs: number = Date.now()): Date =>
  new Date(nowMs + VERIFY_TOKEN_TTL_SECONDS * 1000);

export const isVerifyTokenExpired = (expiresAt: Date, nowMs: number = Date.now()): boolean =>
  expiresAt.getTime() <= nowMs;

export const verifyUrl = (token: string): string =>
  `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Send the verification mail. Returns true when SES accepted it. Never throws:
 * a mail failure is a log line, not a 500 on the register path.
 */
export async function sendVerificationEmail(opts: {
  to: string;
  url: string;
  name?: string | null;
}): Promise<boolean> {
  if (!isSesConfigured()) {
    // eslint-disable-next-line no-console
    console.error('[email-verification] SES is not configured; no mail was sent to', opts.to);
    return false;
  }
  const greeting = opts.name ? `Hi ${escapeHtml(opts.name)},<br><br>` : '';
  try {
    await sendViaSes({
      from: process.env['VERIFICATION_FROM'] ?? 'QuantMail <no-reply@quantmail.in>',
      to: [opts.to],
      subject: 'Verify your QuantMail address',
      bodyText:
        `Please verify your QuantMail address by opening this link:\n\n${opts.url}\n\n` +
        `The link expires in 24 hours. If you did not create this account, you can ignore this mail.`,
      bodyHtml:
        `${greeting}Please verify your QuantMail address:<br><br>` +
        `<a href="${escapeHtml(opts.url)}">Verify my address</a><br><br>` +
        `The link expires in 24 hours. If you did not create this account, you can ignore this mail.`,
    });
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[email-verification] SES send failed for', opts.to, err);
    return false;
  }
}
