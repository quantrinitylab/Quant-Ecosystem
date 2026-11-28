import { createHash } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import prisma from '@quant/auth/lib/prisma';
import * as argon2 from 'argon2';
import { accountLiveness } from '../lib/account-liveness';
import {
  REFRESH_COOKIE_NAME,
  SessionUser,
  authenticatedUserId,
  clearRefreshCookie,
  createTokenService,
  fail,
  issueBrowserSession,
  requireTrustedOrigin,
  sessionMetadataFromRequest,
  sessionUserPayload,
  setRefreshCookie,
} from '../lib/auth-session';
import { signTwoFactorChallenge } from '../lib/two-factor';
import {
  MAX_VERIFICATION_ATTEMPTS,
  generateVerificationCode,
  hashVerificationCode,
  isVerificationCodeExpired,
  looksLikeVerificationCode,
  sendVerificationEmail,
  verificationCodeExpiry,
  verificationCodeMatches,
} from '../lib/email-verification';

// Sentinel thrown inside the verify-email transaction when the code's
// compare-and-set burn loses a race — caught below, never escapes as a 500.
const VERIFICATION_CODE_ALREADY_USED = Symbol('verification-code-already-used');

// Sentinel thrown inside the resend-verification transaction when a
// concurrent resend (or verify) burned one of this request's snapshot rows
// between the snapshot read and the burn — caught below, never escapes as a
// 500. The loser must fail BEFORE any email goes out, so no inbox ever
// receives a code that is already dead.
const RESEND_CODE_SUPERSEDED = Symbol('resend-code-superseded');

// Sentinel thrown inside the resend-verification transaction when the
// in-transaction re-check finds the address already proven — the outer
// handler answers alreadyVerified instead of issuing a code.
const RESEND_ALREADY_VERIFIED = Symbol('resend-already-verified');

/**
 * Prisma unique-constraint violation (P2002), duck-typed on `code` so the
 * check works without importing the generated client — same style as the
 * collab-persistence layer. Register's duplicate-check TOCTOU maps this to
 * 409 USER_EXISTS below.
 */
function isUniqueConstraintViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

/**
 * Identity normalization for every auth entry point (register, login,
 * verify-email, resend-verification): trim + lowercase, applied ONCE to the
 * raw body value before any lookup or write — mirroring
 * routes/password-reset.ts (`email.trim().toLowerCase()`).
 *
 * Before this, register/login/verify/resend used the raw body value while
 * password-reset normalized: `User@X.com` and `user@x.com` registered as two
 * distinct accounts on the same mailbox (the findFirst pre-check and the
 * @unique DB constraint are both case-sensitive), and login was an
 * exact-match findUnique so a different-case retype 401'd. New rows are now
 * stored lowercase, so the case-sensitive @unique constraint also dedupes
 * case variants at the database level.
 */
