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
 * Two endpoints, both behind the session check below (NOT public): changing
 * the recovery address requires an authenticated session, the same posture as
 * changing the password. The forgot-password path that *consumes* it —
 * POST /auth/password-reset mailing the link to the recovery address too — is
 * the unauthenticated one by design (routes/password-reset.ts).
 *
 * What is deliberately NOT here: SMS/phone OTP. The product has no phone OTP
 * infra and the locked design removed phone login/OTP; recovery is email only.
 *
 * On the residual risk of an unverified address: setting it requires the
 * session, and the reset link is ALWAYS mailed to the primary inbox as well —
 * a silently-added recovery address cannot be used without the account owner
 * seeing reset mail in their own inbox. A typo'd address degrades gracefully:
 * the primary copy still arrives.
 */

/* eslint-disable no-console */

import { FastifyInstance } from 'fastify';
import prisma from '@quant/auth/lib/prisma';
import { authenticatedUserId, fail } from '../lib/auth-session';

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

export async function accountRecoveryRoutes(fastify: FastifyInstance) {
  // ─── Read the current recovery address ──────────────────────────────────
  fastify.get('/auth/account/recovery-email', async (request, reply) => {
    const userId = authenticatedUserId(request);
    if (!userId) {
      return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { recoveryEmail: true },
    });

    if (!user) {
      return fail(reply, 404, 'NOT_FOUND', 'Account not found.');
    }

    return reply.send({
      success: true,
      data: { recoveryEmail: user.recoveryEmail ?? null },
    });
  });

  // ─── Set / change / clear the recovery address ──────────────────────────
  fastify.put('/auth/account/recovery-email', async (request, reply) => {
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
    if (email === null || (typeof email === 'string' && email.trim() === '')) {
      await prisma.user.update({ where: { id: userId }, data: { recoveryEmail: null } });
      return reply.send({ success: true, data: { recoveryEmail: null } });
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
      select: { email: true },
    });
    if (account && normalizeEmail(account.email) === normalized) {
      return fail(
        reply,
        400,
        'RECOVERY_EMAIL_SAME_AS_ACCOUNT',
        'Your recovery email must be different from your QuantMail address — it is the out-of-band channel for when this inbox is unreachable.',
      );
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { recoveryEmail: normalized },
      select: { recoveryEmail: true },
    });

    return reply.send({
      success: true,
      data: { recoveryEmail: updated.recoveryEmail ?? null },
    });
  });
}
