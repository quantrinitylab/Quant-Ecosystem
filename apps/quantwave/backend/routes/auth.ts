import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { SSOMiddleware, type AuthConfig } from '@quant/auth';
import type { QuantApp } from '@quant/common';
import { AnonymousIdentityService } from '../services/anonymous-identity.service';
import {
  SsoLoginService,
  type CrossAppValidator,
  type SsoTokenPayload,
} from '../services/sso-login.service';

// ============================================================================
// QuantSync auth routes (mounted at /auth).
//
//   POST /auth/sso/login         { quantMailToken }  -> { accessToken, user }
//   POST /auth/anonymous/toggle  { enabled }         -> { isAnonymous, anonymousAlias? }
//
// SSO: QuantMail is the identity root. The client presents its QuantMail access
// token; we validate it as a cross-app token for QuantSync and return the
// session credential + user profile.
// ============================================================================

const toggleSchema = z.object({ enabled: z.boolean() });
const ssoLoginSchema = z.object({ quantMailToken: z.string().min(1) });

function aliasSecret(): string {
  return process.env['ANON_ALIAS_SECRET'] ?? process.env['JWT_SECRET'] ?? 'dev-anon-alias-secret';
}

function authConfig(): AuthConfig {
  const secret = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production';
  return {
    jwtSecret: secret,
    jwtRefreshSecret: process.env['JWT_REFRESH_SECRET'] ?? secret,
    accessTokenExpiresIn: 900,
    refreshTokenExpiresIn: 604800,
    issuer: process.env['JWT_ISSUER'] ?? 'quant-ecosystem',
    audience: process.env['JWT_AUDIENCE'] ?? 'quant-ecosystem',
    bcryptRounds: 12,
    maxLoginAttempts: 5,
    lockoutDuration: 900,
  };
}

/** Adapt @quant/auth SSOMiddleware to the service's narrow validator port. */
function ssoValidator(): CrossAppValidator {
  const sso = new SSOMiddleware(authConfig());
  return {
    validateCrossAppToken: async (token, targetApp) => {
      const r = await sso.validateCrossAppToken(token, targetApp as QuantApp);
      return {
        valid: r.valid,
        reason: r.reason,
        payload: r.payload as (SsoTokenPayload & Record<string, unknown>) | undefined,
      };
    },
  };
}

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/sso/login', async (request, reply) => {
    const parsed = ssoLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const service = new SsoLoginService(ssoValidator());
    const result = await service.login(parsed.data.quantMailToken);
    return reply.send({ success: true, data: result });
  });

  fastify.post('/anonymous/toggle', async (request, reply) => {
    const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    const parsed = toggleSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new AnonymousIdentityService(prisma as never, aliasSecret());
    const state = await service.setGhostMode(userId, parsed.data.enabled);
    return reply.send({ success: true, data: state });
  });
}
