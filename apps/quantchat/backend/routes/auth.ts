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
  otp: z.string().regex(/^\d{4,8}$/),
  deviceId: z.string().max(128).optional(),
});

const ssoExchangeSchema = z.object({
  ssoToken: z.string().min(10).max(8192),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10).max(8192),
});

const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    bio: z.string().trim().max(280).optional(),
    avatarUrl: z.string().url().max(2048).optional(),
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
        deletedAt: true,
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
    const { displayName, bio, avatarUrl } = parsed.data;
    if (displayName === undefined && bio === undefined && avatarUrl === undefined) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'At least one of displayName, bio, avatarUrl is required',
          statusCode: 400,
        },
      });
    }
    const updated = await prisma.user.update({
      where: { id: authUserId },
      data: {
        ...(displayName !== undefined ? { displayName } : {}),
        ...(bio !== undefined ? { bio } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
      },
    });
    return reply.send({ success: true, data: updated });
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

    const tokens = await sessionTokens.issue({ userId: user.id, username: user.username });
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
    const tokens = await sessionTokens.issue({ userId: user.id, username: user.username });
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
  // and not be deleted. Rotation: a brand-new pair (new session id) is
  // issued on every successful refresh.
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

    const tokens = await sessionTokens.issue({ userId: user.id, username: user.username });
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
        // Verified! Use the mobile from MSG91 response
        const verifiedMobile = verifyData.data.mobile || phoneNumber;
        const normalized = verifiedMobile.replace(/[\s\-()]/g, '');
        const { user, isNewUser } = await upsertPhoneUser(prisma, normalized);
        const tokens = await sessionTokens.issue({ userId: user.id, username: user.username });
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

    const tokens = await sessionTokens.issue({ userId: user.id, username: user.username });
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
