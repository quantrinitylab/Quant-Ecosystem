import pino from 'pino';
import { startHealthServer } from '@quant/health-server';
import { KafkaEventTransport } from './kafka-transport.js';
import { RedisStreamsTransport } from './redis-transport.js';
import { OutboxPoller } from './outbox-poller.js';
import type { EventTransport } from './transport.js';

const logger = pino({ name: 'cdc-relay' });

/**
 * Pick the transport from the environment.
 *
 * Default is Redis Streams, deliberately: staging runs Redis and runs no Kafka,
 * and this service previously could not start at all there — it connected to a
 * hardcoded `localhost:9092` and died. Defaulting to the broker that actually
 * exists is what lets the event spine run. Set `EVENT_TRANSPORT=kafka` (with
 * `KAFKA_BROKERS`) for environments that have a cluster.
 */
function selectTransport(): EventTransport {
  const kind = (process.env['EVENT_TRANSPORT'] ?? 'redis').toLowerCase();

  if (kind === 'kafka') {
    const brokers = (process.env['KAFKA_BROKERS'] ?? '').split(',').filter(Boolean);
    if (brokers.length === 0) {
      // Fail loudly rather than silently connecting to localhost and looking
      // healthy while publishing nowhere.
      throw new Error('EVENT_TRANSPORT=kafka requires KAFKA_BROKERS');
    }
    return new KafkaEventTransport({
      brokers,
      clientId: process.env['KAFKA_CLIENT_ID'] ?? 'cdc-relay',
    });
  }

  if (kind !== 'redis') {
    throw new Error(`Unsupported EVENT_TRANSPORT '${kind}' (expected 'redis' or 'kafka')`);
  }

  const url = process.env['REDIS_URL'];
  if (!url) {
    throw new Error('EVENT_TRANSPORT=redis requires REDIS_URL');
  }
  const maxLen = process.env['STREAM_MAX_LEN'];
  return new RedisStreamsTransport({
    url,
    maxLen: maxLen ? Number(maxLen) : undefined,
  });
}

async function main(): Promise<void> {
  const transport = selectTransport();
  await transport.connect();

  const pollIntervalMs = Number(process.env['POLL_INTERVAL_MS'] ?? '1000');
  const batchSize = Number(process.env['BATCH_SIZE'] ?? '100');

  const poller = new OutboxPoller(transport, pollIntervalMs, batchSize);
  poller.start();

  logger.info({ transport: transport.name }, 'CDC Relay service started');

  const healthPort = Number(process.env['HEALTH_PORT'] ?? '3024');
  await startHealthServer(healthPort);
  logger.info({ healthPort }, 'Health server started');

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutting down CDC Relay...');
    poller.stop();
    await poller.disconnect();
    await transport.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void main().catch((err) => {
  logger.error({ err }, 'CDC Relay failed to start');
  process.exit(1);
});
