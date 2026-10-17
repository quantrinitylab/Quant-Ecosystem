// ============================================================================
// QuantChat - Phone OTP Auth Routes
// ============================================================================
//
// QuantMail is the ecosystem identity root (SSO), but QuantChat additionally
// requires a verified phone number. These PUBLIC endpoints (allow-listed via
// AppConfig.publicPaths in app.ts) own that step:
//
//   POST /auth/otp/request  { phoneNumber, countryCode }  -> { expiresIn }
//   POST /auth/otp/verify   { phoneNumber, otp }           -> AuthTokens + isNewUser
//
// On successful verification we upsert a phone-identified user and issue real
// JWTs (signed with the shared server-core secret/issuer/audience, so they are
// accepted by every protected route).

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { passwordService } from '@quant/auth';
import type { OtpService } from '../lib/otp-service';
import type { SessionTokenIssuer } from '../lib/session-tokens';
import { RefreshTokenStore, type RefreshSessionMeta } from '../lib/refresh-token-store';
import { validateMediaUrl } from '../lib/media-url';
import {
  EMOJI_STATUS_DURATIONS,
  emojiStatusInputSchema,
  serializeEmojiStatus,
} from '../lib/emoji-status';
import { parseDateOfBirth, toDateOnlyString } from '../lib/birthdays';
import { fetchWithTimeout, getTimeoutMs } from '@quant/server-core';

const loginSchema = z.object({
  identifier: z.string().min(1).max(255),
  password: z.string().min(1).max(255),
});

const requestSchema = z.object({
  phoneNumber: z.string().min(4).max(20),
  countryCode: z
    .string()
    .regex(/^\+\d{1,4}$/)
    .optional(),
  locale: z.string().min(2).max(8).optional(),
});

const verifySchema = z.object({
  phoneNumber: z.string().min(4).max(24),
  // QC-F-304: plain digit OTPs (local path) OR the MSG91 widget form
  // "msg91:<access-token>". The digit-only schema previously made the
  // msg91: branch below unreachable; the widened form is admitted ONLY
  // in this exact shape and the branch itself must fail closed on
  // identity binding (see the guard there).
  otp: z.string().regex(/^(\d{4,8}|msg91:\S{10,4096})$/),
  deviceId: z.string().max(128).optional(),
});

const ssoExchangeSchema = z.object({
  ssoToken: z.string().min(10).max(8192),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10).max(8192),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(10).max(8192),
});

/** Best-effort session metadata for the refresh-token row (display/audit only). */
function sessionMeta(request: { headers: Record<string, unknown>; ip?: string }): RefreshSessionMeta {
  const ua = request.headers['user-agent'];
  return {
    userAgent: typeof ua === 'string' ? ua : undefined,
    ipAddress: request.ip,
  };
}

const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    bio: z.string().trim().max(280).optional(),
    avatarUrl: z.string().url().max(2048).optional(),
    // QC-F-466: expiring emoji status. Nested object = set/replace (server
    // computes the expiry from the closed duration enum — a client-sent
    // absolute `expiresAt` is rejected by .strict()); explicit null =
    // clear; absent = leave the current status untouched.
    emojiStatus: emojiStatusInputSchema.nullable().optional(),
    // QC-F-467: date of birth as a date-only string. 'YYYY-MM-DD' sets /
    // replaces, null clears, absent leaves the column untouched. Calendar /
    // future / range validation runs in the handler via parseDateOfBirth —
    // a bare regex would admit 2026-02-30. The value is SELF-DECLARED and
    // UNVERIFIED: it is a celebration fact here, never age proof (the
    // QC-F-441 age-gate slice must do its own consent/enforcement design).
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .strict();

/** Marker for an unusable password (phone-OTP users never log in by password). */
const UNUSABLE_PASSWORD = '!phone-otp-no-password';

function decorations(fastify: FastifyInstance) {
  return fastify as unknown as {
    prisma: PrismaClient;
    otpService: OtpService;
    sessionTokens: SessionTokenIssuer;
  };
}

