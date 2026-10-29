import { createApp } from '@quant/server-core';
import type { AppConfig } from '@quant/server-core';
import projectsRoutes from './routes/projects';
import layersRoutes from './routes/layers';
import aiRoutes from './routes/ai';
import assetsRoutes from './routes/assets';
import exportsRoutes from './routes/exports';
import templatesRoutes from './routes/templates';
import effectsRoutes from './routes/effects';
import brandKitsRoutes from './routes/brand-kits';
import collaborationRoutes from './routes/collaboration';
import craftRoutes from './routes/craft';
import photoRoutes from './routes/photo';
import autoEditRoutes from './routes/auto-edit';
import toolsRoutes from './routes/tools';
import jobsRoutes from './routes/jobs';

export function getConfig(): AppConfig {
  const env = (process.env['NODE_ENV'] as AppConfig['env']) ?? 'development';

  if (env === 'production' && !process.env['JWT_SECRET']) {
    throw new Error('JWT_SECRET environment variable is required in production');
  }

  return {
    port: Number(process.env['PORT'] ?? 3013),
    host: process.env['HOST'] ?? '0.0.0.0',
    logLevel: process.env['LOG_LEVEL'] ?? 'info',
    corsOrigins: (process.env['CORS_ORIGINS'] ?? 'http://localhost:3000').split(','),
    rateLimitMax: Number(process.env['RATE_LIMIT_MAX'] ?? 100),
    rateLimitWindow: process.env['RATE_LIMIT_WINDOW'] ?? '1 minute',
    redisUrl: process.env['REDIS_URL'],
    jwtSecret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
    jwtIssuer: process.env['JWT_ISSUER'] ?? 'quantedits',
    jwtAudience: process.env['JWT_AUDIENCE'] ?? 'quant-ecosystem',
    publicPaths: [
      { path: '/templates', methods: ['GET'], exact: true },
      { path: '/templates/:id', methods: ['GET'], exact: true },
      { path: '/effects', methods: ['GET'], exact: true },
      { path: '/effects/categories', methods: ['GET'], exact: true },
      { path: '/effects/:id', methods: ['GET'], exact: true },
      // NOTE (P0-2): GET /assets is intentionally NOT public — it lists the
      // caller's asset library. (The stale whitelist entry predated the
      // route existing at all.) Per-project listing below stays as it was.
      { path: '/assets/project/:projectId', methods: ['GET'], exact: true },
    ],
    env,
  };
}

export async function buildApp(config?: AppConfig) {
  const appConfig = config ?? getConfig();
  const app = await createApp(appConfig);

  await app.register(projectsRoutes, { prefix: '/projects' });
  await app.register(layersRoutes, { prefix: '/projects' });
  await app.register(aiRoutes, { prefix: '/ai' });
  // Previously-implemented but unregistered routes (their Next proxies were dead):
  await app.register(assetsRoutes, { prefix: '/assets' });
  await app.register(exportsRoutes, { prefix: '/export' });
  await app.register(templatesRoutes, { prefix: '/templates' });
  await app.register(effectsRoutes, { prefix: '/effects' });
  await app.register(brandKitsRoutes, { prefix: '/brand-kits' });
  await app.register(autoEditRoutes, { prefix: '/auto-edit' });
  await app.register(collaborationRoutes, { prefix: '/collaboration' });
  await app.register(craftRoutes, { prefix: '/craft' });
  await app.register(photoRoutes, { prefix: '/photo' });
  // CP-1 control plane: the QuantAI tool registry + unified job reads.
  await app.register(toolsRoutes, { prefix: '/tools' });
  await app.register(jobsRoutes, { prefix: '/jobs' });

  return app;
}
