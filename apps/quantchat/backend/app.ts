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
import voiceNoteRoutes from './routes/voice-notes';
import mapRoutes from './routes/map';
import meetingsRoutes from './routes/meetings';
import voiceBotRoutes, { createVoiceBotServices } from './routes/voice-bot';
import { ProactiveCallWorker } from './services/proactive-call-worker.service';
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
    jwtAudience: process.env['JWT_AUDIENCE'] ?? 'quant-ecosystem',
    env,
    publicPaths: [
      '/auth/otp/request',
      '/auth/otp/verify',
      '/meetings/webhooks/livekit',
      '/voice-bot/alert',
    ],
  };
}

export async function buildApp(config?: AppConfig) {
  const appConfig = config ?? getConfig();
  const app = await createApp(appConfig);

  app.decorate(
    'otpService',
    new OtpService(new LoggingSmsSender((message) => app.log.info(message))),
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

  const voiceBotServices = createVoiceBotServices(app);
  const proactiveCallWorker = new ProactiveCallWorker({
    redisUrl: appConfig.redisUrl,
    ringGenerator: voiceBotServices.ringGenerator,
    onError: (err) => app.log.error({ err }, 'proactive call worker error'),
  });
  if (appConfig.env !== 'test') {
    proactiveCallWorker.start();
  }
  app.addHook('onClose', async () => {
    await proactiveCallWorker.stop();
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
  await app.register(gamesRoutes, { prefix: '/games' });
  await app.register(channelsRoutes, { prefix: '/channels' });
  await app.register(voiceNoteRoutes, { prefix: '/voice-notes' });
  await app.register(memoriesRoutes, { prefix: '/memories' });
  await app.register(spotlightRoutes, { prefix: '/spotlight' });
  await app.register(mapRoutes, { prefix: '/map' });
  await app.register(notificationsRoutes, { prefix: '/notifications' });

  const e2eeRelay = new InMemoryE2EERelay();
  app.decorate('e2ee', e2eeRelay);
  app.addHook('onClose', async () => {
    e2eeRelay.shutdown();
  });
  await app.register(e2eeRoutes, { prefix: '/e2ee' });
  await app.register(e2eePreKeyRoutes, { prefix: '/e2ee' });

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