/**
 * QC-F-041: thrown by the upsert helpers when the identity being signed in
 * belongs to a soft-deleted account. Deleted accounts must never receive a
 * fresh token pair — not via phone OTP (previously upsertPhoneUser happily
 * re-issued a pair: full resurrection), and not via SSO exchange
 * (previously the lookup's deletedAt filter made the deleted row invisible,
 * the code tried to CREATE a duplicate, and the request died as a 500 on
 * the email unique constraint). Handlers translate this into an honest
 * 401 ACCOUNT_DELETED. Reactivation of a deleted account is a product
 * decision for a deliberate future flow, never an accident of sign-in.
 */
export class AccountDeletedError extends Error {
  readonly code = 'ACCOUNT_DELETED';
  constructor() {
    super('This account has been deleted');
    this.name = 'AccountDeletedError';
  }
}

function accountDeletedBody() {
  return {
    success: false,
    error: { code: 'ACCOUNT_DELETED', message: 'This account has been deleted', statusCode: 401 },
  };
}

export default async function authRoutes(fastify: FastifyInstance) {
  const { prisma, otpService, sessionTokens } = decorations(fastify);
  // QC-F-118: stateful refresh redemption (rotation spend + reuse
  // detection + family revocation) on the existing RefreshToken model.
  const refreshStore = new RefreshTokenStore(prisma, sessionTokens);

  // GET /auth/me — OIDC-style userinfo: verify the caller's bearer token (the
  // global auth hook already validated the JWT signature and bound req.auth)
  // and return the durable, backend-resolved identity. This is what the shared
  // useAuth hook resolves via each app's `/api/auth/userinfo` proxy. It is NOT
  // in publicPaths, so an absent/invalid token is rejected upstream — the app
  // fails closed (no fabricated user).
  fastify.get('/me', async (request, reply) => {
    const authUserId = (request as { auth?: { userId?: string } }).auth?.userId;
    if (!authUserId) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required', statusCode: 401 },
      });
    }
    const user = await prisma.user.findUnique({
      where: { id: authUserId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        role: true,
        xpPoints: true,
        level: true,
        statusEmoji: true,
        statusEmojiExpiresAt: true,
        deletedAt: true,
        dateOfBirth: true,
      },
    });
    if (!user) {
      return reply.status(404).send({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found', statusCode: 404 },
      });
    }
    // QC-F-041 defense-in-depth: /auth/me is the identity-resolution path
    // for the whole web session, so it refuses a deleted account itself —
    // even on a deployment where the auth-plugin gate was not enabled,
    // a deleted user must not be handed their profile as a live identity.
    if (user.deletedAt) {
      return reply.status(401).send(accountDeletedBody());
    }
    return reply.send({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        ...(user.bio ? { bio: user.bio } : {}),
        ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
        role: String(user.role).toLowerCase(),
        xpPoints: user.xpPoints,
        level: user.level,
        // QC-F-466: live status only — an expired stored status reads null.
        emojiStatus: serializeEmojiStatus(user),
        // QC-F-467: the OWNER always gets their own full DOB back (the key
        // is present even when null, so the edit form never has to guess).
        // Other users only ever receive month/day — see the participant
        // DTO and /users/birthdays/today.
        dateOfBirth: user.dateOfBirth ? toDateOnlyString(user.dateOfBirth) : null,
      },
    });
  });

  // PUT /auth/profile — update the caller's editable profile fields
  // (displayName, bio, avatarUrl). Previously the frontend's updateProfile()
  // called this endpoint but no route existed, so profile edits 404'd.
  fastify.put('/profile', async (request, reply) => {
    const authUserId = (request as { auth?: { userId?: string } }).auth?.userId;
    if (!authUserId) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required', statusCode: 401 },
      });
    }
    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid profile payload', statusCode: 400 },
      });
    }
    const { displayName, bio, avatarUrl, emojiStatus, dateOfBirth } = parsed.data;
    // QC-F-467: strict calendar/future/range validation of the date-only
    // string (the schema regex alone admits impossible dates).
    let parsedDob: Date | null = null;
    if (dateOfBirth !== undefined && dateOfBirth !== null) {
      parsedDob = parseDateOfBirth(dateOfBirth);
      if (!parsedDob) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'Invalid date of birth',
            statusCode: 400,
          },
        });
      }
    }
    // QC-F-330: User.avatarUrl renders in other users' browsers across
    // the network (chat list, search, stories, map) — a bare `.url()`
    // check let any external host become a tracking avatar. Only
    // own-storage URLs are accepted here; `data:` is NOT (no shipped
    // caller sends one — generated avatars go through /avatar/select).
    // Runs after the 401 gate above so the URL policy is never an oracle
    // for unauthenticated callers. Envelope matches this handler's style.
    if (
      avatarUrl !== undefined &&
      !validateMediaUrl(avatarUrl, { ownerId: authUserId, allowData: false }).ok
    ) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'MEDIA_URL_NOT_ALLOWED',
          message: 'Media URL must be an upload issued for your account or an inline data URL',
          statusCode: 400,
        },
      });
    }
    if (
      displayName === undefined &&
      bio === undefined &&
      avatarUrl === undefined &&
      emojiStatus === undefined &&
      dateOfBirth === undefined
    ) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'At least one of displayName, bio, avatarUrl, emojiStatus, dateOfBirth is required',
          statusCode: 400,
        },
      });
    }
    // QC-F-466: the two status columns are written together or not at all.
    // Set: server-computed expiry from the closed duration enum. Clear
    // (explicit null): both columns NULL. Absent: neither column is in the
    // update payload, so an unrelated profile edit never disturbs a live
    // status. The write target is always the caller's own row
    // (request.auth.userId) — there is no body field that can aim it
    // elsewhere, and .strict() rejects one if a client tries.
    const emojiStatusData =
      emojiStatus === undefined
        ? {}
        : emojiStatus === null
          ? { statusEmoji: null, statusEmojiExpiresAt: null }
          : {
              statusEmoji: emojiStatus.key,
              statusEmojiExpiresAt: new Date(
                Date.now() + EMOJI_STATUS_DURATIONS[emojiStatus.duration],
              ),
            };
    const updated = await prisma.user.update({
      where: { id: authUserId },
      data: {
        ...(displayName !== undefined ? { displayName } : {}),
        ...(bio !== undefined ? { bio } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        ...emojiStatusData,
        // QC-F-467: null clears the column; a string writes the validated
        // UTC-midnight date; absent never reaches this spread.
        ...(dateOfBirth !== undefined ? { dateOfBirth: parsedDob } : {}),
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        statusEmoji: true,
        statusEmojiExpiresAt: true,
        dateOfBirth: true,
      },
    });
    return reply.send({
      success: true,
      data: {
        id: updated.id,
        username: updated.username,
        displayName: updated.displayName,
        bio: updated.bio,
        avatarUrl: updated.avatarUrl,
        // QC-F-466: live status only (raw stored columns never leave).
        emojiStatus: serializeEmojiStatus(updated),
        // QC-F-467: the owner sees their own DOB as a date-only string
        // (or null) — never a raw Date whose JSON form leaks a
        // time/timezone. (Explicit field list, not a spread of `updated`,
        // so the raw statusEmoji columns above never leak either.)
        dateOfBirth: updated.dateOfBirth ? toDateOnlyString(updated.dateOfBirth) : null,
      },
    });
  });

  // POST /auth/login — Email/Username/Phone + Password direct authentication
  fastify.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Identifier and password are required',
          statusCode: 400,
        },
      });
    }
    const { identifier, password } = parsed.data;
    const normalized = identifier.trim().toLowerCase();

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: normalized }, { username: normalized }, { phoneNumber: identifier.trim() }],
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        phoneNumber: true,
        passwordHash: true,
        role: true,
      },
    });

    const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$c29tZXNhbHQ';
    if (!user || !user.passwordHash || user.passwordHash.startsWith('!')) {
      await passwordService.verify(DUMMY_HASH, password).catch(() => false);
      return reply.status(401).send({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid identifier or password',
          statusCode: 401,
        },
      });
    }

    const isValid = await passwordService.verify(user.passwordHash, password);
    if (!isValid) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid identifier or password',
          statusCode: 401,
        },
      });
    }

    const tokens = await refreshStore.issueNewSession(
      { userId: user.id, username: user.username },
      sessionMeta(request),
    );
    return reply.send({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        tokenType: tokens.tokenType,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          phoneNumber: user.phoneNumber,
          role: String(user.role).toLowerCase(),
        },
      },
    });
  });

  // POST /auth/sso/exchange — Exchange a QuantMail SSO token for QuantChat-native tokens.
  //
  // WHY THIS EXISTS: QuantMail's SSO handoff redirects back with a QuantMail-issued
  // JWT (?token=...). That JWT is signed with QuantMail's secret and carries
  // issuer/audience `quantmail`/`quant-ecosystem`, which QuantChat's auth hook
  // (secret + issuer/audience `quantchat`) rejects with 401. Storing the raw
  // QuantMail JWT meant `useAuth` → `/auth/me` got 401 → fail-closed cleared the
  // session → the user bounced back to /login forever.
  //
  // This PUBLIC endpoint verifies the SSO token back-channel against QuantMail's
  // `/api/oauth/userinfo`, upserts the user by verified email, and returns
  // QuantChat-native tokens minted by `sessionTokens`.
  fastify.post('/sso/exchange', async (request, reply) => {
    const parsed = ssoExchangeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'ssoToken is required',
          statusCode: 400,
        },
      });
    }
    const { ssoToken } = parsed.data;

    // 1. Verify the SSO token back-channel against QuantMail (server-side; the
    //    token is never trusted on its claims alone).
    const quantmailBase = (
      process.env['QUANTMAIL_BACKEND_URL'] || 'https://quantmail.in'
    ).replace(/\/$/, '');
    let identity: { email: string; username?: string; displayName?: string };
    try {
      {
        // K13: upstream OIDC/userinfo verification runs under the central
        // remote-call timeout policy ('sso' — default 8000ms, overridable via
        // QUANT_TIMEOUT_SSO). A hung QuantMail fails fast with a typed
        // RemoteCallTimeoutError instead of an untyped abort / silent hang.
        // QUANTMAIL_BACKEND_URL differs by environment: production points at
        // the internal k8s service (no /api prefix — that only exists on the
        // public Next.js proxy), while local/dev may point at the public
        // frontend (which proxies /api/*). Try the direct backend path first,
        // fall back to the proxied path on 404.
        let res: Response | null = null;
        for (const userinfoPath of ['/oauth/userinfo', '/api/oauth/userinfo']) {
          const attempt = await fetchWithTimeout(
            `${quantmailBase}${userinfoPath}`,
            { headers: { Authorization: `Bearer ${ssoToken}` } },
            'sso',
          );
          if (attempt.status === 404) continue; // path not served here — try next
          res = attempt;
          break;
        }
        if (!res) {
          return reply.status(401).send({
            success: false,
            error: {
              code: 'INVALID_SSO_TOKEN',
              message: 'SSO token not accepted by QuantMail',
              statusCode: 401,
            },
          });
        }
        if (!res.ok) {
          return reply.status(401).send({
            success: false,
            error: {
              code: 'INVALID_SSO_TOKEN',
              message: 'SSO token not accepted by QuantMail',
              statusCode: 401,
            },
          });
        }
        const body = (await res.json().catch(() => null)) as {
          data?: { id?: unknown; email?: unknown; username?: unknown; displayName?: unknown };
        } | null;
        const data = body?.data;
        if (!data || typeof data.email !== 'string' || !data.email.includes('@')) {
          return reply.status(401).send({
            success: false,
            error: {
              code: 'INVALID_SSO_TOKEN',
              message: 'SSO identity incomplete',
              statusCode: 401,
            },
          });
        }
        identity = {
          email: data.email.toLowerCase(),
          username: typeof data.username === 'string' ? data.username : undefined,
          displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
        };
      }
    } catch (err) {
      // Labeled log: timeout vs. other upstream failures are distinguishable
      // by `code` (REMOTE_CALL_TIMEOUT) for the health endpoint / metrics.
      request.log.warn(
        {
          dependency: 'sso',
          code: (err as { code?: string } | null)?.code ?? 'UNKNOWN',
          timeoutMs: getTimeoutMs('sso'),
        },
        'sso userinfo upstream call failed',
      );
      return reply.status(502).send({
        success: false,
        error: {
          code: 'SSO_VERIFY_UNAVAILABLE',
          message: 'Could not verify SSO token with QuantMail',
          statusCode: 502,
        },
      });
    }

    // 2. Upsert the QuantChat user by verified email.
    let ssoUpsert: Awaited<ReturnType<typeof upsertSsoUser>>;
    try {
      ssoUpsert = await upsertSsoUser(prisma, identity);
    } catch (err) {
      // QC-F-041: deleted QuantChat account — a clean refusal, not a 500.
      if (err instanceof AccountDeletedError) {
        return reply.status(401).send(accountDeletedBody());
      }
      throw err;
    }
    const { user, isNewUser } = ssoUpsert;

    // 3. Issue QuantChat-native tokens (accepted by every protected route).
    const tokens = await refreshStore.issueNewSession(
      { userId: user.id, username: user.username },
      sessionMeta(request),
    );
    return reply.send({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        tokenType: tokens.tokenType,
        isNewUser,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          role: String(user.role).toLowerCase(),
        },
      },
    });
  });

  // POST /auth/refresh — redeem a refresh token for a fresh token pair.
  //
  // WHY THIS EXISTS: the web client's apiClient has always called
  // `/auth/refresh` on a 401 (with the stored refresh token), but NO route
  // existed at either the Next proxy layer or here — every refresh attempt
  // 404'd, so sessions died at access-token expiry (1h) and users were
  // bounced to /login despite holding a valid 30-day refresh token.
  //
  // This route is PUBLIC (allow-listed in app.ts publicPaths) because it
  // authenticates by the refresh token itself: the issuer verifies the
  // signature/issuer/audience/expiry AND the `kind: 'refresh'` claim (an
  // access token is NOT redeemable here), then the user must still exist
  // and not be deleted. Rotation is STATEFUL (QC-F-118): the presented
  // token is spent against its RefreshToken row and a successor pair is
  // issued in the same family; replaying a spent token revokes the family.
  fastify.post('/refresh', async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'refreshToken is required',
          statusCode: 400,
        },
      });
    }

    const payload = sessionTokens.verifyRefreshToken(parsed.data.refreshToken);
    if (!payload) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Refresh token is invalid or expired',
          statusCode: 401,
        },
      });
    }

    const userId = payload['sub'] as string;
    let user: { id: string; username: string; deletedAt: Date | null } | null;
    try {
      user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, deletedAt: true },
      });
    } catch (err) {
      request.log.error({ err }, 'refresh: user lookup failed');
      return reply.status(503).send({
        success: false,
        error: {
          code: 'UPSTREAM_UNAVAILABLE',
          message: 'Auth service unavailable',
          statusCode: 503,
        },
      });
    }
    if (!user || user.deletedAt) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Refresh token is invalid or expired',
          statusCode: 401,
        },
      });
    }

    // QC-F-118: stateful redemption. The account check above deliberately
    // runs BEFORE the store spends anything (a refused account's token is
    // never spent and its family never advances). The store spends the
    // presented token (CAS), issues the successor in the same family, and
    // treats re-presentation of a spent token — outside the short
    // chain-follow grace for the client's parallel-401 race — as reuse:
    // the whole family is revoked.
    const redeemed = await refreshStore.redeem({
      payload,
      presentedToken: parsed.data.refreshToken,
      subject: { userId: user.id, username: user.username },
      meta: sessionMeta(request),
    });
    if (!redeemed.ok) {
      if (redeemed.reason === 'unavailable') {
        return reply.status(503).send({
          success: false,
          error: {
            code: 'UPSTREAM_UNAVAILABLE',
            message: 'Auth service unavailable',
            statusCode: 503,
          },
        });
      }
      if (redeemed.reason === 'legacy') {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'INVALID_REFRESH_TOKEN',
            message: 'Refresh token is invalid or expired',
            statusCode: 401,
          },
        });
      }
      // unknown / binding / reuse — the family has been revoked. The log
      // carries ids and the family only, never any token material.
      request.log.warn(
        { userId: user.id, family: redeemed.familyId, reason: redeemed.reason },
        'refresh token reuse detected; session family revoked',
      );
      return reply.status(401).send({
        success: false,
        error: {
          code: 'REFRESH_TOKEN_REUSE_DETECTED',
          message: 'Refresh token reuse detected; this session has been revoked',
          statusCode: 401,
        },
      });
    }

    const tokens = redeemed.tokens;
    return reply.send({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        tokenType: tokens.tokenType,
      },
    });
  });

  // POST /auth/logout — revoke the caller's refresh-token family server-side.
  //
  // QC-F-118: there was NO backend logout route at all, so "sign out" only
  // cleared cookies/local storage while the refresh token itself stayed
  // redeemable for its full 30 days. This route is AUTHENTICATED (not in
  // publicPaths): the global auth hook has already bound req.auth from the
  // access token, and the store revokes only a family whose refresh token
  // both digests to a stored row AND belongs to that same user — nobody
  // can revoke another user's session by presenting its token here.
  // Idempotent: an unknown token still returns 200 signedOut.
  fastify.post('/logout', async (request, reply) => {
    const authUserId = (request as { auth?: { userId?: string } }).auth?.userId;
    if (!authUserId) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required', statusCode: 401 },
      });
    }
    const parsed = logoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'refreshToken is required',
          statusCode: 400,
        },
      });
    }
    try {
      await refreshStore.revokeFamilyForUser(authUserId, parsed.data.refreshToken);
    } catch (err) {
      request.log.error({ err }, 'logout: refresh family revoke failed');
      return reply.status(503).send({
        success: false,
        error: {
          code: 'UPSTREAM_UNAVAILABLE',
          message: 'Auth service unavailable',
          statusCode: 503,
        },
      });
    }
    return reply.send({ success: true, data: { signedOut: true } });
  });

  // POST /auth/otp/request
  fastify.post('/otp/request', async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid request', statusCode: 400 },
      });
    }
    const { phoneNumber, countryCode, locale } = parsed.data;
    const full = countryCode ? `${countryCode}${phoneNumber.replace(/\D/g, '')}` : phoneNumber;

    const result = await otpService.requestCode(full, locale ?? 'en');
    if (!result.ok) {
      return reply.status(429).send({
        success: false,
        error: { code: 'OTP_REQUEST_FAILED', message: result.error ?? 'Failed', statusCode: 429 },
        ...(result.retryAfterSec ? { metadata: { retryAfter: result.retryAfterSec } } : {}),
      });
    }
    // QC-F-062: the response must never carry the OTP itself (no demoCode) —
    // this endpoint is public, so anything in the body is readable by an
    // unauthenticated caller asking for a victim's number.
    return reply.send({
      success: true,
      data: {
        message: 'Verification code sent',
        expiresIn: result.expiresInSec ?? 300,
      },
    });
  });

  // POST /auth/otp/verify
  fastify.post('/otp/verify', async (request, reply) => {
    const parsed = verifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid request', statusCode: 400 },
      });
    }
    const { phoneNumber, otp } = parsed.data;

    // MSG91 widget verification: otp format is "msg91:<jwt-access-token>"
    // Verify the JWT with MSG91's verifyAccessToken API
    if (otp.startsWith('msg91:')) {
      const accessToken = otp.slice('msg91:'.length);
      const authKey = process.env.MSG91_AUTH_KEY?.trim();
      if (!authKey) {
        return reply.status(500).send({
          success: false,
          error: { code: 'OTP_CONFIG', message: 'OTP not configured', statusCode: 500 },
        });
      }
      try {
        const verifyRes = await fetch('https://control.msg91.com/api/v5/widget/verifyAccessToken', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authkey: authKey, 'access-token': accessToken }),
        });
        const verifyData = (await verifyRes.json().catch(() => ({}))) as {
          type?: string;
          data?: { mobile?: string; verified?: boolean };
        };
        if (verifyData.type !== 'success' || !verifyData.data?.verified) {
          return reply.status(401).send({
            success: false,
            error: { code: 'OTP_INVALID', message: 'OTP verification failed', statusCode: 401 },
          });
        }
        // QC-F-304: identity binds ONLY to the provider-verified mobile.
        // The previous `verifyData.data.mobile || phoneNumber` fallback
        // issued a full session for the body-supplied number whenever the
        // provider omitted `mobile` — an unauthenticated caller could
        // verify their OWN number in the widget and take over ANY phone
        // account. Fail closed instead: a missing/blank provider mobile
        // is a rejection, and a provider mobile that does not match the
        // body number digit-for-digit (format-insensitive: "+91…" and
        // "91…" are the same number; no partial/suffix matching) is a
        // rejection. The 401 shape is identical to the not-verified
        // response above, so nothing about the provider reply leaks.
        const providerMobile = verifyData.data.mobile;
        const providerDigits =
          typeof providerMobile === 'string' ? providerMobile.replace(/\D/g, '') : '';
        const bodyDigits = phoneNumber.replace(/\D/g, '');
        if (!providerDigits || providerDigits !== bodyDigits) {
          return reply.status(401).send({
            success: false,
            error: { code: 'OTP_INVALID', message: 'OTP verification failed', statusCode: 401 },
          });
        }
        // Verified — and the verified mobile matches the requested number.
        // Binding/storage normalization is unchanged: the provider's
        // mobile is the identity source, the body was only a cross-check.
        const verifiedMobile = providerMobile as string;
        const normalized = verifiedMobile.replace(/[\s\-()]/g, '');
        const { user, isNewUser } = await upsertPhoneUser(prisma, normalized);
        const tokens = await refreshStore.issueNewSession(
          { userId: user.id, username: user.username },
          sessionMeta(request),
        );
        return reply.send({
          success: true,
          data: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn: tokens.expiresIn,
            tokenType: tokens.tokenType,
            isNewUser,
            user: { id: user.id, username: user.username, phoneNumber: user.phoneNumber },
          },
        });
      } catch (err) {
        // QC-F-041: a deleted account is an honest 401, not a 500.
        if (err instanceof AccountDeletedError) {
          return reply.status(401).send(accountDeletedBody());
        }
        return reply.status(500).send({
          success: false,
          error: { code: 'OTP_VERIFY_ERROR', message: 'Verification failed', statusCode: 500 },
        });
      }
    }

    const verdict = otpService.verifyCode(phoneNumber, otp);
    if (!verdict.ok) {
      return reply.status(401).send({
        success: false,
        error: { code: 'OTP_INVALID', message: verdict.error ?? 'Invalid code', statusCode: 401 },
      });
    }

    const normalized = phoneNumber.replace(/[\s\-()]/g, '');
    let phoneUpsert: Awaited<ReturnType<typeof upsertPhoneUser>>;
    try {
      phoneUpsert = await upsertPhoneUser(prisma, normalized);
    } catch (err) {
      if (err instanceof AccountDeletedError) {
        return reply.status(401).send(accountDeletedBody());
      }
      throw err;
    }
    const { user, isNewUser } = phoneUpsert;

    const tokens = await refreshStore.issueNewSession(
      { userId: user.id, username: user.username },
      sessionMeta(request),
    );
    return reply.send({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        tokenType: tokens.tokenType,
        isNewUser,
        user: { id: user.id, username: user.username, phoneNumber: user.phoneNumber },
      },
    });
  });
}

