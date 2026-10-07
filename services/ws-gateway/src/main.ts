// ============================================================================
// WS Gateway - WebSocket Gateway Service
// ============================================================================

import pino from 'pino';
import { startHealthServer } from '@quant/health-server';
import { WebSocketServer, ConnectionAuth } from '@quant/realtime';

const logger = pino({ name: 'ws-gateway' });

const healthPort = Number(process.env['HEALTH_PORT'] ?? '3040');
const wsPort = Number(process.env['WS_PORT'] ?? '3041');
const jwtSecret = process.env['JWT_SECRET'] ?? '';
const jwtIssuer = process.env['JWT_ISSUER'] ?? 'quant-platform';
const jwtAudience = process.env['JWT_AUDIENCE'] ?? 'quant-realtime';

/**
 * Start the WebSocket gateway.
 *
 * If JWT_SECRET is configured (>= 32 chars), starts a real WebSocket server
 * with JWT auth, presence tracking, and channel management.
 * Otherwise, runs only the health server (development/testing mode).
 */
async function main(): Promise<void> {
  // Always start health server
  await startHealthServer(healthPort);
  logger.info({ port: healthPort }, 'Health server listening');

  // Only start WS server if JWT secret is configured
  if (jwtSecret.length >= 32) {
    const server = new WebSocketServer({
      port: wsPort,
      path: '/ws',
      jwtSecret,
      jwtIssuer,
      jwtAudience,
      maxConnections: Number(process.env['MAX_CONNECTIONS'] ?? '10000'),
      heartbeatIntervalMs: 30000,
      heartbeatTimeoutMs: 60000,
      maxMessageSize: 64 * 1024,
      corsOrigins: (process.env['CORS_ORIGINS'] ?? 'https://*.quant.app').split(','),
    });

    await server.start();
    logger.info({ port: wsPort }, 'WebSocket server listening');

    // Sub-managers available for custom routing
    // presenceManager: tracks user online/away/offline status
    // channelManager: manages pub/sub channels
    // deliveryManager: guarantees message delivery with ack/retry
    void server.getPresenceManager();
    void server.getChannelManager();
    void server.getDeliveryManager();

    // Graceful shutdown
    const shutdown = async (): Promise<void> => {
      logger.info('Shutting down ws-gateway');
      await server.shutdown();
      process.exit(0);
    };

    process.on('SIGTERM', () => void shutdown());
    process.on('SIGINT', () => void shutdown());
  } else {
    logger.warn(
      {
        mode: 'health-only',
        reason: 'JWT_SECRET not configured or too short (minimum 32 characters)',
      },
      'WebSocket server disabled - running in degraded health-only mode',
    );
  }
}

// Verify ConnectionAuth is importable (compile-time check)
void ConnectionAuth;

void main();
