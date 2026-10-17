/**
 * Account recovery — the out-of-band recovery email channel.
 *
 * The finding this fixes (queue 2026-10-14, P1 competitor-gap): the
 * password-reset link was mailed to the user's own QuantMail inbox ONLY, which
 * is unreachable when locked out (forgot password + no active session = the
 * reset email sits in a mailbox the person cannot open). Google gives every
 * account a recovery email; QuantMail had no recoveryEmail field at all
 * (migration 0091).
 *
 * CODEX-REVIEW 6241280732 (war-room #902, 2026-10-18) corrective on #1254:
 * #1254 activated the address on session identity alone — an authenticated
 * PUT with only {email} returned 200, and the forgot-password flow then mailed
 * that UNVERIFIED address a usable reset link. No current password or fresh
 * challenge was supplied, so a stolen session (or a typo'd address) could
 * redirect the account's recovery channel. Two corrections, both here:
 *
 *  1. SENSITIVE-ACTION BOUNDARY: setting, verifying, and clearing the
 *     recovery address cross fastify.requireStepUp() (packages/server-core
 *     auth plugin) — recent strong authentication, not just a live session.
 *     A stale session gets an honest 401 STEP_UP_REQUIRED telling the user
 *     to sign in again first. Reads stay session-only (not a mutation).
 *
 *  2. DESTINATION VERIFICATION LIFECYCLE (migration 0102): a new address
 *     starts PENDING in recovery_email_verifications. Only the SHA-256 digest
 *     of a 6-digit code is stored, single-use, 15-minute-bounded,
 *     attempt-capped. Consuming the code through
 *     POST /auth/account/recovery-email/verify flips
 *     users.recoveryEmailVerifiedAt. The CURRENT recoveryEmail stays active
 *     until the pending one verifies — a typo'd or hostile address can never
 *     silently become the channel. Legacy #1254 rows (recoveryEmail set,
 *     recoveryEmailVerifiedAt NULL) are INERT: password-reset.ts mails the
 *     recovery address only when verified.
 *
 * What is deliberately NOT here: SMS/phone OTP. The product has no phone OTP
 * infra and the locked design removed phone login/OTP; recovery is email only.
 *
 * On the residual risk of an unverified address: the code is mailed to the
 * NEW address itself. A typo'd address degrades to a code nobody can read,
 * never to activation — and the primary inbox still gets its reset copy.
 */

/* eslint-disable no-console */

import { FastifyInstance } from 'fastify';
import prisma from '@quant/auth/lib/prisma';
import { authenticatedUserId, fail } from '../lib/auth-session';
import {
  MAX_VERIFICATION_ATTEMPTS,
  generateVerificationCode,
  hashVerificationCode,
  isVerificationCodeExpired,
  looksLikeVerificationCode,
  verificationCodeExpiry,
  verificationCodeMatches,
} from '../lib/email-verification';
import { isSesConfigured, sendViaSes } from '../lib/ses-sender';

/** Short enough to be an address, long enough for the longest real ones. */
const MAX_RECOVERY_EMAIL_LENGTH = 254;

/* Deliberately simple: it rejects typos like "a@b" and accepts everything a
   stricter RFC grammar would plus IDNs; the mailbox, not the regex, proves an
   address. Stricter here would invent rejections for valid mailboxes. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const looksLikeEmail = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.trim().length <= MAX_RECOVERY_EMAIL_LENGTH &&
  EMAIL_SHAPE.test(value.trim());

export const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const RECOVERY_VERIFY_SUBJECT = 'Confirm your QuantMail recovery email';

const recoveryVerifyText = (code: string): string =>
  [
    'Hi there,',
    '',
    'You asked to use this address as the recovery email for your QuantMail account.',
    'Enter this verification code to confirm you own it:',
    '',
    `    ${code}`,
    '',
    'The code expires in 15 minutes and can be used once. Until you confirm it,',
    'your current recovery email (if any) stays active. If you did not ask for',
    'this, ignore this email.',
    '',
    '— The QuantMail team',
  ].join('\n');

const recoveryVerifyHtml = (code: string): string =>
  `<p>Hi there,</p>
<p>You asked to use this address as the recovery email for your QuantMail account. Enter this verification code to confirm you own it:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:8px;font-family:monospace;">${code}</p>
<p>The code expires in 15 minutes and can be used once. Until you confirm it, your current recovery email (if any) stays active. If you did not ask for this, ignore this email.</p>
<p>— The QuantMail team</p>`;

/**
 * Dispatch the destination-verification code to the NEW address. Returns true
 * only when SES accepted the message — the caller must answer honestly either
 * way, because "verification email sent" would be the same lie "reset
 * instructions sent" was before SES production access went live.
 */
