/**
 * Real passkey (WebAuthn) sign-in for QuantMail.
 *
 * What was here before: nothing. The login page offered email+password +
 * TOTP only, and the only WebAuthn code in the tree was an in-memory
 * service in packages/auth (challenges and credentials in Maps, wiped on
 * restart, never mounted by any QuantMail route) plus a mobile capability
 * flag that never ran a ceremony. Google made passkeys the default sign-in
 * for personal accounts in 2023-2024; QuantMail had no registration
 * ceremony, no authentication ceremony, and no credential storage anywhere.
 *
 * What this mounts:
 *   POST   /auth/passkeys/register/options  (session + step-up)
 *   POST   /auth/passkeys/register/verify   (session + step-up)
 *   GET    /auth/passkeys                   (session)
 *   DELETE /auth/passkeys/:id               (session + step-up)
 *   POST   /auth/passkeys/login/options     (public, email-addressed)
 *   POST   /auth/passkeys/login/verify      (public, email-addressed)
 *
 * Trust rules, each deliberate:
 * - Registration and deletion require a session AND step-up (the same
 *   guard as /auth/profile and /auth/sessions/revoke-others): adding a
 *   credential is a "whoever holds this session now owns the account"
 *   action, so a merely-live session is not enough.
 * - Challenges are signed JWTs (lib/passkeys.ts), not server memory: they
 *   survive restarts and replicas, expire in 5 minutes, and are bound to
 *   one user and one purpose. A token for 'login' verifies nothing for
 *   'register' and vice versa.
 * - Credentials are stored in PasskeyCredential (public key only — a
 *   private key never leaves the authenticator, and nothing here ever asks
 *   for one). The public key is never returned to any client: the list
 *   endpoint returns only display metadata.
 * - Counter discipline: an accepted assertion moves the stored counter
 *   forward. An assertion whose counter did not advance past a nonzero
 *   stored counter is a cloned-authenticator signal and fails closed with
 *   no session and no counter update. (Counter 0 on both sides means the
 *   authenticator does not report a counter at all — that is the
 *   authenticator's declared behaviour, not a replay signal.)
 * - User-verification branching on login: a verified assertion WITH user
 *   verification (fingerprint, face, PIN) is the strong second step Google
 *   treats passkeys as, so it mints a session outright. A verified
 *   assertion WITHOUT user verification on a TOTP-protected account falls
 *   through to the existing TOTP challenge — possession alone must not
 *   silently bypass a second factor the user deliberately turned on.
 * - Account-existence discipline on the public login endpoints: a missing
 *   account, a suspended/deactivated account, and an account with no
 *   passkeys all answer the same 404 PASSKEY_NOT_AVAILABLE. (Register
 *   already reveals existence with 409, so this is about not adding a
 *   second oracle for account STATUS, which login only reveals after a
 *   correct password.) Once an assertion verifies, liveness is answered
 *   honestly like /auth/login does, because the caller has then proved
 *   possession of a registered credential.
 */

import { FastifyInstance } from 'fastify';
import prisma from '@quant/auth/lib/prisma';
import {
  generatePasskeyAuthenticationOptions,
  generatePasskeyRegistrationOptions,
  verifyPasskeyAuthentication,
  verifyPasskeyRegistration,
} from '@quant/auth/services/passkey-ceremony';
import { accountLiveness } from '../lib/account-liveness';
import {
  authenticatedUserId,
  createTokenService,
  fail,
  issueBrowserSession,
  requireTrustedOrigin,
  sessionMetadataFromRequest,
} from '../lib/auth-session';
import {
  passkeyRpConfig,
  requestOrigin,
  signPasskeyChallenge,
  verifyPasskeyChallenge,
} from '../lib/passkeys';
import { signTwoFactorChallenge } from '../lib/two-factor';

function isUniqueConstraintViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

