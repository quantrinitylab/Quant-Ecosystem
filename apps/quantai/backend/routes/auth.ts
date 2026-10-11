import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SessionTokenIssuer } from '../lib/session-tokens';

/**
 * Identity routes for the QuantAI backend.
 *
 * GET /auth/me — returns the caller identity as verified by the global
 * requireAuth onRequest hook (packages/server-core). The hook already
 * rejected missing/invalid tokens with 401 before this handler runs, so
 * request.auth is guaranteed present here.
 *
 * This endpoint exists because the QuantAI frontend never issues tokens —
 * the ecosystem identity root (QuantMail backend) does. SSO handoff tickets
 * are verified by calling this endpoint with the candidate token
 * (see UniversalSSOTokenBridge.consumeHandoffTicket -> /api/auth/userinfo).
 * Without it, every SSO round-trip silently failed closed and the user was
 * left on /login with no session.
 *
 * POST /auth/sso/exchange — exchanges a QuantMail SSO credential for
 * QuantAI-native tokens. Accepts EITHER:
 *   - { ssoToken }: a QuantMail-issued access/JWT token (e.g. the access token
 *     from the OAuth2 code+PKCE flow, or a legacy __quant_sso_ticket-wrapped
 *     token), verified back-channel against QuantMail's /oauth/userinfo; or
 *   - { ssoTicket }: a Contract-B single-use chooser ticket (?sso_ticket=),
 *     verified back-channel against QuantMail's /oauth/sso-ticket/verify.
 * In both cases the ticket/token is never trusted on its claims alone, and a
 * real QuantAI session (HS256 tokens signed with the shared ecosystem secret,
 * accepted by every protected route) is minted on success. This is the
 * server-side half that fixed the "SSO bounces back to /login" bug: the old
 * frontend ingested handoff tokens client-side but no endpoint ever minted a
 * real session from them.
 */

const ssoExchangeSchema = z
  .object({
    ssoToken: z.string().min(10).max(8192).optional(),
    ssoTicket: z.string().min(8).max(4096).optional(),
  })
  .refine((v) => v.ssoToken || v.ssoTicket, { message: 'ssoToken or ssoTicket is required' });

const SSO_TIMEOUT_MS = Number(process.env['QUANT_SSO_TIMEOUT_MS'] ?? 8000);

function quantmailBase(): string {
  return (
    process.env['QUANTMAIL_OAUTH_URL'] ||
    process.env['QUANTMAIL_BACKEND_URL'] ||
    'https://quantmail.in'
  ).replace(/\/$/, '');
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SSO_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Try each QuantMail path in order, skipping 404s (direct-backend vs public-proxy layouts). */
async function quantmailCall(paths: string[], init: RequestInit): Promise<Response | null> {
  const base = quantmailBase();
  let last: Response | null = null;
  for (const path of paths) {
    const res = await fetchWithTimeout(`${base}${path}`, init);
    if (res.status !== 404) return res;
    last = res;
  }
  return last;
}

interface VerifiedIdentity {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
}

function readIdentity(data: unknown): VerifiedIdentity | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const id = d['id'] ?? d['sub'];
  const email = d['email'];
  if (typeof id !== 'string' || !id || typeof email !== 'string' || !email.includes('@')) {
    return null;
  }
  const username = d['username'];
  const displayName = d['displayName'] ?? d['name'];
  return {
    id,
    email: email.toLowerCase(),
    username: typeof username === 'string' && username ? username : null,
    displayName: typeof displayName === 'string' && displayName ? displayName : null,
  };
}

function fail(
  reply: { status: (n: number) => { send: (b: unknown) => unknown } },
  status: number,
  code: string,
  message: string,
) {
  return reply.status(status).send({
    success: false,
    error: { code, message, statusCode: status },
  });
}

function tokenIssuer(): SessionTokenIssuer {
  return new SessionTokenIssuer({
    jwtSecret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
    jwtIssuer: process.env['JWT_ISSUER'] ?? 'quantai',
    jwtAudience: process.env['JWT_AUDIENCE'] ?? 'quant-ecosystem',
  });
}

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.get('/me', async (request, reply) => {
    // NOTE: cast via `unknown` — FastifyRequest's generics don't sufficiently
    // overlap with the structural auth shape for a direct assertion (TS2352).
    const auth = (request as unknown as { auth?: Record<string, unknown> }).auth ?? {};
    return reply.send({
      success: true,
      data: {
        id: auth['userId'] ?? '',
        sub: auth['userId'] ?? '',
        email: auth['email'] ?? '',
        username: auth['username'] ?? '',
        displayName: auth['username'] ?? '',
        role: auth['role'] ?? '',
      },
    });
  });

  // POST /auth/sso/exchange — verify a QuantMail SSO credential back-channel
  // and mint QuantAI-native session tokens. PUBLIC (pre-authentication).
  fastify.post('/sso/exchange', async (request, reply) => {
    const parsed = ssoExchangeSchema.safeParse(request.body);
    if (!parsed.success) {
      return fail(reply, 400, 'BAD_REQUEST', 'ssoToken or ssoTicket is required');
    }
    const { ssoToken, ssoTicket } = parsed.data;

    // 1. Verify back-channel against QuantMail — never trust claims alone.
    let identity: VerifiedIdentity | null = null;
    try {
      if (ssoToken) {
        const res = await quantmailCall(['/oauth/userinfo', '/api/oauth/userinfo'], {
          headers: { Authorization: `Bearer ${ssoToken}` },
        });
        if (!res || !res.ok) {
          return fail(reply, 401, 'INVALID_SSO_TOKEN', 'SSO token not accepted by QuantMail');
        }
        const body = (await res.json().catch(() => null)) as {
          data?: unknown;
          user?: unknown;
        } | null;
        identity = readIdentity(body?.data ?? body?.user ?? body);
        if (!identity) {
          return fail(reply, 401, 'INVALID_SSO_TOKEN', 'SSO identity incomplete');
        }
      } else {
        const res = await quantmailCall(
          ['/oauth/sso-ticket/verify', '/api/oauth/sso-ticket/verify'],
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket: ssoTicket }),
          },
        );
        if (!res || !res.ok) {
          return fail(reply, 401, 'INVALID_SSO_TICKET', 'SSO ticket not accepted by QuantMail');
        }
        const body = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: unknown;
        } | null;
        if (body?.success !== true) {
          return fail(reply, 401, 'INVALID_SSO_TICKET', 'SSO ticket was rejected or expired');
        }
        identity = readIdentity(body.data);
        if (!identity) {
          return fail(reply, 401, 'INVALID_SSO_TICKET', 'SSO identity incomplete');
        }
      }
    } catch (err) {
      request.log.warn(
        { dependency: 'sso', code: (err as { code?: string } | null)?.code ?? 'UNKNOWN' },
        'sso upstream verification call failed',
      );
      return fail(reply, 502, 'SSO_VERIFY_UNAVAILABLE', 'Could not verify SSO with QuantMail');
    }

    // 2. Mint QuantAI-native tokens (accepted by every protected route via the
    //    shared server-core verifier).
    const issuer = tokenIssuer();
    const userId = `sso:${identity.id}`;
    const username = identity.username ?? identity.email.split('@')[0] ?? identity.email;
    const tokens = await issuer.issue({
      userId,
      username,
      email: identity.email,
      displayName: identity.displayName ?? undefined,
    });

    return reply.send({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        tokenType: tokens.tokenType,
        user: {
          id: userId,
          email: identity.email,
          username,
          displayName: identity.displayName ?? username,
          role: 'user',
        },
      },
    });
  });
}
