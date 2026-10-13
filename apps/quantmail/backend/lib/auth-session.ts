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
import { TokenService, type SessionMetadata } from '@quant/auth/services/token-service';
import { getJwtSecret, getJwtRefreshSecret } from '@quant/auth/lib/secrets';

export const REFRESH_COOKIE_NAME = 'quantmail_refresh';
// Path=/ : the browser must send this cookie to the /api/auth/* Next.js proxy
// routes (refresh, logout) AND the edge middleware must see it on page routes
// (/, /login, ...) as the signed-in signal. A narrower path (e.g. /auth)
// silently breaks both: the browser withholds the cookie from /api/*, so
// refresh stops working and every signed-in page load bounces to /login.
export const REFRESH_COOKIE_PATH = '/';
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

/**
 * Display metadata for the Active Sessions tab (QM-SCREEN-016), captured from
 * the request that is opening the browser session. Best-effort and never a
 * security signal: the user-agent is client-controlled and the IP is whatever
 * the edge saw (often a proxy). The /auth/refresh endpoint passes this on
 * every rotation, which is what tags legacy sessions as browser sessions on
 * their first rotation after metadata capture ships.
 */
export const sessionMetadataFromRequest = (request: {
  headers?: Record<string, unknown>;
  ip?: string;
}): SessionMetadata => {
  const header = request.headers?.['user-agent'];
  const userAgent = typeof header === 'string' && header.trim() ? header.trim() : undefined;
  const ipAddress = typeof request.ip === 'string' && request.ip ? request.ip : undefined;
  return { source: 'browser', userAgent, ipAddress };
};

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
  phoneNumber?: string | null;
  phoneVerified?: boolean | null;
}

/**
 * The profile the browser embeds in every session-minting response
 * (/auth/login, /auth/register, /auth/2fa/verify, /auth/refresh). Same shape as
 * GET /oauth/userinfo so the frontend can hydrate from the session response
 * alone and skip its second round trip. One builder for every endpoint keeps
 * the four shapes from drifting.
 */
export function sessionUserPayload(user: SessionUser): Record<string, unknown> {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    phoneNumber: user.phoneNumber ?? null,
    phoneVerified: Boolean(user.phoneVerified),
  };
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
  metadata?: SessionMetadata,
): Promise<{ success: true; data: Record<string, unknown> }> {
  const tokens = await tokenService.generateTokenPair(
    user.id,
    { email: user.email, username: user.username, role: user.role },
    ['openid', 'profile', 'email'],
    'quantmail' as any,
    undefined,
    undefined,
    metadata,
  );

  setRefreshCookie(reply, tokens.refreshToken);

  return {
    success: true,
    data: {
      userId: user.id,
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      tokenType: tokens.tokenType,
      user: sessionUserPayload(user),
    },
  };
}