function normalizeIdentity(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

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

interface StoredPasskey {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
  name: string | null;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: Date | string;
  lastUsedAt: Date | string | null;
}

const passkeyStore = () => (prisma as any).passkeyCredential;

function publicPasskey(row: StoredPasskey) {
  return {
    id: row.id,
    name: row.name,
    deviceType: row.deviceType,
    backedUp: row.backedUp,
    transports: row.transports,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    lastUsedAt:
      row.lastUsedAt instanceof Date
        ? row.lastUsedAt.toISOString()
        : (row.lastUsedAt ?? null),
  };
}

const NO_PASSKEY_MESSAGE =
  'No passkey is registered for this address. Sign in with your password, then add one in Security settings.';

/** Two-factor state, same fail-closed rule as /auth/login. */
function twoFactorState(user: any): 'off' | 'on' | 'invalid' {
  const enabled = user.twoFactorEnabled === true;
  const hasSecret = Boolean((user.twoFactorSecret as string | null)?.trim());
  if (enabled !== hasSecret) return 'invalid';
  return enabled ? 'on' : 'off';
}

export async function passkeyRoutes(fastify: FastifyInstance) {
  const tokenService = createTokenService();
  const rpIdOverride = process.env['PASSKEY_RP_ID']?.trim() || undefined;

  // Authenticated: list this account's passkeys (display metadata only —
  // public keys are never sent to the client; nothing there needs them).
  fastify.get('/auth/passkeys', async (request, reply) => {
    const userId = authenticatedUserId(request);
    if (!userId) {
      return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
    }
    const rows = (await passkeyStore().findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    })) as StoredPasskey[];
    return reply.send({ success: true, data: { passkeys: rows.map(publicPasskey) } });
  });

  // Authenticated + step-up: begin registering a new passkey.
  fastify.post(
    '/auth/passkeys/register/options',
    { preHandler: fastify.requireStepUp() },
    async (request, reply) => {
      const userId = authenticatedUserId(request);
      if (!userId) {
        return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
      }
      if (!requireTrustedOrigin(request, reply)) return;
      const rp = passkeyRpConfig(requestOrigin(request), rpIdOverride);
      if (!rp) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'Could not determine this site address for passkey setup.');
      }
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return fail(reply, 404, 'USER_NOT_FOUND', 'User not found.');
      }
      const existing = (await passkeyStore().findMany({ where: { userId } })) as StoredPasskey[];
      const options = await generatePasskeyRegistrationOptions({
        rpName: rp.rpName,
        rpID: rp.rpID,
        userName: (user as any).email,
        userDisplayName: (user as any).displayName ?? (user as any).username,
        userId: user.id,
        excludeCredentials: existing.map((row) => ({
          credentialId: row.credentialId,
          publicKey: row.publicKey,
          counter: row.counter,
          transports: row.transports,
        })),
      });
      const { challengeToken, expiresIn } = await signPasskeyChallenge({
        userId,
        purpose: 'register',
        challenge: options.challenge,
      });
      return reply.send({ success: true, data: { options, challengeToken, expiresIn } });
    },
  );

  // Authenticated + step-up: finish registering a new passkey.
  fastify.post(
    '/auth/passkeys/register/verify',
    { preHandler: fastify.requireStepUp() },
    async (request, reply) => {
      const userId = authenticatedUserId(request);
      if (!userId) {
        return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
      }
      if (!requireTrustedOrigin(request, reply)) return;
      const { response, challengeToken, name } = request.body as any;
      if (!response || !challengeToken) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'A passkey response and challenge are required.');
      }
      const claims = await verifyPasskeyChallenge(challengeToken, 'register');
      if (!claims || claims.userId !== userId) {
        return fail(reply, 401, 'INVALID_CHALLENGE', 'This passkey setup expired or is invalid. Start again.');
      }
      const rp = passkeyRpConfig(requestOrigin(request), rpIdOverride);
      if (!rp) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'Could not determine this site address for passkey setup.');
      }
      const verified = await verifyPasskeyRegistration({
        response,
        expectedChallenge: claims.challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
      });
      if (!verified.verified || !verified.credential) {
        return fail(reply, 401, 'INVALID_PASSKEY', 'That passkey could not be verified.');
      }
      const credential = verified.credential;
      const cleanName =
        typeof name === 'string' && name.replace(/\s+/g, ' ').trim()
          ? name.replace(/\s+/g, ' ').trim().slice(0, 80)
          : null;
      try {
        const created = (await passkeyStore().create({
          data: {
            userId,
            credentialId: credential.credentialId,
            publicKey: credential.publicKey,
            counter: credential.counter,
            transports: credential.transports,
            name: cleanName,
            deviceType: credential.deviceType,
            backedUp: credential.backedUp,
          },
        })) as StoredPasskey;
        return reply.send({ success: true, data: { passkey: publicPasskey(created) } });
      } catch (err) {
        if (isUniqueConstraintViolation(err)) {
          return fail(
            reply,
            409,
            'PASSKEY_ALREADY_REGISTERED',
            'This passkey is already registered.',
          );
        }
        throw err;
      }
    },
  );

  // Authenticated + step-up: delete one of this account's passkeys.
  // Scoped to (id, userId): another account's credential id 404s instead
  // of being touched. Deleting the last passkey is allowed — the password
  // still signs the account in, so this can never lock the account out.
  fastify.delete(
    '/auth/passkeys/:id',
    { preHandler: fastify.requireStepUp() },
    async (request, reply) => {
      const userId = authenticatedUserId(request);
      if (!userId) {
        return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
      }
      const id = (request.params as { id?: string }).id;
      if (!id) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'A passkey id is required.');
      }
      const deleted = await passkeyStore().deleteMany({ where: { id, userId } });
      if (deleted.count !== 1) {
        return fail(reply, 404, 'PASSKEY_NOT_FOUND', 'No passkey with that id was found.');
      }
      return reply.send({ success: true, data: { message: 'Passkey removed.' } });
    },
  );

  // Public: begin a passwordless sign-in for one address. The generic 404
  // covers missing accounts, suspended/deactivated accounts, and accounts
  // with no passkeys alike — see the module header.
  fastify.post(
    '/auth/passkeys/login/options',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!requireTrustedOrigin(request, reply)) return;
      const { email } = request.body as any;
      const normalizedEmail = normalizeIdentity(email);
      if (!normalizedEmail) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'Email address is required.');
      }
      const rp = passkeyRpConfig(requestOrigin(request), rpIdOverride);
      if (!rp) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'Could not determine this site address for passkey sign-in.');
      }
      const lookup = await findUserByEmailInsensitive(normalizedEmail);
      if (lookup.conflict) {
        return fail(reply, 409, 'EMAIL_CASE_CONFLICT', 'This email address is registered on more than one account with different capitalisation. Sign-in is paused for these accounts until the addresses are merged — contact support.');
      }
      const user = lookup.user;
      const credentials = user
        ? ((await passkeyStore().findMany({ where: { userId: user.id } })) as StoredPasskey[])
        : [];
      if (!user || accountLiveness(user) !== 'ok' || credentials.length === 0) {
        return fail(reply, 404, 'PASSKEY_NOT_AVAILABLE', NO_PASSKEY_MESSAGE);
      }
      const options = await generatePasskeyAuthenticationOptions({
        rpID: rp.rpID,
        allowCredentials: credentials.map((row) => ({
          credentialId: row.credentialId,
          publicKey: row.publicKey,
          counter: row.counter,
          transports: row.transports,
        })),
      });
      const { challengeToken, expiresIn } = await signPasskeyChallenge({
        userId: user.id,
        purpose: 'login',
        challenge: options.challenge,
      });
      return reply.send({ success: true, data: { options, challengeToken, expiresIn } });
    },
  );

  // Public: finish a passwordless sign-in.
  fastify.post(
    '/auth/passkeys/login/verify',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!requireTrustedOrigin(request, reply)) return;
      const { email, response, challengeToken } = request.body as any;
      const normalizedEmail = normalizeIdentity(email);
      if (!normalizedEmail || !response || !challengeToken) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'Email address, a passkey response and a challenge are required.');
      }
      const rp = passkeyRpConfig(requestOrigin(request), rpIdOverride);
      if (!rp) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'Could not determine this site address for passkey sign-in.');
      }
      const claims = await verifyPasskeyChallenge(challengeToken, 'login');
      if (!claims) {
        return fail(reply, 401, 'INVALID_CHALLENGE', 'This passkey sign-in expired or is invalid. Start again.');
      }
      const lookup = await findUserByEmailInsensitive(normalizedEmail);
      if (lookup.conflict || !lookup.user || lookup.user.id !== claims.userId) {
        return fail(reply, 401, 'INVALID_PASSKEY', 'That passkey could not be verified.');
      }
      const user = lookup.user;
      const credentialId = typeof response.id === 'string' ? response.id : '';
      const stored = credentialId
        ? ((await passkeyStore().findFirst({
            where: { userId: user.id, credentialId },
          })) as StoredPasskey | null)
        : null;
      if (!stored) {
        return fail(reply, 401, 'INVALID_PASSKEY', 'That passkey could not be verified.');
      }
      const verified = await verifyPasskeyAuthentication({
        response,
        expectedChallenge: claims.challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        credential: {
          credentialId: stored.credentialId,
          publicKey: stored.publicKey,
          counter: stored.counter,
          transports: stored.transports,
        },
      });
      if (!verified.verified || verified.newCounter === undefined) {
        return fail(reply, 401, 'INVALID_PASSKEY', 'That passkey could not be verified.');
      }
      // Clone detection: a counter that did not advance past a nonzero
      // stored value means this credential's assertions are being replayed
      // (or the authenticator was cloned). No session, no counter update.
      if (stored.counter > 0 && verified.newCounter <= stored.counter) {
        return fail(
          reply,
          401,
          'PASSKEY_COUNTER_REPLAY',
          'This passkey looks like it has already been used. Sign in with your password and remove it in Security settings.',
        );
      }
      await passkeyStore().update({
        where: { id: stored.id },
        data: {
          counter: verified.newCounter,
          lastUsedAt: new Date(),
          deviceType: verified.credentialDeviceType ?? stored.deviceType,
          backedUp: verified.credentialBackedUp ?? stored.backedUp,
        },
      });

      const liveness = accountLiveness(user);
      if (liveness === 'suspended') {
        return fail(reply, 401, 'ACCOUNT_SUSPENDED', 'This account is suspended.');
      }
      if (liveness === 'deactivated') {
        return fail(reply, 401, 'ACCOUNT_DEACTIVATED', 'This account is deactivated.');
      }
      const tf = twoFactorState(user);
      if (tf === 'invalid') {
        return fail(
          reply,
          409,
          'TWO_FACTOR_STATE_INVALID',
          'This account security state needs recovery before sign-in.',
        );
      }
      // Possession without user verification must not bypass a deliberately
      // enabled second factor: fall through to the TOTP challenge exactly
      // as a password login does.
      if (tf === 'on' && !verified.userVerified) {
        const { challenge, expiresIn } = await signTwoFactorChallenge(user.id);
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
}
