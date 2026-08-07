import type { PrismaClient } from '@quant/database';
import { z } from 'zod';

export const OutboxEventPayloadSchema = z.record(z.string(), z.unknown());

export type OutboxEventPayload = z.infer<typeof OutboxEventPayloadSchema>;

export interface OutboxEventRecord {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
  publishedAt: Date | null;
}

type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export class OutboxPublisher {
  async publish(
    tx: TransactionClient,
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: OutboxEventPayload,
  ): Promise<OutboxEventRecord> {
    const validatedPayload = OutboxEventPayloadSchema.parse(payload);

    const event = await (
      tx as unknown as { outboxEvent: { create: (args: unknown) => Promise<OutboxEventRecord> } }
    ).outboxEvent.create({
      data: {
        aggregateType,
        aggregateId,
        eventType,
        payload: validatedPayload,
      },
    });

    return event;
  }

  async markPublished(client: PrismaClient, eventIds: string[]): Promise<void> {
    await (
      client as unknown as { outboxEvent: { updateMany: (args: unknown) => Promise<unknown> } }
    ).outboxEvent.updateMany({
      where: { id: { in: eventIds } },
      data: { publishedAt: new Date() },
    });
  }

  async getPending(client: PrismaClient, limit: number): Promise<OutboxEventRecord[]> {
    const events = await (
      client as unknown as {
        outboxEvent: { findMany: (args: unknown) => Promise<OutboxEventRecord[]> };
      }
    ).outboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return events;
  }
}

export function createOutboxPublisher(): OutboxPublisher {
  return new OutboxPublisher();
}
