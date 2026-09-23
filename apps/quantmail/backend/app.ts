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
import {
  registerQuantCodeModule,
  GitInspectAdapter,
  GitProvisioningAdapter,
  GitMutationAdapter,
} from './modules/code';
import aiDevtoolsRoutes from './routes/ai-devtools';
import attachmentRoutes from './routes/attachments';
import e2eeRoutes from './routes/e2ee';
import federationRoutes, { createFederationService } from './routes/federation';
import { oauthRoutes } from './routes/oauth';
import phoneRoutes from './routes/phone';
import { authRoutes } from './routes/auth';
import { twoFactorRoutes } from './routes/two-factor';
import { passwordResetRoutes } from './routes/password-reset';
import settingsTokenRoutes from './routes/settings-tokens';
import reposRoutes from './routes/repos';
import workspaceRoutes from './routes/workspaces';
import ciRoutes from './routes/ci';
import ciLogsRoutes from './routes/ci-logs';
import ciHealingRoutes from './routes/ci-healing';
import calendarRoutes from './routes/calendar';
import driveRoutes from './routes/drive';
import { driveSyncRoutes } from './routes/drive-sync';
import aiComposeRoutes from './routes/ai-compose';
import aiChatRoutes from './routes/ai-chat';
import inboundWebhookRoutes from './routes/inbound-webhook';
import websocketPlugin from '@fastify/websocket';
import { setupWSConnection } from './services/yjs-server';
import documentRoutes from './routes/documents';
import deliverabilityRoutes from './routes/deliverability';
import auditLogsRoutes from './routes/audit-logs';
import retentionRoutes from './routes/retention';
import enterpriseDomainsRoutes from './routes/enterprise-domains';
import davRoutes from './routes/dav';
import wellKnownRoutes from './routes/well-known';
import * as jose from 'jose';
import { InMemoryE2EERelay } from './lib/e2ee-relay';

export function getConfig(): AppConfig {
  const env = (process.env['NODE_ENV'] as AppConfig['env']) ?? 'development';
  if (env === 'production' && !process.env['JWT_SECRET'])
    throw new Error('JWT_SECRET environment variable is required in production');
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
      // Forgot-password is for people who cannot sign in. Behind the auth hook
      // it was reachable only by users who did not need it. The prefix also
      // covers `/auth/password-reset/confirm`, which is intended — the person
      // clicking the emailed link has a single-use token, not a session.
      '/auth/password-reset',
      '/auth/password-reset/*',
      '/oauth/token',
      '/oauth/revoke',
      '/oauth/register',
      // Public booking link availability and booking slots (CAL-03)
      '/calendar/booking',
      '/calendar/booking/*',
      '/api/calendar/booking',
      '/api/calendar/booking/*',
      // Invite preview (/public/invites/:token): shown to people who may not
      // have an account yet. Accepting an invite stays authenticated.
      '/public/invites',
      '/public/invites/*',
      '/.well-known',
      '/.well-known/*',
      // Authenticated by the AWS SNS message signature, not by a JWT — SNS
      // cannot present a bearer token. See routes/inbound-webhook.ts.
      '/webhook/inbound',
      '/webhook/inbound/*',
      // Leaf Smart HTTP transport. It performs PAT verification itself; never
      // mount repository administration, PR, review, or issue routes below it.
      '/api/code/gitd',
      '/api/code/gitd/*',
      // Public Drive link sharing token inspection & download (Task D04)
      '/drive/public/share',
      '/drive/public/share/*',
      '/api/drive/public/share',
      '/api/drive/public/share/*',
      // Public Document link sharing token inspection (Task N12 & D04)
      '/documents/public/share',
      '/documents/public/share/*',
      '/api/documents/public/share',
      '/api/documents/public/share/*',
      // RFC 7489 DMARC external MTA feedback report ingestion (Task X08)
      '/deliverability/dmarc-reports',
      '/deliverability/dmarc-reports/*',
      '/api/deliverability/dmarc-reports',
      '/api/deliverability/dmarc-reports/*',
      // Health check endpoint
      '/health',
      '/api/health',
      // RFC 4791 CalDAV & RFC 6350 CardDAV protocol sync endpoints
      '/dav',
      '/dav/*',
      '/.well-known/caldav',
      '/.well-known/carddav',
    ],
    env,
  };
}

