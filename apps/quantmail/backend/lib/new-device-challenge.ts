/**
 * Risk-based new-device sign-in challenge (queue P1, auth-sso).
 *
 * Before this, /auth/login issued a full browser session to any correct
 * password from any IP: sessionMetadataFromRequest captured ipAddress +
 * userAgent on the refresh-token row, but nothing ever compared a sign-in
 * against prior sessions. A phished password alone granted instant full
 * access from anywhere — Google, by contrast, gates an unfamiliar device /
 * VPN / location change with a "Verify it's you" challenge even when the
 * password is correct.
 *
 * The gate, in one paragraph: a password login is familiar when at least
 * one LIVE browser session (a non-revoked, non-expired refresh-token row)
 * carries the same ipAddress AND userAgent as this request. Familiar logins
 * are untouched. An unfamiliar login — a live history exists but nothing
 * matches — gets NO session; instead a single-use 6-digit code goes to the
 * user's verified recovery email when one exists, else to the account email
 * itself (the mailbox is the recovery channel; there is no SMS channel by
 * user order), and POST /auth/new-device/verify exchanges that code for the
 * session. The challenge is bound to the device fingerprint of the login
 * request, so a code read on one device cannot be redeemed from another.
 *
 * Deliberate boundaries, each with a reason:
 * - Zero live sessions (fresh account, or every session expired/revoked)
 *   is NOT gated: there is no trusted device on record to differ from, and
 *   the session this login mints becomes the first trust record. Gating
 *   empty history would challenge every returning user after a 30-day
 *   expiry and every first sign-in — the exact population with no other
 *   device to read a code on.
 * - A TOTP second factor already IS possession proof, so /auth/2fa/verify
 *   issues the session directly and is not double-gated with an email code.
 *   Requiring both would lock out the user whose authenticator works but
 *   whose mailbox is momentarily unreachable.
 * - The code goes to the account email when no verified recovery email
 *   exists — that is the only channel the user has proven (or is proving).
 *   An UNVERIFIED recoveryEmail is never used: a typo'd or hostile pending
 *   address must never become the gate's channel.
 * - When SES cannot deliver the code, the login fails closed with an honest
 *   503 (NEW_DEVICE_EMAIL_FAILED) and the minted code row is burned. It
 *   never falls back to issuing the session — a mail outage must not
 *   silently disable the gate. Familiar-device logins are unaffected by a
 *   mail outage because they never reach this code path.
 * - The RefreshToken lookup is defensive (`?.findMany ?? []`): the model
 *   predates this change and the real generated client always exposes it,
 *   but test fakes that predate the gate must not 500 every login. A missing
 *   accessor degrades to "no history", i.e. the zero-history rule above —
 *   never to a session for a KNOWN-unfamiliar device, because a known
 *   unfamiliar device requires rows to have been read.
 *
 * HARD RULE: email only. No phone/SMS anywhere in this file — phone OTP was
 * removed by user order.
 */

import { createHash } from 'node:crypto';
import { isSesConfigured, sendViaSes } from './ses-sender';
import {
  MAX_VERIFICATION_ATTEMPTS,
  generateVerificationCode,
  hashVerificationCode,
  verificationCodeMatches,
} from './email-verification';

export { generateVerificationCode, hashVerificationCode, verificationCodeMatches };

/** Long enough to fetch a code from another client, short enough to bound replay. */
export const NEW_DEVICE_CHALLENGE_TTL_SECONDS = 15 * 60;

/** Same cap as the email-verification code: 6 digits + rate limits is the defense. */
export const MAX_NEW_DEVICE_ATTEMPTS = MAX_VERIFICATION_ATTEMPTS;

export const NEW_DEVICE_CHALLENGE_EMAIL_SUBJECT = 'Confirm it\'s you signing in to QuantMail';

export interface DeviceMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * The fingerprint a sign-in is compared on: the exact pair the refresh-token
 * rows already store. Normalization is deliberately minimal — trim + a
 * length cap on the client-controlled user-agent — so a stored row and a
 * fresh request hash identically without inventing a device identity the
 * data cannot support (there is no device-id cookie; see the audit note in
 * findings-queue.md).
 */
export const deviceFingerprint = (metadata: DeviceMetadata): string => {
  const ip = typeof metadata.ipAddress === 'string' ? metadata.ipAddress.trim() : '';
  const ua =
    typeof metadata.userAgent === 'string' ? metadata.userAgent.trim().slice(0, 512) : '';
  return createHash('sha256').update(`${ip}\n${ua}`).digest('hex');
};

/** True when any prior live session row carries this request's exact pair. */
export const isFamiliarDevice = (
  priorSessions: readonly DeviceMetadata[],
  metadata: DeviceMetadata,
): boolean => {
  const ip = typeof metadata.ipAddress === 'string' ? metadata.ipAddress.trim() : '';
  const ua = typeof metadata.userAgent === 'string' ? metadata.userAgent.trim() : '';
  return priorSessions.some((row) => {
    const rowIp = typeof row.ipAddress === 'string' ? row.ipAddress.trim() : '';
    const rowUa = typeof row.userAgent === 'string' ? row.userAgent.trim() : '';
    return rowIp === ip && rowUa === ua;
  });
};

