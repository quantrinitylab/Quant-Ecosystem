/**
 * 2FA recovery for the both-factors-lost lockout (fix/qm-2fa-recovery-flow).
 *
 * The finding this fixes (queue 2026-10-17, P1 competitor-gap): losing the
 * authenticator AND the backup codes meant permanent lockout. The one correct
 * hardening — password reset never clears 2FA (password-reset.ts deliberately
 * omits twoFactorEnabled/twoFactorSecret from its update, and issues no
 * session) — left the user with no path back in. Google re-verifies identity
 * via the recovery channel for locked-out 2SV users; QuantMail's recoveryEmail
 * (migration 0091) was stored and cleared but no flow consumed it.
 *
 * What is here instead: a dedicated recovery channel through the VERIFIED
 * recovery email only (migration 0102's verified/pending lifecycle from PR
 * #1301). Two endpoints, both public, both behind the trusted-origin gate:
 *
 *   POST /auth/2fa/recover
 *     { email } → ALWAYS the same non-committal 200. Only when the account
 *     exists, has 2FA actually on, and holds a VERIFIED recovery address does
 *     the server mint a fresh single-use, 15-minute-bounded, attempt-capped
 *     challenge and mail the code to that verified address. Unknown
 *     addresses, 2FA-off accounts, and unverified/legacy recovery rows get
 *     nothing — and the response says nothing about which of those applied,
 *     so the endpoint is not an account-existence oracle.
 *
 *   POST /auth/2fa/recover/confirm
 *     { email, password, code } → re-proves the password AND consumes the
 *     challenge code, and ONLY THEN disables the TOTP secret, burns every
 *     backup code, revokes every live session, writes an audit row, and
 *     notifies the primary inbox. Disabling TOTP is an explicit,
 *     separately-confirmed action here — never a side effect of password
 *     reset, and no session is issued (the owner signs in again with the
 *     password and re-enrols a fresh authenticator through the normal
 *     /auth/2fa/setup + /auth/2fa/enable flow behind a fresh session).
 *
 * Deliberately no SMS/phone OTP: the product has no phone OTP infra and the
 * locked design removed phone login/OTP; recovery is email only.
 */

/* eslint-disable no-console */

import { FastifyInstance } from 'fastify';
import prisma from '@quant/auth/lib/prisma';
import * as argon2 from 'argon2';
import { fail, requireTrustedOrigin } from '../lib/auth-session';
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
import { looksLikeEmail, normalizeEmail } from './account-recovery';

/** The one answer the request endpoint ever gives — it says nothing about
 *  who has an account, who has 2FA on, or who holds a verified address. */
const NON_COMMITTAL = {
  success: true as const,
  data: {
    message:
      'If an account exists with that address, has two-factor authentication on, and has a verified recovery email, a recovery code has been sent to the recovery address.',
  },
};

const RECOVERY_CODE_SUBJECT = 'Recover your QuantMail two-factor authentication';

const recoveryCodeText = (code: string): string =>
  [
    'Hi there,',
    '',
    'Someone asked to reset the two-factor authentication on the QuantMail account',
    'that uses this address for recovery. If that was you, enter this code:',
    '',
    `    ${code}`,
    '',
    'The code expires in 15 minutes, can be used once, and only works together',
    'with your account password. Until you enter it, nothing changes.',
    'If you did not ask for this, ignore this email — your sign-in is unchanged.',
    '',
    '— The QuantMail team',
  ].join('\n');

const recoveryCodeHtml = (code: string): string =>
  `<p>Hi there,</p>
<p>Someone asked to reset the two-factor authentication on the QuantMail account that uses this address for recovery. If that was you, enter this code:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:8px;font-family:monospace;">${code}</p>
<p>The code expires in 15 minutes, can be used once, and only works together with your account password. Until you enter it, nothing changes. If you did not ask for this, ignore this email — your sign-in is unchanged.</p>
<p>— The QuantMail team</p>`;

const RESET_NOTIFICATION_SUBJECT = 'Your QuantMail two-factor authentication was turned off';

