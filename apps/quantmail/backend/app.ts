import { createApp } from '@quant/server-core';
import type { AppConfig } from '@quant/server-core';
import emailsRoutes from './routes/emails';
import emailsChangesRoutes from './routes/emails-changes';
import labelsRoutes from './routes/labels';
import threadsRoutes from './routes/threads';
import quantyAgentRoutes from './routes/quanty-agent';
import foldersRoutes from './routes/folders';
import contactsRoutes from './routes/contacts';
import contactGroupsRoutes from './routes/contact-groups';
import aiRoutes from './routes/ai';
import aiServicesRoutes, { aiThreadSummaryRoutes } from './routes/ai-services';
import mailFiltersRoutes from './routes/mail-filters';
import vacationResponderRoutes from './routes/vacation-responder';
import emailTemplatesRoutes from './routes/email-templates';
import emailSignaturesRoutes from './routes/email-signatures';
import followUpReminderRoutes from './routes/follow-up-reminders';
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
import { ssoTicketRoutes } from './routes/sso-tickets';
import { quantyMcpRoutes } from './routes/quanty-mcp';
// Phone OTP login was REMOVED per the locked 2026-10-05 / 2026-10-11 SSO design:
// `routes/phone.ts` (SMS send-otp/verify) was deleted; OTP is email-based only.
import { authRoutes } from './routes/auth';
import { twoFactorRoutes } from './routes/two-factor';
import { twoFactorRecoveryRoutes } from './routes/two-factor-recovery';
import { passwordResetRoutes } from './routes/password-reset';
import { accountRecoveryRoutes } from './routes/account-recovery';
import { sendAsRoutes } from './routes/send-as';
import settingsTokenRoutes from './routes/settings-tokens';
import reposRoutes from './routes/repos';
import workspaceRoutes from './routes/workspaces';
import ciRoutes from './routes/ci';
import ciLogsRoutes from './routes/ci-logs';
import ciHealingRoutes from './routes/ci-healing';
import { startCiRunStatusSync } from './modules/code/services/ci-run-events';
import calendarRoutes from './routes/calendar';
import driveRoutes from './routes/drive';
import { driveSyncRoutes } from './routes/drive-sync';
import { chunkedUploadRoutes } from './routes/chunked-upload';
import aiComposeRoutes from './routes/ai-compose';
import aiChatRoutes from './routes/ai-chat';
import inboundWebhookRoutes from './routes/inbound-webhook';
import openTrackingRoutes from './routes/open-tracking';
import { createMemoryService } from '@quant/ai';
import { DeliverabilityAuthService } from './services/deliverability-auth.service';
import { extractCollabWsToken } from './services/collab-ws-auth';
import { InboundIngestAdapter } from './services/inbound-ingest.service';
import { MailFilterService } from './services/mail-filter.service';
import { MemoryBackedLearnedInboxCategoryStore } from './services/learned-inbox-category.service';
import { SmartInboxService } from './services/smart-inbox.service';
import {
  sweepDueCallReminders,
  type CallReminderEventStore,
  type CallReminderNotificationStore,
} from './services/call-reminder-notify.service';
import type { PushSubscriptionStore } from './services/push-delivery.service';
import websocketPlugin from '@fastify/websocket';
import { setupWSConnection } from './services/yjs-server';
import { sloPlugin } from '@quant/server-core';
import { createQuantMailDependencyRegistry } from './lib/dependency-health';
import { QUANTMAIL_SLOS, QUANTMAIL_SLO_ROUTES } from './lib/slos';
import { threadRealtimeRoutes } from './routes/thread-realtime';
import documentRoutes from './routes/documents';
import deliverabilityRoutes from './routes/deliverability';
import auditLogsRoutes from './routes/audit-logs';
import adminRoutes from './routes/admin';
import retentionRoutes from './routes/retention';
import dataLifecycleRoutes from './routes/data-lifecycle';
import enterpriseDomainsRoutes from './routes/enterprise-domains';
import davRoutes from './routes/dav';
import wellKnownRoutes from './routes/well-known';
import * as jose from 'jose';
import { InMemoryE2EERelay } from './lib/e2ee-relay';
import { parsePort } from './lib/parse-port';

