import { createApp } from '@quant/server-core';
import type { AppConfig } from '@quant/server-core';
import matchingRoutes from './routes/matching';
import matchesRoutes from './routes/matches';
import profilesRoutes from './routes/profiles';
import swipesRoutes from './routes/swipes';
import randomChatRoutes from './routes/random-chat';
import aiRoutes from './routes/ai';
import feedRoutes from './routes/feed';
import paymentsRoutes, { paymentsWebhookRoutes, createPaymentsService } from './routes/payments';
import commerceRoutes, { createCommerceService } from './routes/commerce';
import economyRoutes, { createEconomyService } from './routes/economy';
import videosRoutes from './routes/videos';
import safetyRoutes from './routes/safety';
import videochatRoutes from './routes/videochat';
import liveRoutes from './routes/live';
import { createFeedEngines } from './lib/feed-engines';

export function getConfig(): AppConfig {
  const env = (process.env['NODE_ENV'] as AppConfig['env']) ?? 'development';

  if (env === 'production' && !process.env['JWT_SECRET']) {
    throw new Error('JWT_SECRET environment variable is required in production');
  }

  return {
    port: Number(process.env['PORT'] ?? 3008),
    host: process.env['HOST'] ?? '0.0.0.0',
    logLevel: process.env['LOG_LEVEL'] ?? 'info',
    corsOrigins: (process.env['CORS_ORIGINS'] ?? 'http://localhost:3000').split(','),
    rateLimitMax: Number(process.env['RATE_LIMIT_MAX'] ?? 100),
    rateLimitWindow: process.env['RATE_LIMIT_WINDOW'] ?? '1 minute',
    redisUrl: process.env['REDIS_URL'],
    jwtSecret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
    jwtIssuer: process.env['JWT_ISSUER'] ?? 'quantmax',
    jwtAudience: process.env['JWT_AUDIENCE'] ?? 'quant-ecosystem',
    env,
  };
}

export async function buildApp(config?: AppConfig) {
  const appConfig = config ?? getConfig();
  const app = await createApp(appConfig);

  await app.register(matchingRoutes, { prefix: '/matching' });
  // Real mutual-match management (list + unmatch). DISTINCT from `/matching`
  // above, which returns swipe candidates rather than actual Match rows.
  await app.register(matchesRoutes, { prefix: '/matches' });
  await app.register(profilesRoutes, { prefix: '/profiles' });
  await app.register(swipesRoutes, { prefix: '/swipes' });
  await app.register(randomChatRoutes, { prefix: '/random-chat' });
  await app.register(aiRoutes, { prefix: '/ai' });
  await app.register(videosRoutes, { prefix: '/videos' });
  await app.register(safetyRoutes, { prefix: '/safety' });
  await app.register(videochatRoutes, { prefix: '/videochat' });
  await app.register(liveRoutes, { prefix: '/live' });

  // ==========================================================================
  // Task 14.2 — quantmax feed/recommendation engine wiring (per-app lane,
  // Stage 6). Composes the FIVE real, as-shipped feed engines
  // (recommendations → ranking → ml-pipeline → ml-runtime → triton-client)
  // honouring their dependsOn ordering (see lib/feed-engines.ts). Several wrap
  // @simulated/external inference cores; per Req 9.1 they are wired AS-IS and
  // NOT de-simulated. Decorated once at boot as a singleton; routes under
  // `/feed` sit behind the global auth hook from createApp(), with `feed:write`
  // scopes on mutating routes. The `/feed` prefix does not collide with the
  // server-core PUBLIC_PATHS allowlist nor with quantmax's pre-existing mock
  // `/feed/for-you|trending|engagement` frontend proxy paths.
  // ==========================================================================
  app.decorate('feed', createFeedEngines());
  await app.register(feedRoutes, { prefix: '/feed' });

  // ==========================================================================
  // Task 14.4 — payments + paid commerce/economy engine wiring (per-app lane,
  // Stage 5/6). Wires `@quant/payments` into quantmax REUSING the completed
  // quantube payments seam EXACTLY (env-sourced Stripe secrets — NEVER
  // hardcoded; TEST MODE acceptable per design Open Question 3, so the gateway
  // constructs without a live key; scoped `payments:write`/`payments:read`
  // routes; signature-verifying webhook in a SEPARATE raw-body plugin —
  // Req 7.6). Then wires the two payments-dependent commerce engines that target
  // quantmax — `@quant/quant-commerce` and `@quant/quant-economy` (both
  // `dependsOn @quant/payments`) — DECORATED AFTER payments so the dependsOn
  // ordering is honoured by decoration order (Req 3.2). Each engine is wired
  // AS-SHIPPED (Req 9.1), decorated once at boot as a singleton; all routes sit
  // behind the global auth hook from createApp() with fine-grained scopes on
  // mutating routes. None of `/payments`, `/commerce`, `/economy` collide with
  // the server-core PUBLIC_PATHS allowlist nor with each other or the existing
  // `/feed` prefix.
  // ==========================================================================

  // payments — the real Stripe gateway, env-sourced secrets, decorated FIRST so
  // the commerce/economy engines (dependsOn payments) build on the money rail.
  app.decorate('payments', createPaymentsService());
  await app.register(paymentsRoutes, { prefix: '/payments' });
  // Webhook isolated: its raw-body content-type parser must NOT leak into the
  // JSON payment routes above (sibling encapsulated scope).
  await app.register(paymentsWebhookRoutes, { prefix: '/payments' });

  // quant-commerce — travel/shopping aggregators + order/price-alert tracking.
  // dependsOn @quant/payments (decorated above).
  app.decorate('commerce', createCommerceService());
  await app.register(commerceRoutes, { prefix: '/commerce' });

  // quant-economy — coin wallet/store/subscriptions/gifting. dependsOn
  // @quant/payments (decorated above).
  app.decorate('economy', createEconomyService());
  await app.register(economyRoutes, { prefix: '/economy' });

  return app;
}
