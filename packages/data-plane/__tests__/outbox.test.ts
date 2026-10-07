import { describe, it, expect, vi } from 'vitest';
import { OutboxPublisher } from '../src/outbox.js';

describe('OutboxPublisher', () => {
  const publisher = new OutboxPublisher();

  function createMockTx() {
    return {
      outboxEvent: {
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'evt-1',
            ...data,
            createdAt: new Date(),
            publishedAt: null,
          }),
        ),
      },
    };
  }

  function createMockClient() {
    return {
      outboxEvent: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'evt-1',
            aggregateType: 'User',
            aggregateId: 'user-1',
            eventType: 'User.created',
            payload: {},
            createdAt: new Date(),
            publishedAt: null,
          },
          {
            id: 'evt-2',
            aggregateType: 'User',
            aggregateId: 'user-2',
            eventType: 'User.created',
            payload: {},
            createdAt: new Date(),
            publishedAt: null,
          },
        ]),
      },
    };
  }

  describe('publish', () => {
    it('should create an outbox event record', async () => {
      const mockTx = createMockTx();

      const result = await publisher.publish(mockTx as never, 'User', 'user-123', 'User.created', {
        email: 'test@example.com',
      });

      expect(result.id).toBe('evt-1');
      expect(result.aggregateType).toBe('User');
      expect(result.aggregateId).toBe('user-123');
      expect(result.eventType).toBe('User.created');
      expect(result.publishedAt).toBeNull();
      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          aggregateType: 'User',
          aggregateId: 'user-123',
          eventType: 'User.created',
          payload: { email: 'test@example.com' },
        },
      });
    });
  });

  describe('markPublished', () => {
    it('should update publishedAt timestamp', async () => {
      const mockClient = createMockClient();
      const eventIds = ['evt-1', 'evt-2'];

      await publisher.markPublished(mockClient as never, eventIds);

      expect(mockClient.outboxEvent.updateMany).toHaveBeenCalledWith({
        where: { id: { in: eventIds } },
        data: { publishedAt: expect.any(Date) },
      });
    });
  });

  describe('getPending', () => {
    it('should return unpublished events ordered by createdAt', async () => {
      const mockClient = createMockClient();

      const results = await publisher.getPending(mockClient as never, 10);

      expect(results).toHaveLength(2);
      expect(mockClient.outboxEvent.findMany).toHaveBeenCalledWith({
        where: { publishedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
    });
  });
});