const sendRecoveryVerificationEmail = async (to: string, code: string): Promise<boolean> => {
  if (!isSesConfigured()) {
    console.error('[account-recovery] SES is not configured; no verification code was sent to', to);
    return false;
  }
  try {
    await sendViaSes({
      from: process.env['VERIFICATION_EMAIL_FROM'] ?? 'QuantMail <no-reply@quantmail.in>',
      to: [to],
      subject: RECOVERY_VERIFY_SUBJECT,
      bodyText: recoveryVerifyText(code),
      bodyHtml: recoveryVerifyHtml(code),
    });
    return true;
  } catch (error) {
    console.error('[account-recovery] verification code delivery failed', error);
    return false;
  }
};

type PendingVerification = {
  id: string;
  email: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  usedAt: Date | null;
};

const latestPendingFor = async (userId: string): Promise<PendingVerification | null> => {
  const row = await prisma.recoveryEmailVerification.findFirst({
    where: { userId, usedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  return (row ?? null) as PendingVerification | null;
};

export async function accountRecoveryRoutes(fastify: FastifyInstance) {
  // ─── Read the current recovery address ──────────────────────────────────
  // Session-only: a read is not a sensitive mutation. `verified: false` on a
  // legacy #1254 row is the honest signal that the address is inert until
  // re-verified — it is not hidden, because the owner must know to fix it.
  fastify.get('/auth/account/recovery-email', async (request, reply) => {
    const userId = authenticatedUserId(request);
    if (!userId) {
      return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { recoveryEmail: true, recoveryEmailVerifiedAt: true },
    });

    if (!user) {
      return fail(reply, 404, 'NOT_FOUND', 'Account not found.');
    }

    const pending = await latestPendingFor(userId);

    return reply.send({
      success: true,
      data: {
        recoveryEmail: user.recoveryEmail ?? null,
        verified: user.recoveryEmailVerifiedAt != null,
        pendingEmail: pending?.email ?? null,
      },
    });
  });

  // ─── Set / change the recovery address → PENDING until verified ──────────
  // Step-up guarded (CODEX-REVIEW 6241280732): a stolen but stale session must
  // not be able to redirect the recovery channel. Rate-limited like the
  // password-reset request: each accepted call mails a code to an address the
  // caller named, so an unbounded version is a mail bomb.
  fastify.put(
    '/auth/account/recovery-email',
    {
      preHandler: fastify.requireStepUp(),
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request);
      if (!userId) {
        return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const { email } = (request.body ?? {}) as { email?: unknown };

      // An absent field must NOT wipe a set address: a body of {} (or no body)
      // is a malformed request, not a clear. Clearing is explicit — null or a
      // blank string, the two shapes an emptied form field actually produces.
      if (email === undefined) {
        return fail(
          reply,
          400,
          'VALIDATION_ERROR',
          'Provide an email address to set, or null to remove your recovery email.',
        );
      }

      // Clearing is a sensitive mutation too: it runs behind the same
      // step-up boundary, and it drops any pending verification as well —
      // a pending code for an address the owner just removed must not stay
      // consumable.
      if (email === null || (typeof email === 'string' && email.trim() === '')) {
        await prisma.$transaction(async (tx: any) => {
          await tx.recoveryEmailVerification.deleteMany({ where: { userId } });
          await tx.user.update({
            where: { id: userId },
            data: { recoveryEmail: null, recoveryEmailVerifiedAt: null },
          });
        });
        return reply.send({
          success: true,
          data: { recoveryEmail: null, verified: false, pendingEmail: null },
        });
      }

      if (!looksLikeEmail(email)) {
        return fail(
          reply,
          400,
          'VALIDATION_ERROR',
          'Enter a valid email address, or clear the field to remove your recovery email.',
        );
      }
      const normalized = normalizeEmail(email);

      // A recovery address identical to the account's own inbox is not
      // out-of-band: the lockout this channel exists for leaves that inbox
      // unreachable, so accepting it would be a placebo.
      const account = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, recoveryEmail: true, recoveryEmailVerifiedAt: true },
      });
      if (account && normalizeEmail(account.email) === normalized) {
        return fail(
          reply,
          400,
          'RECOVERY_EMAIL_SAME_AS_ACCOUNT',
          'Your recovery email must be different from your QuantMail address — it is the out-of-band channel for when this inbox is unreachable.',
        );
      }

      // Idempotent re-submit: the verified address is already the channel —
      // minting another code would be code-spam to the owner's own mailbox.
      if (
        account?.recoveryEmail &&
        normalizeEmail(account.recoveryEmail) === normalized &&
        account.recoveryEmailVerifiedAt != null
      ) {
        return reply.send({
          success: true,
          data: {
            recoveryEmail: account.recoveryEmail,
            verified: true,
            pendingEmail: null,
            pendingVerification: false,
          },
        });
      }

      // Replace any earlier pending verification: one pending address per
      // user, so a stale code for a superseded address can never activate.
      const code = generateVerificationCode();
      const ip = typeof request.ip === 'string' ? request.ip : null;
      await prisma.$transaction(async (tx: any) => {
        await tx.recoveryEmailVerification.deleteMany({ where: { userId } });
        await tx.recoveryEmailVerification.create({
          data: {
            userId,
            email: normalized,
            codeHash: hashVerificationCode(code),
            expiresAt: verificationCodeExpiry(),
            requestedIp: ip,
          },
        });
      });

      // The code goes to the NEW address itself: a typo'd address degrades to
      // a code nobody can read, never to activation. The current recoveryEmail
      // (if any) is untouched until the code comes back verified.
      const codeDelivered = await sendRecoveryVerificationEmail(normalized, code);

      return reply.send({
        success: true,
        data: {
          recoveryEmail: account?.recoveryEmail ?? null,
          verified: account?.recoveryEmailVerifiedAt != null,
          pendingEmail: normalized,
          pendingVerification: true,
          codeDelivered,
        },
      });
    },
  );

  // ─── Consume the verification code → the pending address becomes THE channel
  // Step-up guarded for the same reason as the PUT: completing a recovery-
  // channel change is the sensitive mutation, not just starting it.
  fastify.post(
    '/auth/account/recovery-email/verify',
    {
      preHandler: fastify.requireStepUp(),
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request);
      if (!userId) {
        return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const { code } = (request.body ?? {}) as { code?: unknown };
      if (!looksLikeVerificationCode(code)) {
        return fail(
          reply,
          400,
          'VALIDATION_ERROR',
          'Enter the 6-digit code from the email we sent to the new address.',
        );
      }

      const pending = await latestPendingFor(userId);
      if (!pending) {
        return fail(
          reply,
          400,
          'NO_PENDING_VERIFICATION',
          'There is no address waiting for verification. Set a recovery email first.',
        );
      }
      if (pending.attempts >= MAX_VERIFICATION_ATTEMPTS) {
        return fail(
          reply,
          400,
          'VERIFICATION_ATTEMPTS_EXCEEDED',
          'Too many wrong codes. Set the recovery email again to get a new code.',
        );
      }
      if (isVerificationCodeExpired(pending.expiresAt)) {
        return fail(
          reply,
          400,
          'VERIFICATION_CODE_EXPIRED',
          'That code has expired. Set the recovery email again to get a new code.',
        );
      }
      if (!verificationCodeMatches(code, pending.codeHash)) {
        // Counted, not silent: 10^6 guesses minus the attempt cap is the
        // defense, and the client must know the guess failed honestly.
        await prisma.recoveryEmailVerification.update({
          where: { id: pending.id },
          data: { attempts: pending.attempts + 1 },
        });
        return fail(
          reply,
          400,
          'INVALID_VERIFICATION_CODE',
          'That code does not match. Check the email and try again.',
        );
      }

      // The destination proved ownership of the address: it becomes the
      // channel NOW. Only the recovery fields are written — 2FA, password,
      // and every other credential stay exactly as they were.
      const now = new Date();
      await prisma.$transaction(async (tx: any) => {
        await tx.user.update({
          where: { id: userId },
          data: { recoveryEmail: pending.email, recoveryEmailVerifiedAt: now },
        });
        await tx.recoveryEmailVerification.update({
          where: { id: pending.id },
          data: { usedAt: now },
        });
        await tx.recoveryEmailVerification.deleteMany({
          where: { userId, usedAt: null, id: { not: pending.id } },
        });
      });

      return reply.send({
        success: true,
        data: { recoveryEmail: pending.email, verified: true, pendingEmail: null },
      });
    },
  );
}
