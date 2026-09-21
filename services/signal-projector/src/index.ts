// ============================================================================
// @quant/signal-projector — folds spine events into cross-app interest signals
// ============================================================================
//
// The read side of the event spine. `services/cdc-relay` drains `outbox_events`
// onto per-aggregate Redis Streams; this service reads those streams and writes
// the events that say something about a person's interests into
// `user_interest_signals`, where any app's feed or recommender can query them.
//
// Until this ran, the spine had a producer and a carrier and no consumer, so
// events were published and then nothing happened to them.
import pino from 'pino';
import { startHealthServer } from '@quant/health-server';
import { SignalConsumer } from './consumer.js';
import { PostgresSignalStore } from './store.js';
import { knownEventTypes } from './projection.js';

const logger = pino({ name: 'signal-projector' });

async function main(): Promise<void> {
  const redisUrl = process.env['REDIS_URL'];
  if (!redisUrl) throw new Error('REDIS_URL is required');
  if (!process.env['DATABASE_URL']) throw new Error('DATABASE_URL is required');

  // Which streams to follow. Defaults to the one aggregate that currently emits;
  // extending it is a config change, not a code change.
  const streams = (process.env['SIGNAL_STREAMS'] ?? 'outbox.Video')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const store = new PostgresSignalStore();
  const consumer = new SignalConsumer(store, {
    redisUrl,
    streams,
    group: process.env['SIGNAL_GROUP'] ?? 'signal-projector',
    batchSize: Number(process.env['BATCH_SIZE'] ?? '100'),
    blockMs: Number(process.env['BLOCK_MS'] ?? '5000'),
  });

  await consumer.connect();

  const healthPort = Number(process.env['HEALTH_PORT'] ?? '3025');
  await startHealthServer(healthPort);
  logger.info({ streams, healthPort, projects: knownEventTypes() }, 'Signal projector started');

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutting down signal projector...');
    await consumer.disconnect();
    await store.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  await consumer.run();
}

void main().catch((err) => {
  logger.error({ err }, 'Signal projector failed to start');
  process.exit(1);
});
