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
import { authRoutes } from './routes/auth';
import reposRoutes from './routes/repos';
import ciRoutes from './routes/ci';
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
    rateLimitMax: Number(process.env['RATE_LIMIT_MAX'] ?? 100),
    rateLimitWindow: process.env['RATE_LIMIT_WINDOW'] ?? '1 minute',
    redisUrl: process.env['REDIS_URL'],
    jwtSecret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
    jwtIssuer: process.env['JWT_ISSUER'] ?? 'quantmail',
    jwtAudience: process.env['JWT_AUDIENCE'] ?? 'quant-ecosystem',
    // Pre-authentication endpoints that must bypass the global auth hook so
    // users can sign in / sign up / run OAuth without a token. `/oauth/authorize`
    // stays protected (it needs a logged-in user for the consent screen).
    publicPaths: [
      '/auth/login',
      '/auth/register',
      '/oauth/token',
      '/oauth/revoke',
      '/oauth/register',
      '/oauth/consent',
      '/.well-known',
    ],
    env,
  };
}

export async function buildApp(config?: AppConfig) {
  const appConfig = config ?? getConfig();
  const app = await createApp(appConfig);

  // Auth routes (Login, Register, OAuth2)
  await app.register(authRoutes);
  await app.register(oauthRoutes);

  await app.register(emailsRoutes, { prefix: '/emails' });
  await app.register(labelsRoutes, { prefix: '/labels' });
  await app.register(threadsRoutes, { prefix: '/threads' });
  await app.register(foldersRoutes, { prefix: '/folders' });
  await app.register(contactsRoutes, { prefix: '/contacts' });
  // Product-surface repositories API (id-based, list-my-repos) consumed by the
  // Repos page. Complements the QuantCode owner/name git API under /api/code.
  await app.register(reposRoutes, { prefix: '/repos' });
  // CI/CD product surface (/ci/*) for the Pipelines page — builds backed by the
  // CiRun model; workflows/deployments are empty until those are modelled.
  await app.register(ciRoutes);
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

  return app;
}
