/**
 * Password reset, as primitives.
 *
 * The endpoint pair this serves used to answer "reset instructions have been
 * sent" without sending anything, and 501 on confirm. Every rule that makes a
 * reset link safe therefore had nowhere to live: what the token is made of, how
 * long it lasts, what a new password has to clear, and what the mail actually
 * says. They live here, and are tested directly rather than through an HTTP
 * round trip, because a route test that happens to pass tells you nothing about
 * which of these held.
 */

import { createHash, randomBytes } from 'node:crypto';
import { isSesConfigured, sendViaSes } from './ses-sender';

/** Long enough to walk to another device, short enough that a leaked mailbox
 *  is not a standing key to the account. */
export const RESET_TOKEN_TTL_SECONDS = 3_600;

/** 256 bits. The link is a bearer credential for the entire account, so it is
 *  sized like one — not like a six-digit code someone types. */
export const RESET_TOKEN_BYTES = 32;

export const MIN_PASSWORD_LENGTH = 8;

/** argon2 will hash anything handed to it, including a megabyte of "a". */
export const MAX_PASSWORD_LENGTH = 200;

export const generateResetToken = (): string =>
  randomBytes(RESET_TOKEN_BYTES).toString('base64url');

/** Only the digest is stored, for the same reason a password is not stored: the
 *  row grants account takeover, so a leaked table must not be live links. */
export const hashResetToken = (token: string): string =>
  createHash('sha256').update(token.trim()).digest('hex');

/* base64url of 32 bytes is 43 characters. The accepted band is wider than that
   so changing RESET_TOKEN_BYTES cannot silently start 400-ing every link. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,128}$/;

export const looksLikeResetToken = (value: unknown): value is string =>
  typeof value === 'string' && TOKEN_SHAPE.test(value.trim());

export const resetTokenExpiry = (nowMs: number = Date.now()): Date =>
  new Date(nowMs + RESET_TOKEN_TTL_SECONDS * 1000);

export const isResetTokenExpired = (expiresAt: Date, nowMs: number = Date.now()): boolean =>
  expiresAt.getTime() <= nowMs;

/* -------------------------------------------------------------------------- */

/**
 * The passwords that get tried first. A production blocklist is ~10⁵ entries and
 * belongs in a data file loaded at boot; this is the head of that distribution,
 * which is where nearly all the credential-stuffing volume actually is.
 */
const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password1',
  'password123',
  'qwerty123',
  'qwertyuiop',
  'iloveyou',
  'princess',
  'sunshine',
  'football',
  'baseball',
  'welcome1',
  'admin123',
  'letmein1',
  'monkey123',
  'abc12345',
  'trustno1',
  'dragon123',
  'passw0rd',
  'p@ssw0rd',
  'changeme',
  'quantmail',
  'quantmail123',
]);

/**
 * What is wrong with this password, or `null` if nothing is.
 *
 * Length plus a blocklist, and deliberately no composition rules: NIST SP
 * 800-63B stopped recommending "one upper, one digit, one symbol" because it
 * reliably produces `Password1!` and nothing else. Rejecting the account's own
 * address is the one identity rule worth keeping, because it is the first guess.
 */
export const passwordComplaint = (
  password: unknown,
  identity: { email?: string | null; username?: string | null } = {},
): string | null => {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Choose a new password.';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Use ${MAX_PASSWORD_LENGTH} characters or fewer.`;
  }
  if (new Set(password).size === 1) {
    return 'Use more than one repeated character.';
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'That password appears on public breach lists. Choose another.';
  }

  const folded = password.trim().toLowerCase();
  const email = identity.email?.trim().toLowerCase();
  const candidates = [email, email?.split('@')[0], identity.username?.trim().toLowerCase()];
  if (candidates.some((candidate) => candidate && candidate.length >= 3 && candidate === folded)) {
    return 'Do not use your address or username as your password.';
  }

  return null;
};

/* -------------------------------------------------------------------------- */

export const appUrl = (): string =>
  (
    process.env['PASSWORD_RESET_APP_URL'] ??
    process.env['WORKSPACE_APP_URL'] ??
    process.env['NEXT_PUBLIC_APP_URL'] ??
    'https://quantmail.in'
  ).replace(/\/$/, '');

