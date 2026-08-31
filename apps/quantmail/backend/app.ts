import { createApp } from '@quant/server-core';
import type { AppConfig } from '@quant/server-core';
import emailsRoutes from './routes/emails';
import labelsRoutes from './routes/labels';
import threadsRoutes from './routes/threads';
import foldersRoutes from './routes/folders';
import contactsRoutes from './routes/contacts';
import aiRoutes from './routes/ai';
import aiServicesRoutes from './routes/ai-services';
import mailFiltersRoutes from './routes/mail-filters';
import vacationResponderRoutes from './routes/vacation-responder';
import emailTemplatesRoutes from './routes/email-templates';
import emailSignaturesRoutes from './routes/email-signatures';
import searchRoutes from './routes/search';
import { registerQuantCodeModule } from './modules/code';
import aiDevtoolsRoutes from './routes/ai-devtools';
import attachmentRoutes from './routes/attachments';
import e2eeRoutes from './routes/e2ee';
import federationRoutes, { createFederationService } from './routes/federation';
import { oauthRoutes } from './routes/oauth';
import phoneRoutes from './routes/phone';
import { authRoutes } from './routes/auth';
import { twoFactorRoutes } from './routes/two-factor';
import reposRoutes from './routes/repos';
import workspaceRoutes from './routes/workspaces';
import ciRoutes from './routes/ci';
import calendarRoutes from './routes/calendar';
import driveRoutes from './routes/drive';
import aiComposeRoutes from './routes/ai-compose';
import aiChatRoutes from './routes/ai-chat';
import inboundWebhookRoutes from './routes/inbound-webhook';
import { InMemoryE2EERelay } from './lib/e2ee-relay';

export function getConfig(): AppConfig {
  const env = (process.env['NODE_ENV'] as AppConfig['env']) ?? 'development';

  if (env === 'production' && !process.env['JWT_SECRET']) {
    throw new Error('JWT_SECRET environment variable is required in production');
  }

  return {
    port: Number(process.env['PORT'] ?? 3010),
    host: process.env['HOST'] ?? '0.0.0.0',
    logLevel: process.env['LOG_LEVEL'] ?? 'info',
    corsOrigins: (process.env['CORS_ORIGINS'] ?? 'http://localhost:3000').split(','),
    rateLimitMax: Number(process.env['RATE_LIMIT_MAX'] ?? 1000),
    rateLimitWindow: process.env['RATE_LIMIT_WINDOW'] ?? '1 minute',
    redisUrl: process.env['REDIS_URL'],
    jwtSecret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
    jwtIssuer: process.env['JWT_ISSUER'] ?? 'quantmail',
    jwtAudience: process.env['JWT_AUDIENCE'] ?? 'quant-ecosystem',
    // Pre-authentication endpoints that must bypass the global auth hook so
    // users can sign in / sign up / run OAuth without a token. `/oauth/authorize`
    // stays protected (it needs a logged-in user for the consent screen).
    //
    // These are matched by PREFIX (`packages/server-core/src/app.ts`), so an entry
    // here exempts every path beneath it. Nothing may be mounted under one of
    // these unless it is meant to be public: `/webhook/inbound/sync-all` used to
    // exist and inherited this exemption, which is how replaying the entire
    // inbound S3 bucket into every user's mailbox became an unauthenticated POST.
    // It now lives at `/admin/inbound/sync-all`, outside the prefix.
    publicPaths: [
      '/auth/login',
      '/auth/register',
      '/auth/refresh',
      '/auth/logout',
      // Completes a login that stopped at the second factor: the caller holds a
      // signed challenge and no access token yet, so it cannot pass the JWT
      // hook. Listed as the exact path — NEVER as `/auth/2fa`, which would
      // expose setup, enable, disable and backup-code regeneration to anyone.
      '/auth/2fa/verify',
      '/oauth/token',
      '/oauth/revoke',
      '/oauth/register',
      '/oauth/consent',
      // Invite preview (/public/invites/:token): shown to people who may not
      // have an account yet. Accepting an invite stays authenticated.
      '/public/invites',
      '/.well-known',
      // Authenticated by the AWS SNS message signature, not by a JWT — SNS
      // cannot present a bearer token. See routes/inbound-webhook.ts.
      '/webhook/inbound',
    ],
    env,
  };
}

