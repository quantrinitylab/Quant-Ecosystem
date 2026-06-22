import { createApp } from '@quant/server-core';
import type { AppConfig } from '@quant/server-core';
import videosRoutes from './routes/videos';
import channelsRoutes from './routes/channels';
import historyRoutes from './routes/history';
import aiRoutes from './routes/ai';
import mediaRoutes, { createMediaService } from './routes/media';
import feedRoutes from './routes/feed';
import crossPublishRoutes, { createCrossPublishService } from './routes/cross-publish';
import creatorRoutes, { createCreatorEconomyService } from './routes/creator';
import playlistRoutes, { createPlaylistService } from './routes/playlists';
import paymentsRoutes, { paymentsWebhookRoutes, createPaymentsService } from './routes/payments';
import payoutRoutes, { createPayoutService } from './routes/payouts';
import musicRoutes from './routes/music';
import { createFeedEngines } from './lib/feed-engines';

export function getConfig(): AppConfig {
  const env = (process.env['NODE_ENV'] as AppConfig['env']) ?? 'development';

  if (env === 'production' && !process.env['JWT_SECRET']) {
    throw new Error('JWT_SECRET environment variable is required in production');
  }

  return {
    port: Number(process.env['PORT'] ?? 3006),
    host: process.env['HOST'] ?? '0.0.0.0',
    logLevel: process.env['LOG_LEVEL'] ?? 'info',
    corsOrigins: (process.env['CORS_ORIGINS'] ?? 'http://localhost:3000').split(','),
    rateLimitMax: Number(process.env['RATE_LIMIT_MAX'] ?? 100),
    rateLimitWindow: process.env['RATE_LIMIT_WINDOW'] ?? '1 minute',
    redisUrl: process.env['REDIS_URL'],
    jwtSecret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
    jwtIssuer: process.env['JWT_ISSUER'] ?? 'quantube',
    jwtAudience: process.env['JWT_AUDIENCE'] ?? 'quant-ecosystem',
    env,
  };
}

export async function buildApp(config?: AppConfig) {
  const appConfig = config ?? getConfig();
  const app = await createApp(appConfig);

  await app.register(videosRoutes, { prefix: '/videos' });
  await app.register(channelsRoutes, { prefix: '/channels' });
  await app.register(historyRoutes, { prefix: '/history' });
  await app.register(aiRoutes, { prefix: '/ai' });
  await app.register(musicRoutes, { prefix: '/music' });

  // playlists engine — quantube Library "Playlists" + "Watch Later" surfaces
  // and the playlist/[id] detail page (quantube-real-data-wiring, Task 3).
  // Decorated once at boot as a singleton (`fastify.playlists`, never
  // per-request). Routes sit behind the global auth hook (401 unauthenticated);
  // mutating routes additionally declare a `library:write` scope. The
  // `/playlists` prefix does NOT collide with any PUBLIC_PATHS entry, so every
  // `/playlists*` route requires authentication.
  app.decorate('playlists', createPlaylistService());
  await app.register(playlistRoutes, { prefix: '/playlists' });

  // ==========================================================================
  // Task 13.1 — quantube video/feed/creator engine wiring (per-app lane).
  // Each engine is wired AS-SHIPPED (Req 9.1); decorated once at boot as a
  // singleton; routes sit behind the global auth hook from createApp() with
  // fine-grained scopes on mutating routes. dependsOn ordering is honoured by
  // DECORATION ORDER below. None of the route prefixes collide with the
  // server-core PUBLIC_PATHS allowlist.
  // ==========================================================================

  // media engine — per-app lane (Stage 4). Decorated FIRST because cross-publish
  // dependsOn @quant/media. `@quant/media` exposes chunked upload + the shared
  // media picker + transcoding, wired as-shipped (in-memory, no new schema).
  app.decorate('media', createMediaService());
  await app.register(mediaRoutes, { prefix: '/media' });

  // feed stack — composes the FIVE real, as-shipped feed engines
  // (recommendations → ranking → ml-pipeline → ml-runtime → triton-client)
  // honouring their dependsOn ordering (see lib/feed-engines.ts). Several wrap
  // @simulated/external inference cores; per Req 9.1 they are wired AS-IS.
  app.decorate('feed', createFeedEngines());
  await app.register(feedRoutes, { prefix: '/feed' });

  // cross-publish engine — dependsOn @quant/media (decorated above). Composes
  // publish-intent + fanout (+ in-memory queue) + content library, as-shipped.
  app.decorate('crossPublish', createCrossPublishService());
  await app.register(crossPublishRoutes, { prefix: '/cross-publish' });

  // creator-economy engine — NON-PAYMENT surfaces only (dashboard, tiers,
  // monetization recording, credits). Its payment-dependent payout routes
  // (dependsOn @quant/payments) are deferred to Task 13.2. Decorated last.
  app.decorate('creatorEconomy', createCreatorEconomyService());
  await app.register(creatorRoutes, { prefix: '/creator' });

  // ==========================================================================
  // Task 13.2 — payments + creator-economy payout (money-movement) wiring.
  // `@quant/payments` (real Stripe gateway) is decorated from env-sourced
  // secrets (NEVER hardcoded; TEST MODE acceptable per design Open Question 3 —
  // the gateway still constructs without a live key). Its scoped routes carry
  // `payments:write`/`payments:read`. The Stripe WEBHOOK is registered as a
  // separate encapsulated plugin with a raw-body parser so it can VERIFY the
  // Stripe signature against the exact bytes (Req 7.6). With payments now wired,
  // the creator-economy PayoutService money-movement routes (request/process/
  // complete) deferred in 13.1 are surfaced (creator-economy dependsOn payments).
  // ==========================================================================
  app.decorate('payments', createPaymentsService());
  await app.register(paymentsRoutes, { prefix: '/payments' });
  // Webhook last + isolated: its raw-body content-type parser must NOT leak into
  // the JSON payment routes above (sibling encapsulated scope).
  await app.register(paymentsWebhookRoutes, { prefix: '/payments' });

  // creator-economy payout money rails (dependsOn @quant/payments, decorated
  // above). Surfaces the request/process/complete flow held back in 13.1.
  app.decorate('payouts', createPayoutService());
  await app.register(payoutRoutes, { prefix: '/payouts' });

  return app;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const config = getConfig();
  buildApp(config).then((app) => {
    app.listen({ port: config.port, host: config.host }, (err) => {
      if (err) {
        app.log.error(err);
        process.exit(1);
      }
    });
  });
}