/**
 * Find-or-create a user by QuantMail-verified SSO identity. New users get an
 * unusable password (they authenticate via QuantMail SSO, never password) and a
 * unique username derived from their QuantMail handle.
 */
async function upsertSsoUser(
  prisma: PrismaClient,
  identity: { email: string; username?: string; displayName?: string },
): Promise<{
  user: { id: string; email: string; username: string; displayName: string; role: unknown };
  isNewUser: boolean;
}> {
  const email = identity.email.toLowerCase();
  // QC-F-041: look the row up WITHOUT the deletedAt filter so a deleted
  // account is seen and refused explicitly. The old `deletedAt: null`
  // filter made the deleted row invisible here, after which the create
  // path below collided with the email unique constraint and the exchange
  // died as a 500 — fail-closed only by accident.
  const existing = await prisma.user.findFirst({
    where: { email },
    select: { id: true, email: true, username: true, displayName: true, role: true, deletedAt: true },
  });
  if (existing?.deletedAt) {
    throw new AccountDeletedError();
  }
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        lastLoginAt: new Date(),
        loginCount: { increment: 1 },
        emailVerified: true,
        isVerified: true,
      },
    });
    return { user: existing, isNewUser: false };
  }

  const base = (identity.username || email.split('@')[0] || 'quant_user')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .slice(0, 24) || 'quant_user';

  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = attempt === 0 ? '' : `_${randomUUID().replace(/-/g, '').slice(0, 6)}`;
    const username = `${base}${suffix}`.slice(0, 30);
    try {
      const created = await prisma.user.create({
        data: {
          email,
          username,
          displayName: identity.displayName || identity.username || email.split('@')[0] || 'Quant User',
          passwordHash: UNUSABLE_PASSWORD,
          emailVerified: true,
          isVerified: true,
          status: 'ACTIVE',
          lastLoginAt: new Date(),
          loginCount: 1,
        },
        select: { id: true, email: true, username: true, displayName: true, role: true },
      });
      return { user: created, isNewUser: true };
    } catch (err) {
      if (isUniqueConstraintError(err) && attempt < 4) continue;
      throw err;
    }
  }
  throw new Error('Failed to allocate a unique username for SSO user');
}

