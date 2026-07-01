import { createApp } from '@quant/server-core';
import type { AppConfig } from '@quant/server-core';
import type { PrismaClient } from '@prisma/client';
import messagesRoutes from './routes/messages';
import conversationsRoutes from './routes/conversations';
import searchRoutes from './routes/search';
import encryptionRoutes from './routes/encryption';
import e2eeRoutes from './routes/e2ee';
import e2eePreKeyRoutes from './routes/e2ee-prekeys';
import federationRoutes, { createFederationService } from './routes/federation';
import arLensesRoutes, { createArLensesService } from './routes/ar-lenses';
import mediaRoutes from './routes/media';
import callsRoutes from './routes/calls';
import aiRoutes from './routes/ai';
import aiAgentRoutes from './routes/ai-agent';
import reelsRoutes from './routes/reels';
import avatarRoutes from './routes/avatar';
import memoriesRoutes from './routes/memories';
import spotlightRoutes from './routes/spotlight';
import notificationsRoutes from './routes/notifications';
import themesRoutes from './routes/themes';
import ephemeralRoutes from './routes/ephemeral';
import gamesRoutes from './routes/games';
import channelsRoutes from './routes/channels';
import mapRoutes from './routes/map';
import { websocketRoutes } from './routes/websocket';
import { InMemoryE2EERelay } from './lib/e2ee-relay';
import { AutoReplyManager } from './lib/auto-reply-manager';
import { ScheduledMessageWorker } from './services/scheduled-message-worker';
import { createRealtimeContext } from './lib/realtime-context';
import { PrismaOutboxService } from './services/outbox.service';
import { DeliveryWorker } from './services/delivery-worker';
import {
  createPushDispatcher,
  type PrismaPushSubscriptionClient,
} from './services/push-dispatcher';
import authRoutes from './routes/auth';
import { OtpService, LoggingSmsSender } from './lib/otp-service';
import { SessionTokenIssuer } from './lib/session-tokens';

export function getConfig(): AppConfig {
  const env = (process.env['NODE_ENV'] as AppConfig['env']) ?? 'development';

  if (env === 'production' && !process.env['JWT_SECRET']) {
    throw new Error('JWT_SECRET environment variable is required in production');
  }

  return {
    port: Number(process.env['PORT'] ?? 3002),
    host: process.env['HOST'] ?? '0.0.0.0',
    logLevel: process.env['LOG_LEVEL'] ?? 'info',
    corsOrigins: (process.env['CORS_ORIGINS'] ?? 'http://localhost:3000').split(','),
    rateLimitMax: Number(process.env['RATE_LIMIT_MAX'] ?? 100),
    rateLimitWindow: process.env['RATE_LIMIT_WINDOW'] ?? '1 minute',
    redisUrl: process.env['REDIS_URL'],
    jwtSecret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
    jwtIssuer: process.env['JWT_ISSUER'] ?? 'quantchat',
    jwtAudience: process.env['JWT_AUDIENCE'] ?? 'quant-ecosystem',
    env,
    // Phone-OTP sign-in endpoints are pre-authentication and must bypass the
    // global auth hook.
    publicPaths: ['/auth/otp/request', '/auth/otp/verify'],
  };
}

