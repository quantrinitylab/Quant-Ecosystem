import { createApp } from '@quant/server-core';
import type { AppConfig } from '@quant/server-core';
import type { PrismaClient } from '@prisma/client';
import messagesRoutes from './routes/messages';
import conversationsRoutes from './routes/conversations';
import searchRoutes from './routes/search';
import encryptionRoutes from './routes/encryption';
import e2eeRoutes from './routes/e2ee';
import e2eePreKeyRoutes from './routes/e2ee-prekeys';
import prekeysRoutes from './routes/prekeys';
import federationRoutes, { createFederationService } from './routes/federation';
import arLensesRoutes, { createArLensesService } from './routes/ar-lenses';
import mediaRoutes from './routes/media';
import callsRoutes from './routes/calls';
import aiRoutes from './routes/ai';
import aiAgentRoutes from './routes/ai-agent';
import receiptsRoutes from './routes/receipts';
import pollsRoutes from './routes/polls';
import reelsRoutes from './routes/reels';
import avatarRoutes from './routes/avatar';
import bitmojiRoutes from './routes/bitmoji';
import memoriesRoutes from './routes/memories';
import spotlightRoutes from './routes/spotlight';
import storiesRoutes from './routes/stories';
import notificationsRoutes from './routes/notifications';
import usersRoutes from './routes/users';
import settingsRoutes from './routes/settings';
import themesRoutes from './routes/themes';
import ephemeralRoutes from './routes/ephemeral';
import gamesRoutes from './routes/games';
import channelsRoutes from './routes/channels';
import discoverRoutes from './routes/discover';
import voiceNoteRoutes from './routes/voice-notes';
import mapRoutes from './routes/map';
import meetingsRoutes from './routes/meetings';
import audioRoomsRoutes from './routes/audio-rooms';
import voiceBotRoutes, { createVoiceBotServices } from './routes/voice-bot';
import { ProactiveCallWorker } from './services/proactive-call-worker.service';
import { websocketRoutes } from './routes/websocket';
import { createE2EERelay } from './services/e2ee-relay-factory';
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
import { OtpService, Msg91SmsSender } from './lib/otp-service';
import { SessionTokenIssuer } from './lib/session-tokens';
import { createAccountStatusGate } from './lib/account-status';

export function getConfig(): AppConfig {
  const env = (process.env['NODE_ENV'] as AppConfig['env']) ?? 'development';

  if (env === 'production' && !process.env['JWT_SECRET']) {
    throw new Error('JWT_SECRET environment variable is required in production');
  }

  if (
    (env === 'production' || (env as string) === 'staging') &&
    !process.env['VOICE_BOT_SECRET'] &&
    !process.env['LIVEKIT_API_SECRET']
  ) {
    throw new Error(
      'VOICE_BOT_SECRET or LIVEKIT_API_SECRET environment variable is required in production and staging',
    );
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
    // Scoped to quantchat so QuantChat-minted tokens cannot bypass QuantMail 2FA on sibling backends (W32-3)
    jwtAudience: process.env['JWT_AUDIENCE'] ?? 'quantchat',
    env,
    publicPaths: [
      '/auth/login',
      '/auth/refresh',
      '/auth/otp/request',
      '/auth/otp/verify',
      '/auth/sso/exchange',
      '/meetings/webhooks/livekit',
      '/voice-bot/alert',
      // QC-F-197: /ws/chat ka ekmatra auth gate backend/routes/websocket.ts ka
      // ConnectionAuth hai (single iss/aud + QC-F-030 kind gate + QC-F-037
      // membership) — browser WebSocket Authorization header laga NAHI sakta,
      // isiliye shipped client token ko Sec-WebSocket-Protocol se bhejta hai,
      // jo global hook padhta hi NAHI aur har subprotocol-only upgrade ko
      // handler se pehle 401 se kaat deta tha. Exemption EXACT path + GET
      // only hai: isi plugin ki /ws/presence hook par hi nirbhar hai (uske
      // paas handler-level auth NAHI hai), isiliye '/ws' ya '/ws/*' KABHI
      // NAHI — sirf ye ek route, sirf GET.
      { path: '/ws/chat', methods: ['GET'], exact: true },
    ],
  };
}

