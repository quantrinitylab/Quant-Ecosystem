import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.fn().mockResolvedValue(undefined);
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockDisconnect = vi.fn().mockResolvedValue(undefined);

const mockFindMany = vi.fn();
const mockUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
const mockTransaction = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    $transaction: mockTransaction,
    outboxEvent: {
      findMany: mockFindMany,
      updateMany: mockUpdateMany,
    },
  })),
}));

vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

import { OutboxPoller } from '../src/outbox-poller.js';
import type { KafkaProducerClient } from '../src/kafka-producer.js';

describe('OutboxPoller', () => {
  let poller: OutboxPoller;
  let mockProducer: KafkaProducerClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProducer = {
      connect: mockConnect,
      disconnect: mockDisconnect,
      send: mockSend,
      sendBatch: vi.fn(),
    } as unknown as KafkaProducerClient;

    poller = new OutboxPoller(mockProducer, 1000, 50);
  });

  it('should poll for unpublished events and publish them', async () => {
    const mockEvents = [
      {
        id: 'evt-1',
        aggregateType: 'user',
        aggregateId: 'user-123',
        eventType: 'UserCreated',
        payload: { name: 'John' },
        createdAt: new Date(),
        publishedAt: null,
      },
      {
        id: 'evt-2',
        aggregateType: 'order',
        aggregateId: 'order-456',
        eventType: 'OrderPlaced',
        payload: { total: 99.99 },
        createdAt: new Date(),
        publishedAt: null,
      },
    ];

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        outboxEvent: {
          findMany: vi.fn().mockResolvedValue(mockEvents),
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      };
      await fn(tx);
    });

    await poller.pollOnce();

    expect(mockProducer.sendBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        {
          topic: 'outbox.user',
          messages: [{ key: 'user-123', value: JSON.stringify({ name: 'John' }) }],
        },
        {
          topic: 'outbox.order',
          messages: [{ key: 'order-456', value: JSON.stringify({ total: 99.99 }) }],
        },
      ]),
    );
  });

  it('should do nothing when no unpublished events exist', async () => {
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        outboxEvent: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn(),
        },
      };
      await fn(tx);
    });

    await poller.pollOnce();

    expect(mockSend).not.toHaveBeenCalled();
    expect(mockProducer.sendBatch).not.toHaveBeenCalled();
  });

  it('should mark events as published after sending', async () => {
    const mockEvents = [
      {
        id: 'evt-3',
        aggregateType: 'payment',
        aggregateId: 'pay-789',
        eventType: 'PaymentReceived',
        payload: { amount: 50 },
        createdAt: new Date(),
        publishedAt: null,
      },
    ];

    const mockUpdateManyTx = vi.fn().mockResolvedValue({ count: 1 });

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        outboxEvent: {
          findMany: vi.fn().mockResolvedValue(mockEvents),
          updateMany: mockUpdateManyTx,
        },
      };
      await fn(tx);
    });

    await poller.pollOnce();

    expect(mockProducer.sendBatch).toHaveBeenCalledWith([
      {
        topic: 'outbox.payment',
        messages: [{ key: 'pay-789', value: JSON.stringify({ amount: 50 }) }],
      },
    ]);
    expect(mockUpdateManyTx).toHaveBeenCalledWith({
      where: { id: { in: ['evt-3'] } },
      data: { publishedAt: expect.any(Date) },
    });
  });

  it('should start and stop the polling loop', () => {
    poller.start();
    poller.stop();
    // No errors means success
  });

  it('should not start twice', () => {
    poller.start();
    poller.start(); // second call should be no-op
    poller.stop();
  });
});
