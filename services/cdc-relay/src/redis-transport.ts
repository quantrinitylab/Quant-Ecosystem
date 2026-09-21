// ============================================================================
// cdc-relay — Redis Streams transport
// ============================================================================
//
// Streams, deliberately, not pub/sub. Redis pub/sub is fire-and-forget: a
// consumer that is restarting when an event is published never sees it, which
// would make the whole spine lossy and defeat Foundation Law 2 ("history should
// never disappear"). A stream is an append-only log with consumer groups and
// explicit acks, so a consumer can restart and resume, and slow consumers apply
// backpressure instead of losing data.
//
// One stream per aggregate type (`outbox.User`, `outbox.Email`, ...) so a
// consumer subscribes to the slice it needs and events for a given aggregate
// stay in append order.
import Redis from 'ioredis';
import pino from 'pino';
import { streamFor, toEnvelope, type EventTransport, type OutboxRecord } from './transport.js';

const logger = pino({ name: 'redis-transport' });

export interface RedisStreamsTransportOptions {
  url: string;
  /**
   * Cap each stream's length. Redis has no TTL per stream entry, so without a
   * bound the streams grow forever and eventually consume the instance's memory.
   * `XADD MAXLEN ~` trims approximately, which is O(1) amortised, unlike an exact
   * trim. Consumers that fall further behind than this lose events — that is a
   * deliberate, bounded trade, and the number is the retention budget.
   */
  maxLen?: number;
}

const DEFAULT_MAX_LEN = 100_000;

export class RedisStreamsTransport implements EventTransport {
  readonly name = 'redis-streams';
  private readonly client: Redis;
  private readonly maxLen: number;

  constructor(options: RedisStreamsTransportOptions) {
    this.maxLen = options.maxLen ?? DEFAULT_MAX_LEN;
    this.client = new Redis(options.url, {
      // The poller retries on the next tick, so a command that queues forever is
      // worse than one that fails fast and rolls the transaction back.
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    this.client.on('error', (err) => logger.error({ err }, 'Redis transport error'));
  }

  async connect(): Promise<void> {
    await this.client.connect();
    logger.info('Redis Streams transport connected');
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
    logger.info('Redis Streams transport disconnected');
  }

  async publish(records: OutboxRecord[]): Promise<void> {
    if (records.length === 0) return;

    // One pipeline for the batch: a single round trip, and every XADD is sent
    // before any reply is read. Each reply is still checked below, because a
    // pipeline reports per-command errors rather than failing as a unit.
    const pipeline = this.client.pipeline();
    for (const record of records) {
      const envelope = toEnvelope(record);
      pipeline.xadd(
        streamFor(record.aggregateType),
        'MAXLEN',
        '~',
        String(this.maxLen),
        '*',
        'eventId',
        envelope.eventId,
        'eventType',
        envelope.eventType,
        'aggregateId',
        envelope.aggregateId,
        'occurredAt',
        envelope.occurredAt,
        'payload',
        JSON.stringify(envelope.payload),
      );
    }

    const results = await pipeline.exec();
    if (!results) {
      throw new Error('Redis pipeline returned no result; batch not published');
    }

    // Surface the first per-command failure. The poller treats a throw as "do not
    // mark these rows published", so they are retried rather than lost.
    for (const [err] of results) {
      if (err) throw err;
    }

    logger.debug({ count: records.length }, 'Published batch to Redis Streams');
  }
}