/**
 * Live browser sessions for the familiarity check: one refresh-token family
 * is one session, and only live families count — a revoked or expired row
 * is not a trusted device. Rows tagged 'oauth' are third-party grants, not
 * browser sign-ins, and are excluded exactly like /auth/sessions does.
 * Returns [] when the model accessor is absent (see the module header).
 */
export async function listLiveBrowserSessions(
  prisma: unknown,
  userId: string,
): Promise<DeviceMetadata[]> {
  const refreshToken = (prisma as { refreshToken?: { findMany?: unknown } } | null)?.refreshToken;
  if (!refreshToken || typeof refreshToken.findMany !== 'function') return [];
  const rows = (await (refreshToken.findMany as (args: unknown) => Promise<unknown[]>)({
    where: {
      userId,
      isRevoked: false,
      expiresAt: { gt: new Date() },
      OR: [{ source: 'browser' }, { source: null }],
    },
  })) as DeviceMetadata[];
  return Array.isArray(rows) ? rows : [];
}

/** The NewDeviceChallenge model accessor, or null when the generated client predates it. */
export const newDeviceChallengeApi = (
  prisma: unknown,
): {
  findFirst: (args: unknown) => Promise<unknown>;
  create: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
} | null => {
  const api = (prisma as { newDeviceChallenge?: unknown } | null)?.newDeviceChallenge;
  if (!api || typeof api !== 'object') return null;
  const candidate = api as Record<string, unknown>;
  if (
    typeof candidate['findFirst'] !== 'function' ||
    typeof candidate['create'] !== 'function' ||
    typeof candidate['update'] !== 'function' ||
    typeof candidate['updateMany'] !== 'function'
  ) {
    return null;
  }
  return candidate as never;
};

/** The code destination: the VERIFIED recovery email, else the account email. */
export const challengeDestination = (user: {
  email: string;
  recoveryEmail?: string | null;
  recoveryEmailVerifiedAt?: Date | string | null;
}): { to: string; channel: 'recovery' | 'primary' } => {
  if (user.recoveryEmail && user.recoveryEmailVerifiedAt) {
    return { to: user.recoveryEmail, channel: 'recovery' };
  }
  return { to: user.email, channel: 'primary' };
};

/** Masked destination for the client: first character + domain, never the full address. */
export const maskEmail = (email: string): string => {
  const at = email.indexOf('@');
  if (at <= 0) return 'your email address';
  return `${email[0]}***@${email.slice(at + 1)}`;
};

export const newDeviceChallengeExpiry = (nowMs: number = Date.now()): Date =>
  new Date(nowMs + NEW_DEVICE_CHALLENGE_TTL_SECONDS * 1000);

export const isNewDeviceChallengeExpired = (expiresAt: Date, nowMs: number = Date.now()): boolean =>
  expiresAt.getTime() <= nowMs;

export const newDeviceChallengeEmailText = (opts: {
  name?: string | null;
  code: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): string => {
  const name = opts.name?.trim() || 'there';
  const where = [
    opts.ipAddress ? `from IP address ${opts.ipAddress}` : null,
    opts.userAgent ? `using ${opts.userAgent.slice(0, 120)}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  return [
    `Hi ${name},`,
    '',
    `Someone signed in to your QuantMail account with the correct password ${where ? `${where} ` : ''}from a device we have not seen before.`,
    '',
    'If that was you, enter this code to finish signing in:',
    '',
    `    ${opts.code}`,
    '',
    'The code expires in 15 minutes and can be used once, only from the device that started the sign-in. If this was not you, do not share the code — change your QuantMail password and review your active sessions.',
    '',
    '— The QuantMail team',
  ].join('\n');
};

export const newDeviceChallengeEmailHtml = (opts: {
  name?: string | null;
  code: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): string => {
  const name = (opts.name?.trim() || 'there').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
  const where = [
    opts.ipAddress ? `from IP address ${opts.ipAddress}` : null,
    opts.userAgent ? `using ${opts.userAgent.slice(0, 120)}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  return `<p>Hi ${name},</p>
<p>Someone signed in to your QuantMail account with the correct password ${where ? `${where} ` : ''}from a device we have not seen before.</p>
<p>If that was you, enter this code to finish signing in:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:8px;font-family:monospace;">${opts.code}</p>
<p>The code expires in 15 minutes and can be used once, only from the device that started the sign-in. If this was not you, do not share the code — change your QuantMail password and review your active sessions.</p>
<p>— The QuantMail team</p>`;
};

/**
 * Dispatch the challenge code. Returns true only when SES accepted the
 * message — the caller must answer honestly either way, because a "code
 * sent" that was never sent strands the user on a screen with no code
 * coming, and a silent session would defeat the gate.
 */
export const sendNewDeviceChallengeEmail = async (opts: {
  to: string;
  code: string;
  name?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<boolean> => {
  if (!isSesConfigured()) {
    // eslint-disable-next-line no-console
    console.error('[new-device-challenge] SES is not configured; no code was sent to', opts.to);
    return false;
  }
  try {
    await sendViaSes({
      from: process.env['VERIFICATION_EMAIL_FROM'] ?? 'QuantMail <no-reply@quantmail.in>',
      to: [opts.to],
      subject: NEW_DEVICE_CHALLENGE_EMAIL_SUBJECT,
      bodyText: newDeviceChallengeEmailText(opts),
      bodyHtml: newDeviceChallengeEmailHtml(opts),
    });
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[new-device-challenge] delivery failed', error);
    return false;
  }
};
