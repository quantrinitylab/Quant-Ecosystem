import { FastifyInstance } from 'fastify';
import { TokenService } from '@quant/auth/services/token-service';
import { getJwtSecret, getJwtRefreshSecret } from '@quant/auth/lib/secrets';
import prisma from '@quant/auth/lib/prisma';
import { generateId } from '@quant/auth/crypto/secure-random';

export async function oauthRoutes(fastify: FastifyInstance) {
  const tokenService = new TokenService({
    jwtSecret: getJwtSecret(),
    jwtRefreshSecret: getJwtRefreshSecret(),
    accessTokenExpiresIn: 900,
    refreshTokenExpiresIn: 2592000,
    issuer: 'quantmail',
    audience: 'quant-ecosystem',
    bcryptRounds: 12,
    maxLoginAttempts: 5,
    lockoutDuration: 900,
  });

  // POST /oauth/token
  fastify.post('/oauth/token', async (request, reply) => {
    const body = request.body as any;
    const { grant_type, code, refresh_token, client_id, code_verifier, redirect_uri } = body;

    if (grant_type === 'refresh_token' && refresh_token) {
      try {
        const tokens = await tokenService.refreshToken(refresh_token);
        return reply.send(tokens);
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

      await prisma.authorizationCode.delete({ where: { code } });

      const user = await prisma.user.findUnique({ where: { id: authCode.userId } });
      if (!user) {
        return reply.code(400).send({ error: 'invalid_grant' });
      }

      const tokens = await tokenService.generateTokenPair(
        user.id,
        { email: user.email, username: user.username, role: user.role },
        authCode.scopes as any,
        'quantmail' as any,
      );

      return reply.send(tokens);
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
    } = query;

    if (response_type !== 'code') {
      return reply.code(400).send({ error: 'invalid_request' });
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
          expiresAt,
        },
      });

      const redirectUrl = `${redirect_uri}?code=${code}${state ? `&state=${state}` : ''}`;
      return reply.redirect(redirectUrl);
    }

    // Show consent screen
    const consentHtml = `
      <html>
        <head><title>QuantMail - Authorize Application</title></head>
        <body style="font-family: system-ui; max-width: 520px; margin: 60px auto; padding: 20px; line-height: 1.6;">
          <h2>Authorize Application</h2>
          <p><strong>${client_id}</strong> wants to access your QuantMail account.</p>
          
          <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <strong>Permissions requested:</strong><br>
            ${(scope || 'openid profile email')
              .split(' ')
              .map((s: string) => `• ${s}`)
              .join('<br>')}
          </div>

          <form method="POST" action="/oauth/consent">
            <input type="hidden" name="client_id" value="${client_id}">
            <input type="hidden" name="redirect_uri" value="${redirect_uri}">
            <input type="hidden" name="user_id" value="${userId}">
            <input type="hidden" name="scope" value="${scope || 'openid profile email'}">
            <input type="hidden" name="state" value="${state || ''}">
            
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

    if (action !== 'approve') {
      const errorUrl = `${redirect_uri}?error=access_denied${state ? `&state=${state}` : ''}`;
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
        expiresAt,
      },
    });

    const redirectUrl = `${redirect_uri}?code=${code}${state ? `&state=${state}` : ''}`;
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

  // Discovery
  fastify.get('/.well-known/openid-configuration', async () => ({
    issuer: 'https://quantmail.com',
    authorization_endpoint: '/oauth/authorize',
    token_endpoint: '/oauth/token',
    revocation_endpoint: '/oauth/revoke',
    registration_endpoint: '/oauth/register',
    jwks_uri: '/.well-known/jwks.json',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
  }));

  fastify.get('/.well-known/jwks.json', async () => ({ keys: [] }));
}