function normalizeIdentity(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Case-insensitive user lookup by an already-normalized email — the lookup
 * counterpart of normalizeIdentity, in the same style as password-reset's
 * `findMany({ email: { equals: normalized, mode: 'insensitive' } }, take: 2)`
 * (password-reset fails closed on >1 match with the same 409, so neither
 * entry point ever mails or signs into a case-colliding twin).
 *
 * Old rows were created before normalization existed and may carry mixed
 * case, so an exact-match lookup must never be used at an identity entry
 * point. `deletedAt: null` matches password-reset: a soft-deleted account
 * must not log in or receive verification codes.
 *
 * When two or more rows differ only by case this is a data-corruption state
 * (impossible for new rows, possible for legacy ones). The lookup reports it
 * explicitly and the caller answers 409 EMAIL_CASE_CONFLICT — never silently
 * picks one account and lets a stranger's password grant access to it.
 */
async function findUserByEmailInsensitive(normalizedEmail: string) {
  const matches = await prisma.user.findMany({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' }, deletedAt: null },
    take: 2,
  });
  if (matches.length > 1) {
    return { user: null, conflict: true as const };
  }
  return { user: matches[0] ?? null, conflict: false as const };
}

const EMAIL_CASE_CONFLICT_MESSAGE =
  'This email address is registered on more than one account with different capitalisation. ' +
  'Sign-in is paused for these accounts until the addresses are merged — contact support.';

/**
 * MIGRATION NOTE for rows created before this change: mixed-case
 * email/username rows are NOT rewritten in place. They keep working through
 * the case-insensitive lookups above. New registrations are canonical
 * (lowercase), so the case-sensitive @unique constraint is a true
 * case-insensitive dedupe going forward. If two rows already differ only by
 * case, every entry point answers 409 EMAIL_CASE_CONFLICT instead of
 * silently signing into one of them; they must be merged by a human. Ops can
 * find them with:
 *   SELECT lower(email) AS canonical, count(*) FROM "User"
 *   GROUP BY lower(email) HAVING count(*) > 1;
 * (and the same on username).
 */

export async function authRoutes(fastify: FastifyInstance) {
  const tokenService = createTokenService();

  // Browser login: the access token remains memory-scoped in JavaScript while
  // the refresh credential is delivered only as an HttpOnly host-only cookie.
  fastify.post(
    '/auth/login',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!requireTrustedOrigin(request, reply)) return;
      const { email, password } = request.body as any;

      if (!email || !password) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'Email and password are required.');
      }
      // normalizeIdentity: a stored mixed-case legacy row must still match,
      // and new rows are stored lowercase, so login cannot be an exact-match
      // lookup on the raw body value.
      const normalizedEmail = normalizeIdentity(email);
      if (!normalizedEmail) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'Email and password are required.');
      }

      const lookup = await findUserByEmailInsensitive(normalizedEmail);
      if (lookup.conflict) {
        return fail(reply, 409, 'EMAIL_CASE_CONFLICT', EMAIL_CASE_CONFLICT_MESSAGE);
      }
      const user = lookup.user;
      if (!user) {
        return fail(reply, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
      }

      const valid = await argon2.verify(user.passwordHash, password);
      if (!valid) {
        return fail(reply, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
      }

      // Soft-delete/status gate, AFTER the password check: a SUSPENDED or
      // DEACTIVATED live row answers honestly instead of authenticating.
      // The lookup above already excludes tombstoned rows (deletedAt: null),
      // so a soft-deleted account answers exactly like a missing one — same
      // code, same message — and the tombstone cannot be probed for
      // existence. Checking after the password hash is deliberate: this
      // endpoint is rate-limited (5/min), so the argon2 cost is bounded, and
      // a pre-password status check would let anyone map email → account
      // status without knowing the password.
      const liveness = accountLiveness(user);
      if (liveness === 'suspended') {
        return fail(reply, 401, 'ACCOUNT_SUSPENDED', 'This account is suspended.');
      }
      if (liveness === 'deactivated') {
        return fail(reply, 401, 'ACCOUNT_DEACTIVATED', 'This account is deactivated.');
      }

      // A password alone is not a session for an account with a second factor.
      // The flag and secret must agree. Silently treating a half-enabled row as
      // one-factor authentication turns data corruption into a 2FA bypass; fail
      // closed and send the account through recovery instead.
      const protectedUser = user as unknown as {
        twoFactorEnabled?: boolean | null;
        twoFactorSecret?: string | null;
      };
      const twoFactorEnabled = protectedUser.twoFactorEnabled === true;
      const hasTwoFactorSecret = Boolean(protectedUser.twoFactorSecret?.trim());
      if (twoFactorEnabled !== hasTwoFactorSecret) {
        return fail(
          reply,
          409,
          'TWO_FACTOR_STATE_INVALID',
          'This account security state needs recovery before sign-in.',
        );
      }
      if (twoFactorEnabled && protectedUser.twoFactorSecret) {
        const { challenge, expiresIn } = await signTwoFactorChallenge(user.id);
        // No tokens and no refresh cookie yet. The challenge proves only that
        // the password was accepted; a fresh authenticator/recovery code is
        // still required on every successful completion.
        return reply.send({
          success: true,
          data: { twoFactorRequired: true, challenge, expiresIn },
        });
      }

      return reply.send(
        await issueBrowserSession(tokenService, reply, user, sessionMetadataFromRequest(request)),
      );
    },
  );

  fastify.post(
    '/auth/register',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!requireTrustedOrigin(request, reply)) return;
      const { email, username, displayName, password } = request.body as any;

      if (!email || !username || !password) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'Email, username and password are required.');
      }
      // normalizeIdentity: register once in canonical form so the
      // case-sensitive pre-check and @unique constraint actually dedupe.
      const normalizedEmail = normalizeIdentity(email);
      const normalizedUsername = normalizeIdentity(username);
      if (!normalizedEmail || !normalizedUsername) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'Email, username and password are required.');
      }
      // Mirror /auth/change-password: reject trivially short secrets at the door.
      if (password.length < 8) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'Password must be at least 8 characters.');
      }

      // Case-insensitive pre-check: a legacy row stored with mixed case must
      // still block re-registration, answering an honest 409 instead of
      // slipping a second account past the case-sensitive check and dying on
      // P2002. (The P2002 mapping below still covers the concurrent-register
      // TOCTOU, where two normalized-identical rows collide in the
      // transaction.)
      //
      // Tombstone retention: this pre-check deliberately has NO deletedAt
      // filter. A soft-deleted row keeps its unique email claim, so
      // re-registering that address 409s USER_EXISTS exactly like a live row
      // — register never silently revives a deleted account. Reviving one is
      // a product decision (ownership re-proof), not an implicit side effect.
      const existing = await prisma.user.findFirst({
        where: {
          OR: [
            { email: { equals: normalizedEmail, mode: 'insensitive' } },
            { username: { equals: normalizedUsername, mode: 'insensitive' } },
          ],
        },
      });

      if (existing) {
        const takenField =
          (existing.email as string).toLowerCase() === normalizedEmail ? 'email' : 'username';
        return fail(
          reply,
          409,
          'USER_EXISTS',
          `An account with this ${takenField} already exists. Try signing in instead.`,
        );
      }

      const passwordHash = await argon2.hash(password);

      // Registration is atomic: the user row, the default folders and the
      // verification row commit together inside one transaction. Creating
      // the user first and the verification row later left an ACTIVE orphan
      // behind whenever the row insert failed — and the retry then 409'd
      // USER_EXISTS with no way to ever verify that account.
      const verificationCode = generateVerificationCode();
      let user;
      try {
        user = await prisma.$transaction(async (tx: any) => {
          const created = await tx.user.create({
            data: {
              // Canonical form: lowercase rows make the case-sensitive
              // @unique constraint a true case-insensitive dedupe for all
              // future registrations, and every entry point looks the same
              // way up.
              email: normalizedEmail,
              username: normalizedUsername,
              displayName: displayName || normalizedUsername,
              passwordHash,
              status: 'ACTIVE',
              // The address is NOT proven at this point. Creating users with
              // emailVerified: true here was how any address could be claimed
              // with no proof of ownership — /auth/verify-email flips it.
              emailVerified: false,
            },
          });

          // Provision standard mail folders at signup (M10: eliminates per-request upsert overhead)
          if (tx.emailFolder?.createMany) {
            await tx.emailFolder.createMany({
              data: [
                { userId: created.id, name: 'Inbox', type: 'INBOX' },
                { userId: created.id, name: 'Sent', type: 'SENT' },
                { userId: created.id, name: 'Drafts', type: 'DRAFTS' },
                { userId: created.id, name: 'Archive', type: 'ARCHIVE' },
                { userId: created.id, name: 'Trash', type: 'TRASH' },
                { userId: created.id, name: 'Spam', type: 'SPAM' },
              ],
              skipDuplicates: true,
            });
          }

          // Prove-it-later: the new account is not yet entitled to claim this
          // address. A real 6-digit code goes out over SES (no phone/SMS — that
          // channel was removed by user order), and only its hash is stored.
          await tx.emailVerificationCode.create({
            data: {
              userId: created.id,
              codeHash: hashVerificationCode(verificationCode),
              expiresAt: verificationCodeExpiry(),
              requestedIp: typeof request.ip === 'string' ? request.ip : null,
            },
          });

          return created;
        });
      } catch (err) {
        // Duplicate-check TOCTOU: the findFirst pre-check above runs OUTSIDE
        // this transaction, so two concurrent registers with the same email
        // (or username) can both pass it. The winner's tx.user.create commits;
        // the loser's hits the unique constraint (P2002). Mapping that to
        // 409 USER_EXISTS keeps the loser's retry path honest — before this,
        // the unmapped P2002 escaped as a raw 500.
        if (isUniqueConstraintViolation(err)) {
          return fail(
            reply,
            409,
            'USER_EXISTS',
            'An account with this email or username already exists. Try signing in instead.',
          );
        }
        throw err;
      }

      const verificationEmailSent = await sendVerificationEmail({
        to: normalizedEmail,
        code: verificationCode,
        name: user.displayName,
      });

      const session = await issueBrowserSession(
        tokenService,
        reply,
        user,
        sessionMetadataFromRequest(request),
      );
      // The response must not claim the address is verified — it is not.
      // verificationEmailSent is reported honestly: false means the mailer
      // failed and /auth/resend-verification should be offered.
      return reply.send({
        ...session,
        data: {
          ...session.data,
          emailVerification: {
            required: true,
            emailVerified: false,
            emailSent: verificationEmailSent,
          },
        },
      });
    },
  );

  // Email address ownership proof: POST /auth/verify-email { email, code }.
  // A wrong code and a nonexistent account get the same answer, so the
  // endpoint is not an account-enumeration oracle beyond what /auth/register
  // already reveals (409 USER_EXISTS). Single-use, 15-minute-bounded,
  // constant-time compare, attempt-capped.
  fastify.post(
    '/auth/verify-email',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!requireTrustedOrigin(request, reply)) return;
      const { email, code } = request.body as any;

      if (!email || !looksLikeVerificationCode(code)) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'Email and a 6-digit verification code are required.');
      }
      // normalizeIdentity: the account was registered lowercase, and a
      // legacy mixed-case row must still find its codes.
      const normalizedEmail = normalizeIdentity(email);
      if (!normalizedEmail) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'Email and a 6-digit verification code are required.');
      }

      const lookup = await findUserByEmailInsensitive(normalizedEmail);
      if (lookup.conflict) {
        // A burned code belongs to exactly one account; never burn it for an
        // ambiguous address.
        return fail(reply, 409, 'EMAIL_CASE_CONFLICT', EMAIL_CASE_CONFLICT_MESSAGE);
      }
      const user = lookup.user;
      if (user?.emailVerified) {
        return reply.send({ success: true, data: { emailVerified: true, alreadyVerified: true } });
      }

      const row = user
        ? await prisma.emailVerificationCode.findFirst({
            where: { userId: user.id, usedAt: null },
            orderBy: { createdAt: 'desc' },
          })
        : null;

      // No account, no live code, or an expired code all look the same from
      // the outside: wrong-or-expired, nothing more.
      if (!user || !row || isVerificationCodeExpired(row.expiresAt)) {
        return fail(reply, 400, 'INVALID_OR_EXPIRED_CODE', 'The verification code is wrong or has expired.');
      }
      if (row.attempts >= MAX_VERIFICATION_ATTEMPTS) {
        return fail(
          reply,
          429,
          'TOO_MANY_ATTEMPTS',
          'Too many wrong codes. Request a new code and try again.',
        );
      }

      if (!verificationCodeMatches(code, row.codeHash)) {
        await prisma.emailVerificationCode.update({
          where: { id: row.id },
          data: { attempts: { increment: 1 } },
        });
        return fail(reply, 400, 'INVALID_CODE', 'The verification code is wrong.');
      }

      // Success: burn this code atomically, then mark the address proven.
      //
      // Race note: two confirms can both read usedAt: null above before
      // either commits, so that read is NOT a guard. The burn below is a
      // compare-and-set — updateMany on { id, usedAt: null } with a required
      // affected-count of 1 is the linearization point (single atomic
      // statement in the database; the first committer wins the row lock).
      // A loser sees count 0, rolls back, and gets an honest error.
      try {
        await prisma.$transaction(async (tx: any) => {
          const claimed = await tx.emailVerificationCode.updateMany({
            where: { id: row.id, usedAt: null },
            data: { usedAt: new Date() },
          });
          if (claimed.count !== 1) {
            throw VERIFICATION_CODE_ALREADY_USED;
          }
          // Burn any other pending codes for this user, then mark proven.
          await tx.emailVerificationCode.updateMany({
            where: { userId: user.id, usedAt: null },
            data: { usedAt: new Date() },
          });
          await tx.user.update({
            where: { id: user.id },
            data: { emailVerified: true },
          });
        });
      } catch (err) {
        if (err === VERIFICATION_CODE_ALREADY_USED) {
          return fail(reply, 400, 'CODE_ALREADY_USED', 'This verification code has already been used.');
        }
        throw err;
      }

      return reply.send({ success: true, data: { emailVerified: true } });
    },
  );

  // Re-send the code when the first mail did not arrive. Register already
  // reveals existence (409 USER_EXISTS), so 404 here reveals nothing new.
  fastify.post(
    '/auth/resend-verification',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!requireTrustedOrigin(request, reply)) return;
      const { email } = request.body as any;

      if (!email) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'Email is required.');
      }
      // normalizeIdentity: the account was registered lowercase, and a
      // legacy mixed-case row must still receive its code.
      const normalizedEmail = normalizeIdentity(email);
      if (!normalizedEmail) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'Email is required.');
      }

      const lookup = await findUserByEmailInsensitive(normalizedEmail);
      if (lookup.conflict) {
        // Never issue a code for an ambiguous address.
        return fail(reply, 409, 'EMAIL_CASE_CONFLICT', EMAIL_CASE_CONFLICT_MESSAGE);
      }
      const user = lookup.user;
      if (!user) {
        return fail(reply, 404, 'USER_NOT_FOUND', 'No account uses this email address.');
      }
      if (user.emailVerified) {
        return reply.send({ success: true, data: { emailVerified: true, alreadyVerified: true } });
      }

      // Burn-then-create must be atomic. As sequential awaits, two concurrent
      // resends interleave (A burns, A creates A1, B burns A1, B creates B1)
      // and the code in A's just-sent email is already dead — the user gets
      // INVALID_OR_EXPIRED_CODE for a code they received seconds ago.
      //
      // Linearization, same style as the verify-email fix: inside one
      // transaction, snapshot the codes pending when THIS request began, then
      // burn exactly that snapshot with a compare-and-set
      // (updateMany on { id, usedAt: null }) and require the affected-count
      // to match the snapshot size. A sibling resend still in flight has its
      // create uncommitted, so it is invisible to our snapshot — we can never
      // burn a code whose email is still being sent. If a sibling (or a
      // verify) burned one of our snapshot rows between our snapshot read
      // and our burn, the count comes up short and this request loses
      // cleanly BEFORE any email goes out: exactly one winner, one live
      // code, one email — a just-received code never arrives dead.
      const verificationCode = generateVerificationCode();
      try {
        await prisma.$transaction(async (tx: any) => {
          // Re-check inside the transaction: the address may have been
          // proven between the read above and now. Never issue a code for a
          // proven address.
          const fresh = await tx.user.findUnique({
            where: { id: user.id },
            select: { emailVerified: true },
          });
          if (fresh?.emailVerified) {
            throw RESEND_ALREADY_VERIFIED;
          }

          const pending = await tx.emailVerificationCode.findMany({
            where: { userId: user.id, usedAt: null },
            select: { id: true },
          });
          const burned = await tx.emailVerificationCode.updateMany({
            where: { id: { in: pending.map((row: any) => row.id) }, usedAt: null },
            data: { usedAt: new Date() },
          });
          if (burned.count !== pending.length) {
            throw RESEND_CODE_SUPERSEDED;
          }

          await tx.emailVerificationCode.create({
            data: {
              userId: user.id,
              codeHash: hashVerificationCode(verificationCode),
              expiresAt: verificationCodeExpiry(),
              requestedIp: typeof request.ip === 'string' ? request.ip : null,
            },
          });
        });
      } catch (err) {
        if (err === RESEND_ALREADY_VERIFIED) {
          return reply.send({ success: true, data: { emailVerified: true, alreadyVerified: true } });
        }
        if (err === RESEND_CODE_SUPERSEDED) {
          // The address may have been proven by the winning sibling (a
          // verify racing this resend) — answer that honestly instead of
          // telling the user to check their inbox for a code they no longer
          // need.
          const latest = await prisma.user.findUnique({ where: { id: user.id } });
          if (latest?.emailVerified) {
            return reply.send({ success: true, data: { emailVerified: true, alreadyVerified: true } });
          }
          return fail(
            reply,
            409,
            'RESEND_SUPERSEDED',
            'A newer verification code was just issued. Please use the code from your latest email.',
          );
        }
        throw err;
      }
      const emailSent = await sendVerificationEmail({
        // The stored spelling, mirroring password-reset: the mail still goes
        // to the mailbox even if the request typed the case differently.
        to: user.email,
        code: verificationCode,
        name: user.displayName,
      });

      return reply.send({ success: true, data: { emailSent } });
    },
  );

  // Cookie-only browser rotation endpoint. Requiring an allowlisted Origin in
  // addition to SameSite=Strict prevents cross-site refresh and logout CSRF.
  fastify.post(
    '/auth/refresh',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!requireTrustedOrigin(request, reply)) return;
      const oldRefreshToken = request.cookies[REFRESH_COOKIE_NAME];
      if (!oldRefreshToken) {
        clearRefreshCookie(reply);
        return fail(reply, 401, 'REFRESH_REQUIRED', 'No browser refresh session is available.');
      }

      try {
        const tokens = await tokenService.refreshToken(
          oldRefreshToken,
          sessionMetadataFromRequest(request),
        );
        setRefreshCookie(reply, tokens.refreshToken);
        // Collapse the browser's hydrate waterfall: the profile the frontend
        // used to fetch with a second /oauth/userinfo round trip rides along
        // on this response instead. The user is located the same
        // possession-bound way /auth/logout does — the one-way digest of the
        // presented refresh token — so this adds no new trust assumption, and
        // a missing row is a best-effort omission, not a failure: the frontend
        // falls back to /oauth/userinfo for backends that don't embed yet.
        let embeddedUser: Record<string, unknown> | undefined;
        try {
          const digest = createHash('sha256').update(oldRefreshToken).digest('hex');
          const stored = await prisma.refreshToken.findFirst({ where: { token: digest } });
          const user = stored ? await prisma.user.findUnique({ where: { id: stored.userId } }) : null;
          if (user) {
            embeddedUser = sessionUserPayload(user as SessionUser);
          }
        } catch {
          // Profile lookup must never fail a token rotation that already
          // succeeded — the browser retries the profile leg on its own.
        }
        return reply.send({
          success: true,
          data: {
            accessToken: tokens.accessToken,
            expiresIn: tokens.expiresIn,
            tokenType: tokens.tokenType,
            ...(embeddedUser ? { user: embeddedUser } : {}),
          },
        });
      } catch {
        clearRefreshCookie(reply);
        return fail(reply, 401, 'INVALID_REFRESH_SESSION', 'The browser session is invalid.');
      }
    },
  );

  fastify.post('/auth/logout', async (request, reply) => {
    if (!requireTrustedOrigin(request, reply)) return;
    const refreshToken = request.cookies[REFRESH_COOKIE_NAME];

    if (refreshToken) {
      // Possession-bound family revocation without persisting or decoding the
      // bearer value: locate the exact one-way digest already stored by
      // TokenService, then revoke every descendant in that rotation family.
      const digest = createHash('sha256').update(refreshToken).digest('hex');
      const stored = await prisma.refreshToken.findFirst({ where: { token: digest } });
      if (stored) {
        await prisma.refreshToken.updateMany({
          where: { family: stored.family },
          data: { isRevoked: true },
        });
      }
    }

    clearRefreshCookie(reply);
    return reply.send({ success: true, data: { message: 'Signed out.' } });
  });

  /**
   * GET /auth/sessions — the Security page's Active Sessions tab (QM-SCREEN-016).
   *
   * One session = one refresh-token rotation family. Only live families are
   * listed: not revoked, not expired, and either tagged 'browser' or untagged
   * (issued before tagging — presumed browser session). Rows tagged 'oauth'
   * are third-party app grants and belong to the Connected Apps surface, not
   * this list.
   *
   * The presented refresh cookie identifies the current family via the same
   * one-way digest lookup as logout — the bearer value is never decoded or
   * persisted. Device metadata is whatever issuance/rotation recorded; NULLs
   * mean "not recorded" and the UI says so instead of inventing a device.
   */
  fastify.get('/auth/sessions', async (request, reply) => {
    const userId = authenticatedUserId(request);
    if (!userId) {
      return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const rows = await prisma.refreshToken.findMany({
      where: {
        userId,
        isRevoked: false,
        expiresAt: { gt: new Date() },
        OR: [{ source: 'browser' }, { source: null }],
      },
      orderBy: { createdAt: 'asc' },
    });

    let currentFamily: string | null = null;
    const presented = (request as { cookies?: Record<string, unknown> }).cookies?.[
      REFRESH_COOKIE_NAME
    ];
    if (typeof presented === 'string' && presented) {
      const digest = createHash('sha256').update(presented).digest('hex');
      currentFamily = rows.find((row: { token: string; family: string }) => row.token === digest)?.family ?? null;
    }

    const byFamily = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byFamily.get(row.family);
      if (list) {
        list.push(row);
      } else {
        byFamily.set(row.family, [row]);
      }
    }

    // Rows arrive oldest-first, so the first row of a family is its first
    // sign-in and the last row its most recent rotation (last seen active).
    const sessions = [...byFamily.entries()].map(([family, familyRows]) => {
      const first = familyRows[0] as (typeof rows)[number];
      const latest = familyRows[familyRows.length - 1] as (typeof rows)[number];
      return {
        id: family,
        isCurrent: family === currentFamily,
        firstSeenAt: first.createdAt.toISOString(),
        lastActiveAt: latest.createdAt.toISOString(),
        userAgent: latest.userAgent ?? null,
        ipAddress: latest.ipAddress ?? null,
      };
    });
    sessions.sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return b.lastActiveAt.localeCompare(a.lastActiveAt);
    });

    return reply.send({ success: true, data: { sessions } });
  });

  /**
   * POST /auth/sessions/revoke-others — "Revoke All" on the Security page.
   *
   * Ends every other browser session: all live families except the one holding
   * the presented refresh cookie. Step-up guarded (K6): invalidating other
   * logins requires recent strong authentication, not just a live session.
   *
   * Fail closed when the current session cannot be identified from the refresh
   * cookie — revoking "everything except this one" is meaningless when "this
   * one" is unknown, and silently signing the caller out everywhere would be
   * the worse outcome.
   */
  fastify.post(
    '/auth/sessions/revoke-others',
    { preHandler: fastify.requireStepUp() },
    async (request, reply) => {
      const userId = authenticatedUserId(request);
      if (!userId) {
        return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const presented = (request as { cookies?: Record<string, unknown> }).cookies?.[
        REFRESH_COOKIE_NAME
      ];
      let currentFamily: string | null = null;
      if (typeof presented === 'string' && presented) {
        const digest = createHash('sha256').update(presented).digest('hex');
        const current = await prisma.refreshToken.findFirst({
          where: { token: digest, userId, isRevoked: false },
          select: { family: true },
        });
        currentFamily = current?.family ?? null;
      }
      if (!currentFamily) {
        return fail(
          reply,
          409,
          'CURRENT_SESSION_UNKNOWN',
          'Could not identify this session from its sign-in cookie. Sign in again, then retry.',
        );
      }

      const others = await prisma.refreshToken.findMany({
        where: {
          userId,
          isRevoked: false,
          family: { not: currentFamily },
          OR: [{ source: 'browser' }, { source: null }],
        },
        select: { family: true },
      });
      const families = [...new Set(others.map((row: { family: string }) => row.family))];
      if (families.length > 0) {
        await prisma.refreshToken.updateMany({
          where: { userId, family: { in: families } },
          data: { isRevoked: true },
        });
      }

      return reply.send({
        success: true,
        data: {
          revokedSessions: families.length,
          message:
            families.length === 0
              ? 'No other sessions to revoke.'
              : `Signed out ${families.length} other session${families.length === 1 ? '' : 's'}. They will need to sign in again.`,
        },
      });
    },
  );

  fastify.post(
    '/auth/change-password',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
      if (!userId) {
        return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const { currentPassword, newPassword } = request.body as {
        currentPassword?: string;
        newPassword?: string;
      };
      if (!currentPassword || !newPassword) {
        return fail(
          reply,
          400,
          'VALIDATION_ERROR',
          'Current password and new password are required.',
        );
      }
      if (newPassword.length < 8) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'New password must be at least 8 characters.');
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return fail(reply, 404, 'USER_NOT_FOUND', 'User not found.');
      }

      const valid = await argon2.verify(user.passwordHash, currentPassword);
      if (!valid) {
        return fail(reply, 401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
      }

      const passwordHash = await argon2.hash(newPassword);

      // Security: a password change is the "I may be compromised" remediation
      // path, and the industry-standard behavior (Google) is to sign the user
      // out of every OTHER session. Identify this browser session from its
      // refresh cookie so it survives; every other live family is revoked —
      // browser sessions AND third-party OAuth grants, since a stolen OAuth
      // grant must not survive a password change either. Before this fix the
      // handler only rewrote the argon2 hash and left every other 30-day
      // refresh-token family live, so an attacker who stole a session stayed
      // signed in after the victim changed their password.
      const presented = (request as { cookies?: Record<string, unknown> }).cookies?.[
        REFRESH_COOKIE_NAME
      ];
      let currentFamily: string | null = null;
      if (typeof presented === 'string' && presented) {
        const digest = createHash('sha256').update(presented).digest('hex');
        const current = await prisma.refreshToken.findFirst({
          where: { token: digest, userId, isRevoked: false },
          select: { family: true },
        });
        currentFamily = current?.family ?? null;
      }

      // Hash rewrite + session revocation commit atomically: a password change
      // that leaves other sessions live is a lie, and a revocation that fails
      // without rolling back is a half-applied security action. When the
      // current session cannot be identified from the cookie, revoke EVERYTHING
      // (fail safe, not fail closed): the caller proved knowledge of the
      // current password, and the current access token keeps working for its
      // ~15 minutes, so re-sign-in is one step away. This is deliberately
      // different from /auth/sessions/revoke-others' 409 fail-closed — a
      // password change is the remediation path, and failing it would leave the
      // compromised account unprotected.
      const { revokedSessions } = await prisma.$transaction(async (tx: any) => {
        await tx.user.update({ where: { id: userId }, data: { passwordHash } });

        const others = await tx.refreshToken.findMany({
          where: {
            userId,
            isRevoked: false,
            ...(currentFamily ? { family: { not: currentFamily } } : {}),
          },
          select: { family: true },
        });
        const families = [...new Set(others.map((row: { family: string }) => row.family))];
        if (families.length > 0) {
          await tx.refreshToken.updateMany({
            where: { userId, family: { in: families } },
            data: { isRevoked: true },
          });
        }
        return { revokedSessions: families.length };
      });

      return reply.send({
        success: true,
        data: {
          message: 'Password updated.',
          revokedSessions,
          ...(currentFamily
            ? {}
            : {
                note: 'This session could not be identified from its sign-in cookie, so it was signed out too. Please sign in again with your new password.',
              }),
        },
      });
    },
  );

  /**
   * PATCH /auth/profile — the only mutable field on a user's identity.
   *
   * Settings had a "Save display name" button for a long time with nothing
   * behind it: it wrote `localStorage` and toasted success, and the next reload
   * re-read `/oauth/userinfo` and put the old name back. A control that reports
   * a save it did not perform is worse than no control, so this is the write
   * side that `/oauth/userinfo` reads back.
   *
   * `email` and `username` are deliberately not accepted. Both are identity —
   * mail is addressed to them and other rows reference them — so changing
   * either is a migration, not a preference.
   *
   * Step-up guarded (K6): a settings update requires recent strong
   * authentication — password login or MFA verification within the policy
   * window — not just a live session.
   */
  fastify.patch(
    '/auth/profile',
    { preHandler: fastify.requireStepUp() },
    async (request, reply) => {
    const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    if (!userId) {
      return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const { displayName } = (request.body ?? {}) as { displayName?: unknown };
    if (typeof displayName !== 'string') {
      return fail(reply, 400, 'VALIDATION_ERROR', 'A display name is required.');
    }

    // Collapse whitespace before measuring: a name of 80 spaces is not 80
    // characters of name, and a tab inside one breaks every header it lands in.
    const next = displayName.replace(/\s+/g, ' ').trim();
    if (!next) {
      return fail(reply, 400, 'VALIDATION_ERROR', 'A display name cannot be empty.');
    }
    if (next.length > 80) {
      return fail(reply, 400, 'VALIDATION_ERROR', 'A display name cannot exceed 80 characters.');
    }
    // A display name is rendered into a `From:` header. C0/C1 controls there let
    // a name inject a second header line, so they are rejected rather than
    // stripped — silently saving something other than what was typed is its own
    // small lie.
    if (/[\u0000-\u001F\u007F-\u009F]/.test(next)) {
      return fail(
        reply,
        400,
        'VALIDATION_ERROR',
        'A display name cannot contain control characters.',
      );
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { displayName: next },
    });

    return reply.send({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    });
  });

  // 2FA lives in `routes/two-factor.ts`. It used to live here as a pair of
  // handlers that generated a secret nobody stored and accepted any six digits.
  // Password reset lives in `routes/password-reset.ts`. It used to live here as
  // a hard-coded "instructions have been sent" that sent nothing, plus a 501.
}
