import { createApp } from '@quant/server-core';
import type { AppConfig } from '@quant/server-core';
import messagesRoutes from './routes/messages';
import conversationsRoutes from './routes/conversations';
import encryptionRoutes from './routes/encryption';
import mediaRoutes from './routes/media';
import callsRoutes from './routes/calls';
import aiRoutes from './routes/ai';
import { websocketRoutes } from './routes/websocket';

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
  };
}

export async function buildApp(config?: AppConfig) {
  const appConfig = config ?? getConfig();
  const app = await createApp(appConfig);

  // WebSocket real-time routes
  await app.register(websocketRoutes, { prefix: '/ws' });

  await app.register(messagesRoutes, { prefix: '/conversations' });
  await app.register(conversationsRoutes, { prefix: '/conversations' });
  await app.register(encryptionRoutes, { prefix: '/encryption' });
  await app.register(mediaRoutes, { prefix: '/media' });
  await app.register(callsRoutes, { prefix: '/calls' });
  await app.register(aiRoutes, { prefix: '/ai' });

  return app;
}
