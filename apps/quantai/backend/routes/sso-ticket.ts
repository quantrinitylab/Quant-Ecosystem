// ============================================================================
// POST /auth/sso/ticket — QuantAI side of the QuantMail opaque-ticket SSO
// handoff (QuantMail PR #881).
// ============================================================================
//
// The /sso account chooser redirects back with ONLY `?__quant_sso_ticket=` — a
// single-use opaque ticket (signed JWT, tokenType=sso-ticket, domain-separated
// secret) that can NEVER validate as an access token. The old flow tried to
// bearer-verify it client-side and failed closed; that path is dead.
//
// New flow (this route, server-to-server):
//   1. The browser hands the ticket to this endpoint (same-origin).
//   2. We POST {IDENTITY_BASE}/sso/ticket/resolve with the ticket plus our
//      OAuth client credentials (QUANT_SSO_CLIENT_ID / QUANT_SSO_CLIENT_SECRET,
//      sent as a Basic Authorization header AND in the body — the identity
//      route accepts either). Fail-closed with an honest error when the env
//      credentials are unset; they are never hardcoded.
//   3. The identity returns the user's IDENTITY (never any token). We validate
//      it (non-empty id + email — the F-023 precedent) and confirm the ticket
//      was minted for our client.
//   4. We establish QuantAI's own session: a short-lived QuantAI-issued SSO
//      session token (services/sso-session.ts, iss=quantai so it verifies only
//      on this backend) returned to the web tier, which stores it HttpOnly like
//      the hardened login route.
//
// Cross-lane dependency: the QuantMail lane must register an OAuth client with
// client_id matching QUANT_SSO_CLIENT_ID (the /sso chooser mints tickets bound
// to the `client_id` query param — QuantAI passes `client_id=quantai`) and
// provision the client secret out-of-band. Until then this endpoint answers
// 500 SSO_CLIENT_MISCONFIGURED and the UI says so honestly.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { mintSsoSessionToken } from '../services/sso-session';

const RESOLVE_TIMEOUT_MS = 10_000;
const MAX_TICKET_LENGTH = 4096;

/**
 * Resolve deadline (ms) for the identity server-to-server call. Overridable
 * via env so tests can exercise the timeout path without waiting 10s.
 */
function resolveTimeoutMs(): number {
  const raw = process.env['QUANT_SSO_RESOLVE_TIMEOUT_MS'];
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : RESOLVE_TIMEOUT_MS;
}

function identityBaseUrl(): string {
  return (
    process.env['QUANT_IDENTITY_URL'] ??
    process.env['QUANTMAIL_BACKEND_URL'] ??
    'http://quant-quantmail-backend:3011'
  );
}

interface ErrorBody {
  success: false;
  error: { code: string; message: string; statusCode: number };
}

function fail(reply: FastifyReply, statusCode: number, code: string, message: string): ErrorBody {
  return reply.status(statusCode).send({
    success: false,
    error: { code, message, statusCode },
  }) as unknown as ErrorBody;
}

interface ResolvedUser {
  id: string;
  email: string;
  username?: string;
  displayName?: string;
}

