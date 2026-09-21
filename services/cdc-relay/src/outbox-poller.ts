import { PrismaClient } from '@quant/database';
import pino from 'pino';
import type { EventTransport, OutboxRecord } from './transport.js';

const logger = pino({ name: 'outbox-poller' });

interface OutboxEventRow {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
  publishedAt: Date | null;
}

interface OutboxEventRepository {
  findMany(args: {
    where: { publishedAt: null };
    orderBy: { createdAt: 'asc' };
    take: number;
  }): Promise<OutboxEventRow[]>;
  updateMany(args: {
    where: { id: { in: string[] } };
    data: { publishedAt: Date };
  }): Promise<{ count: number }>;
}

interface TransactionClient {
  outboxEvent: OutboxEventRepository;
}

/**
 * Drains `outbox_events` and hands each batch to a transport.
 *
 * Ordering is load-bearing: rows are read, published, and only then marked
 * published, all inside one transaction. If `publish` throws, the transaction
 * rolls back and the same rows are retried next tick. That makes delivery
 * at-least-once, never at-most-once — so consumers must deduplicate on
 * `eventId`, which is why the envelope carries it.
 */
export class OutboxPoller {
  private readonly transport: EventTransport;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly prisma: PrismaClient;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;
  /** Guards against overlapping ticks when a batch takes longer than the interval. */
  private inFlight = false;

  constructor(
    transport: EventTransport,
    pollIntervalMs = 1000,
    batchSize = 100,
    prisma?: PrismaClient,
  ) {
    this.transport = transport;
    this.pollIntervalMs = pollIntervalMs;
    this.batchSize = batchSize;
    this.prisma =
      prisma ??
      new PrismaClient({
        datasourceUrl: process.env['DATABASE_URL'],
      });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info(
      { pollIntervalMs: this.pollIntervalMs, batchSize: this.batchSize, transport: this.transport.name },
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
    await this.prisma.$disconnect();
    logger.info('Prisma client disconnected');
  }

  async pollOnce(): Promise<void> {
    // A slow batch must not be overtaken by the next interval: two ticks reading
    // the same unpublished rows would publish them twice on every cycle.
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      await this.prisma.$transaction(async (tx: TransactionClient) => {
        const rows = await tx.outboxEvent.findMany({
          where: { publishedAt: null },
          orderBy: { createdAt: 'asc' },
          take: this.batchSize,
        });

        if (rows.length === 0) return;

        const records: OutboxRecord[] = rows.map((row) => ({
          eventId: row.id,
          aggregateType: row.aggregateType,
          aggregateId: row.aggregateId,
          eventType: row.eventType,
          payload: row.payload,
          occurredAt: row.createdAt,
        }));

        // Publish BEFORE marking published, inside the transaction. A throw here
        // rolls the mark back, so the batch is retried instead of vanishing.
        await this.transport.publish(records);

        await tx.outboxEvent.updateMany({
          where: { id: { in: rows.map((row) => row.id) } },
          data: { publishedAt: new Date() },
        });

        logger.info({ count: rows.length, transport: this.transport.name }, 'Published outbox events');
      });
    } catch (error) {
      logger.error({ error }, 'Error polling outbox');
    } finally {
      this.inFlight = false;
    }
  }
}
