import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { AppConfig } from './types';
import errorHandler from './plugins/error-handler';
import healthPlugin from './plugins/health';
import authPlugin from './plugins/auth';
import prismaPlugin from './plugins/prisma';
import metricsPlugin from './plugins/metrics';
import requestIdPlugin from './plugins/request-id';
import requestLoggerPlugin from './plugins/request-logger';
import gracefulShutdownPlugin from './plugins/graceful-shutdown';
import observabilityPlugin from './plugins/observability';
import performancePlugin from './plugins/performance';
import errorMonitoringPlugin from './plugins/error-monitoring';
import featureFlagsPlugin from './plugins/feature-flags';
import auditPlugin from './plugins/audit';
import organizationsPlugin from './plugins/organizations';
import notificationsPlugin from './plugins/notifications';
import identityPermissionsPlugin from './plugins/identity-permissions';
import teamsPlugin from './plugins/teams';
import rateLimitPlugin from '@fastify/rate-limit';

export async function createApp(config: AppConfig) {
  // Production security validation
  if (config.env === 'production') {
    if (!config.jwtSecret || config.jwtSecret.length < 32) {
      throw new Error(
        '[FATAL] jwtSecret must be at least 32 characters in production. Set a strong secret.',
      );
    }
  }

  const fastify = Fastify({
    logger:
      config.env === 'test'
        ? false
        : {
            level: config.logLevel,
            ...(config.env === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
          },
    genReqId: () => randomUUID(),
    disableRequestLogging: config.env === 'test',
  });

  // Set Zod as the schema validator/serializer
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  // Register helmet for security headers
  const helmet = await import('@fastify/helmet');
  await fastify.register(helmet.default, { global: true });

  // Register CORS
  const cors = await import('@fastify/cors');
  await fastify.register(cors.default, {
    origin: config.corsOrigins,
    credentials: true,
  });

  // Register rate limiting with Redis or in-memory fallback
  const rateLimitOpts: Record<string, unknown> = {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
  };

  let redisClient: import('ioredis').Redis | undefined;

  if (config.redisUrl) {
    try {
      const { default: Redis } = await import('ioredis');
      redisClient = new Redis(config.redisUrl);
      rateLimitOpts['redis'] = redisClient;
    } catch {
      // Fall back to in-memory if Redis connection fails
    }
  }

  await fastify.register(rateLimitPlugin, rateLimitOpts);

  // Register cookie support
  const cookie = await import('@fastify/cookie');
  await fastify.register(cookie.default);

  // Register error handler
  await fastify.register(errorHandler);

  // Register request-id propagation
  await fastify.register(requestIdPlugin);

  // Register request logger (after error handler so errors are logged)
  await fastify.register(requestLoggerPlugin);

  // Register metrics collection
  await fastify.register(metricsPlugin);

  // Register Prisma client
  await fastify.register(prismaPlugin);

  // Register auth plugin
  await fastify.register(authPlugin, {
    jwtSecret: config.jwtSecret,
    jwtIssuer: config.jwtIssuer,
    jwtAudience: config.jwtAudience,
  });

  // Register cross-cutting engine plugins (Category A — wired once, inherited by
  // every app via createApp()). Registered AFTER prisma + auth so each plugin's
  // construction/runtime can rely on `fastify.prisma` and `request.auth`.
  // - observability: import-gated behind OTEL_EXPORTER_OTLP_ENDPOINT (no-op when unset)
  // - performance: request timing + opt-in per-route SLO budget hook (no-op when
  //   no budget is defined); decorates `fastify.performance`
  // - feature-flags: decorates `fastify.flags`
  // - audit: decorates `fastify.audit`, reads `request.auth` in onResponse
  // - organizations: decorates `fastify.org` + org-context middleware
  // - notifications: decorates `fastify.notifications` (PreferenceService +
  //   NotificationFanout + CrossAppDispatcher); depends on `prisma`
  // - error-monitoring: captures/forwards errors via an `onError` hook,
  //   correlated by `x-request-id`; decorates `fastify.errorMonitoring`. Depends
  //   on `error-handler` (which owns the envelope) + `request-id` (correlation),
  //   both registered above — the envelope/status are left untouched.
  await fastify.register(observabilityPlugin);
  await fastify.register(performancePlugin);
  await fastify.register(errorMonitoringPlugin);
  await fastify.register(featureFlagsPlugin);
  await fastify.register(auditPlugin);
  await fastify.register(organizationsPlugin);
  await fastify.register(notificationsPlugin);

  // Register the RBAC auth substrate (Category A — cross-cutting). Registered
  // AFTER `auth` (declares `dependencies: ['auth']`) so `requireAuth({ scopes })`
  // scope evaluation is backed by `@quant/identity-permissions`, and BEFORE any
  // per-app route that declares fine-grained scopes (Requirement 4.3). `teams`
  // depends on `identity-permissions` and provides multi-actor team context.
  await fastify.register(identityPermissionsPlugin);
  await fastify.register(teamsPlugin);

  // Public paths that bypass auth
  const PUBLIC_PATHS = [
    '/health',
    '/healthz',
    '/ready',
    '/readyz',
    '/live',
    '/livez',
    '/metrics',
    // Caller-supplied pre-authentication endpoints (e.g. login / OTP).
    ...(config.publicPaths ?? []),
  ];

  // Enforce auth on all routes except health/metrics
  fastify.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'))) {
      return;
    }
    await fastify.requireAuth()(request, reply);
    if (reply.sent) return;
  });

  // Register health endpoints
  await fastify.register(healthPlugin, {
    redisClient,
  });

  // Register graceful shutdown
  await fastify.register(gracefulShutdownPlugin, { timeoutMs: 30000 });

  return fastify;
}

// Security: CodeQL #170: @fastify/rate-limit registered globally (static import).