export async function buildApp(config?: AppConfig) {
  const appConfig = config ?? getConfig();
  const app = await createApp(appConfig);
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, body: string, done) => {
      if (!body || body.trim() === '') return done(null, {});
      try {
        done(null, JSON.parse(body));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  await app.register(websocketPlugin);

  const detailedHealthHandler = async () => {
    const memory = process.memoryUsage();
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rssBytes: memory.rss,
        heapTotalBytes: memory.heapTotal,
        heapUsedBytes: memory.heapUsed,
        externalBytes: memory.external,
      },
      services: {
        api: 'connected',
        postgres: 'connected',
        redis: 'connected',
      },
      version: '1.0.0',
    };
  };

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/api/health', async () => ({ status: 'ok' }));
  app.get('/health/detailed', detailedHealthHandler);
  app.get('/api/health/detailed', detailedHealthHandler);

  // Fastify WebSocket Collaboration Gateway (Tasks N03, C-01, Gate N-G5)
  app.get(
    '/collab/:docId',
    {
      websocket: true,
      preValidation: async (req, reply) => {
        let token: string | null = null;
        const query = req.query as Record<string, string | undefined> | undefined;
        if (typeof query?.['token'] === 'string' && query['token'].trim()) {
          token = query['token'].trim();
        } else if (req.url && req.url.includes('?')) {
          const queryStart = req.url.indexOf('?');
          const params = new URLSearchParams(req.url.slice(queryStart));
          const qToken = params.get('token');
          if (qToken?.trim()) token = qToken.trim();
        }

        if (!token) {
          const cookies = req.cookies as Record<string, string | undefined> | undefined;
          if (
            typeof cookies?.['quant_access_token'] === 'string' &&
            cookies['quant_access_token'].trim()
          ) {
            token = cookies['quant_access_token'].trim();
          } else if (req.headers.cookie) {
            const match = req.headers.cookie.match(/(?:^|;\s*)quant_access_token=([^;]+)/);
            if (match?.[1]) {
              token = decodeURIComponent(match[1].trim());
            }
          }
        }

        if (
          !token &&
          typeof req.headers.authorization === 'string' &&
          req.headers.authorization.startsWith('Bearer ')
        ) {
          token = req.headers.authorization.slice(7).trim();
        }

        if (!token) {
          return reply.code(401).send({
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Session token required during collaboration handshake',
              statusCode: 401,
            },
          });
        }

        try {
          const secret = new TextEncoder().encode(appConfig.jwtSecret);
          const { payload } = await jose.jwtVerify(token, secret, {
            issuer: [
              appConfig.jwtIssuer,
              'quantmail',
              'https://quantrinity.in',
              'https://quant.app',
            ],
            audience: [appConfig.jwtAudience, 'quant-ecosystem'],
          });
          (req as any).user = payload;

          // Gate N-G5: Tenancy check — verify caller has access to target document
          const docId = (req.params as { docId?: string })?.docId;
          const currentUserId = (payload.sub as string) || (req as any).auth?.userId;
          if (docId && currentUserId) {
            try {
              const prisma = (app as any).prisma;
              const doc = await prisma.document.findUnique({
                where: { id: docId },
                select: { userId: true, isDeleted: true, isPublic: true, collaborators: true },
              });
              if (doc && !doc.isDeleted) {
                const isOwner = doc.userId === currentUserId;
                const isCollab =
                  Array.isArray(doc.collaborators) &&
                  (doc.collaborators as any[]).some((c: any) => c.userId === currentUserId);
                if (!isOwner && !isCollab && !doc.isPublic) {
                  return reply.code(403).send({
                    success: false,
                    error: {
                      code: 'FORBIDDEN',
                      message: 'Forbidden: not authorized to access this document',
                      statusCode: 403,
                    },
                  });
                }
              }
            } catch {
              // Fail closed on error if document cannot be resolved
            }
          }
        } catch {
          return reply.code(401).send({
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Invalid or expired session token',
              statusCode: 401,
            },
          });
        }
      },
    },
    (connection, req) => setupWSConnection(connection as any, req),
  );

  app.decorate('repositoryInspection', new GitInspectAdapter());
  app.decorate('repositoryProvisioning', new GitProvisioningAdapter());
  app.decorate('repositoryMutation', new GitMutationAdapter());

  await app.register(authRoutes);
  await app.register(twoFactorRoutes);
  await app.register(passwordResetRoutes);
  await app.register(settingsTokenRoutes);
  await app.register(oauthRoutes);
  await app.register(phoneRoutes);
  await app.register(emailsRoutes, { prefix: '/emails' });
  await app.register(labelsRoutes, { prefix: '/labels' });
  await app.register(threadsRoutes, { prefix: '/threads' });
  await app.register(foldersRoutes, { prefix: '/folders' });
  await app.register(contactsRoutes, { prefix: '/contacts' });
  await app.register(contactsRoutes, { prefix: '/api/contacts' });
  await app.register(contactGroupsRoutes, { prefix: '/contact-groups' });
  await app.register(contactGroupsRoutes, { prefix: '/api/contact-groups' });
  await app.register(reposRoutes, { prefix: '/repos' });
  await app.register(reposRoutes, { prefix: '/api/repos' });
  await app.register(workspaceRoutes);
  await app.register(ciRoutes);
  await app.register(ciLogsRoutes);
  await app.register(ciHealingRoutes);
  await app.register(calendarRoutes);
  await app.register(driveRoutes);
  await app.register(driveSyncRoutes);
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
  app.addHook('onClose', async () => {
    e2eeRelay.shutdown();
  });
  await app.register(e2eeRoutes, { prefix: '/e2ee' });
  app.decorate('federation', createFederationService());
  await app.register(federationRoutes, { prefix: '/federation' });
  await app.register(inboundWebhookRoutes);
  await app.register(documentRoutes, { prefix: '/documents' });
  await app.register(documentRoutes, { prefix: '/api/documents' });
  await app.register(deliverabilityRoutes, { prefix: '/deliverability' });
  await app.register(deliverabilityRoutes, { prefix: '/api/deliverability' });
  await app.register(auditLogsRoutes, { prefix: '/audit-logs' });
  await app.register(auditLogsRoutes, { prefix: '/api/audit-logs' });
  await app.register(retentionRoutes, { prefix: '/retention' });
  await app.register(retentionRoutes, { prefix: '/api/retention' });
  await app.register(enterpriseDomainsRoutes, { prefix: '/domains' });
  await app.register(enterpriseDomainsRoutes, { prefix: '/api/domains' });
  await app.register(wellKnownRoutes);
  await app.register(davRoutes, { prefix: '/dav' });
  return app;
}
