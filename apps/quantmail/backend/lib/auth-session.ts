/**
 * The browser session boundary, in one place.
 *
 * Login and the two-factor verification that completes it must issue exactly
 * the same credentials in exactly the same way — same cookie flags, same
 * response shape, same trusted-origin rule. When those rules lived inline in
 * `routes/auth.ts`, the second copy needed by `/auth/2fa/verify` would have been
 * a copy: one that drifts, and drifts silently, because a weaker cookie still
 * logs people in.
 */

import type { FastifyRequest } from 'fastify';
import { TokenService } from '@quant/auth/services/token-service';
import { getJwtSecret, getJwtRefreshSecret } from '@quant/auth/lib/secrets';

export const REFRESH_COOKIE_NAME = 'quantmail_refresh';
export const REFRESH_COOKIE_PATH = '/auth';
export const REFRESH_TOKEN_TTL_SECONDS = 2_592_000;

export const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'strict' as const,
  path: REFRESH_COOKIE_PATH,
  maxAge: REFRESH_TOKEN_TTL_SECONDS,
});

export const configuredOrigins = (): Set<string> =>
  new Set(
    (process.env['CORS_ORIGINS'] ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );

export const hasTrustedOrigin = (request: { headers: Record<string, unknown> }): boolean => {
  const origin = request.headers['origin'];
  return typeof origin === 'string' && configuredOrigins().has(origin.replace(/\/$/, ''));
};

/* The route handlers this serves are written against loose `any` reply objects,
   and narrowing here would only move the casts to every call site. */

export const fail = (reply: any, statusCode: number, code: string, message: string) =>
  reply.code(statusCode).send({ success: false, error: { code, message, statusCode } });

export const setRefreshCookie = (reply: any, token: string) =>
  reply.setCookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions());

export const clearRefreshCookie = (reply: any) =>
  reply.clearCookie(REFRESH_COOKIE_NAME, {
    path: REFRESH_COOKIE_PATH,
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'strict',
  });

export const requireTrustedOrigin = (request: any, reply: any): boolean => {
  if (hasTrustedOrigin(request)) return true;
  fail(reply, 403, 'UNTRUSTED_ORIGIN', 'The request origin is not allowed.');
  return false;
};

/** The userId the global auth hook attached, or undefined for anonymous. */
export const authenticatedUserId = (request: FastifyRequest | unknown): string | undefined =>
  (request as { auth?: { userId?: string } }).auth?.userId;

export const createTokenService = (): TokenService =>
  new TokenService({
    jwtSecret: getJwtSecret(),
    jwtRefreshSecret: getJwtRefreshSecret(),
    accessTokenExpiresIn: 900,
    refreshTokenExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
    issuer: process.env['JWT_ISSUER'] ?? 'quantmail',
    audience: process.env['JWT_AUDIENCE'] ?? 'quant-ecosystem',
    bcryptRounds: 12,
    maxLoginAttempts: 5,
    lockoutDuration: 900,
  });

export interface SessionUser {
  id: string;
  email: string;
  username: string;
  displayName?: string | null;
  role: string;
}

/**
 * Mint the pair, park the refresh half in the HttpOnly cookie, and return the
 * JSON body. The refresh token is never part of that body — the whole point of
 * the cookie is that JavaScript cannot read it, and echoing it in JSON would
 * undo that in one line.
 */
export async function issueBrowserSession(
  tokenService: TokenService,
  reply: any,
  user: SessionUser,
): Promise<{ success: true; data: Record<string, unknown> }> {
  const tokens = await tokenService.generateTokenPair(
    user.id,
    { email: user.email, username: user.username, role: user.role },
    ['openid', 'profile', 'email'],
    'quantmail' as any,
  );

  setRefreshCookie(reply, tokens.refreshToken);

  return {
    success: true,
    data: {
      userId: user.id,
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      tokenType: tokens.tokenType,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
      },
    },
  };
}