export async function buildApp(config?: AppConfig) {
  const appConfig = config ?? getConfig();
  const app = await createApp(appConfig);

  // Phone-OTP sign-in (QuantChat additionally requires a verified phone on top
  // of QuantMail SSO). The OtpService is an in-memory singleton (one code/rate
  // store) decorated once at boot; the SMS sender is the dev logging sender
  // unless real provider env (Twilio/MSG91) is wired. SessionTokenIssuer signs
  // JWTs with the SAME secret/issuer/audience the auth plugin verifies, so the
  // access token is immediately valid on protected routes. Routes are mounted
  // at /auth and allow-listed as public via getConfig().publicPaths.
  app.decorate('otpService', new OtpService(new LoggingSmsSender((m) => app.log.info(m))));
  app.decorate(
    'sessionTokens',
    new SessionTokenIssuer({
      jwtSecret: appConfig.jwtSecret,
      jwtIssuer: appConfig.jwtIssuer,
      jwtAudience: appConfig.jwtAudience,
    }),
  );
  await app.register(authRoutes, { prefix: '/auth' });

  // W2/W3 — Shared realtime context (backplane + presence). Created once and
  // decorated on the app BEFORE the websocket routes register, so the websocket
  // layer AND the DeliveryWorker below share the SAME instances (one Redis
  // client, one presence ZSET, one channel-subscription set).
  const realtime = createRealtimeContext({
    error: (obj, msg) => app.log.error(obj as object, msg),
    warn: (msg) => app.log.warn(msg),
    info: (msg) => app.log.info(msg),
  });
  app.decorate('realtimeBackplane', realtime.backplane);
  app.decorate('presence', realtime.presence);

  // WebSocket real-time routes (consume the decorated backplane + presence)
  await app.register(websocketRoutes, { prefix: '/ws' });

  await app.register(messagesRoutes, { prefix: '/conversations' });
  await app.register(conversationsRoutes, { prefix: '/conversations' });

  // Unified search (W5, design Component 5 / Algorithm 5). Routes a plaintext
  // `q` through the existing Postgres ILIKE path (non-E2EE messages — Req 15.7)
  // and client-computed `tokenHashes` through the blind index (E2EE messages),
  // returning both result sets. Uses the shared `fastify.prisma` decorator and
  // the global auth hook from createApp(); the backend stays a zero-knowledge
  // relay — it matches opaque HMAC token hashes only (Req 15.6, 16.1).
  await app.register(searchRoutes, { prefix: '/search' });

  // Snapchat parity — chat themes + ephemeral/disappearing messages (Task 14).
  // Both mount under /conversations: themes persist the per-conversation theme
  // (Task 14.3), ephemeral handles disappear-timer config (14.8), post-view
  // deletion scheduling (14.9), and screenshot notifications (14.10). They use
  // the shared `fastify.prisma` decorator from createApp().
  await app.register(themesRoutes, { prefix: '/conversations' });
  await app.register(ephemeralRoutes, { prefix: '/conversations' });

  await app.register(encryptionRoutes, { prefix: '/encryption' });
  await app.register(mediaRoutes, { prefix: '/media' });
  await app.register(callsRoutes, { prefix: '/calls' });
  await app.register(aiRoutes, { prefix: '/ai' });

  // Quant AI Agent — agentic chat capabilities (Task 12, Req 11). The
  // AutoReplyManager is an in-memory singleton (no new schema — Req 9.5)
  // decorated once at boot so the auto-reply enablement + cancellation state
  // (Task 12.9) is shared across all /ai/auto-reply* requests. The scheduled
  // message worker (Task 12.4) polls every 30s (< 60s tolerance) and delivers
  // due ScheduledMessage rows; it is started here and stopped on app close.
  const autoReplyManager = new AutoReplyManager();
  app.decorate('autoReplyManager', autoReplyManager);
  await app.register(aiAgentRoutes, { prefix: '/ai' });

  const scheduledWorker = new ScheduledMessageWorker(
    (app as unknown as { prisma: ConstructorParameters<typeof ScheduledMessageWorker>[0] }).prisma,
    {
      onError: (error) => {
        app.log.error({ err: error }, 'scheduled message delivery failed');
      },
    },
  );
  scheduledWorker.start();
  app.addHook('onClose', async () => {
    scheduledWorker.stop();
  });

  await app.register(reelsRoutes, { prefix: '/reels' });
  await app.register(avatarRoutes, { prefix: '/avatar' });

  // In-chat games → shared cross-app leaderboard. Scores persist to the same
  // `GameScore` table QuantNeon writes to (tagged app: 'quantchat'), so ranks
  // aggregate across the whole ecosystem. Uses the shared `fastify.prisma`
  // decorator and the global auth hook from createApp().
  await app.register(gamesRoutes, { prefix: '/games' });
  await app.register(channelsRoutes, { prefix: '/channels' });

  // Snapchat parity — Memories vault + Spotlight feed (Task 13). Both rely on
  // the shared `fastify.prisma`/`fastify.notifications` decorators from
  // createApp(), so they register after the cross-cutting plugins are wired.
  await app.register(memoriesRoutes, { prefix: '/memories' });
  await app.register(spotlightRoutes, { prefix: '/spotlight' });

  // Snap Map — friend-location sharing (wires the previously-unused Prisma
  // `FriendLocation` model). POST /map/location publishes the caller's current
  // location (opt-in share, Zod-validated bounds), DELETE /map/location stops
  // sharing (idempotent), and GET /map/friends returns the caller's CLOSE
  // FRIENDS who are actively sharing, shaped for the map. Privacy: only the
  // caller's close friends with a live location row are ever exposed. Uses the
  // shared `fastify.prisma` decorator and the global auth hook from createApp().
  // The `/map` prefix does not collide with any existing registration.
  await app.register(mapRoutes, { prefix: '/map' });

  // Push notifications — subscription storage + dispatch (Task 10.2, Req 9).
  // Subscriptions persist to the Prisma `PushSubscription` model when available
  // (falls back to an in-memory store in dev/test). Delivery uses the graceful
  // web-push transport which degrades cleanly when the optional `web-push`
  // dependency / VAPID keys are absent (Task 10.2).
  await app.register(notificationsRoutes, { prefix: '/notifications' });

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
  // Req 7.4). Mounted at `/e2ee`, separate from the legacy `/encryption` prekey
  // routes above (no prefix collision).
  const e2eeRelay = new InMemoryE2EERelay();
  app.decorate('e2ee', e2eeRelay);
  app.addHook('onClose', async () => {
    e2eeRelay.shutdown();
  });
  await app.register(e2eeRoutes, { prefix: '/e2ee' });

  // Durable E2EE prekey distribution (W1, design Component 1 / Sequence 1).
  // Config-driven key storage (KEY_STORAGE=memory → volatile InMemoryKeyStorage,
  // otherwise durable PrismaKeyStorage). Mounted under /e2ee alongside the
  // ciphertext relay above: POST /e2ee/prekeys (publish PUBLIC bundle + verify
  // signed-prekey signature) and GET /e2ee/prekeys/:userId (fetch PUBLIC bundle
  // + atomically claim a one-time prekey). Zero-knowledge invariant preserved
  // (public material only — Req 16.1, 16.3); paths do not collide with the
  // relay's /e2ee/keys or /e2ee/messages.
  await app.register(e2eePreKeyRoutes, { prefix: '/e2ee' });

  // federation engine — per-app lane, Task 14.1 (Req 3.1, 3.2, 7.4). Composes
  // the as-shipped `@quant/federation` exports (FederationModeration +
  // APIKeyManager) into a decorated singleton constructed once at boot. Routes
  // under `/federation` are SCOPED (federation:read/write) on top of the global
  // auth hook. In-memory persistence (no new schema — Req 9.5).
  app.decorate('federation', createFederationService());
  await app.register(federationRoutes, { prefix: '/federation' });

  // ar-lenses engine — per-app lane (Stage 6, Task 14.2), SHARED DECORATOR
  // approach (design.md Open Question 2). quantchat is a declared ar-lenses
  // target (inventory: ar-lenses targets quantneon/quantchat/quantmeet). The
  // engine construction + route logic are app-agnostic and mirror quantneon's
  // module shape (see ./routes/ar-lenses.ts), reused here as a REAL app-local
  // importer of `@quant/ar-lenses` so DoD-1 holds for quantchat. quantchat only
  // supplies the app-specific bits — the `/ar-lenses` route prefix here and the
  // backend URL/port in the Next proxy (`src/app/api/_lib/ar-lenses-proxy.ts`).
  // The engine is in-memory (no prisma, no new schema — Req 9.5) and decorated
  // once at boot, never per-request. The global auth hook from createApp() stays
  // intact; mutating routes declare `ar-lenses:write` (Req 7.4).
  app.decorate('arLenses', createArLensesService());
  await app.register(arLensesRoutes, { prefix: '/ar-lenses' });

  // W3 — At-least-once delivery drain loop. Drains the transactional
  // `MessageOutbox` (written atomically with each Message by MessageService),
  // fanning every recipient to realtime delivery (online) via the shared
  // backplane or to Web Push (offline). The worker was previously only exercised
  // in its own tests; wiring it here makes HTTP-posted messages actually reach
  // online recipients and trigger offline push in production. Push uses a real
  // web-push transport when VAPID keys are configured, otherwise degrades to a
  // no-op dispatcher so the loop still drains.
  const prisma = (app as unknown as { prisma: PrismaClient }).prisma;
  const deliveryWorker = new DeliveryWorker(
    {
      outbox: new PrismaOutboxService(prisma),
      backplane: realtime.backplane,
      presence: realtime.presence,
      pushDispatcher: createPushDispatcher(prisma as unknown as PrismaPushSubscriptionClient),
    },
    {
      onError: (error) => app.log.error({ err: error }, 'message delivery drain failed'),
    },
  );
  // The 1s drain loop is not started under the test harness (no live DB); the
  // worker is covered directly by its own unit/integration tests.
  if (appConfig.env !== 'test') {
    deliveryWorker.start();
  }

  // Tear down the worker + the shared realtime context (backplane + Redis) on
  // app close. This is the single owner of the backplane lifecycle now that the
  // websocket layer consumes the shared instance.
  app.addHook('onClose', async () => {
    deliveryWorker.stop();
    await realtime.backplane.shutdown();
    if (realtime.redis) {
      realtime.redis.disconnect();
    }
  });

  return app;
}
