/**
 * Real TOTP two-factor authentication.
 *
 * What this replaces: `/auth/2fa/setup` generated a secret, showed it to the
 * user, stored nothing, and shipped the `otpauth://` URI — which *contains that
 * secret* — to `api.qrserver.com` to have a QR drawn. `/auth/2fa/enable` then
 * accepted the secret back from the client and "verified" the code with
 * `/^\d{6}$/`, swallowing any database failure so it always answered success.
 * `/auth/login` never read the flag it set.
 *
 * What is here instead: the server keeps the secret it issued, verifies against
 * that secret and no other, refuses a code it has already accepted, hands out
 * hashed single-use recovery codes, and gates login behind a short-lived
 * challenge. Every rejection is a distinct code for the UI and a distinct
 * sentence for the user, because "that didn't work" is how people end up locked
 * out of their own mail.
 */

import { FastifyInstance } from 'fastify';
import prisma from '@quant/auth/lib/prisma';
import * as argon2 from 'argon2';
import {
  authenticatedUserId,
  createTokenService,
  fail,
  issueBrowserSession,
  requireTrustedOrigin,
} from '../lib/auth-session';
import {
  BACKUP_CODE_COUNT,
  digestsMatch,
  generateBackupCodes,
  hashBackupCode,
  isTotpStepReplayed,
  looksLikeBackupCode,
  looksLikeTotpCode,
  otpauthUri,
  totpReplayFloorAfter,
  totpStepFor,
  verifyTwoFactorChallenge,
} from '../lib/two-factor';

const ISSUER = 'QuantMail';

/**
 * The subset of `User` this module touches. Written out rather than inferred
 * because `backend/types/prisma-stub.d.ts` describes `User` without any of
 * these columns, so the alternative is `any` everywhere and no compiler help at
 * all inside the handlers.
 */
interface TwoFactorUser {
  id: string;
  email: string;
  username: string;
  displayName?: string | null;
  role: string;
  passwordHash: string;
  twoFactorEnabled?: boolean | null;
  twoFactorSecret?: string | null;
  twoFactorPendingSecret?: string | null;
  twoFactorConfirmedAt?: Date | string | null;
  twoFactorLastUsedStep?: number | null;
}

const loadUser = async (userId: string): Promise<TwoFactorUser | null> =>
  (await prisma.user.findUnique({ where: { id: userId } })) as TwoFactorUser | null;

/**
 * Deferred so importing this module never pulls the shared auth package (and
 * its otplib dependency) into a cold start that may not need it — the same
 * reason `routes/auth.ts` reached for it dynamically.
 */
const totp = async () => (await import('@quant/auth')).totpService;

