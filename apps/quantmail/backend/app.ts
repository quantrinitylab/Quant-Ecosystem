import { createApp } from '@quant/server-core';
import type { AppConfig } from '@quant/server-core';
import emailsRoutes from './routes/emails';
import threadsRoutes from './routes/threads';
import foldersRoutes from './routes/folders';
import contactsRoutes from './routes/contacts';
import aiRoutes from './routes/ai';

export function getConfig(): AppConfig {
  const env = (process.env['NODE_ENV'] as AppConfig['env']) ?? 'development';

  if (env === 'production' && !process.env['JWT_SECRET']) {
    throw new Error('JWT_SECRET environment variable is required in production');
  }

  return {
    port: Number(process.env['PORT'] ?? 3010),
    host: process.env['HOST'] ?? '0.0.0.0',
    logLevel: process.env['LOG_LEVEL'] ?? 'info',
    corsOrigins: (process.env['CORS_ORIGINS'] ?? 'http://localhost:3000').split(','),
    rateLimitMax: Number(process.env['RATE_LIMIT_MAX'] ?? 100),
    rateLimitWindow: process.env['RATE_LIMIT_WINDOW'] ?? '1 minute',
    redisUrl: process.env['REDIS_URL'],
    jwtSecret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
    jwtIssuer: process.env['JWT_ISSUER'] ?? 'quantmail',
    jwtAudience: process.env['JWT_AUDIENCE'] ?? 'quant-ecosystem',
    env,
  };
}

export async function buildApp(config?: AppConfig) {
  const appConfig = config ?? getConfig();
  const app = await createApp(appConfig);

  await app.register(emailsRoutes, { prefix: '/emails' });
  await app.register(threadsRoutes, { prefix: '/threads' });
  await app.register(foldersRoutes, { prefix: '/folders' });
  await app.register(contactsRoutes, { prefix: '/contacts' });
  await app.register(aiRoutes, { prefix: '/emails' });

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
