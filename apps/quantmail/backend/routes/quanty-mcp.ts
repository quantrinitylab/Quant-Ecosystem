// ============================================================================
// Quanty agent — MCP connector routes (production)
// ============================================================================
//
// PURPOSE
//   Production REST surface for Quanty's MCP connectors (Q2). Gmail is the
//   first production provider; the scaffold is provider-keyed so GitHub /
//   Calendar / Notion can follow without route changes.
//
// ENDPOINTS (all under /api/quanty/mcp, Bearer auth except callback)
//   GET  /connections          — user's connections (safe fields only)
//   GET  /catalog              — curated provider catalog (consumer UI)
//   POST /connect/:provider    — { authorizeUrl, state } (OAuth step 1)
//   GET  /callback?code=&state — OAuth callback: exchange, encrypt, store, 302
//   POST /disconnect/:provider — revoke grant + audit
//   POST /test/:provider       — live connectivity check → { ok, latencyMs, scopes }
//
// SECURITY
//   * Bearer auth on every endpoint except /callback; /callback is protected
//     by the HMAC-signed, 10-minute-expiry `state` binding it to a userId.
//   * Refresh tokens are AES-256-GCM encrypted before storage; plaintext
//     tokens never touch the DB, logs, or responses.
//   * Env: GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET /
//     GOOGLE_OAUTH_REDIRECT (also accepts GMAIL_OAUTH_* aliases),
//     GMAIL_OAUTH_STATE_SECRET, GMAIL_TOKEN_ENCRYPTION_KEY.
//     Values come from the Secret Vault — never in code.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { TokenService } from '@quant/auth/services/token-service';
import { getJwtSecret, getJwtRefreshSecret } from '@quant/auth/lib/secrets';
import prisma from '@quant/auth/lib/prisma';
import {
  GmailOAuth,
  EnvKeyTokenCipher,
  gmailOAuthConfigFromEnv,
  GMAIL_SCOPES,
} from '../services/quanty-agent/mcp/gmail/gmail-oauth';
import { PrismaGmailGrantStore } from '../services/quanty-agent/mcp/connection-store';
import { MCP_PROVIDER_CATALOG, getProvider } from '../services/quanty-agent/mcp/catalog';

const PROVIDER_PARAM = z.object({ provider: z.string().min(1).max(64) });

/** Lazily-built GmailOAuth singleton (fail-closed when env is missing). */
let gmailOAuth: GmailOAuth | null = null;
let gmailOAuthError: string | null = null;

function getGmailOAuth(): GmailOAuth {
  if (gmailOAuth) return gmailOAuth;
  if (gmailOAuthError) throw new Error(gmailOAuthError);
  try {
    // Prefer GOOGLE_OAUTH_* (canonical), fall back to the prototype's GMAIL_OAUTH_*.
    const env = { ...process.env };
    env.GMAIL_OAUTH_CLIENT_ID = env.GOOGLE_OAUTH_CLIENT_ID ?? env.GMAIL_OAUTH_CLIENT_ID;
    env.GMAIL_OAUTH_CLIENT_SECRET = env.GOOGLE_OAUTH_CLIENT_SECRET ?? env.GMAIL_OAUTH_CLIENT_SECRET;
    env.GMAIL_OAUTH_REDIRECT_URI = env.GOOGLE_OAUTH_REDIRECT ?? env.GMAIL_OAUTH_REDIRECT_URI;
    const config = gmailOAuthConfigFromEnv(env);
    const store = new PrismaGmailGrantStore(prisma as never);
    const cipher = new EnvKeyTokenCipher(config.encryptionKey);
    gmailOAuth = new GmailOAuth({ config, grantStore: store, cipher });
    return gmailOAuth;
  } catch (err) {
    gmailOAuthError = err instanceof Error ? err.message : 'Gmail OAuth not configured';
    throw new Error(gmailOAuthError);
  }
}

/** For tests: reset the singleton. */
export function __resetGmailOAuthForTests(): void {
  gmailOAuth = null;
  gmailOAuthError = null;
}

function successRedirectUrl(provider: string, ok: boolean, accountEmail?: string): string {
  const base =
    process.env['MCP_CONNECT_SUCCESS_URL'] ?? 'https://quantmail.in';
  const url = new URL(base);
  url.searchParams.set('mcp_connected', provider);
  url.searchParams.set('mcp_ok', ok ? '1' : '0');
  if (accountEmail) url.searchParams.set('mcp_account', accountEmail);
  return url.toString();
}

