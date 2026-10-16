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
 * concurrency (issuance is linearized — burn+create in one transaction, so a
 * concurrent request cannot kill another's just-mailed link; plus a partial
 * unique index on live tokens per user, migration 0097, which closes the
 * empty-snapshot race the transaction alone cannot), hour-bounded,
 * mailed through SES, and a confirm that revokes every live session on
 * success.
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
    message:
      "If an account exists with that address, reset instructions have been sent to the account's email — and to its recovery email, if one was set.",
  },
};

// Sentinel thrown inside the password-reset request transaction when a
// concurrent request burned one of this request's snapshot rows between the
// snapshot read and the burn — caught below, never escapes as a 500. The
// loser answers the same non-committal 200 WITHOUT any email going out, so
// no inbox ever receives a link that is already dead, and the loser path
// reveals nothing about whether the address exists (only an existing
// address can lose a race, so a distinct status here would be an
// enumeration oracle).
const RESET_REQUEST_SUPERSEDED = Symbol('reset-request-superseded');

/**
 * Prisma unique-constraint violation (P2002), duck-typed on `code` — the
 * convention used by routes/auth.ts (register) and booking-link.service.ts,
 * so this works without importing the generated client.
 *
 * CODEX-REVIEW 6167000384 corrective on merged PR #1151: the
 * in-transaction compare-and-set closes the issuance race only when the
 * snapshot is non-empty. Two concurrent requests with EMPTY snapshots both
 * pass 0===0 and both reach the create under READ COMMITTED. Migration 0097
 * adds the partial unique index
 * password_reset_tokens_user_live_unique(userId) WHERE usedAt IS NULL, so
 * the loser's create blocks on the index until the winner commits and then
 * fails P2002. Mapping it onto the superseded-loser path keeps the
 * invariant — one winner, one live link, one email.
 *
 * The only other unique constraint on this table is tokenHash (256-bit);
 * a collision there is not a plausible P2002 source, and answering
 * non-committally is still the safe, non-enumerating response.
 */
function isUniqueConstraintViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

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
        // One live link per account: without the burn, repeated requests
        // leave a pile of simultaneously-valid links and the oldest mail in a
        // compromised mailbox stays usable.
        //
        // The burn and the create must be atomic. As sequential awaits they
        // interleave (A burns, A creates L1, B burns L1, B creates L2) and the
        // link in A's just-sent email is already dead — the user clicks a
        // seconds-old link and gets RESET_LINK_EXPIRED.
        //
        // Linearization, same style as the resend-verification fix (PR
        // #1045): inside one transaction, snapshot the links live when THIS
        // request began, delete exactly that snapshot with a compare-and-set
        // ({ id: { in: ids }, usedAt: null }), and require the deleted count
        // to match the snapshot size. A sibling request still in flight has
        // its create uncommitted, hence invisible to the snapshot — a request
        // can never delete a link whose email is still being sent. A loser
        // fails BEFORE any email goes out: one winner, one live link, one
        // email — a just-mailed link never arrives dead.
        //
        // Second layer (CODEX-REVIEW 6167000384 corrective on #1151): the
        // compare-and-set only serializes when the snapshot is NON-empty.
        // Two concurrent requests with EMPTY snapshots both pass 0===0 and
        // both reach the create under READ COMMITTED. Migration 0097's
        // partial unique index (userId) WHERE usedAt IS NULL closes that
        // hole: the loser's create blocks on the index until the winner
        // commits, then fails P2002, which is mapped to the same
        // superseded-loser path below.
        const token = generateResetToken();
        try {
          await prisma.$transaction(async (tx: any) => {
            const live = await tx.passwordResetToken.findMany({
              where: { userId: user.id, usedAt: null },
              select: { id: true },
            });
            const burned = await tx.passwordResetToken.deleteMany({
              where: { id: { in: live.map((row: any) => row.id) }, usedAt: null },
            });
            if (burned.count !== live.length) {
              throw RESET_REQUEST_SUPERSEDED;
            }
            await tx.passwordResetToken.create({
              data: {
                userId: user.id,
                tokenHash: hashResetToken(token),
                expiresAt: resetTokenExpiry(),
                requestedIp: typeof request.ip === 'string' ? request.ip : null,
              },
            });
          });
        } catch (err) {
          // A sibling won the race — either it burned one of this request's
          // snapshot rows (RESET_REQUEST_SUPERSEDED) or both snapshots were
          // empty and this request's create lost on the partial unique index
          // (P2002; CODEX-REVIEW 6167000384 on #1151). Its email carries the
          // live link. Answering "sent" is honest — the account's mailbox did
          // get a working link from this burst of requests.
          if (err === RESET_REQUEST_SUPERSEDED || isUniqueConstraintViolation(err)) {
            return reply.send(NON_COMMITTAL);
          }
          throw err;
        }

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

        // The out-of-band channel (migration 0091, routes/account-recovery.ts):
        // the SAME link is mailed to the recovery address too when one is set.
        // The primary inbox is unreachable in exactly the lockout this endpoint
        // exists for (forgot password + no active session); without this, the
        // reset is a dead letter in a mailbox the person cannot open. Still
        // non-committal: the response never says whether the address exists or
        // whether a recovery email was set, and the fire-and-forget send adds
        // no timing signal either way.
        const recoveryEmail = user.recoveryEmail;
        if (typeof recoveryEmail === 'string' && recoveryEmail.trim()) {
          void sendPasswordResetEmail({
            to: recoveryEmail.trim(),
            url: resetUrl(token),
            name: user.displayName ?? user.username ?? null,
          });
        }
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