export async function buildApp(config?: AppConfig) {
  const appConfig = config ?? getConfig();
  const app = await createApp(appConfig);

  // Cookie-only endpoints (/auth/refresh, /auth/logout) are legitimately called
  // without a payload. Fastify's default JSON parser rejects that with
  // FST_ERR_CTP_EMPTY_JSON_BODY (400), which silently logged users out.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, body: string, done) => {
      if (!body || body.trim() === '') {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(body));
      } catch (error) {
        done(error as Error, undefined);
      }
    },
  );

  // Auth routes (Login, Register, OAuth2)
  await app.register(authRoutes);
  // TOTP second factor. `/auth/2fa/verify` is public (it completes a login);
  // every other route in here requires the JWT the global hook enforces.
  await app.register(twoFactorRoutes);
  await app.register(oauthRoutes);
  await app.register(phoneRoutes);

  await app.register(emailsRoutes, { prefix: '/emails' });
  await app.register(labelsRoutes, { prefix: '/labels' });
  await app.register(threadsRoutes, { prefix: '/threads' });
  await app.register(foldersRoutes, { prefix: '/folders' });
  await app.register(contactsRoutes, { prefix: '/contacts' });
  // Product-surface repositories API (id-based, list-my-repos) consumed by the
  // Repos page. Complements the QuantCode owner/name git API under /api/code.
  await app.register(reposRoutes, { prefix: '/repos' });
  // Shared workspaces: multi-user collaboration with roles + emailed invites.
  await app.register(workspaceRoutes);
  // CI/CD product surface (/ci/*) for the Pipelines page — builds backed by the
  // CiRun model; workflows/deployments are empty until those are modelled.
  await app.register(ciRoutes);
  // Calendar (/events, /calendars) and Drive (/drive/*) product surfaces,
  // backed by the Event/Calendar and File/Folder models respectively.
  await app.register(calendarRoutes);
  await app.register(driveRoutes);
  // AI compose (/ai/compose) for the composer's AI assist — real @quant/ai
  // engine; degrades to 503 when no provider key is configured.
  await app.register(aiComposeRoutes, { prefix: '/ai' });
  await app.register(aiChatRoutes, { prefix: '/ai' });
  await app.register(aiRoutes, { prefix: '/emails' });
  await app.register(aiServicesRoutes, { prefix: '/api/v1' });

  // QuantMail productivity features (Gmail/Superhuman-class): server-side
  // filters/rules, vacation auto-responder, reusable templates, signatures,
  // and advanced (operator-based) search. Each sits behind the global auth hook.
  await app.register(mailFiltersRoutes, { prefix: '/mail-filters' });
  await app.register(vacationResponderRoutes, { prefix: '/vacation-responder' });
  await app.register(emailTemplatesRoutes, { prefix: '/email-templates' });
  await app.register(emailSignaturesRoutes, { prefix: '/email-signatures' });
  await app.register(searchRoutes, { prefix: '/search' });

  // QuantCode developer-platform module (Pillar 2, SRP-extracted — Task 9.1).
  // Mounts repo/PR/issue/review/branch-protection/CI under the canonical
  // `/api/code/*` prefix (Requirement 6.1), plus a `/api/v1/*` backward-compat
  // alias preserving the pre-extraction paths. The mail domain above does not
  // import any QuantCode service and this module imports no mail service
  // (Requirement 6.2).
  await registerQuantCodeModule(app);

  await app.register(aiDevtoolsRoutes, { prefix: '/api/v1' });
  await app.register(attachmentRoutes, { prefix: '/attachments' });

  // encryption (E2EE) engine — per-app lane, Task 14.1. SECURITY CONTRACT (Req
  // 7.5): the `@quant/encryption` engine runs CLIENT-SIDE — all key generation,
  // encryption, and decryption happen in the browser (see
  // `src/features/encryption/`). The backend is a zero-knowledge relay: it only
  // registers PUBLIC pre-key bundles (for key distribution) and relays opaque
  // CIPHERTEXT envelopes between users. Private keys, session/ratchet secrets,
  // and plaintext NEVER reach this server (the `/e2ee` route schemas are
  // `.strict()` and model public/ciphertext fields only). The relay is in-memory
  // (no new persistent schema — Req 9.5) and decorated once at boot, never
  // per-request. The global auth hook from createApp() stays intact; the `/e2ee`
  // routes additionally declare encryption:read/write scopes (sensitive engine,
  // Req 7.4).
  const e2eeRelay = new InMemoryE2EERelay();
  app.decorate('e2ee', e2eeRelay);
  app.addHook('onClose', async () => {
    e2eeRelay.shutdown();
  });
  await app.register(e2eeRoutes, { prefix: '/e2ee' });

  // federation engine — per-app lane, Task 14.1 (Req 3.1, 3.2, 7.4). Composes
  // the as-shipped `@quant/federation` exports (FederationModeration +
  // APIKeyManager) into a decorated singleton constructed once at boot. Routes
  // under `/federation` are SCOPED (federation:read/write) on top of the global
  // auth hook. In-memory persistence (no new schema — Req 9.5).
  app.decorate('federation', createFederationService());
  await app.register(federationRoutes, { prefix: '/federation' });

  // SES inbound email webhook (POST /webhook/inbound) — called by AWS SNS and
  // authenticated by the SNS message signature rather than a JWT. The same module
  // registers POST /admin/inbound/sync-all, which is deliberately *outside* the
  // public prefix and checks for an ADMIN role.
  await app.register(inboundWebhookRoutes);

  return app;
}
