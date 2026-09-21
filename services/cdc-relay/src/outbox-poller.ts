import { Pool, type PoolClient } from 'pg';
import pino from 'pino';
import type { EventTransport, OutboxRecord } from './transport.js';

const logger = pino({ name: 'outbox-poller' });

/**
 * Minimal surface this poller needs from a Postgres pool, so tests can supply a
 * double without a database.
 */
export interface QueryablePool {
  connect(): Promise<PoolClient>;
  end(): Promise<void>;
}

interface OutboxRow {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
}

// Column names are quoted because Prisma created them in camelCase
// (see the outbox_events migration); unquoted identifiers would fold to
// lowercase and the query would fail on `aggregatetype`.
const CLAIM_SQL = `
  SELECT "id", "aggregateType", "aggregateId", "eventType", "payload", "createdAt"
  FROM "outbox_events"
  WHERE "publishedAt" IS NULL
  ORDER BY "createdAt" ASC
  LIMIT $1
  FOR UPDATE SKIP LOCKED
`;

const MARK_SQL = `
  UPDATE "outbox_events"
  SET "publishedAt" = NOW()
  WHERE "id" = ANY($1::text[])
`;

/**
 * Drains `outbox_events` and hands each batch to a transport.
 *
 * Deliberately raw SQL over `pg` rather than Prisma. The relay touches exactly
 * one table with two statements, and pulling in the ORM meant pulling in a
 * generated client and a native query engine — which is what kept this service
 * from booting at all: pnpm resolved TWO `@prisma/client` store variants (one for
 * `@quant/database`, one for this package, differing only by the `prisma` peer),
 * `prisma generate` populated one, and the relay resolved the other. A pure-JS
 * driver has no generate step and no variant to get wrong.
 *
 * `FOR UPDATE SKIP LOCKED` is the other reason: it makes claiming row-level, so a
 * second replica skips rows a first replica already holds instead of
 * double-publishing them. That is what the Prisma version could not do, and why
 * it had to be pinned to one replica.
 *
 * Ordering is load-bearing: rows are claimed, published, and only then marked,
 * all in one transaction. If `publish` throws, the transaction rolls back and the
 * rows are retried. Delivery is therefore at-least-once, never at-most-once, so
 * consumers must deduplicate on `eventId` — which is why the envelope carries it.
 */
export class OutboxPoller {
  private readonly transport: EventTransport;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly pool: QueryablePool;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;
  /** Guards against overlapping ticks when a batch outlives the interval. */
  private inFlight = false;

  constructor(
    transport: EventTransport,
    pollIntervalMs = 1000,
    batchSize = 100,
    pool?: QueryablePool,
  ) {
    this.transport = transport;
    this.pollIntervalMs = pollIntervalMs;
    this.batchSize = batchSize;
    this.pool = pool ?? new Pool({ connectionString: process.env['DATABASE_URL'] });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info(
      {
        pollIntervalMs: this.pollIntervalMs,
        batchSize: this.batchSize,
        transport: this.transport.name,
      },
      'Outbox poller started',
    );
    this.intervalHandle = setInterval(() => {
      void this.pollOnce();
    }, this.pollIntervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    logger.info('Outbox poller stopped');
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
    logger.info('Postgres pool closed');
  }

  async pollOnce(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      await client.query('BEGIN');
      try {
        const claimed = await client.query<OutboxRow>(CLAIM_SQL, [this.batchSize]);
        const rows = claimed.rows;
        if (rows.length === 0) {
          await client.query('COMMIT');
          return;
        }

        const records: OutboxRecord[] = rows.map((row) => ({
          eventId: row.id,
          aggregateType: row.aggregateType,
          aggregateId: row.aggregateId,
          eventType: row.eventType,
          payload: row.payload,
          occurredAt: row.createdAt,
        }));

        // Publish before marking, inside the transaction: a throw here rolls the
        // mark back so the batch is retried rather than lost.
        await this.transport.publish(records);

        await client.query(MARK_SQL, [rows.map((row) => row.id)]);
        await client.query('COMMIT');

        logger.info(
          { count: rows.length, transport: this.transport.name },
          'Published outbox events',
        );
      } catch (inner) {
        await client.query('ROLLBACK');
        throw inner;
      }
    } catch (error) {
      logger.error({ error }, 'Error polling outbox');
    } finally {
      client?.release();
      this.inFlight = false;
    }
  }
}
