/**
 * Working password reset.
 *
 * What this replaces: `POST /auth/password-reset` answered "If an account exists
 * with that address, reset instructions have been sent." and sent nothing — the
 * handler's entire body was that sentence. `POST /auth/password-reset/confirm`
 * answered 501. The forgot-password screen has been fully built and fully
 * non-functional, which is worse than absent: someone locked out of their mail
 * waits for a message that was never going to arrive.
 *
 * What is here instead: a 256-bit link stored only as a digest, single-use under
 * concurrency, hour-bounded, mailed through SES, and a confirm that revokes
 * every live session on success.
 *
 * Two properties are deliberate and easy to break later:
 *   1. The request endpoint answers identically whether or not the address
 *      exists, and does not wait for SES, so neither the body nor the latency
 *      says who has an account.
 *   2. A reset never touches the second factor and never issues a session. Both
 *      would turn "I control this mailbox" into a 2FA bypass.
 */

import { FastifyInstance } from 'fastify';
import prisma from '@quant/auth/lib/prisma';
import * as argon2 from 'argon2';
import { fail, requireTrustedOrigin } from '../lib/auth-session';
import {
  generateResetToken,
  hashResetToken,
  isResetTokenExpired,
  looksLikeResetToken,
  passwordComplaint,
  resetTokenExpiry,
  resetUrl,
  sendPasswordResetEmail,
} from '../lib/password-reset';

/** The one answer the request endpoint ever gives. */
const NON_COMMITTAL = {
  success: true as const,
  data: {
    message: 'If an account exists with that address, reset instructions have been sent.',
  },
};

export async function passwordResetRoutes(fastify: FastifyInstance) {
  // ─── Request a link ───────────────────────────────────────────────────────
  // Rate-limited harder than login: each accepted call sends mail to an address
  // the caller named, so an unbounded version is a mail bomb aimed at someone
  // else's inbox and a way to burn the domain's sending reputation.
  fastify.post(
    '/auth/password-reset',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      if (!requireTrustedOrigin(request, reply)) return;
      const { email } = (request.body ?? {}) as { email?: unknown };

      // Shape, not existence: refusing a missing field says nothing about who
      // has an account, and answering "sent" to an empty body would be a lie
      // with no recipient.
      if (typeof email !== 'string' || !email.trim()) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'Enter the address on your account.');
      }
      const normalized = email.trim().toLowerCase();

      // Case-insensitive because people capitalise their own address; the mail
      // still goes to the stored spelling.
      const user = await prisma.user.findFirst({
        where: {
          email: { equals: normalized, mode: 'insensitive' },
          deletedAt: null,
        },
      });

      if (user) {
        // One live link per account. Without this, repeated requests leave a
        // pile of simultaneously-valid links and the oldest mail in a
        // compromised mailbox stays usable.
        await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });

        const token = generateResetToken();
        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashResetToken(token),
            expiresAt: resetTokenExpiry(),
            requestedIp: typeof request.ip === 'string' ? request.ip : null,
          },
        });

        // Not awaited: an SES round trip would make a real address answer
        // measurably slower than an unknown one, which is the enumeration
        // signal the wording above exists to avoid. The sender logs its own
        // failures and never throws, so this cannot become an unhandled
        // rejection.
        void sendPasswordResetEmail({
          to: user.email,
          url: resetUrl(token),
          name: user.displayName ?? user.username ?? null,
        });
      }

      return reply.send(NON_COMMITTAL);
    },
  );

  // ─── Spend a link ─────────────────────────────────────────────────────────
  fastify.post(
    '/auth/password-reset/confirm',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      if (!requireTrustedOrigin(request, reply)) return;
      const { token, newPassword } = (request.body ?? {}) as {
        token?: unknown;
        newPassword?: unknown;
      };

      if (!looksLikeResetToken(token)) {
        return fail(
          reply,
          400,
          'INVALID_TOKEN',
          'That reset link is not valid. Request a new one from the sign-in screen.',
        );
      }

      // The password is judged before the link is spent. The other order means a
      // rejected password burns the only link the person has, and they get to
      // read the rule after it stops being useful to them.
      const complaint = passwordComplaint(newPassword);
      if (complaint) {
        return fail(reply, 400, 'WEAK_PASSWORD', complaint);
      }

      const row = await prisma.passwordResetToken.findUnique({
        where: { tokenHash: hashResetToken(token) },
      });

      if (!row) {
        return fail(
          reply,
          400,
          'INVALID_TOKEN',
          'That reset link is not valid. Request a new one from the sign-in screen.',
        );
      }
      if (row.usedAt || isResetTokenExpired(row.expiresAt)) {
        return fail(
          reply,
          400,
          'RESET_LINK_EXPIRED',
          'This reset link has already been used or has expired. Request a new one.',
        );
      }

      // Single use, decided by the database rather than by the check above: two
      // confirms racing on the same link both pass that check, and exactly one
      // of them updates a row still matching `usedAt: null`.
      const spent = await prisma.passwordResetToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if ((spent?.count ?? 0) === 0) {
        return fail(
          reply,
          400,
          'RESET_LINK_EXPIRED',
          'This reset link has already been used or has expired. Request a new one.',
        );
      }

      const user = await prisma.user.findUnique({ where: { id: row.userId } });
      if (!user) {
        // The account went away between the mail and the click.
        return fail(
          reply,
          400,
          'INVALID_TOKEN',
          'That reset link is not valid. Request a new one from the sign-in screen.',
        );
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await argon2.hash(newPassword as string),
          // Whoever reset the password is very likely the person who tripped the
          // lockout guessing at the old one. Leaving it armed means a successful
          // reset still ends at "too many attempts".
          failedLoginAttempts: 0,
          lockoutUntil: null,
          // Deliberately absent: twoFactorEnabled and twoFactorSecret. Control
          // of a mailbox is not the second factor, and clearing it here would
          // make every 2FA account resettable down to one factor by mail.
        },
      });

      // Anything already signed in as this account loses its session. A reset is
      // the answer to "someone else may be in here", so the rotation families
      // minted before it must not survive it.
      await prisma.refreshToken.updateMany({
        where: { userId: user.id },
        data: { isRevoked: true },
      });

      // Any other link that was still live is now dead too.
      await prisma.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      });

      // No session is issued here on purpose: a token that arrived by mail must
      // not hand back credentials, or a mailbox becomes a way past the second
      // factor. The new password goes through the front door like any other.
      return reply.send({
        success: true,
        data: { message: 'Password updated. Sign in with your new password.' },
      });
    },
  );
}