export function getConfig(): AppConfig {
  const env = (process.env['NODE_ENV'] as AppConfig['env']) ?? 'development';
  if (env === 'production' && !process.env['JWT_SECRET'])
    throw new Error('JWT_SECRET environment variable is required in production');
  return {
    port: parsePort(),
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
    // Matches via `matchesPublicPath()` in `packages/server-core/src/app.ts`.
    // Matching semantics (read this before adding an entry — the old comment
    // here used to claim the opposite): a plain STRING entry is a PREFIX
    // match (the path itself plus any sub-path, e.g. '/auth/login' also
    // matches '/auth/login/anything'); a trailing `/*` on a string changes
    // nothing. Only the OBJECT form with `exact: true` is a truly exact
    // match, and object entries can also be scoped by HTTP methods.
    // Rule: single endpoints MUST use `{ path, exact: true }`; use a string
    // (or `exact: false`) only when the sub-paths are intentionally public
    // too, and say so in the comment. Never add unbounded blanket wildcards
    // for data routes. Endpoints under these paths must be intentionally public.
    publicPaths: [
      { path: '/auth/login', exact: true },
      { path: '/auth/register', exact: true },
      { path: '/auth/refresh', exact: true },
      { path: '/auth/logout', exact: true },
      // Email address ownership proof (6-digit SES code). Reached WITHOUT a
      // session BY DESIGN: the emailed code IS the credential, not a bearer
      // token — a freshly-registered user holds no tokens yet and can only
      // prove address ownership here. Exact + POST-scoped: GET/PUT/DELETE on
      // these paths stay behind the auth hook, and no sub-path slips through.
      { path: '/auth/verify-email', methods: ['POST'], exact: true },
      { path: '/auth/resend-verification', methods: ['POST'], exact: true },
      // Completes a login that stopped at the second factor: the caller holds a
      // signed challenge and no access token yet, so it cannot pass the JWT
      // hook. Exact object form — NEVER as `/auth/2fa`, which would
      // expose setup, enable, disable and backup-code regeneration to anyone.
      { path: '/auth/2fa/verify', exact: true },
      // Forgot-password is for people who cannot sign in. Behind the auth hook
      // it was reachable only by users who did not need it. The prefix also
      // covers `/auth/password-reset/confirm`, which is intended — the person
      // clicking the emailed link has a single-use token, not a session.
      '/auth/password-reset',
      '/auth/password-reset/*',
      { path: '/oauth/token', exact: true },
      { path: '/oauth/revoke', exact: true },
      { path: '/oauth/register', exact: true },
      // POST /oauth/consent is reached by a plain HTML form POST from the
      // consent screen, which cannot send an Authorization header. Same
      // posture as /sso/ticket/resolve: listed here because the caller holds
      // a consent_token instead of the usual Authorization header, and auth is
      // enforced inside the handler (requireConsentAuth in routes/oauth.ts). Scoped to POST only:
      // GET /oauth/consent does not exist.
      { path: '/oauth/consent', methods: ['POST'], exact: true },
      // SSO ticket resolution is server-to-server: the receiving app's backend
      // presents the ticket plus its OAuth client credentials, so the caller
      // holds no user session. Auth is enforced inside the handler (same
      // posture as /oauth/token). The mint endpoint stays behind the session
      // auth hook and is deliberately NOT listed here.
      { path: '/sso/ticket/resolve', exact: true },
      // SSO ticket exchange is the token-minting sibling of /resolve: same
      // server-to-server posture, auth enforced inside the handler.
      { path: '/sso/ticket/exchange', exact: true },
      // Public booking link availability and booking slots (CAL-03)
      '/calendar/booking',
      '/calendar/booking/*',
      '/api/calendar/booking',
      '/api/calendar/booking/*',
      // Invite preview (/public/invites/:token): shown to people who may not
      // have an account yet. Accepting an invite stays authenticated.
      '/public/invites',
      '/public/invites/*',
      // Group join-link preview (GET /contact-groups/invite/:token): public
      // preview of a join link. No auth — the join page shows this before the
      // visitor signs in. Scoped to GET only: POST /contact-groups/join and
      // POST|GET|DELETE /contact-groups/:id/invite-link stay authenticated.
      { path: '/contact-groups/invite', methods: ['GET'], exact: false },
      '/.well-known',
      '/.well-known/*',
      // Authenticated by the AWS SNS message signature, not by a JWT — SNS
      // cannot present a bearer token. See routes/inbound-webhook.ts.
      '/webhook/inbound',
      '/webhook/inbound/*',
      // Open-tracking beacon (fix/qm-composer-open-tracking): the 1x1 image
      // in tracked outbound mail, fetched by the RECIPIENT's mail client with
      // no QuantMail session. Public BY DESIGN — the unguessable 48-hex token
      // is the only credential, and it authorizes nothing but counting this
      // one message's opens. Scoped to GET only (exact:false prefix match
      // covers /track/open and /track/open/<token> and nothing else); the
      // handler still answers 200 + GIF for unknown tokens so validity is
      // never leaked.
      { path: '/track/open', methods: ['GET'], exact: false },
      { path: '/api/track/open', methods: ['GET'], exact: false },
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
      // Health check endpoint. String (prefix) form is INTENTIONAL here:
      // it also covers /health/detailed and /api/health/detailed, which are
      // public by design (see route-reachability + dependency-health tests).
      // Do not "tighten" these to exact without moving the detailed
      // endpoints behind auth first.
      '/health',
      '/api/health',
      // RFC 4791 CalDAV & RFC 6350 CardDAV protocol sync endpoints
      // Discovery endpoints (.well-known) are public per RFC 6764.
      // /dav and /dav/* bypass the global Bearer-only requireAuth() so that
      // davRoutes's encapsulated preHandler can negotiate RFC 4791 HTTP Basic Auth
      // (for native Apple Calendar / Thunderbird / DAVx5) or Bearer tokens,
      // and enforce strict tenant boundary isolation (401 on missing auth, 403 on mismatch).
      { path: '/dav', exact: false },
      { path: '/dav/*', exact: false },
      { path: '/.well-known/caldav', methods: ['GET', 'PROPFIND'], exact: true },
      { path: '/.well-known/carddav', methods: ['GET', 'PROPFIND'], exact: true },
    ],
    env,
  };
}