export const resetFrom = (): string =>
  process.env['PASSWORD_RESET_FROM'] ?? 'QuantMail <no-reply@quantmail.in>';

/** The token rides in the query string because the reset page has to read it
 *  before anyone is signed in; it is single-use and hour-bounded for exactly
 *  that reason. */
export const resetUrl = (token: string): string =>
  `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;

export const RESET_EMAIL_SUBJECT = 'Reset your QuantMail password';

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ttlMinutes = (): number => Math.round(RESET_TOKEN_TTL_SECONDS / 60);

export const resetEmailText = (opts: { url: string; name?: string | null }): string =>
  [
    opts.name ? `Hi ${opts.name},` : 'Hi,',
    '',
    'Someone asked to reset the password on your QuantMail account. Open this link to choose a new one:',
    '',
    opts.url,
    '',
    `The link works once and expires in ${ttlMinutes()} minutes.`,
    '',
    'If this was not you, you can ignore this message — nothing has changed, and your current password still works.',
    '',
    '— QuantMail',
  ].join('\n');

/**
 * Inline styles and a letterform mark, not a linked image: Gmail and Outlook
 * both strip `<svg>`, and a PNG logo would be a tracking-blocked grey box in
 * every client that defers remote images. The palette is the product's own, so
 * the mail reads as the same surface the link lands on.
 */
export const resetEmailHtml = (opts: { url: string; name?: string | null }): string => {
  const safeUrl = escapeHtml(opts.url);
  const greeting = opts.name ? `Hi ${escapeHtml(opts.name)},` : 'Hi,';
  return `<!doctype html><html><body style="margin:0;background:#090A0C;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px">
    <div style="border:1px solid #282C35;border-radius:16px;background:#111318;padding:32px">
      <div style="display:inline-block;width:34px;height:34px;line-height:32px;text-align:center;border-radius:9px;background:#2B1A11;border:1px solid #5C3016;color:#FF8C42;font-weight:700;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">Q</div>
      <h1 style="margin:22px 0 10px;color:#F5F5F5;font-size:22px;line-height:1.3;letter-spacing:-0.02em">Reset your password</h1>
      <p style="margin:0 0 18px;color:#A1A4AC;font-size:14px;line-height:1.6">
        ${greeting} someone asked to reset the password on your QuantMail account.
        Choose a new one here — the link works once and expires in ${ttlMinutes()} minutes.
      </p>
      <a href="${safeUrl}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#FF8C42;color:#111111;font-weight:600;font-size:14px;text-decoration:none">Choose a new password</a>
      <p style="margin:22px 0 0;color:#6B6E76;font-size:12px;line-height:1.6">
        Or paste this link in your browser:<br><span style="color:#A1A4AC;word-break:break-all">${safeUrl}</span>
      </p>
      <p style="margin:18px 0 0;padding-top:18px;border-top:1px solid #282C35;color:#6B6E76;font-size:12px;line-height:1.6">
        Did not ask for this? Ignore this message. Nothing has changed and your current password still works.
      </p>
    </div>
  </div></body></html>`;
};

/**
 * Deliver, and say honestly whether it went.
 *
 * The caller answers the same way either way — the response must not become the
 * enumeration oracle the non-committal wording exists to avoid — so a failure
 * here is a log line, not an error the requester sees. What it must never be is
 * silence: "instructions have been sent" was a lie for months precisely because
 * nothing recorded that nothing was sent.
 */
export const sendPasswordResetEmail = async (opts: {
  to: string;
  url: string;
  name?: string | null;
}): Promise<boolean> => {
  if (!isSesConfigured()) {
    // eslint-disable-next-line no-console
    console.error('[password-reset] SES is not configured; no mail was sent to', opts.to);
    return false;
  }

  try {
    await sendViaSes({
      from: resetFrom(),
      to: [opts.to],
      subject: RESET_EMAIL_SUBJECT,
      bodyText: resetEmailText(opts),
      bodyHtml: resetEmailHtml(opts),
    });
    return true;
  } catch (error) {
    // The SES sandbox blocks unverified recipients, so this is an expected
    // outcome in staging rather than a bug — but it stays visible.
    // eslint-disable-next-line no-console
    console.error('[password-reset] delivery failed', error);
    return false;
  }
};
