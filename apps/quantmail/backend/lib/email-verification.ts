/**
 * Email address ownership proof, as primitives.
 *
 * Register used to create users with `emailVerified: true` without ever
 * verifying the address — anyone could claim any address. The code lives here,
 * beside the password-reset primitives it mirrors: only the SHA-256 digest of
 * the 6-digit code is stored, single-use, 15-minute-bounded, attempt-capped.
 *
 * HARD RULE: email only. Phone/SMS/OTP-by-mobile-number was removed by user
 * order — this module must never mention or depend on a phone number.
 */

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { isSesConfigured, sendViaSes } from './ses-sender';

/** Long enough to walk to another device and copy six digits. */
export const VERIFICATION_CODE_TTL_SECONDS = 15 * 60;

/**
 * 6 digits = 10^6 guesses; the attempt cap plus rate limits are the defense.
 * The cap is per account per code epoch, not per row: the resend handler
 * carries the failed-attempt count of still-live superseded codes onto the
 * replacement row, so resending cannot reset the budget. Attempts on an
 * already-expired code do not carry over — expiry ends the epoch.
 */
export const MAX_VERIFICATION_ATTEMPTS = 5;

export const generateVerificationCode = (): string =>
  randomInt(0, 1_000_000).toString().padStart(6, '0');

/** Only the digest is stored, for the same reason a password is not stored:
 *  a leaked table must not be live verification codes. */
export const hashVerificationCode = (code: string): string =>
  createHash('sha256').update(code.trim()).digest('hex');

/** Constant-time compare on equal-length hex digests; never early-exit on a
 *  guess, or the guesser learns how many leading digits matched. */
export const verificationCodeMatches = (code: string, digest: string): boolean => {
  const candidate = hashVerificationCode(code);
  if (candidate.length !== digest.length) return false;
  return timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(digest, 'hex'));
};

export const looksLikeVerificationCode = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{6}$/.test(value.trim());

export const verificationCodeExpiry = (nowMs: number = Date.now()): Date =>
  new Date(nowMs + VERIFICATION_CODE_TTL_SECONDS * 1000);

export const isVerificationCodeExpired = (expiresAt: Date, nowMs: number = Date.now()): boolean =>
  expiresAt.getTime() <= nowMs;

export const verificationFrom = (): string =>
  process.env['VERIFICATION_EMAIL_FROM'] ?? 'QuantMail <no-reply@quantmail.in>';

export const VERIFICATION_EMAIL_SUBJECT = 'Verify your QuantMail email address';

export const verificationEmailText = (opts: { name?: string | null; code: string }): string => {
  const name = opts.name?.trim() || 'there';
  return [
    `Hi ${name},`,
    '',
    'You signed up for QuantMail with this email address. Enter this verification code to confirm you own it:',
    '',
    `    ${opts.code}`,
    '',
    'The code expires in 15 minutes and can be used once. If you did not sign up, ignore this email.',
    '',
    '— The QuantMail team',
  ].join('\n');
};

export const verificationEmailHtml = (opts: { name?: string | null; code: string }): string => {
  const name = (opts.name?.trim() || 'there').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
  return `<p>Hi ${name},</p>
<p>You signed up for QuantMail with this email address. Enter this verification code to confirm you own it:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:8px;font-family:monospace;">${opts.code}</p>
<p>The code expires in 15 minutes and can be used once. If you did not sign up, ignore this email.</p>
<p>— The QuantMail team</p>`;
};

/**
 * Dispatch the verification code. Returns true only when SES accepted the
 * message — the caller must answer the requester honestly either way, because
 * "verification email sent" was the same lie "reset instructions sent" was
 * before SES production access went live.
 */
export const sendVerificationEmail = async (opts: {
  to: string;
  code: string;
  name?: string | null;
}): Promise<boolean> => {
  if (!isSesConfigured()) {
    // eslint-disable-next-line no-console
    console.error('[email-verification] SES is not configured; no code was sent to', opts.to);
    return false;
  }

  try {
    await sendViaSes({
      from: verificationFrom(),
      to: [opts.to],
      subject: VERIFICATION_EMAIL_SUBJECT,
      bodyText: verificationEmailText(opts),
      bodyHtml: verificationEmailHtml(opts),
    });
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[email-verification] delivery failed', error);
    return false;
  }
};