export async function quantyMcpRoutes(fastify: FastifyInstance): Promise<void> {
  const tokenService = new TokenService({
    jwtSecret: getJwtSecret(),
    jwtRefreshSecret: getJwtRefreshSecret(),
    accessTokenExpiresIn: 900,
    refreshTokenExpiresIn: 2592000,
    issuer: process.env['JWT_ISSUER'] ?? 'quantmail',
    audience: process.env['JWT_AUDIENCE'] ?? 'quant-ecosystem',
    bcryptRounds: 12,
    maxLoginAttempts: 5,
    lockoutDuration: 900,
  });

  const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers?.authorization as string | undefined;
    if (!header || !header.startsWith('Bearer ')) {
      return reply.code(401).send({ ok: false, error: { code: 'unauthorized', message: 'Missing bearer token' } });
    }
    const payload = await tokenService.validateAccessToken(header.slice(7));
    if (!payload) {
      return reply.code(401).send({ ok: false, error: { code: 'invalid_token', message: 'Invalid or expired token' } });
    }
    (request as unknown as { user: unknown }).user = payload;
  };

  const userIdOf = (request: FastifyRequest): string => {
    const user = (request as unknown as { user?: { id?: string; sub?: string } }).user;
    const id = user?.id ?? user?.sub;
    if (!id) throw new Error('Authenticated request without user id');
    return id;
  };

  const storeFor = () => new PrismaGmailGrantStore(prisma as never).mcp;

  // -- GET /api/quanty/mcp/connections -------------------------------------
  fastify.get('/connections', { preHandler: requireAuth }, async (request, reply) => {
    const userId = userIdOf(request);
    const connections = await storeFor().listConnections(userId);
    return reply.send({ ok: true, connections });
  });

  // -- GET /api/quanty/mcp/catalog ------------------------------------------
  fastify.get('/catalog', { preHandler: requireAuth }, async (_request, reply) => {
    return reply.send({ ok: true, providers: MCP_PROVIDER_CATALOG });
  });

  // -- POST /api/quanty/mcp/connect/:provider --------------------------------
  fastify.post<{ Params: { provider: string } }>(
    '/connect/:provider',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { provider } = PROVIDER_PARAM.parse(request.params);
      const entry = getProvider(provider);
      if (!entry) {
        return reply.code(404).send({ ok: false, error: { code: 'unknown_provider', message: `Unknown provider: ${provider}` } });
      }
      if (!entry.available) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'provider_unavailable', message: `${entry.name} is coming soon` },
        });
      }
      if (provider !== 'gmail') {
        return reply.code(501).send({ ok: false, error: { code: 'not_implemented', message: `OAuth flow for ${provider} is not implemented yet` } });
      }
      const userId = userIdOf(request);
      let oauth: GmailOAuth;
      try {
        oauth = getGmailOAuth();
      } catch (err) {
        return reply.code(503).send({
          ok: false,
          error: { code: 'oauth_not_configured', message: err instanceof Error ? err.message : 'OAuth not configured' },
        });
      }
      const authorizeUrl = oauth.getAuthorizationUrl(userId);
      const state = new URL(authorizeUrl).searchParams.get('state') ?? '';
      return reply.send({ ok: true, authorizeUrl, state });
    },
  );

  // -- GET /api/quanty/mcp/callback ------------------------------------------
  // No Bearer auth — the HMAC-signed `state` binds this to the user.
  fastify.get('/callback', async (request, reply) => {
    const query = z.object({ code: z.string().min(1), state: z.string().min(1) }).safeParse(request.query);
    if (!query.success) {
      return reply.redirect(successRedirectUrl('gmail', false));
    }
    let oauth: GmailOAuth;
    try {
      oauth = getGmailOAuth();
    } catch {
      return reply.redirect(successRedirectUrl('gmail', false));
    }
    try {
      const { userId, accountEmail } = await oauth.handleCallback(query.data.code, query.data.state);
      const store = storeFor();
      await store.audit({
        userId,
        provider: 'gmail',
        event: 'connected',
        detail: accountEmail ? `account=${accountEmail}` : undefined,
        ipAddress: request.ip,
      });
      return reply.redirect(successRedirectUrl('gmail', true, accountEmail));
    } catch {
      // Never leak why (code/token/state details stay server-side).
      return reply.redirect(successRedirectUrl('gmail', false));
    }
  });

  // -- POST /api/quanty/mcp/disconnect/:provider ------------------------------
  fastify.post<{ Params: { provider: string } }>(
    '/disconnect/:provider',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { provider } = PROVIDER_PARAM.parse(request.params);
      if (provider !== 'gmail') {
        return reply.code(404).send({ ok: false, error: { code: 'unknown_provider', message: `Unknown provider: ${provider}` } });
      }
      const userId = userIdOf(request);
      const store = storeFor();
      const revoked = await store.revoke(userId);
      if (revoked) {
        await store.audit({ userId, provider, event: 'disconnected', ipAddress: request.ip });
      }
      return reply.send({ ok: true, revoked });
    },
  );

  // -- POST /api/quanty/mcp/test/:provider -------------------------------------
  fastify.post<{ Params: { provider: string } }>(
    '/test/:provider',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { provider } = PROVIDER_PARAM.parse(request.params);
      if (provider !== 'gmail') {
        return reply.code(404).send({ ok: false, error: { code: 'unknown_provider', message: `Unknown provider: ${provider}` } });
      }
      const userId = userIdOf(request);
      let oauth: GmailOAuth;
      try {
        oauth = getGmailOAuth();
      } catch (err) {
        return reply.code(503).send({
          ok: false,
          error: { code: 'oauth_not_configured', message: err instanceof Error ? err.message : 'OAuth not configured' },
        });
      }
      const store = storeFor();
      const started = Date.now();
      try {
        const accessToken = await oauth.getAccessToken(userId);
        if (!accessToken) {
          await store.audit({ userId, provider, event: 'test_failed', detail: 'not_connected', ipAddress: request.ip });
          return reply.send({ ok: false, error: { code: 'not_connected', message: 'Gmail is not connected' } });
        }
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const latencyMs = Date.now() - started;
        if (!res.ok) {
          await store.recordTest(userId, false);
          await store.audit({ userId, provider, event: 'test_failed', detail: `http=${res.status}`, ipAddress: request.ip });
          return reply.send({ ok: false, error: { code: 'gmail_api_error', message: `Gmail API returned HTTP ${res.status}` } });
        }
        await store.recordTest(userId, true);
        await store.audit({ userId, provider, event: 'test_ok', detail: `latencyMs=${latencyMs}`, ipAddress: request.ip });
        return reply.send({ ok: true, latencyMs, scopes: GMAIL_SCOPES });
      } catch (err) {
        await store.audit({
          userId,
          provider,
          event: 'test_failed',
          detail: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
          ipAddress: request.ip,
        });
        return reply.send({ ok: false, error: { code: 'test_failed', message: 'Connectivity test failed' } });
      }
    },
  );
}
