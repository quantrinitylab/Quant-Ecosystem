// ============================================================================
// SSO ticket endpoints — QuantMail as the ecosystem SSO provider
// ============================================================================
//
// Replaces the old handoff that put the RAW session access token into the
// cross-app redirect URL three times (?token=, ?accessToken=,
// ?__quant_sso_ticket=) — leaking the bearer credential into browser history,
// server access logs, and Referer headers.
//
// New contract (QuantMail side):
//   POST /sso/ticket/mint    — the signed-in user (session auth via the global
//                              auth hook; NOT in publicPaths) mints a
//                              short-lived single-use opaque ticket.
//   POST /sso/ticket/resolve — the RECEIVING app's backend presents the ticket
//                              plus its OAuth client credentials and gets back
//                              the user's IDENTITY (never any token), then
//                              establishes its own session. Listed in
//                              publicPaths like /oauth/token because the caller
//                              holds client credentials, not a user session —
//                              auth is enforced inside the handler.
//
// Receiving-app adoption is tracked separately: until an app calls /resolve,
// it cannot complete the new handoff. QuantMail itself no longer emits bearer
// tokens in URLs regardless.

import { FastifyInstance } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import prisma from '@quant/auth/lib/prisma';
import { createTokenService } from '../lib/auth-session';
import {
  consumeSsoTicket,
  mintSsoTicket,
  SSO_TICKET_TTL_SECONDS,
  type SsoTicketPayload,
} from '../services/sso-ticket';

interface RequestAuth {
  auth?: { userId?: string; email?: string; username?: string };
}

function readClientCredentials(
  request: any,
  body: Record<string, unknown>,
): { clientId?: string; clientSecret?: string } {
  let clientId = typeof body['client_id'] === 'string' ? (body['client_id'] as string) : undefined;
  let clientSecret =
    typeof body['client_secret'] === 'string' ? (body['client_secret'] as string) : undefined;
  const basic = request.headers?.authorization;
  if (typeof basic === 'string' && basic.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(basic.slice(6), 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      if (idx >= 0) {
        clientId = clientId ?? decoded.slice(0, idx);
        clientSecret = clientSecret ?? decoded.slice(idx + 1);
      }
    } catch {
      // Malformed Basic header — fall through to the 401 below.
    }
  }
  return { clientId, clientSecret };
}

