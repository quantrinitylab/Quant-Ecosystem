import { FastifyInstance } from 'fastify';
import { TokenService } from '@quant/auth/services/token-service';
import { getJwtSecret, getJwtRefreshSecret } from '@quant/auth/lib/secrets';
import prisma from '@quant/auth/lib/prisma';
import { generateId } from '@quant/auth/crypto/secure-random';
import { validateCodeChallenge } from '@quant/auth/crypto/pkce';
import { oidcKeyService } from '../services/oidc-key.service';

/** The OIDC issuer identifier. MUST match the `iss` claim in issued id_tokens
 *  and the `issuer` field of the discovery document (env-overridable). */
function getIssuer(): string {
  return process.env['QUANTMAIL_ISSUER'] ?? 'https://quantmail.com';
}

/** Build an absolute endpoint URL under the issuer origin. */
function endpoint(path: string): string {
  return `${getIssuer().replace(/\/$/, '')}${path}`;
}

const ACCESS_TOKEN_TTL_SECONDS = 900;

export async function oauthRoutes(fastify: FastifyInstance) {
  // The issuer/audience MUST match the global auth hook's verifier
  // (@quant/server-core reads JWT_ISSUER / JWT_AUDIENCE from env), otherwise
  // tokens minted here fail verification on every protected endpoint.
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

  const requireAuth = async (request: any, reply: any) => {
    const header = request.headers?.authorization as string | undefined;
    if (!header || !header.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const payload = await tokenService.validateAccessToken(header.slice(7));
    if (!payload) {
      return reply.code(401).send({ error: 'invalid_token' });
    }
    (request as any).user = payload;
  };

  const resolveRedirectUri = async (
    clientId: string,
    redirectUri: string,
  ): Promise<string | null> => {
    if (!clientId || !redirectUri) return null;
    const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
    if (!client) return null;
    // Return the registered (DB-sourced) URI, never the request value, so the
    // redirect target cannot be attacker-controlled (open-redirect safe).
    return client.redirectUris.find((u: string) => u === redirectUri) ?? null;
  };

  const esc = (value: unknown): string =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  // Normalize the bound PKCE challenge method. RFC 7636 allows 'plain' and
  // 'S256'; anything other than an explicit 'plain' is treated as the
  // SHA-256 transform ('S256'), which is what the spec mandates.
  const normalizeChallengeMethod = (method: unknown): 'plain' | 'S256' =>
    method === 'plain' ? 'plain' : 'S256';

  // Map the internal camelCase TokenPair to an RFC 6749 §5.1 token response
  // (snake_case `access_token` / `token_type` / `expires_in` / `refresh_token`,
  // plus the granted `scope` and an optional OIDC `id_token`).
  const toTokenResponse = (
    tokens: { accessToken: string; refreshToken: string; expiresIn: number; tokenType: string },
    scopes: string[],
    idToken?: string,
  ): Record<string, unknown> => ({
    access_token: tokens.accessToken,
    token_type: tokens.tokenType,
    expires_in: tokens.expiresIn,
    refresh_token: tokens.refreshToken,
    scope: scopes.join(' '),
    ...(idToken ? { id_token: idToken } : {}),
  });

  // POST /oauth/token
  fastify.post('/oauth/token', async (request, reply) => {
    const body = request.body as any;
    const { grant_type, code, refresh_token, client_id, code_verifier, redirect_uri } = body;

    if (grant_type === 'refresh_token' && refresh_token) {
      try {
        const tokens = await tokenService.refreshToken(refresh_token);
        return reply.send(toTokenResponse(tokens, []));
      } catch (err: any) {
        return reply.code(400).send({
          error: 'invalid_grant',
          error_description: err.message,
        });
      }
    }

    if (grant_type === 'authorization_code' && code) {
      const authCode = await prisma.authorizationCode.findUnique({
        where: { code },
      });

      if (!authCode || authCode.expiresAt < new Date()) {
        return reply.code(400).send({
          error: 'invalid_grant',
          error_description: 'Authorization code expired or invalid',
        });
      }

      // Enforce PKCE: when a code_challenge was bound at authorize time, the
      // exchange MUST present a code_verifier whose challenge-method transform
      // equals the stored code_challenge. Reject (issuing no tokens, and
      // without consuming the code) on a missing or mismatched verifier.
      if (authCode.codeChallenge) {
        if (!code_verifier) {
          return reply.code(400).send({
            error: 'invalid_grant',
            error_description: 'code_verifier required',
          });
        }

        const method = normalizeChallengeMethod(authCode.codeChallengeMethod);
        const verifierValid = await validateCodeChallenge(
          code_verifier,
          authCode.codeChallenge,
          method,
        );

        if (!verifierValid) {
          return reply.code(400).send({
            error: 'invalid_grant',
            error_description: 'PKCE verification failed',
          });
        }
      }

      // Enforce redirect_uri rebinding: the token-exchange redirect_uri MUST be
      // an exact match of the value bound to the code at authorize time. Reject
      // (issuing no tokens, and WITHOUT consuming the code) on any mismatch so a
      // code intercepted for one redirect target cannot be exchanged against
      // another. This runs before the single-use consumption step below.
      if (redirect_uri !== authCode.redirectUri) {
        return reply.code(400).send({
          error: 'invalid_grant',
          error_description: 'redirect_uri mismatch',
        });
      }

      // Single-use consumption: atomically delete the code and reject if it was
      // already consumed. deleteMany returns the affected row count, so under a
      // replay (or two concurrent exchanges) only the first request observes
      // count === 1; any later attempt sees count === 0 and is rejected with no
      // tokens issued. The code is consumed only AFTER PKCE + redirect checks
      // pass, so a failed attempt never burns the code prematurely.
      const consumed = await prisma.authorizationCode.deleteMany({ where: { code } });
      if (consumed.count === 0) {
        return reply.code(400).send({
          error: 'invalid_grant',
          error_description: 'Authorization code already used',
        });
      }

      const user = await prisma.user.findUnique({ where: { id: authCode.userId } });
      if (!user) {
        return reply.code(400).send({ error: 'invalid_grant' });
      }

      const scopes: string[] = Array.isArray(authCode.scopes) ? authCode.scopes : [];

      const tokens = await tokenService.generateTokenPair(
        user.id,
        { email: user.email, username: user.username, role: user.role },
        scopes as any,
        'quantmail' as any,
      );

      // OpenID Connect: when the `openid` scope was granted, mint an RS256
      // id_token signed by QuantMail's OIDC key (verifiable via the published
      // JWKS). The id_token is bound to the requesting client (`aud`) and
      // echoes the request `nonce` when present (OIDC Core 3.1.3.6).
      let idToken: string | undefined;
      if (scopes.includes('openid')) {
        idToken = await oidcKeyService.signIdToken(
          {
            sub: user.id,
            aud: authCode.clientId,
            azp: authCode.clientId,
            nonce: (authCode as { nonce?: string | null }).nonce ?? undefined,
            email: user.email,
            email_verified: user.emailVerified,
            name: user.displayName,
            preferred_username: user.username,
            auth_time: authCode.createdAt
              ? Math.floor(authCode.createdAt.getTime() / 1000)
              : undefined,
          },
          { issuer: getIssuer(), expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS },
        );
      }

      return reply.send(toTokenResponse(tokens, scopes, idToken));
    }

    return reply.code(400).send({ error: 'unsupported_grant_type' });
  });

  // POST /oauth/revoke
  fastify.post('/oauth/revoke', async (request, reply) => {
    const { token } = request.body as any;
    if (!token) return reply.code(400).send({ error: 'invalid_request' });

    await tokenService.revokeToken(token);
    return reply.send({ success: true });
  });

  // GET /oauth/authorize - Protected + Consent Screen
  fastify.get('/oauth/authorize', { preHandler: requireAuth }, async (request: any, reply) => {
    const query = request.query as any;
    const {
      client_id,
      redirect_uri,
      response_type,
      scope,
      state,
      code_challenge,
      code_challenge_method,
      nonce,
    } = query;

    if (response_type !== 'code') {
      return reply.code(400).send({ error: 'invalid_request' });
    }

    const safeRedirectUri = await resolveRedirectUri(client_id, redirect_uri);
    if (!safeRedirectUri) {
      return reply
        .code(400)
        .send({ error: 'invalid_request', error_description: 'Invalid redirect_uri' });
    }

    const userId = request.user?.id || request.user?.sub;
    if (!userId) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    // Check if consent already exists
    const existingConsent = await prisma.oAuthConsent.findUnique({
      where: {
        userId_clientId: {
          userId,
          clientId: client_id,
        },
      },
    });

    if (existingConsent) {
      // Auto-approve if consent already given
      const code = generateId('ac_');
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await prisma.authorizationCode.create({
        data: {
          code,
          clientId: client_id,
          userId,
          redirectUri: redirect_uri,
          scopes: (scope || 'openid profile email').split(' '),
          codeChallenge: code_challenge ?? null,
          codeChallengeMethod: code_challenge
            ? normalizeChallengeMethod(code_challenge_method)
            : null,
          nonce: nonce ?? null,
          expiresAt,
        },
      });

      const redirectUrl = `${safeRedirectUri}?code=${code}${state ? `&state=${state}` : ''}`;
      return reply.redirect(redirectUrl);
    }

    // Show consent screen
    const consentHtml = `
      <html>
        <head><title>QuantMail - Authorize Application</title></head>
        <body style="font-family: system-ui; max-width: 520px; margin: 60px auto; padding: 20px; line-height: 1.6;">
          <h2>Authorize Application</h2>
          <p><strong>${esc(client_id)}</strong> wants to access your QuantMail account.</p>
          
          <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <strong>Permissions requested:</strong><br>
            ${(scope || 'openid profile email')
              .split(' ')
              .map((s: string) => `• ${esc(s)}`)
              .join('<br>')}
          </div>

          <form method="POST" action="/oauth/consent">
            <input type="hidden" name="client_id" value="${esc(client_id)}">
            <input type="hidden" name="redirect_uri" value="${esc(redirect_uri)}">
            <input type="hidden" name="user_id" value="${esc(userId)}">
            <input type="hidden" name="scope" value="${esc(scope || 'openid profile email')}">
            <input type="hidden" name="state" value="${esc(state || '')}">
            <input type="hidden" name="code_challenge" value="${esc(code_challenge || '')}">
            <input type="hidden" name="code_challenge_method" value="${esc(code_challenge_method || '')}">
            <input type="hidden" name="nonce" value="${esc(nonce || '')}">
            
            <button type="submit" name="action" value="approve" 
                    style="background: #0066ff; color: white; padding: 14px 28px; border: none; border-radius: 8px; font-size: 16px; cursor: pointer;">
              Approve
            </button>
            
            <button type="submit" name="action" value="deny"
                    style="background: #e0e0e0; color: #333; padding: 14px 28px; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; margin-left: 12px;">
              Cancel
            </button>
          </form>
        </body>
      </html>
    `;

    return reply.type('text/html').send(consentHtml);
  });

  // POST /oauth/consent
  fastify.post('/oauth/consent', async (request, reply) => {
    const body = request.body as any;
    const { action, client_id, redirect_uri, user_id, scope, state } = body;
    const { code_challenge, code_challenge_method, nonce } = body;

    const safeRedirectUri = await resolveRedirectUri(client_id, redirect_uri);
    if (!safeRedirectUri) {
      return reply
        .code(400)
        .send({ error: 'invalid_request', error_description: 'Invalid redirect_uri' });
    }

    if (action !== 'approve') {
      const errorUrl = `${safeRedirectUri}?error=access_denied${state ? `&state=${state}` : ''}`;
      return reply.redirect(errorUrl);
    }

    // Save consent
    await prisma.oAuthConsent.upsert({
      where: {
        userId_clientId: {
          userId: user_id,
          clientId: client_id,
        },
      },
      update: {
        scopes: scope.split(' '),
      },
      create: {
        userId: user_id,
        clientId: client_id,
        scopes: scope.split(' '),
      },
    });

    const code = generateId('ac_');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.authorizationCode.create({
      data: {
        code,
        clientId: client_id,
        userId: user_id,
        redirectUri: redirect_uri,
        scopes: scope.split(' '),
        codeChallenge: code_challenge || null,
        codeChallengeMethod: code_challenge
          ? normalizeChallengeMethod(code_challenge_method)
          : null,
        nonce: nonce || null,
        expiresAt,
      },
    });

    const redirectUrl = `${safeRedirectUri}?code=${code}${state ? `&state=${state}` : ''}`;
    return reply.redirect(redirectUrl);
  });

  // POST /oauth/register
  fastify.post('/oauth/register', async (request, reply) => {
    const body = request.body as any;
    const { name, redirect_uris, scopes, is_confidential } = body;

    if (!name || !redirect_uris?.length) {
      return reply.code(400).send({ error: 'invalid_request' });
    }

    const clientId = generateId('client_');
    const clientSecret = is_confidential ? generateId('secret_') : null;

    const client = await prisma.oAuthClient.create({
      data: {
        clientId,
        clientSecretHash: clientSecret,
        name,
        redirectUris: redirect_uris,
        allowedScopes: scopes || ['openid', 'profile', 'email'],
        isConfidential: is_confidential ?? true,
        isFirstParty: false,
      },
    });

    return reply.send({
      client_id: client.clientId,
      client_secret: clientSecret,
      name: client.name,
    });
  });

  // GET /oauth/userinfo — current user for the authenticated session. The
  // frontend auth-provider calls this right after login/hydrate to populate
  // the user; it expects the standard `{ success, data }` envelope with
  // `{ id, email, username, displayName, role }`. Protected by requireAuth
  // (validates the bearer access token).
  fastify.get('/oauth/userinfo', { preHandler: requireAuth }, async (request: any, reply) => {
    const userId = request.user?.sub || request.user?.id;
    if (!userId) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated', statusCode: 401 },
      });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return reply.code(404).send({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found', statusCode: 404 },
      });
    }

    return reply.send({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    });
  });

  // Discovery (OpenID Connect Discovery 1.0 + RFC 8414)
  fastify.get('/.well-known/openid-configuration', async () => ({
    issuer: getIssuer(),
    authorization_endpoint: endpoint('/oauth/authorize'),
    token_endpoint: endpoint('/oauth/token'),
    revocation_endpoint: endpoint('/oauth/revoke'),
    registration_endpoint: endpoint('/oauth/register'),
    jwks_uri: endpoint('/.well-known/jwks.json'),
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
    code_challenge_methods_supported: ['S256', 'plain'],
    scopes_supported: ['openid', 'profile', 'email'],
    claims_supported: [
      'sub',
      'iss',
      'aud',
      'exp',
      'iat',
      'auth_time',
      'nonce',
      'email',
      'email_verified',
      'name',
      'preferred_username',
    ],
  }));

  // JWKS — the public half of QuantMail's OIDC signing key(s). Relying parties
  // fetch this to verify id_tokens. Served from the asymmetric key resolved by
  // the OidcKeyService (env-provided in production, ephemeral in dev).
  fastify.get('/.well-known/jwks.json', async () => oidcKeyService.getPublicJwks());
}
