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

/** Marker for an unusable password (phone-OTP users never log in by password). */
const UNUSABLE_PASSWORD = '!phone-otp-no-password';

function decorations(fastify: FastifyInstance) {
  return fastify as unknown as {
    prisma: PrismaClient;
    otpService: OtpService;
    sessionTokens: SessionTokenIssuer;
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
        avatarUrl: true,
        role: true,
        xpPoints: true,
        level: true,
      },
    });
    if (!user) {
      return reply.status(404).send({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found', statusCode: 404 },
      });
    }
    return reply.send({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
        role: String(user.role).toLowerCase(),
        xpPoints: user.xpPoints,
        level: user.level,
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(`${quantmailBase}/api/oauth/userinfo`, {
          headers: { Authorization: `Bearer ${ssoToken}` },
          signal: controller.signal,
        });
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
      } finally {
        clearTimeout(timeout);
      }
    } catch {
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
    const { user, isNewUser } = await upsertSsoUser(prisma, identity);

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
    return reply.send({
      success: true,
      data: {
        message: 'Verification code sent',
        expiresIn: result.expiresInSec ?? 300,
        ...(result.demoCode ? { demoCode: result.demoCode } : {}),
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
  const existing = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: { id: true, email: true, username: true, displayName: true, role: true },
  });
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