/** A malformed stored hash makes argon2 throw; that is a failed check, not a 500. */
async function passwordMatches(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Replace every recovery code with a fresh batch, returning the plaintext for
 * the one and only time it will exist outside the user's own notes.
 */
async function issueBackupCodes(userId: string): Promise<string[]> {
  const codes = generateBackupCodes(BACKUP_CODE_COUNT);
  await prisma.twoFactorBackupCode.deleteMany({ where: { userId } });
  await prisma.twoFactorBackupCode.createMany({
    data: codes.map((code) => ({ userId, codeHash: hashBackupCode(code) })),
  });
  return codes;
}

/**
 * Spend one recovery code. The match is found in application code with a
 * constant-time digest comparison rather than a `where: { codeHash }` lookup so
 * the query plan cannot leak by timing, and the write is an `updateMany` scoped
 * to `usedAt: null` so two simultaneous uses of the same code produce one
 * winner: the loser updates zero rows and is rejected.
 */
async function consumeBackupCode(userId: string, code: string): Promise<boolean> {
  const digest = hashBackupCode(code);
  const rows = (await prisma.twoFactorBackupCode.findMany({
    where: { userId, usedAt: null },
  })) as Array<{ id: string; codeHash: string }>;

  const match = rows.find((row) => digestsMatch(row.codeHash, digest));
  if (!match) return false;

  const result = (await prisma.twoFactorBackupCode.updateMany({
    where: { id: match.id, usedAt: null },
    data: { usedAt: new Date() },
  })) as { count?: number } | null;

  return (result?.count ?? 0) > 0;
}

export async function twoFactorRoutes(fastify: FastifyInstance) {
  const tokenService = createTokenService();

  // ─── Enrolment: hand out a secret and remember it ──────────────────────────
  fastify.post(
    '/auth/2fa/setup',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = authenticatedUserId(request);
      if (!userId) return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');

      const user = await loadUser(userId);
      if (!user) return fail(reply, 404, 'USER_NOT_FOUND', 'User not found.');

      if (user.twoFactorEnabled && user.twoFactorSecret) {
        return fail(
          reply,
          409,
          'ALREADY_ENABLED',
          'Two-factor authentication is already on. Turn it off first to enrol a different authenticator.',
        );
      }

      const secret = (await totp()).generateSecret();

      // Pending, not active: until a code proves the authenticator holds this
      // secret, enabling would only mean the server had written a flag.
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorPendingSecret: secret },
      });

      // The URI is built and returned here for the client to render locally. It
      // carries the shared secret, so handing it to a QR-image service would put
      // the second factor in a third party's access log.
      return reply.send({
        success: true,
        data: {
          secret,
          otpauthUri: otpauthUri(secret, user.email, ISSUER),
          issuer: ISSUER,
          account: user.email,
        },
      });
    },
  );

  // ─── Confirm enrolment with a code the authenticator actually produced ─────
  fastify.post(
    '/auth/2fa/enable',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = authenticatedUserId(request);
      if (!userId) return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');

      const { code } = (request.body ?? {}) as { code?: unknown };
      if (!looksLikeTotpCode(code)) {
        return fail(
          reply,
          400,
          'INVALID_CODE',
          'Enter the 6-digit code shown in your authenticator app.',
        );
      }

      const user = await loadUser(userId);
      if (!user) return fail(reply, 404, 'USER_NOT_FOUND', 'User not found.');

      // The secret comes from the row, never from the request. Accepting it from
      // the body — as the previous version did — let the caller choose the
      // secret their own code would be checked against.
      const pending = user.twoFactorPendingSecret;
      if (!pending) {
        return fail(
          reply,
          409,
          'NO_PENDING_SETUP',
          'Start setup again — there is no enrolment waiting to be confirmed.',
        );
      }

      if (!(await totp()).verify(code.trim(), pending)) {
        return fail(
          reply,
          400,
          'INVALID_CODE',
          'That code did not match. Check the clock on your device, then try the next code.',
        );
      }

      // Recovery codes are written first on purpose: a failure between these two
      // writes leaves 2FA off with a few unused codes attached — harmless, and
      // replaced by the next enrolment — rather than 2FA on with no way back in.
      const backupCodes = await issueBackupCodes(userId);
      const confirmedAt = new Date();

      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: true,
          twoFactorSecret: pending,
          twoFactorPendingSecret: null,
          twoFactorConfirmedAt: confirmedAt,
          twoFactorLastUsedStep: totpReplayFloorAfter(totpStepFor()),
        },
      });

      return reply.send({
        success: true,
        data: {
          message: 'Two-factor authentication is on.',
          confirmedAt: confirmedAt.toISOString(),
          backupCodes,
        },
      });
    },
  );

  // ─── Complete a login challenge (public — the caller has no token yet) ─────
  fastify.post(
    '/auth/2fa/verify',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!requireTrustedOrigin(request, reply)) return;

      const { challenge, code } = (request.body ?? {}) as { challenge?: unknown; code?: unknown };
      if (typeof challenge !== 'string' || typeof code !== 'string') {
        return fail(reply, 400, 'VALIDATION_ERROR', 'A challenge and a code are required.');
      }

      const claims = await verifyTwoFactorChallenge(challenge);
      const user = claims ? await loadUser(claims.userId) : null;

      // Expired, forged, and "the account turned 2FA off in another tab" are one
      // answer: whoever is asking has to present the password again either way,
      // and telling them which it was only helps if they did not have it.
      if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
        return fail(
          reply,
          401,
          'CHALLENGE_EXPIRED',
          'This sign-in attempt is no longer valid. Enter your password again.',
        );
      }

      const trimmed = code.trim();
      const step = totpStepFor();

      if (looksLikeTotpCode(trimmed)) {
        if (!(await totp()).verify(trimmed, user.twoFactorSecret)) {
          return fail(reply, 401, 'INVALID_CODE', 'That code is not right.');
        }
        // Checked after the code, so a wrong code is never reported as a reused
        // one. A correct code at or below the floor is a replay of one already
        // spent — the ±1-step tolerance keeps a captured code alive for up to 90
        // seconds otherwise.
        if (isTotpStepReplayed(step, user.twoFactorLastUsedStep)) {
          return fail(
            reply,
            401,
            'CODE_ALREADY_USED',
            'That code has already been used. Wait for your authenticator to show the next one.',
          );
        }
        await prisma.user.update({
          where: { id: user.id },
          data: { twoFactorLastUsedStep: totpReplayFloorAfter(step) },
        });
      } else if (looksLikeBackupCode(trimmed)) {
        if (!(await consumeBackupCode(user.id, trimmed))) {
          return fail(
            reply,
            401,
            'INVALID_CODE',
            'That recovery code is not valid, or it has already been used.',
          );
        }
      } else {
        return fail(
          reply,
          400,
          'INVALID_CODE',
          'Enter the 6-digit code from your authenticator, or one of your recovery codes.',
        );
      }

      return reply.send(await issueBrowserSession(tokenService, reply, user));
    },
  );

  // ─── What is actually true about this account ──────────────────────────────
  fastify.get('/auth/2fa/status', async (request, reply) => {
    const userId = authenticatedUserId(request);
    if (!userId) return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');

    const user = await loadUser(userId);
    if (!user) return fail(reply, 404, 'USER_NOT_FOUND', 'User not found.');

    // Both halves, not just the flag. A flag with no secret is exactly the state
    // the old endpoint left accounts in, and reporting it as "on" is the lie
    // that made the settings screen offer "Enable 2FA" to protected accounts.
    const enabled = Boolean(user.twoFactorEnabled && user.twoFactorSecret);
    const backupCodesRemaining = enabled
      ? ((await prisma.twoFactorBackupCode.count({ where: { userId, usedAt: null } })) as number)
      : 0;

    return reply.send({
      success: true,
      data: {
        enabled,
        pendingSetup: Boolean(user.twoFactorPendingSecret) && !enabled,
        confirmedAt: user.twoFactorConfirmedAt
          ? new Date(user.twoFactorConfirmedAt).toISOString()
          : null,
        backupCodesRemaining,
      },
    });
  });

  // ─── Turn it off ───────────────────────────────────────────────────────────
  //
  // The password is the cost, not a current code. Someone who has lost their
  // authenticator is the most likely person to be here, and demanding the
  // authenticator to remove the authenticator is how accounts become unusable.
  // The session already proves possession of the account; the password proves
  // it is not a borrowed tab.
  fastify.post(
    '/auth/2fa/disable',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = authenticatedUserId(request);
      if (!userId) return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');

      const { password } = (request.body ?? {}) as { password?: unknown };
      if (typeof password !== 'string' || password.length === 0) {
        return fail(
          reply,
          400,
          'VALIDATION_ERROR',
          'Your password is required to turn off two-factor authentication.',
        );
      }

      const user = await loadUser(userId);
      if (!user) return fail(reply, 404, 'USER_NOT_FOUND', 'User not found.');
      if (!(await passwordMatches(user.passwordHash, password))) {
        return fail(reply, 401, 'INVALID_CREDENTIALS', 'That password is not right.');
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorPendingSecret: null,
          twoFactorConfirmedAt: null,
          twoFactorLastUsedStep: null,
        },
      });
      await prisma.twoFactorBackupCode.deleteMany({ where: { userId } });

      return reply.send({
        success: true,
        data: { message: 'Two-factor authentication is off.' },
      });
    },
  );

  // ─── Fresh recovery codes ──────────────────────────────────────────────────
  fastify.post(
    '/auth/2fa/backup-codes',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = authenticatedUserId(request);
      if (!userId) return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');

      const { password } = (request.body ?? {}) as { password?: unknown };
      if (typeof password !== 'string' || password.length === 0) {
        return fail(
          reply,
          400,
          'VALIDATION_ERROR',
          'Your password is required to generate new recovery codes.',
        );
      }

      const user = await loadUser(userId);
      if (!user) return fail(reply, 404, 'USER_NOT_FOUND', 'User not found.');
      if (!(user.twoFactorEnabled && user.twoFactorSecret)) {
        return fail(
          reply,
          409,
          'NOT_ENABLED',
          'Turn on two-factor authentication first — recovery codes only exist alongside it.',
        );
      }
      if (!(await passwordMatches(user.passwordHash, password))) {
        return fail(reply, 401, 'INVALID_CREDENTIALS', 'That password is not right.');
      }

      // Regenerating invalidates the old set outright. Half-replacing would leave
      // a user unsure which printout is live, and an unused old code is exactly
      // as good as a new one to whoever found the paper.
      const backupCodes = await issueBackupCodes(userId);

      return reply.send({
        success: true,
        data: { backupCodes, count: backupCodes.length },
      });
    },
  );
}
