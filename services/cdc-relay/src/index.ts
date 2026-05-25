import pino from 'pino';
import { KafkaProducerClient } from './kafka-producer.js';
import { OutboxPoller } from './outbox-poller.js';

const logger = pino({ name: 'cdc-relay' });

async function main(): Promise<void> {
  const brokers = (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',');
  const clientId = process.env['KAFKA_CLIENT_ID'] ?? 'cdc-relay';

  const producer = new KafkaProducerClient({ brokers, clientId });
  await producer.connect();

  const pollIntervalMs = Number(process.env['POLL_INTERVAL_MS'] ?? '1000');
  const batchSize = Number(process.env['BATCH_SIZE'] ?? '100');

  const poller = new OutboxPoller(producer, pollIntervalMs, batchSize);
  poller.start();

  logger.info('CDC Relay service started');

  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down CDC Relay...');
    poller.stop();
    await poller.disconnect();
    await producer.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void main();
