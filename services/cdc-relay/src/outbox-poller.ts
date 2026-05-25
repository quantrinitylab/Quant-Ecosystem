import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import type { KafkaProducerClient } from './kafka-producer.js';

const logger = pino({ name: 'outbox-poller' });

interface OutboxEvent {
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
  }): Promise<OutboxEvent[]>;
  updateMany(args: {
    where: { id: { in: string[] } };
    data: { publishedAt: Date };
  }): Promise<{ count: number }>;
}

interface TransactionClient {
  outboxEvent: OutboxEventRepository;
}

export class OutboxPoller {
  private readonly producer: KafkaProducerClient;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly prisma: PrismaClient;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(producer: KafkaProducerClient, pollIntervalMs = 1000, batchSize = 100) {
    this.producer = producer;
    this.pollIntervalMs = pollIntervalMs;
    this.batchSize = batchSize;
    this.prisma = new PrismaClient({
      datasourceUrl: process.env['DATABASE_URL'],
    });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info(
      { pollIntervalMs: this.pollIntervalMs, batchSize: this.batchSize },
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

  async pollOnce(): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx: TransactionClient) => {
        const events = await tx.outboxEvent.findMany({
          where: { publishedAt: null },
          orderBy: { createdAt: 'asc' },
          take: this.batchSize,
        });

        if (events.length === 0) return;

        for (const event of events) {
          const topic = `outbox.${event.aggregateType}`;
          await this.producer.send(topic, [
            {
              key: event.aggregateId,
              value: JSON.stringify(event.payload),
            },
          ]);
        }

        const eventIds = events.map((event) => event.id);
        await tx.outboxEvent.updateMany({
          where: { id: { in: eventIds } },
          data: { publishedAt: new Date() },
        });

        logger.info({ count: events.length }, 'Published outbox events');
      });
    } catch (error) {
      logger.error({ error }, 'Error polling outbox');
    }
  }
}