/**
 * Find-or-create a user by verified phone number. New users get a synthesized
 * unique placeholder email + an unusable password (they authenticate by OTP,
 * never password) and a random username they can change in the profile step.
 */
async function upsertPhoneUser(
  prisma: PrismaClient,
  phone: string,
): Promise<{
  user: { id: string; username: string; phoneNumber: string | null };
  isNewUser: boolean;
}> {
  const existing = await prisma.user.findUnique({ where: { phoneNumber: phone } });
  if (existing) {
    // QC-F-041: a deleted account must not be resurrected by OTP. This
    // lookup previously had no deletedAt handling at all, so a deleted
    // phone user received a brand-new token pair on every verify.
    if (existing.deletedAt) {
      throw new AccountDeletedError();
    }
    if (!existing.phoneVerified) {
      await prisma.user.update({ where: { id: existing.id }, data: { phoneVerified: true } });
    }
    return {
      user: { id: existing.id, username: existing.username, phoneNumber: existing.phoneNumber },
      isNewUser: false,
    };
  }

  const phoneDigits = phone.replace(/\D/g, '');
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
    try {
      const created = await prisma.user.create({
        data: {
          email: `phone_${phoneDigits}_${suffix}@phone.quantchat.local`,
          username: `qc_${suffix}`,
          displayName: 'QuantChat User',
          passwordHash: UNUSABLE_PASSWORD,
          phoneNumber: phone,
          phoneVerified: true,
        },
      });
      return {
        user: { id: created.id, username: created.username, phoneNumber: created.phoneNumber },
        isNewUser: true,
      };
    } catch (err) {
      // Retry only on unique-constraint collisions (username/email); rethrow others.
      if (isUniqueConstraintError(err) && attempt < 4) continue;
      // If the phone was created concurrently, fall back to fetching it.
      const race = await prisma.user.findUnique({ where: { phoneNumber: phone } });
      if (race) {
        // Same QC-F-041 refusal on the race path.
        if (race.deletedAt) {
          throw new AccountDeletedError();
        }
        return {
          user: { id: race.id, username: race.username, phoneNumber: race.phoneNumber },
          isNewUser: false,
        };
      }
      throw err;
    }
  }
  throw new Error('Failed to allocate a unique username');
}

function isUniqueConstraintError(err: unknown): boolean {
  return Boolean(
    err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002',
  );
}