interface TicketResolveResponse {
  user?: {
    id?: unknown;
    email?: unknown;
    username?: unknown;
    displayName?: unknown;
  } | null;
  clientId?: unknown;
  error?: unknown;
  error_description?: unknown;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Validate the identity the identity root returned. Null = invalid. */
function validateResolvedIdentity(body: TicketResolveResponse): ResolvedUser | null {
  const user = body?.user;
  if (!user || typeof user !== 'object') return null;
  const id = asNonEmptyString(user.id);
  const email = asNonEmptyString(user.email);
  if (!id || !email || !email.includes('@')) return null;
  const username = asNonEmptyString(user.username) ?? undefined;
  const displayName = asNonEmptyString(user.displayName) ?? undefined;
  const result: ResolvedUser = { id, email };
  if (username) result.username = username;
  if (displayName) result.displayName = displayName;
  return result;
}

export default async function ssoTicketRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /auth/sso/ticket (registered with prefix '/auth').
  // Public by design: the caller holds an SSO ticket, not a session — auth is
  // enforced inside the handler via the ticket + client credentials.
  fastify.post('/sso/ticket', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const ticket = asNonEmptyString(body['ticket']);
    if (!ticket || ticket.length > MAX_TICKET_LENGTH) {
      return fail(reply, 400, 'SSO_TICKET_MISSING', 'A sign-in ticket is required.');
    }

    const clientId = process.env['QUANT_SSO_CLIENT_ID'];
    const clientSecret = process.env['QUANT_SSO_CLIENT_SECRET'];
    if (!clientId || !clientSecret) {
      request.log.error(
        'POST /auth/sso/ticket: QUANT_SSO_CLIENT_ID / QUANT_SSO_CLIENT_SECRET are not set. ' +
          'The QuantMail lane must register an OAuth client for QuantAI and provision the secret.',
      );
      return fail(
        reply,
        500,
        'SSO_CLIENT_MISCONFIGURED',
        'Single sign-on is not configured for this app yet.',
      );
    }

    const jwtSecret = process.env['JWT_SECRET'];
    if (!jwtSecret) {
      request.log.error('POST /auth/sso/ticket: JWT_SECRET is not set; cannot mint SSO session.');
      return fail(reply, 500, 'SSO_MISCONFIGURED', 'Single sign-on is not configured for this app yet.');
    }

    // Server-to-server ticket resolution. Credentials travel in the Basic
    // Authorization header (preferred) and the JSON body (the identity route
    // accepts either); the ticket itself never appears in a URL.
    //
    // ONE deadline covers the whole resolve call — headers AND body. The
    // timer is cleared only after the body is fully parsed: if the identity
    // sends headers but then stalls mid-body, we still fail closed at the
    // deadline instead of hanging the route. The ticket may already be
    // consumed server-side when the deadline trips, so we NEVER retry it —
    // the user is told to start again from the chooser.
    let resolveRes: Response;
    let resolveBody: TicketResolveResponse | null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), resolveTimeoutMs());
      try {
        resolveRes = await fetch(`${identityBaseUrl()}/sso/ticket/resolve`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            'cache-control': 'no-store',
          },
          body: JSON.stringify({ ticket, client_id: clientId, client_secret: clientSecret }),
          signal: controller.signal,
        });
        try {
          resolveBody = (await resolveRes.json()) as TicketResolveResponse | null;
        } catch (jsonErr) {
          // A stalled body trips the same deadline: the abort rejects the
          // body read, so rethrow and let the outer handler fail 502.
          if (jsonErr instanceof Error && jsonErr.name === 'AbortError') throw jsonErr;
          // Empty or non-JSON body — not a usable identity response.
          resolveBody = null;
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      request.log.warn(
        `POST /auth/sso/ticket: identity resolve ${isTimeout ? 'timed out' : 'unreachable'}`,
      );
      return fail(
        reply,
        502,
        'SSO_IDENTITY_UNAVAILABLE',
        isTimeout
          ? 'The sign-in service took too long to respond. Your ticket may already have been used — please start again from "Continue with Quant Account".'
          : 'The QuantMail sign-in service is temporarily unreachable. Please try again shortly.',
      );
    }

    if (!resolveRes.ok || !resolveBody) {
      const status = resolveRes.status;
      if (status === 400 || status === 403) {
        // invalid_grant: ticket expired, invalid, already used — or minted for
        // a different client.
        return fail(
          reply,
          401,
          'SSO_TICKET_INVALID',
          'This sign-in link has expired or was already used. Please start again from "Continue with Quant Account".',
        );
      }
      if (status === 401) {
        // invalid_client: unknown client or bad secret — our deployment's
        // credentials are wrong or the client was never registered.
        request.log.error(
          `POST /auth/sso/ticket: identity rejected our client credentials (client_id=${clientId}). ` +
            'The QuantMail lane must register this OAuth client.',
        );
        return fail(
          reply,
          500,
          'SSO_CLIENT_MISCONFIGURED',
          'Single sign-on is not configured for this app yet.',
        );
      }
      request.log.warn(`POST /auth/sso/ticket: identity resolve failed with HTTP ${status}`);
      return fail(
        reply,
        502,
        'SSO_IDENTITY_UNAVAILABLE',
        'The QuantMail sign-in service is temporarily unavailable. Please try again shortly.',
      );
    }

    const identity = validateResolvedIdentity(resolveBody);
    if (!identity) {
      request.log.warn('POST /auth/sso/ticket: identity resolve returned an invalid identity shape');
      return fail(
        reply,
        401,
        'SSO_IDENTITY_INVALID',
        'The sign-in service returned an incomplete identity. Please try again.',
      );
    }

    // Defence in depth: the identity already binds tickets to the minting
    // client, but refuse to mint a session when the response names another one.
    if (
      resolveBody.clientId !== undefined &&
      resolveBody.clientId !== null &&
      resolveBody.clientId !== clientId
    ) {
      request.log.warn('POST /auth/sso/ticket: resolve response clientId mismatch');
      return fail(
        reply,
        401,
        'SSO_TICKET_INVALID',
        'This sign-in link was not issued for this app. Please start again from "Continue with Quant Account".',
      );
    }

    let sessionToken: string;
    try {
      sessionToken = mintSsoSessionToken(
        {
          userId: identity.id,
          email: identity.email,
          ...(identity.username ? { username: identity.username } : {}),
          ...(identity.displayName ? { displayName: identity.displayName } : {}),
        },
        jwtSecret,
      );
    } catch (err) {
      request.log.error(`POST /auth/sso/ticket: failed to mint SSO session: ${String(err)}`);
      return fail(reply, 500, 'SSO_MISCONFIGURED', 'Could not complete sign-in. Please try again.');
    }

    return reply.send({
      success: true,
      data: {
        user: {
          id: identity.id,
          email: identity.email,
          username: identity.username ?? '',
          displayName: identity.displayName ?? '',
        },
        sessionToken,
      },
    });
  });
}