export async function buildApp(config?: AppConfig) {
  const appConfig = config ?? getConfig();
  const app = await createApp(appConfig);

  // One process-scoped mail-intelligence graph. PostgreSQL remains the durable
  // cross-replica authority; wrappers are reused by correction routes and every
  // inbound path so learned sender preferences actually affect future mail.
  const db = (app as unknown as { prisma: ConstructorParameters<typeof InboundIngestAdapter>[0] })
    .prisma;
  const memoryBackend = createMemoryService({ prisma: db as never });
  const learnedCategory = new MemoryBackedLearnedInboxCategoryStore(memoryBackend);
  const smartInbox = new SmartInboxService();
  const inboundIngest = new InboundIngestAdapter(db, new DeliverabilityAuthService(db), {
    learnedCategory,
    smartInbox,
    // P0 fix: filters were constructed but never wired into ingest, so
    // user filters never auto-triggered on new mail ("Apply Now" worked
    // because it calls the service directly).
    filters: new MailFilterService(db as never),
  });

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

  // K12 reliability: SLO tracking. Records real request observations against
  // the QuantMail SLO journeys (lib/slos.ts), evaluates burn rates in-process,
  // and hooks burn-rate alerts into the pino logging + /metrics pipeline.
  // Registered on the root instance so its onResponse hook sees every route.
  await app.register(sloPlugin, { slos: QUANTMAIL_SLOS, routes: QUANTMAIL_SLO_ROUTES });

  // K12 reliability: per-dependency health registry (spec M16). Declares the
  // 12 spec'd dependencies with honest states — real probes where a cheap live
  // probe exists, `not_configured` where a dependency isn't wired, `unknown`
  // where it is configured but has no live probe. Each probe runs through its
  // own circuit breaker whose state is surfaced below.
  const dependencyRegistry = createQuantMailDependencyRegistry({
    prisma: db as unknown as { $queryRawUnsafe: (query: string) => Promise<unknown> },
    redisUrl: appConfig.redisUrl,
  });

  const detailedHealthHandler = async () => {
    const memory = process.memoryUsage();

    // Probe every dependency in parallel. Each probe swallows its own failure
    // (and is bounded by a timeout + circuit breaker) so this endpoint reports
    // a disconnected dependency rather than throwing a 500 — a down database
    // should surface as a signal, not an opaque error.
    const dependencies = await dependencyRegistry.checkAll();

    // SLO summary: latest error-budget evaluations for the critical journeys.
    // `sloEvaluations` is decorated by the sloPlugin registered above.
    const sloEvaluations = (
      app as unknown as { sloEvaluations?: () => Array<{ sloId: string }> }
    ).sloEvaluations?.() ?? [];
    const slos: Record<string, unknown> = {};
    for (const evaluation of sloEvaluations) {
      slos[evaluation.sloId] = evaluation;
    }

    // Back-compat `services` map: `api` is always reachable (it is serving this
    // request); `postgres` is a real round-trip; `redis` reflects configuration
    // (no live client is decorated onto this instance).
    const postgresStatus = dependencies['postgres']?.status;
    const redis: 'configured' | 'not_configured' = appConfig.redisUrl
      ? 'configured'
      : 'not_configured';

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
        api: 'ok',
        postgres: postgresStatus === 'ok' || postgresStatus === 'degraded' ? 'connected' : 'disconnected',
        redis,
      },
      dependencies,
      slos,
      version: '1.0.0',
    };
  };

  // NOTE: GET /health itself is registered by @quant/server-core's healthPlugin
  // (via createApp). Registering it here too throws
  // FastifyError: Method 'GET' already declared for route '/health'.
  // /api/health is NOT registered by the plugin, so it stays here.
  app.get('/api/health', async () => ({ status: 'ok' }));
  app.get('/health/detailed', detailedHealthHandler);
  app.get('/api/health/detailed', detailedHealthHandler);

  // Fastify WebSocket Collaboration Gateway (Tasks N03, C-01, Gate N-G5)
  app.get(
    '/collab/:docId',
    {
      websocket: true,
      preValidation: async (req, reply) => {
        // SECURITY: query-string tokens are never accepted (they leak into
        // proxy/server logs and browser history). The browser client sends the
        // token as a Sec-WebSocket-Protocol `bearer.<jwt>` offer instead.
        const token = extractCollabWsToken(
          req as unknown as Parameters<typeof extractCollabWsToken>[0],
        );

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
  await app.register(twoFactorRecoveryRoutes);
  await app.register(passwordResetRoutes);
  await app.register(accountRecoveryRoutes);
  await app.register(sendAsRoutes);
  await app.register(settingsTokenRoutes);
  await app.register(oauthRoutes);
  await app.register(ssoTicketRoutes);
  await app.register(quantyMcpRoutes, { prefix: '/api/quanty/mcp' });
  // No phoneRoutes: SMS OTP login/verify removed per locked design (see note above).
  await app.register(emailsRoutes, {
    prefix: '/emails',
    learnedCategory,
    smartInbox,
  });
  await app.register(emailsChangesRoutes, { prefix: '/emails' });
  await app.register(labelsRoutes, { prefix: '/labels' });
  await app.register(threadsRoutes, { prefix: '/threads' });
  await app.register(quantyAgentRoutes);
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
  await app.register(chunkedUploadRoutes);
  await app.register(aiComposeRoutes, { prefix: '/ai' });
  await app.register(aiChatRoutes, { prefix: '/ai' });
  await app.register(aiRoutes, { prefix: '/emails' });
  await app.register(aiServicesRoutes, { prefix: '/api/v1' });
  // The staging ingress strips `/api`, so the browser's POST /api/ai/summarize-thread
  // lands on /ai/summarize-thread — mounted at the root as well (see the plugin).
  await app.register(aiThreadSummaryRoutes);
  await app.register(mailFiltersRoutes, { prefix: '/mail-filters' });
  await app.register(vacationResponderRoutes, { prefix: '/vacation-responder' });
  await app.register(emailTemplatesRoutes, { prefix: '/email-templates' });
  await app.register(emailSignaturesRoutes, { prefix: '/email-signatures' });
  // Follow-up reminders (fix/qm-followup-reminders): server-backed replacement
  // for the dead EmailFollowUpReminder component.
  await app.register(followUpReminderRoutes, { prefix: '/follow-up-reminders' });
  await app.register(notificationRoutes, { prefix: '/notifications' });
  await app.register(searchRoutes, { prefix: '/search' });
  await registerQuantCodeModule(app);
  // CI runs (fix/qm-quantgit-ci-runs): the ci-runs queue events listener that
  // flips CiRun rows PENDING -> RUNNING -> SUCCESS|FAILED. Without it, runs
  // dispatched onto the queue would still sit PENDING forever from the API's
  // point of view. Skipped under NODE_ENV=test (suites build the app and must
  // never open a Redis connection), matching the call-reminder sweep pattern.
  if (process.env['NODE_ENV'] !== 'test') {
    const stopCiRunStatusSync = startCiRunStatusSync(
      (app as unknown as { prisma: unknown }).prisma as never,
      { logger: app.log },
    );
    if (stopCiRunStatusSync) {
      app.addHook('onClose', async () => {
        await stopCiRunStatusSync();
      });
    }
  }
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
  await app.register(inboundWebhookRoutes, { inboundIngest });
  // Thread realtime gateway (email-chat P0: realtime transport + typing).
  // Paths are absolute (/ws/...) so the /api ingress rewrite lands on the
  // backend root; keep no /api prefix registration (the rewrite strips it).
  await app.register(threadRealtimeRoutes);
  await app.register(documentRoutes, { prefix: '/documents' });
  await app.register(documentRoutes, { prefix: '/api/documents' });
  await app.register(deliverabilityRoutes, { prefix: '/deliverability' });
  await app.register(deliverabilityRoutes, { prefix: '/api/deliverability' });
  // Open-tracking beacon (fix/qm-composer-open-tracking): the 1x1 image in
  // tracked outbound mail. Fetched by the recipient's mail client with no
  // QuantMail session, so the path is public (GET only) in publicPaths above.
  await app.register(openTrackingRoutes, { prefix: '/track' });
  await app.register(openTrackingRoutes, { prefix: '/api/track' });
  await app.register(auditLogsRoutes, { prefix: '/audit-logs' });
  await app.register(auditLogsRoutes, { prefix: '/api/audit-logs' });
  await app.register(adminRoutes, { prefix: '/admin' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(retentionRoutes, { prefix: '/retention' });
  await app.register(retentionRoutes, { prefix: '/api/retention' });
  await app.register(dataLifecycleRoutes, { prefix: '/data-lifecycle' });
  await app.register(dataLifecycleRoutes, { prefix: '/api/data-lifecycle' });
  await app.register(enterpriseDomainsRoutes, { prefix: '/domains' });
  await app.register(enterpriseDomainsRoutes, { prefix: '/api/domains' });
  await app.register(wellKnownRoutes);
  await app.register(davRoutes, { prefix: '/dav' });

  // QM-SCREEN-015: periodic call-reminder sweep. GET /events/alarms/due had
  // zero frontend consumers, so persisting on that route alone would still
  // leave reminders undelivered — this timer runs the same persist + push
  // path for every user on a cadence. Env-gated
  // (CALL_REMINDER_SWEEP_INTERVAL_MS, default 60s; 0 or non-finite disables)
  // and skipped under NODE_ENV=test so suites never see timer-driven writes.
  // The handle is unref'd and cleared onClose so it can neither hold the
  // process open nor fire after shutdown. Failures are logged, never thrown.
  const reminderSweepIntervalMs = Number(process.env['CALL_REMINDER_SWEEP_INTERVAL_MS'] ?? 60_000);
  if (
    process.env['NODE_ENV'] !== 'test' &&
    Number.isFinite(reminderSweepIntervalMs) &&
    reminderSweepIntervalMs > 0
  ) {
    const sweepStores = db as unknown as {
      event: CallReminderEventStore;
      notification: CallReminderNotificationStore;
      pushSubscription: PushSubscriptionStore;
    };
    const reminderSweep = setInterval(() => {
      sweepDueCallReminders(
        {
          events: sweepStores.event,
          notifications: sweepStores.notification,
          push: { store: sweepStores.pushSubscription },
          log: app.log,
        },
        new Date(),
      ).then(
        (result) => {
          if (result.persisted > 0 || result.truncated) {
            app.log.info(
              `[call-reminder] sweep: persisted=${result.persisted} ` +
                `already-existed=${result.skippedExisting} users=${result.users} ` +
                `truncated=${result.truncated}`,
            );
          }
        },
        (error: unknown) => app.log.error(`[call-reminder] sweep failed: ${String(error)}`),
      );
    }, reminderSweepIntervalMs);
    if (typeof reminderSweep.unref === 'function') reminderSweep.unref();
    app.addHook('onClose', async () => {
      clearInterval(reminderSweep);
    });
  }

  return app;
}
