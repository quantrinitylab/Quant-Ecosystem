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
import {
  consumeSsoTicket,
  mintSsoTicket,
  SSO_TICKET_TTL_SECONDS,
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
    const ticket = typeof body['ticket'] === 'string' ? (body['ticket'] as string) : '';
    const { clientId, clientSecret } = readClientCredentials(request, body);

    if (!ticket) {
      return reply
        .code(400)
        .send({ error: 'invalid_request', error_description: 'Missing ticket' });
    }
    if (!clientId) {
      return reply.code(401).send({
        error: 'invalid_client',
        error_description: 'Client authentication failed: unknown client',
      });
    }

    let client;
    try {
      client = await prisma.oAuthClient.findUnique({ where: { clientId } });
    } catch {
      return reply.code(503).send({ error: 'temporarily_unavailable' });
    }
    if (!client) {
      return reply.code(401).send({
        error: 'invalid_client',
        error_description: 'Client authentication failed: unknown client',
      });
    }
    if (client.isConfidential || client.clientSecretHash) {
      if (!verifyClientSecret(clientSecret ?? '', client.clientSecretHash)) {
        return reply
          .code(401)
          .send({ error: 'invalid_client', error_description: 'Client authentication failed' });
      }
    }

    const payload = await consumeSsoTicket(ticket);
    if (!payload) {
      return reply.code(400).send({
        error: 'invalid_grant',
        error_description: 'Ticket expired, invalid, or already used',
      });
    }
    // A ticket minted for one client cannot be redeemed by another.
    if (payload.clientId && payload.clientId !== client.clientId) {
      return reply.code(403).send({
        error: 'invalid_grant',
        error_description: 'Ticket was not minted for this client',
      });
    }

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
}