export async function buildApp(config?: AppConfig) {
  const appConfig = config ?? getConfig();

  // QC-F-041: account-status gate. The gate's resolver is handed to
  // createApp() as part of the config, but it reads through the prisma
  // decoration that createApp() itself installs — so the gate is built
  // around a provider that only dereferences the app once it exists
  // (the resolver runs at request time, never during boot).
  let appRef: Awaited<ReturnType<typeof createApp>> | undefined;
  const accountStatusGate = createAccountStatusGate(
    () => (appRef as unknown as { prisma?: PrismaClient } | undefined)?.prisma,
  );

  // Enablement: an explicit config.accountStatus always wins (route/unit
  // tests inject their own resolver). Otherwise the prisma-backed gate is
  // on for every real deployment (development / staging / production) and
  // off in env 'test', whose harness runs without a database — a gate
  // there could only ever answer 'unavailable' and 503 the whole suite;
  // the gate's own behaviour is pinned by its dedicated suites instead.
  const effectiveConfig: AppConfig = {
    ...appConfig,
    accountStatus:
      appConfig.accountStatus ??
      (appConfig.env === 'test' ? undefined : accountStatusGate.resolver),
  };

  const app = await createApp(effectiveConfig);
  appRef = app;
  // Shared with routes/websocket.ts (verifier) and routes/settings.ts
  // (DELETE /account invalidates its own user's cached verdict).
  app.decorate('accountStatusGate', accountStatusGate);

  app.decorate(
    'otpService',
    new OtpService(new Msg91SmsSender((message) => app.log.info(message))),
  );
  app.decorate(
    'sessionTokens',
    new SessionTokenIssuer({
      jwtSecret: appConfig.jwtSecret,
      jwtIssuer: appConfig.jwtIssuer,
      jwtAudience: appConfig.jwtAudience,
    }),
  );
  await app.register(authRoutes, { prefix: '/auth' });

  const realtime = createRealtimeContext({
    error: (object, message) => app.log.error(object as object, message),
    warn: (message) => app.log.warn(message),
    info: (message) => app.log.info(message),
  });
  app.decorate('realtimeBackplane', realtime.backplane);
  app.decorate('presence', realtime.presence);

  await app.register(websocketRoutes, { prefix: '/ws' });
  await app.register(messagesRoutes, { prefix: '/conversations' });
  await app.register(conversationsRoutes, { prefix: '/conversations' });
  await app.register(searchRoutes, { prefix: '/search' });
  await app.register(themesRoutes, { prefix: '/conversations' });
  await app.register(ephemeralRoutes, { prefix: '/conversations' });
  await app.register(encryptionRoutes, { prefix: '/encryption' });
  await app.register(mediaRoutes, { prefix: '/media' });
  await app.register(callsRoutes, { prefix: '/calls' });
  await app.register(voiceBotRoutes, { prefix: '/voice-bot' });
  await app.register(aiRoutes, { prefix: '/ai' });
  await app.register(meetingsRoutes, { prefix: '/meetings' });
  await app.register(receiptsRoutes, { prefix: '/receipts' });
  await app.register(pollsRoutes, { prefix: '/polls' });

  const voiceBotServices = createVoiceBotServices(app);
  // QC-F-076: without LiveKit configuration the factory builds no ring
  // generator, so the proactive caller stays off instead of holding a
  // dependency that could only mint tokens with a fallback secret.
  const proactiveRingGenerator = voiceBotServices.ringGenerator;
  const proactiveCallWorker = proactiveRingGenerator
    ? new ProactiveCallWorker({
        redisUrl: appConfig.redisUrl,
        ringGenerator: proactiveRingGenerator,
        onError: (err) => app.log.error({ err }, 'proactive call worker error'),
      })
    : null;
  if (!proactiveCallWorker) {
    app.log.warn('Proactive voice-bot calls disabled: LiveKit is not configured');
  }
  if (proactiveCallWorker && appConfig.env !== 'test') {
    proactiveCallWorker.start();
  }
  app.addHook('onClose', async () => {
    await proactiveCallWorker?.stop();
  });

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
  await app.register(bitmojiRoutes, { prefix: '/bitmoji' });
  await app.register(gamesRoutes, { prefix: '/games' });
  await app.register(channelsRoutes, { prefix: '/channels' });
  await app.register(voiceNoteRoutes, { prefix: '/voice-notes' });
  await app.register(memoriesRoutes, { prefix: '/memories' });
  await app.register(spotlightRoutes, { prefix: '/spotlight' });
  await app.register(discoverRoutes, { prefix: '/discover' });
  await app.register(storiesRoutes, { prefix: '/stories' });
  await app.register(mapRoutes, { prefix: '/map' });
  await app.register(notificationsRoutes, { prefix: '/notifications' });
  await app.register(usersRoutes, { prefix: '/users' });
  await app.register(settingsRoutes, { prefix: '/settings' });
  await app.register(audioRoomsRoutes, { prefix: '/audio-rooms' });
  await app.register(audioRoomsRoutes, { prefix: '/api/audio-rooms' });

  // K27: durable zero-knowledge relay by default (E2EE_RELAY=memory only for
  // local dev/tests). Published bundles + relayed ciphertext survive restarts.
  const e2eeRelay = createE2EERelay(
    (app as unknown as { prisma: PrismaClient }).prisma,
  );
  app.decorate('e2ee', e2eeRelay);
  app.addHook('onClose', async () => {
    await e2eeRelay.shutdown();
  });
  await app.register(e2eeRoutes, { prefix: '/e2ee' });
  await app.register(e2eePreKeyRoutes, { prefix: '/e2ee' });
  await app.register(prekeysRoutes);

  app.decorate('federation', createFederationService());
  await app.register(federationRoutes, { prefix: '/federation' });

  app.decorate('arLenses', createArLensesService());
  await app.register(arLensesRoutes, { prefix: '/ar-lenses' });

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
  if (appConfig.env !== 'test') {
    deliveryWorker.start();
  }

  app.addHook('onClose', async () => {
    deliveryWorker.stop();
    await realtime.backplane.shutdown();
    if (realtime.redis) {
      realtime.redis.disconnect();
    }
  });

  return app;
}