// Mirrors the confidential-client secret check in routes/oauth.ts (AUTH-04):
// SHA-256 hash or legacy plaintext, constant-time compare. Deliberately
// read-only here — unlike /oauth/token there is no auto-upgrade write on the
// resolve path.
function verifyClientSecret(presented: string, storedHash: string | null): boolean {
  if (!presented || !storedHash) return false;
  const isSha256 = /^[0-9a-f]{64}$/i.test(storedHash);
  if (isSha256) {
    const presentedHash = createHash('sha256').update(presented).digest('hex');
    const a = Buffer.from(presentedHash);
    const b = Buffer.from(storedHash);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  const a = Buffer.from(presented);
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function ssoTicketRoutes(fastify: FastifyInstance) {
  const tokenService = createTokenService();

  /**
   * Shared server-to-server validation for /sso/ticket/resolve and
   * /sso/ticket/exchange: ticket present → OAuth client lookup → confidential
   * client secret check → single-use ticket consume → ticket/client binding.
   * Returns the client + ticket payload on success, or a responder the caller
   * must return (with the appropriate envelope) on failure.
   */
  const validateTicketGrant = async (
    request: any,
    body: Record<string, unknown>,
  ): Promise<
    | { ok: true; client: { clientId: string }; payload: SsoTicketPayload }
    | { ok: false; status: number; code: string; message: string }
  > => {
    const ticket = typeof body['ticket'] === 'string' ? (body['ticket'] as string) : '';
    const { clientId, clientSecret } = readClientCredentials(request, body);

    if (!ticket) {
      return { ok: false, status: 400, code: 'invalid_request', message: 'Missing ticket' };
    }
    if (!clientId) {
      return {
        ok: false,
        status: 401,
        code: 'invalid_client',
        message: 'Client authentication failed: unknown client',
      };
    }

    let client;
    try {
      client = await prisma.oAuthClient.findUnique({ where: { clientId } });
    } catch {
      return { ok: false, status: 503, code: 'temporarily_unavailable', message: 'temporarily_unavailable' };
    }
    if (!client) {
      return {
        ok: false,
        status: 401,
        code: 'invalid_client',
        message: 'Client authentication failed: unknown client',
      };
    }
    if (client.isConfidential || client.clientSecretHash) {
      if (!verifyClientSecret(clientSecret ?? '', client.clientSecretHash)) {
        return {
          ok: false,
          status: 401,
          code: 'invalid_client',
          message: 'Client authentication failed',
        };
      }
    }

    const payload = await consumeSsoTicket(ticket);
    if (!payload) {
      return {
        ok: false,
        status: 400,
        code: 'invalid_grant',
        message: 'Ticket expired, invalid, or already used',
      };
    }
    // A ticket minted for one client cannot be redeemed by another.
    if (payload.clientId && payload.clientId !== client.clientId) {
      return {
        ok: false,
        status: 403,
        code: 'invalid_grant',
        message: 'Ticket was not minted for this client',
      };
    }

    return { ok: true, client, payload };
  };

  // POST /sso/ticket/mint — session-authenticated (global auth hook attaches
  // request.auth). Deliberately NOT in publicPaths.
  fastify.post('/sso/ticket/mint', async (request, reply) => {
    const auth = (request as unknown as RequestAuth).auth;
    const userId = auth?.userId;
    if (!userId) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const clientId =
      typeof body['clientId'] === 'string' ? (body['clientId'] as string).slice(0, 128) : undefined;
    const returnTo =
      typeof body['returnTo'] === 'string' ? (body['returnTo'] as string).slice(0, 2048) : undefined;

    // Best-effort profile enrichment; the ticket still carries the JWT claims
    // if the lookup fails.
    let displayName = auth.username ?? '';
    let email = auth.email ?? '';
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true, username: true, email: true },
      });
      if (user) {
        displayName = user.displayName || user.username;
        email = user.email || email;
      }
    } catch {
      // Fall through with the claims from the session.
    }

    const ticket = await mintSsoTicket({
      userId,
      email,
      username: auth.username ?? '',
      displayName,
      ...(clientId ? { clientId } : {}),
      ...(returnTo ? { returnTo } : {}),
    });
    return reply.send({
      ticket,
      expiresIn: SSO_TICKET_TTL_SECONDS,
      tokenType: 'sso-ticket',
    });
  });

  // POST /sso/ticket/resolve — server-to-server. The receiving app's backend
  // presents the ticket + its OAuth client credentials and receives the user's
  // identity. No tokens are ever returned here.
  fastify.post('/sso/ticket/resolve', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const result = await validateTicketGrant(request, body);
    if (!result.ok) {
      return reply.code(result.status).send({ error: result.code, error_description: result.message });
    }
    const { client, payload } = result;

    return reply.send({
      user: {
        id: payload.userId,
        email: payload.email,
        username: payload.username,
        displayName: payload.displayName,
      },
      clientId: client.clientId,
    });
  });

  // POST /sso/ticket/exchange — server-to-server. Same validation chain as
  // /sso/ticket/resolve, but additionally mints an access token for the user
  // so the receiving app can establish its session in one round trip (the
  // QuantAI web tier has no backend of its own to do the resolve-then-mint
  // dance — see apps/quantai/src/app/api/auth/sso/ticket/route.ts).
  //
  // Security properties (all enforced, see tests):
  //  - the ticket is single-use and short-lived (120s); consumption is atomic
  //  - the caller's OAuth client credentials are verified (confidential
  //    clients must present the secret)
  //  - a ticket minted for one client cannot be exchanged by another
  //  - only an ACCESS token is minted: no refresh pair, so there is no
  //    orphaned refresh credential — the receiving app owns its session
  //    lifetime via its own cookie, exactly like /auth/login's access half
  //  - the token travels only in this POST's JSON response body, never in a
  //    URL (same rule as the rest of the ticket scheme)
  fastify.post('/sso/ticket/exchange', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const result = await validateTicketGrant(request, body);
    if (!result.ok) {
      return reply.code(result.status).send({
        success: false,
        error: { code: result.code, message: result.message, statusCode: result.status },
      });
    }
    const { payload } = result;

    // Role comes from the live user row so the minted token carries the same
    // claims as a password login. Falls back to 'user' if the row vanished
    // between mint and exchange (the ticket itself was minted from a live
    // session seconds ago).
    let role = 'user';
    try {
      const userRow = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { role: true },
      });
      if (userRow?.role) role = userRow.role;
    } catch {
      // Fall through with the default role.
    }

    let minted;
    try {
      minted = await tokenService.generateAccessToken(
        payload.userId,
        {
          email: payload.email,
          username: payload.username,
          role,
        },
        ['openid', 'profile', 'email'],
        'quantmail' as any,
      );
    } catch {
      return reply.code(503).send({
        success: false,
        error: { code: 'TOKEN_MINT_FAILED', message: 'Could not issue a session token.', statusCode: 503 },
      });
    }

    return reply.send({
      success: true,
      data: {
        user: {
          id: payload.userId,
          email: payload.email,
          username: payload.username,
          displayName: payload.displayName,
        },
        accessToken: minted.accessToken,
        expiresIn: minted.expiresIn,
        tokenType: minted.tokenType,
      },
    });
  });
}
