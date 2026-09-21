import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { SSOMiddleware, type AuthConfig } from '@quant/auth';
import type { QuantApp } from '@quant/common';
import { AnonymousIdentityService } from '../services/anonymous-identity.service';
import { SessionService, type SessionIdentity } from '../services/session.service';
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
//   GET  /auth/session                              -> { authenticated, identity, user }
//   POST /auth/refresh           { quantMailToken? } -> { accessToken, user }
//   POST /auth/logout                               -> { revoked }
//
// SSO: QuantMail is the identity root. The client presents its QuantMail access
// token; we validate it as a cross-app token for QuantSync and return the
// session credential + user profile.
//
// session/refresh/logout completed the lifecycle: the Next proxies
// (`src/app/api/auth/{session,refresh,logout}`) forwarded to these paths, but only
// sso/login and anonymous/toggle existed, so each one 404'd. Because QuantSync does not
// issue its own tokens, `refresh` re-validates the presented QuantMail credential rather
// than minting a new one — see `session.service.ts`.
// ============================================================================

const toggleSchema = z.object({ enabled: z.boolean() });
const ssoLoginSchema = z.object({ quantMailToken: z.string().min(1) });
/** Refresh may re-present the QuantMail token in the body, or rely on the Authorization header. */
const refreshSchema = z.object({ quantMailToken: z.string().min(1).optional() }).optional();

/** Pull the bearer credential off the request, if present. */
function bearerToken(request: { headers: Record<string, unknown> }): string | undefined {
  const raw = request.headers['authorization'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (typeof header !== 'string') return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || undefined;
}

/** Project the verified auth context onto the service's identity shape. */
function identityOf(request: unknown): SessionIdentity | undefined {
  const auth = (request as { auth?: Record<string, unknown> }).auth;
  if (!auth?.['userId']) return undefined;
  return {
    userId: String(auth['userId']),
    email: String(auth['email'] ?? ''),
    username: String(auth['username'] ?? ''),
    role: String(auth['role'] ?? ''),
    scopes: Array.isArray(auth['scopes']) ? (auth['scopes'] as string[]).map(String) : [],
    sessionId: String(auth['sessionId'] ?? ''),
    app: String(auth['app'] ?? ''),
  };
}

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

  // --- Session lifecycle ---------------------------------------------------

  fastify.get('/session', async (request, reply) => {
    const identity = identityOf(request);
    if (!identity) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new SessionService(prisma as never);
    const data = await service.getSession(
      identity,
      bearerToken(request as unknown as { headers: Record<string, unknown> }),
    );
    return reply.send({ success: true, data });
  });

  /**
   * Re-validate the QuantMail credential. QuantSync cannot issue a longer-lived token, so an
   * expired credential is a 401 that sends the client back to QuantMail — it is never
   * silently renewed here.
   */
  fastify.post('/refresh', async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const token =
      parsed.data?.quantMailToken ??
      bearerToken(request as unknown as { headers: Record<string, unknown> });
    if (!token) {
      throw createAppError(
        'quantMailToken or Authorization header is required',
        400,
        'MISSING_TOKEN',
      );
    }
    const service = new SsoLoginService(ssoValidator());
    const result = await service.login(token);
    return reply.send({ success: true, data: result });
  });

  fastify.post('/logout', async (request, reply) => {
    const identity = identityOf(request);
    if (!identity) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new SessionService(prisma as never);
    const data = await service.logout(
      bearerToken(request as unknown as { headers: Record<string, unknown> }),
    );
    return reply.send({ success: true, data });
  });
}