const resetNotificationText = (): string =>
  [
    'Hi there,',
    '',
    'The two-factor authentication on your QuantMail account was just turned off',
    'through the recovery email flow. Every recovery code was burned and all',
    'signed-in sessions were revoked.',
    '',
    'If this was you: sign in with your password and set up a new authenticator',
    'app in Settings → Security as soon as you can.',
    '',
    'If this was NOT you: someone with your password and access to your recovery',
    'email did this. Change your password immediately from the sign-in screen',
    '("Forgot password") and contact support.',
    '',
    '— The QuantMail team',
  ].join('\n');

const resetNotificationHtml = (): string =>
  `<p>Hi there,</p>
<p>The two-factor authentication on your QuantMail account was just turned off through the recovery email flow. Every recovery code was burned and all signed-in sessions were revoked.</p>
<p>If this was you: sign in with your password and set up a new authenticator app in Settings → Security as soon as you can.</p>
<p>If this was NOT you: someone with your password and access to your recovery email did this. Change your password immediately from the sign-in screen ("Forgot password") and contact support.</p>
<p>— The QuantMail team</p>`;

/** A malformed stored hash makes argon2 throw; that is a failed check, not a 500. */
async function passwordMatches(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * The fields /auth/2fa/* reads to decide "2FA is actually on". A flag without
 * a secret is the state the old enrolment bug left accounts in; recovery must
 * not offer to "reset" what was never armed.
 */
const twoFactorArmed = (user: {
  twoFactorEnabled?: boolean | null;
  twoFactorSecret?: string | null;
}): boolean => Boolean(user.twoFactorEnabled && user.twoFactorSecret);

/** Only a VERIFIED recovery address is the channel. Legacy #1254 rows
 *  (address set, never verified) are inert — exactly as in password-reset. */
const hasVerifiedRecoveryEmail = (user: {
  recoveryEmail?: string | null;
  recoveryEmailVerifiedAt?: Date | string | null;
}): boolean =>
  typeof user.recoveryEmail === 'string' &&
  user.recoveryEmail.trim().length > 0 &&
  user.recoveryEmailVerifiedAt != null;

type RecoveryChallenge = {
  id: string;
  userId: string;
  email: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  usedAt: Date | null;
};

const latestPendingChallenge = async (userId: string): Promise<RecoveryChallenge | null> => {
  const row = await prisma.twoFactorRecoveryChallenge.findFirst({
    where: { userId, usedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  return (row ?? null) as RecoveryChallenge | null;
};

const sendRecoveryCodeEmail = async (to: string, code: string): Promise<boolean> => {
  if (!isSesConfigured()) {
    console.error('[two-factor-recovery] SES is not configured; no recovery code was sent to', to);
    return false;
  }
  try {
    await sendViaSes({
      from: process.env['VERIFICATION_EMAIL_FROM'] ?? 'QuantMail <no-reply@quantmail.in>',
      to: [to],
      subject: RECOVERY_CODE_SUBJECT,
      bodyText: recoveryCodeText(code),
      bodyHtml: recoveryCodeHtml(code),
    });
    return true;
  } catch (error) {
    console.error('[two-factor-recovery] recovery code delivery failed', error);
    return false;
  }
};

/**
 * Notify the PRIMARY inbox that 2FA was reset through the recovery flow.
 * The owner may be reading this later (they were locked out), but it is the
 * record an account-takeover victim needs: the honest Gmail-style signal.
 */
const notifyPrimaryInbox = async (to: string): Promise<boolean> => {
  if (!isSesConfigured()) {
    console.error(
      '[two-factor-recovery] SES is not configured; no reset notification was sent to',
      to,
    );
    return false;
  }
  try {
    await sendViaSes({
      from: process.env['VERIFICATION_EMAIL_FROM'] ?? 'QuantMail <no-reply@quantmail.in>',
      to: [to],
      subject: RESET_NOTIFICATION_SUBJECT,
      bodyText: resetNotificationText(),
      bodyHtml: resetNotificationHtml(),
    });
    return true;
  } catch (error) {
    console.error('[two-factor-recovery] reset notification delivery failed', error);
    return false;
  }
};

export async function twoFactorRecoveryRoutes(fastify: FastifyInstance) {
  // ─── Ask for a recovery challenge (public) ────────────────────────────────
  // Rate-limited like the password-reset request: each accepted call sends
  // mail to an address the caller named, so an unbounded version is a mail
  // bomb. The mail is fire-and-forget, exactly like password-reset's: neither
  // the body nor the latency may say who has an account.
  fastify.post(
    '/auth/2fa/recover',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      if (!requireTrustedOrigin(request, reply)) return;

      const { email } = (request.body ?? {}) as { email?: unknown };
      if (!looksLikeEmail(email)) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'Enter the address on your account.');
      }
      const normalized = normalizeEmail(email);

      const user = (await prisma.user.findFirst({
        where: {
          email: { equals: normalized, mode: 'insensitive' },
          deletedAt: null,
        },
      })) as
        | {
            id: string;
            email: string;
            twoFactorEnabled?: boolean | null;
            twoFactorSecret?: string | null;
            recoveryEmail?: string | null;
            recoveryEmailVerifiedAt?: Date | string | null;
          }
        | null;

      // Only when the account is genuinely in the both-factors-lost state with
      // a usable channel does anything happen. Every other case — unknown
      // address, 2FA off, no recovery email, or a legacy unverified address —
      // gets the same non-committal 200.
      if (user && twoFactorArmed(user) && hasVerifiedRecoveryEmail(user)) {
        const recoveryAddress = normalizeEmail(user.recoveryEmail as string);
        const code = generateVerificationCode();
        const ip = typeof request.ip === 'string' ? request.ip : null;

        // One live challenge per account: a superseded pending would otherwise
        // let two mailed codes race, and the older mail's code would be a
        // dead end the user cannot distinguish from a typo.
        await prisma.$transaction(async (tx: any) => {
          await tx.twoFactorRecoveryChallenge.deleteMany({
            where: { userId: user.id, usedAt: null },
          });
          await tx.twoFactorRecoveryChallenge.create({
            data: {
              userId: user.id,
              email: recoveryAddress,
              codeHash: hashVerificationCode(code),
              expiresAt: verificationCodeExpiry(),
              requestedIp: ip,
            },
          });
        });

        // The code goes ONLY to the verified recovery address — never to the
        // primary inbox. The primary inbox is exactly what is unreachable in
        // this lockout; mailing the code there is a placebo that leaks a
        // live code into a mailbox the scenario says the owner cannot open.
        sendRecoveryCodeEmail(recoveryAddress, code).catch(() => {
          /* delivery failure is logged inside; the response stays non-committal */
        });
      }

      return reply.send(NON_COMMITTAL);
    },
  );

  // ─── Confirm: password + code → 2FA off (public) ──────────────────────────
  // This is the explicitly-confirmed TOTP reset the finding demands. It is a
  // separate action from password reset, behind its own challenge, and it
  // never weakens the password-reset hardening: password-reset.ts is
  // untouched and still never clears 2FA.
  fastify.post(
    '/auth/2fa/recover/confirm',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      if (!requireTrustedOrigin(request, reply)) return;

      const { email, password, code } = (request.body ?? {}) as {
        email?: unknown;
        password?: unknown;
        code?: unknown;
      };
      if (!looksLikeEmail(email)) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'Enter the address on your account.');
      }
      if (typeof password !== 'string' || password.length === 0) {
        return fail(
          reply,
          400,
          'VALIDATION_ERROR',
          'Your current password is required to reset two-factor authentication.',
        );
      }
      if (!looksLikeVerificationCode(code)) {
        return fail(
          reply,
          400,
          'VALIDATION_ERROR',
          'Enter the 6-digit recovery code from your recovery email.',
        );
      }
      const normalized = normalizeEmail(email);

      const user = (await prisma.user.findFirst({
        where: {
          email: { equals: normalized, mode: 'insensitive' },
          deletedAt: null,
        },
      })) as
        | {
            id: string;
            email: string;
            passwordHash: string;
            twoFactorEnabled?: boolean | null;
            twoFactorSecret?: string | null;
            recoveryEmail?: string | null;
            recoveryEmailVerifiedAt?: Date | string | null;
          }
        | null;

      // Missing account and wrong password are one answer: the password is a
      // second factor of this flow, and distinguishing them would let a caller
      // with a leaked recovery mailbox probe which addresses have accounts.
      if (!user || !(await passwordMatches(user.passwordHash, password))) {
        return fail(reply, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
      }

      // The caller HAS the password here, so these answers do not enumerate:
      // they describe the account the caller just proved ownership-adjacent
      // knowledge of.
      if (!twoFactorArmed(user)) {
        return fail(
          reply,
          409,
          'TWO_FACTOR_NOT_ENABLED',
          'Two-factor authentication is not on for this account — there is nothing to recover.',
        );
      }
      if (!hasVerifiedRecoveryEmail(user)) {
        return fail(
          reply,
          409,
          'NO_VERIFIED_RECOVERY_EMAIL',
          'This account has no verified recovery email. Recovery codes and the authenticator are the way back in — contact support.',
        );
      }

      const challenge = await latestPendingChallenge(user.id);
      if (!challenge) {
        return fail(
          reply,
          400,
          'NO_PENDING_RECOVERY',
          'No recovery code has been requested for this account. Start recovery first.',
        );
      }
      if (challenge.attempts >= MAX_VERIFICATION_ATTEMPTS) {
        return fail(
          reply,
          400,
          'RECOVERY_ATTEMPTS_EXCEEDED',
          'Too many wrong codes. Start recovery again to get a new code.',
        );
      }
      if (isVerificationCodeExpired(challenge.expiresAt)) {
        return fail(
          reply,
          400,
          'RECOVERY_CODE_EXPIRED',
          'That recovery code has expired. Start recovery again to get a new code.',
        );
      }
      // The channel may have moved since the code was mailed (the owner set a
      // new recovery address behind a fresh session). A code mailed to the old
      // address is inert — it must never reset 2FA on the strength of an
      // address that is no longer the channel.
      if (normalizeEmail(user.recoveryEmail as string) !== challenge.email) {
        return fail(
          reply,
          400,
          'RECOVERY_CHANNEL_CHANGED',
          'Your recovery email changed after this code was sent. Start recovery again.',
        );
      }
      if (!verificationCodeMatches(code as string, challenge.codeHash)) {
        await prisma.twoFactorRecoveryChallenge.update({
          where: { id: challenge.id },
          data: { attempts: challenge.attempts + 1 },
        });
        return fail(
          reply,
          400,
          'INVALID_RECOVERY_CODE',
          'That recovery code does not match. Check the email and try again.',
        );
      }

      const now = new Date();
      const ip = typeof request.ip === 'string' ? request.ip : null;
      const userAgent =
        typeof request.headers?.['user-agent'] === 'string'
          ? (request.headers['user-agent'] as string)
          : null;

      // The explicitly-confirmed TOTP reset: clear the secret and its
      // enrolment state, burn every backup code, revoke every live session,
      // and burn the challenge — one atomic unit, so a failure cannot leave
      // 2FA half-cleared with live backup codes still floating around.
      // Whoever asked for this is very likely the person who tripped the
      // lockout guessing at credentials, so the failed-login counters reset
      // too (mirrors password-reset.ts).
      await prisma.$transaction(async (tx: any) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            twoFactorEnabled: false,
            twoFactorSecret: null,
            twoFactorPendingSecret: null,
            twoFactorConfirmedAt: null,
            twoFactorLastUsedStep: null,
            failedLoginAttempts: 0,
            lockoutUntil: null,
          },
        });
        await tx.twoFactorBackupCode.deleteMany({ where: { userId: user.id } });
        await tx.refreshToken.updateMany({
          where: { userId: user.id },
          data: { isRevoked: true },
        });
        await tx.twoFactorRecoveryChallenge.update({
          where: { id: challenge.id },
          data: { usedAt: now },
        });
      });

      // The audit row and the primary-inbox notification are best-effort
      // outside the transaction: the security action is complete either way,
      // and a notification failure must not roll back a completed recovery.
      try {
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'TWO_FACTOR_RECOVERY_CONFIRMED',
            resource: 'user',
            resourceId: user.id,
            metadata: {
              channel: 'verified-recovery-email',
              challengeId: challenge.id,
            },
            ip,
            userAgent,
            timestamp: now,
            createdAt: now,
          },
        });
      } catch (error) {
        console.error('[two-factor-recovery] audit log write failed', error);
      }

      const notifiedPrimaryInbox = await notifyPrimaryInbox(user.email);

      return reply.send({
        success: true,
        data: {
          message:
            'Two-factor authentication is off. Sign in with your password, then set up a new authenticator in Settings → Security.',
          notifiedPrimaryInbox,
        },
      });
    },
  );
}
