import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as jose from 'jose';
import type { AuthContext } from '@quant/auth';
import type { PermissionScope, QuantApp } from '@quant/common';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

export interface RequireAuthOptions {
  scopes?: string[];
}

/**
 * Step-up authentication policy.
 *
 * The spec (`docs/quant-architecture/products/quantmail/backend/settings-api.md`)
 * requires that sensitive settings updates "may require recent authentication /
 * MFA" and that the client never decides whether step-up is needed; the abuse
 * engine spec lists "require step-up authentication" as an enforcement action.
 * Neither names a window, so the default is 15 minutes (900s) — the same as the
 * access-token lifetime — overridable per route and via
 * `STEP_UP_AUTH_WINDOW_SECONDS`.
 */
export const DEFAULT_STEP_UP_WINDOW_SECONDS = 900;

export function resolveStepUpWindowSeconds(): number {
  const raw = process.env['STEP_UP_AUTH_WINDOW_SECONDS'];
  const parsed = raw !== undefined ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STEP_UP_WINDOW_SECONDS;
}

export interface RequireStepUpOptions extends RequireAuthOptions {
  /**
   * Maximum age, in seconds, of the session's last strong authentication
   * (password login or MFA verification). Older — or unknown — timestamps are
   * rejected with 401 STEP_UP_REQUIRED. Defaults to
   * `STEP_UP_AUTH_WINDOW_SECONDS` or 900.
   */
  windowSeconds?: number;
  /**
   * Step-up methods advertised to the client in the 401 body. Defaults to the
   * flows this ecosystem actually serves: password re-login and TOTP /
   * recovery-code verification.
   */
  methods?: string[];
}

export const DEFAULT_STEP_UP_METHODS = ['password', 'totp', 'recovery-code'] as const;

/** Mirror the access token's `lastStrongAuthAt` claim into the auth context. */
function readLastStrongAuthAt(payload: jose.JWTPayload): number | undefined {
  const value = payload['lastStrongAuthAt'];
  return typeof value === 'number' && value > 0 ? value : undefined;
}

function stepUpRequiredBody(
  windowSeconds: number,
  lastStrongAuthAt: number | undefined,
): {
  success: boolean;
  error: { code: string; message: string; statusCode: number };
  stepUp: {
    required: boolean;
    reason: string;
    policyWindowSeconds: number;
    lastStrongAuthAt: number | null;
    methods: string[];
    howTo: string[];
  };
} {
  return {
    success: false,
    error: {
      code: 'STEP_UP_REQUIRED',
      message:
        'This action needs a fresh sign-in. Sign in again with your password' +
        ' — and your authenticator code if two-factor authentication is on —' +
        ' then retry.',
      statusCode: 401,
    },
    stepUp: {
      required: true,
      reason: 'STALE_AUTHENTICATION',
      policyWindowSeconds: windowSeconds,
      lastStrongAuthAt: lastStrongAuthAt ?? null,
      methods: [...DEFAULT_STEP_UP_METHODS],
      howTo: [
        'POST /auth/login with your email and password to start a fresh session.',
        'If two-factor authentication is on, finish POST /auth/2fa/verify with the sign-in challenge and your authenticator or recovery code.',
        'Retry this request with the new access token.',
      ],
    },
  };
}

