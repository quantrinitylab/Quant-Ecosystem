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
import type { OtpService } from '../lib/otp-service';
import type { SessionTokenIssuer } from '../lib/session-tokens';

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
      data: { message: 'Verification code sent', expiresIn: result.expiresInSec ?? 300 },
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
