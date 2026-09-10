import { createApp } from '@quant/server-core';
import type { AppConfig } from '@quant/server-core';
import emailsRoutes from './routes/emails';
import labelsRoutes from './routes/labels';
import threadsRoutes from './routes/threads';
import foldersRoutes from './routes/folders';
import contactsRoutes from './routes/contacts';
import contactGroupsRoutes from './routes/contact-groups';
import aiRoutes from './routes/ai';
import aiServicesRoutes from './routes/ai-services';
import mailFiltersRoutes from './routes/mail-filters';
import vacationResponderRoutes from './routes/vacation-responder';
import emailTemplatesRoutes from './routes/email-templates';
import emailSignaturesRoutes from './routes/email-signatures';
import notificationRoutes from './routes/notifications';
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
import { passwordResetRoutes } from './routes/password-reset';
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
  if (env === 'production' && !process.env['JWT_SECRET']) throw new Error('JWT_SECRET environment variable is required in production');
  return {
    port: Number(process.env['PORT'] ?? 3010), host: process.env['HOST'] ?? '0.0.0.0',
    logLevel: process.env['LOG_LEVEL'] ?? 'info', corsOrigins: (process.env['CORS_ORIGINS'] ?? 'http://localhost:3000').split(','),
    rateLimitMax: Number(process.env['RATE_LIMIT_MAX'] ?? 1000), rateLimitWindow: process.env['RATE_LIMIT_WINDOW'] ?? '1 minute',
    redisUrl: process.env['REDIS_URL'], jwtSecret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
    jwtIssuer: process.env['JWT_ISSUER'] ?? 'quantmail', jwtAudience: process.env['JWT_AUDIENCE'] ?? 'quant-ecosystem',
    publicPaths: ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout', '/auth/2fa/verify', '/auth/password-reset', '/oauth/token', '/oauth/revoke', '/oauth/register', '/oauth/consent', '/public/invites', '/.well-known', '/webhook/inbound'],
    env,
  };
}

export async function buildApp(config?: AppConfig) {
  const app = await createApp(config ?? getConfig());
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body: string, done) => {
    if (!body || body.trim() === '') return done(null, {});
    try { done(null, JSON.parse(body)); } catch (error) { done(error as Error, undefined); }
  });

  await app.register(authRoutes);
  await app.register(twoFactorRoutes);
  await app.register(passwordResetRoutes);
  await app.register(oauthRoutes);
  await app.register(phoneRoutes);
  await app.register(emailsRoutes, { prefix: '/emails' });
  await app.register(labelsRoutes, { prefix: '/labels' });
  await app.register(threadsRoutes, { prefix: '/threads' });
  await app.register(foldersRoutes, { prefix: '/folders' });
  await app.register(contactsRoutes, { prefix: '/contacts' });
  await app.register(contactGroupsRoutes, { prefix: '/contact-groups' });
  await app.register(reposRoutes, { prefix: '/repos' });
  await app.register(workspaceRoutes);
  await app.register(ciRoutes);
  await app.register(calendarRoutes);
  await app.register(driveRoutes);
  await app.register(aiComposeRoutes, { prefix: '/ai' });
  await app.register(aiChatRoutes, { prefix: '/ai' });
  await app.register(aiRoutes, { prefix: '/emails' });
  await app.register(aiServicesRoutes, { prefix: '/api/v1' });
  await app.register(mailFiltersRoutes, { prefix: '/mail-filters' });
  await app.register(vacationResponderRoutes, { prefix: '/vacation-responder' });
  await app.register(emailTemplatesRoutes, { prefix: '/email-templates' });
  await app.register(emailSignaturesRoutes, { prefix: '/email-signatures' });
  await app.register(notificationRoutes, { prefix: '/notifications' });
  await app.register(searchRoutes, { prefix: '/search' });
  await registerQuantCodeModule(app);
  await app.register(aiDevtoolsRoutes, { prefix: '/api/v1' });
  await app.register(attachmentRoutes, { prefix: '/attachments' });

  const e2eeRelay = new InMemoryE2EERelay();
  app.decorate('e2ee', e2eeRelay);
  app.addHook('onClose', async () => { e2eeRelay.shutdown(); });
  await app.register(e2eeRoutes, { prefix: '/e2ee' });
  app.decorate('federation', createFederationService());
  await app.register(federationRoutes, { prefix: '/federation' });
  await app.register(inboundWebhookRoutes);
  return app;
}