async function authPlugin(
  fastify: FastifyInstance,
  opts: { jwtSecret: string; jwtIssuer: string; jwtAudience: string },
) {
  const secret = new TextEncoder().encode(opts.jwtSecret);

  fastify.decorateRequest('auth', undefined as unknown as AuthContext);

  fastify.decorate('requireAuth', function (options?: RequireAuthOptions) {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      let token: string | undefined;

      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      }

      if (!token) {
        const cookies = (request as any).cookies as Record<string, string | undefined> | undefined;
        if (
          typeof cookies?.['quant_access_token'] === 'string' &&
          cookies['quant_access_token'].trim()
        ) {
          token = cookies['quant_access_token'].trim();
        } else if (request.headers.cookie) {
          const match = request.headers.cookie.match(/(?:^|;\s*)quant_access_token=([^;]+)/);
          if (match?.[1]) {
            token = decodeURIComponent(match[1].trim());
          }
        }
      }

      // Tokens are accepted only from the Authorization header and the
      // quant_access_token cookie. Query-string tokens (?token=) are NOT
      // accepted: they leak into access logs, browser history, and Referer
      // headers. SSO handoff tokens are captured and scrubbed client-side.

      if (!token) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid authorization header',
            statusCode: 401,
          },
        });
      }

      try {
        const issuer = [opts.jwtIssuer, 'quantmail', 'https://quantrinity.in', 'https://quant.app'];
        const audience = [opts.jwtAudience, 'quant-ecosystem'];
        const { payload } = await jose.jwtVerify(token, secret, {
          issuer,
          audience,
        });

        const authContext: AuthContext = {
          userId: payload.sub ?? '',
          email: (payload['email'] as string) ?? '',
          username: (payload['username'] as string) ?? '',
          role: (payload['role'] as string) ?? '',
          scopes: (payload['scopes'] as PermissionScope[]) ?? [],
          sessionId: payload.jti ?? '',
          app: (payload['app'] as QuantApp) ?? 'quantmail',
          tokenId: payload.jti ?? '',
          lastStrongAuthAt: readLastStrongAuthAt(payload),
        };

        request.auth = authContext;

        // Check scopes if required. Scope evaluation is backed by
        // `@quant/identity-permissions` (RBAC) via the `evaluateScopes`
        // decoration installed by the identity-permissions plugin. When that
        // plugin is not registered (e.g. the bare auth plugin in isolation),
        // fall back to the original exact-match semantics so 401/403 behaviour
        // (design Property P7) is unchanged.
        if (options?.scopes && options.scopes.length > 0) {
          const evaluateScopes = (
            fastify as unknown as {
              evaluateScopes?: (granted: readonly string[], required: readonly string[]) => boolean;
            }
          ).evaluateScopes;
          const grantedScopes = authContext.scopes as unknown as string[];
          const hasScopes =
            typeof evaluateScopes === 'function'
              ? evaluateScopes(grantedScopes, options.scopes)
              : options.scopes.every((scope) =>
                  authContext.scopes.includes(scope as PermissionScope),
                );
          if (!hasScopes) {
            return reply.status(403).send({
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'Insufficient permissions',
                statusCode: 403,
              },
            });
          }
        }
      } catch {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired token',
            statusCode: 401,
          },
        });
      }
    };
  });

  fastify.decorate('optionalAuth', function () {
    return async function (request: FastifyRequest) {
      let token: string | undefined;

      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      }

      if (!token) {
        const cookies = (request as any).cookies as Record<string, string | undefined> | undefined;
        if (
          typeof cookies?.['quant_access_token'] === 'string' &&
          cookies['quant_access_token'].trim()
        ) {
          token = cookies['quant_access_token'].trim();
        } else if (request.headers.cookie) {
          const match = request.headers.cookie.match(/(?:^|;\s*)quant_access_token=([^;]+)/);
          if (match?.[1]) {
            token = decodeURIComponent(match[1].trim());
          }
        }
      }

      // Same as requireAuth: query-string tokens (?token=) are never accepted.
      if (!token) return;

      try {
        const issuer = [opts.jwtIssuer, 'quantmail', 'https://quantrinity.in', 'https://quant.app'];
        const audience = [opts.jwtAudience, 'quant-ecosystem'];
        const { payload } = await jose.jwtVerify(token, secret, {
          issuer,
          audience,
        });

        const authContext: AuthContext = {
          userId: payload.sub ?? '',
          email: (payload['email'] as string) ?? '',
          username: (payload['username'] as string) ?? '',
          role: (payload['role'] as string) ?? '',
          scopes: (payload['scopes'] as PermissionScope[]) ?? [],
          sessionId: payload.jti ?? '',
          app: (payload['app'] as QuantApp) ?? 'quantmail',
          tokenId: payload.jti ?? '',
          lastStrongAuthAt: readLastStrongAuthAt(payload),
        };

        request.auth = authContext;
      } catch {
        // Ignored for optional auth
      }
    };
  });

  fastify.decorate('requireStepUp', function (options?: RequireStepUpOptions) {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      // Step-up implies authentication: run the exact requireAuth flow first so
      // 401 UNAUTHORIZED / 403 FORBIDDEN semantics are unchanged, then evaluate
      // the freshness of the last strong authentication. The client never
      // decides whether step-up is required — this guard does, per route.
      await fastify.requireAuth(options)(request, reply);
      if (reply.sent) return;

      const windowSeconds = options?.windowSeconds ?? resolveStepUpWindowSeconds();
      const lastStrongAuthAt = request.auth?.lastStrongAuthAt;
      const nowSeconds = Math.floor(Date.now() / 1000);

      // Fail closed: a missing or non-positive timestamp (tokens minted before
      // step-up support, or a claim that did not survive verification) is
      // treated as stale, never as fresh.
      const stale =
        typeof lastStrongAuthAt !== 'number' ||
        lastStrongAuthAt <= 0 ||
        nowSeconds - lastStrongAuthAt > windowSeconds;

      if (stale) {
        const body = stepUpRequiredBody(windowSeconds, lastStrongAuthAt);
        if (options?.methods && options.methods.length > 0) {
          body.stepUp.methods = [...options.methods];
        }
        return reply.status(401).send(body);
      }
    };
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (
      options?: RequireAuthOptions,
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    optionalAuth: () => (request: FastifyRequest) => Promise<void>;
    /**
     * Step-up authentication guard for sensitive routes (settings updates,
     * credential changes, abuse-engine-flagged actions). Authenticates exactly
     * like `requireAuth`, then rejects with 401 STEP_UP_REQUIRED when the
     * session's last strong authentication is older than the policy window.
     * The 401 body tells the client exactly how to step up.
     */
    requireStepUp: (
      options?: RequireStepUpOptions,
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(authPlugin, {
  name: 'auth',
});
