import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockTransaction = vi.fn();

vi.mock('@quant/database', () => ({
  PrismaClient: vi.fn().mockImplementation(function () {
    return {
      $transaction: mockTransaction,
      $disconnect: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

import { OutboxPoller } from '../src/outbox-poller.js';
import type { EventTransport, OutboxRecord } from '../src/transport.js';

interface Row {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
  publishedAt: Date | null;
}

const ROWS: Row[] = [
  {
    id: 'evt-1',
    aggregateType: 'User',
    aggregateId: 'user-123',
    eventType: 'User.created',
    payload: { name: 'John' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    publishedAt: null,
  },
  {
    id: 'evt-2',
    aggregateType: 'User',
    aggregateId: 'user-123',
    eventType: 'User.deleted',
    payload: { reason: 'gdpr' },
    createdAt: new Date('2026-01-01T00:00:01.000Z'),
    publishedAt: null,
  },
];

/** Records the order of operations so "publish before mark" can be asserted. */
function harness(rows: Row[], transport: EventTransport) {
  const calls: string[] = [];
  const updateMany = vi.fn().mockImplementation(() => {
    calls.push('markPublished');
    return Promise.resolve({ count: rows.length });
  });
  const findMany = vi.fn().mockImplementation(() => {
    calls.push('read');
    return Promise.resolve(rows);
  });
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
    await fn({ outboxEvent: { findMany, updateMany } });
  });
  return { calls, findMany, updateMany, transport };
}

function fakeTransport(): EventTransport & { published: OutboxRecord[][]; calls: string[] } {
  const published: OutboxRecord[][] = [];
  const calls: string[] = [];
  return {
    name: 'fake',
    published,
    calls,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockImplementation((records: OutboxRecord[]) => {
      calls.push('publish');
      published.push(records);
      return Promise.resolve();
    }),
  };
}

describe('OutboxPoller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes unpublished rows and then marks them published', async () => {
    const transport = fakeTransport();
    const h = harness(ROWS, transport);
    // Share one call log so relative order is observable.
    (transport.publish as ReturnType<typeof vi.fn>).mockImplementation((records: OutboxRecord[]) => {
      h.calls.push('publish');
      transport.published.push(records);
      return Promise.resolve();
    });

    await new OutboxPoller(transport, 1000, 50).pollOnce();

    expect(transport.published).toHaveLength(1);
    expect(transport.published[0]).toHaveLength(2);
    // Publish must precede the mark, or a transport failure would lose the batch.
    expect(h.calls).toEqual(['read', 'publish', 'markPublished']);
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['evt-1', 'evt-2'] } },
      data: { publishedAt: expect.any(Date) },
    });
  });

  it('carries eventType and eventId, which the previous relay dropped', async () => {
    // Regression: the old poller published bare `JSON.stringify(event.payload)`
    // into a topic named only after the aggregate type, so these two rows were
    // indistinguishable to any consumer.
    const transport = fakeTransport();
    harness(ROWS, transport);

    await new OutboxPoller(transport, 1000, 50).pollOnce();

    const batch = transport.published[0]!;
    expect(batch.map((r) => r.eventType)).toEqual(['User.created', 'User.deleted']);
    expect(batch.map((r) => r.eventId)).toEqual(['evt-1', 'evt-2']);
    expect(batch[0]!.occurredAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('does NOT mark rows published when the transport throws', async () => {
    const transport = fakeTransport();
    (transport.publish as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('broker down'));
    const h = harness(ROWS, transport);

    // pollOnce swallows the error (it is a background loop) but must not mark.
    await expect(new OutboxPoller(transport, 1000, 50).pollOnce()).resolves.toBeUndefined();

    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing when there is nothing to publish', async () => {
    const transport = fakeTransport();
    const h = harness([], transport);

    await new OutboxPoller(transport, 1000, 50).pollOnce();

    expect(transport.publish).not.toHaveBeenCalled();
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it('skips an overlapping tick instead of publishing the same rows twice', async () => {
    // A batch slower than the poll interval used to be overtaken by the next
    // tick, which read the same still-unpublished rows.
    const transport = fakeTransport();
    let release: (() => void) | undefined;
    (transport.publish as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );
    harness(ROWS, transport);

    const poller = new OutboxPoller(transport, 1000, 50);
    const first = poller.pollOnce();
    await poller.pollOnce(); // must return immediately, not read again
    release?.();
    await first;

    expect(transport.publish).toHaveBeenCalledTimes(1);
  });
});
