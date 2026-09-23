import { createApp } from '@quant/server-core';
import type { AppConfig } from '@quant/server-core';
import postsRoutes from './routes/posts';
import feedRoutes from './routes/feed';
import communitiesRoutes from './routes/communities';
import aiRoutes from './routes/ai';
import anonymousRoutes from './routes/anonymous';
import authRoutes from './routes/auth';
import interactionsRoutes from './routes/interactions';
import followRoutes from './routes/follow';
import notificationsRoutes from './routes/notifications';

export function getConfig(): AppConfig {
  const env = (process.env['NODE_ENV'] as AppConfig['env']) ?? 'development';

  if (env === 'production' && !process.env['JWT_SECRET']) {
    throw new Error('JWT_SECRET environment variable is required in production');
  }

  return {
    port: Number(process.env['PORT'] ?? 3004),
    host: process.env['HOST'] ?? '0.0.0.0',
    logLevel: process.env['LOG_LEVEL'] ?? 'info',
    corsOrigins: (process.env['CORS_ORIGINS'] ?? 'http://localhost:3000').split(','),
    rateLimitMax: Number(process.env['RATE_LIMIT_MAX'] ?? 100),
    rateLimitWindow: process.env['RATE_LIMIT_WINDOW'] ?? '1 minute',
    redisUrl: process.env['REDIS_URL'],
    jwtSecret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
    jwtIssuer: process.env['JWT_ISSUER'] ?? 'quantsync',
    jwtAudience: process.env['JWT_AUDIENCE'] ?? 'quant-ecosystem',
    // SSO login and public feed discovery bypass the global auth hook so guests can explore
    publicPaths: [
      { path: '/auth/sso/login', exact: true },
      { path: '/feed', methods: ['GET'], exact: true },
      { path: '/feed/trending', methods: ['GET'], exact: true },
      { path: '/explore', methods: ['GET'], exact: true },
      { path: '/trending', methods: ['GET'], exact: true },
      { path: '/posts/:id', methods: ['GET'], exact: true },
    ],
    env,
  };
}

export async function buildApp(config?: AppConfig) {
  const appConfig = config ?? getConfig();
  const app = await createApp(appConfig);

  await app.register(postsRoutes, { prefix: '/posts' });
  await app.register(feedRoutes, { prefix: '/feed' });
  await app.register(communitiesRoutes, { prefix: '/communities' });
  await app.register(aiRoutes, { prefix: '/ai' });
  await app.register(anonymousRoutes, { prefix: '/anonymous' });
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(interactionsRoutes, { prefix: '/interactions' });
  await app.register(followRoutes, { prefix: '/follow' });
  await app.register(notificationsRoutes, { prefix: '/notifications' });

  // Public explore and trending endpoints
  app.get('/trending', async (request, reply) => {
    const prisma = (app as any).prisma;
    const { FeedService } = await import('./services/feed.service');
    const feedService = new FeedService(prisma);
    const limit = Number((request.query as any)?.limit ?? (request.query as any)?.pageSize ?? 20);
    const posts = await feedService.getTrendingPosts(limit);
    return reply.send(posts);
  });

  app.get('/explore', async (request, reply) => {
    const prisma = (app as any).prisma;
    const { FeedService } = await import('./services/feed.service');
    const feedService = new FeedService(prisma);
    const page = Number((request.query as any)?.page ?? 1);
    const pageSize = Number((request.query as any)?.pageSize ?? 20);
    const posts = await feedService.getFeed('', page, pageSize);
    return reply.send(posts);
  });

  return app;
}

// Dev-only self-start: `pnpm dev:backend` runs this file directly
// (backend/app.ts). In production the entry is backend/server.ts, which imports
// buildApp and calls listen itself. esbuild bundles app.ts INTO server.mjs, so
// the previous `import.meta.url.endsWith(process.argv[1])` guard evaluated TRUE
// in the bundle (both resolve to server.mjs) and made the process listen twice
// -> EADDRINUSE crash-loop. Gating on the entry basename being app.(ts|js|mjs)
// keeps the dev path working while staying inert inside the bundle.
const entry = process.argv[1] ?? '';
if (/[/\\]app\.(ts|js|mjs)$/.test(entry)) {
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
