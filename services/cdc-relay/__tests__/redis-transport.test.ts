import { beforeEach, describe, expect, it, vi } from 'vitest';

const xadd = vi.fn();
const exec = vi.fn();
const pipeline = vi.fn(() => ({ xadd, exec }));
const connect = vi.fn().mockResolvedValue(undefined);
const quit = vi.fn().mockResolvedValue(undefined);

// `new Redis(...)` must work, so the mock default export has to be constructible.
// An arrow function is not — it throws "is not a constructor".
vi.mock('ioredis', () => ({
  default: class {
    pipeline = pipeline;
    connect = connect;
    quit = quit;
    on = vi.fn();
  },
}));

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

import { RedisStreamsTransport } from '../src/redis-transport.js';
import type { OutboxRecord } from '../src/transport.js';

const RECORD: OutboxRecord = {
  eventId: 'evt-1',
  aggregateType: 'Email',
  aggregateId: 'email-9',
  eventType: 'Email.sent',
  payload: { to: 'a@b.c' },
  occurredAt: new Date('2026-01-02T03:04:05.000Z'),
};

/** Turn the flat XADD varargs into a lookup, so field order is not asserted. */
function fieldsOf(args: unknown[]): Record<string, string> {
  const starAt = args.indexOf('*');
  const out: Record<string, string> = {};
  for (let i = starAt + 1; i < args.length; i += 2) {
    out[String(args[i])] = String(args[i + 1]);
  }
  return out;
}

describe('RedisStreamsTransport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exec.mockResolvedValue([[null, '1-0']]);
  });

  it('appends to a stream named after the aggregate type', async () => {
    await new RedisStreamsTransport({ url: 'redis://x:6379' }).publish([RECORD]);

    expect(xadd).toHaveBeenCalledTimes(1);
    expect(xadd.mock.calls[0]![0]).toBe('outbox.Email');
  });

  it('writes the full envelope, including the eventType the old relay dropped', async () => {
    await new RedisStreamsTransport({ url: 'redis://x:6379' }).publish([RECORD]);

    const fields = fieldsOf(xadd.mock.calls[0]!);
    expect(fields['eventId']).toBe('evt-1');
    expect(fields['eventType']).toBe('Email.sent');
    expect(fields['aggregateId']).toBe('email-9');
    expect(fields['occurredAt']).toBe('2026-01-02T03:04:05.000Z');
    expect(JSON.parse(fields['payload'] as string)).toEqual({ to: 'a@b.c' });
  });

  it('bounds stream growth with an approximate MAXLEN', async () => {
    // Redis has no per-entry TTL, so an unbounded stream eventually eats the
    // instance's memory. `~` keeps the trim O(1) amortised.
    await new RedisStreamsTransport({ url: 'redis://x:6379', maxLen: 42 }).publish([RECORD]);

    const args = xadd.mock.calls[0]!;
    expect(args.slice(1, 4)).toEqual(['MAXLEN', '~', '42']);
  });

  it('throws when a queued command failed, so the batch is retried not lost', async () => {
    exec.mockResolvedValue([[new Error('OOM'), null]]);

    await expect(
      new RedisStreamsTransport({ url: 'redis://x:6379' }).publish([RECORD]),
    ).rejects.toThrow('OOM');
  });

  it('throws when the pipeline returns no result at all', async () => {
    exec.mockResolvedValue(null);

    await expect(
      new RedisStreamsTransport({ url: 'redis://x:6379' }).publish([RECORD]),
    ).rejects.toThrow(/no result/i);
  });

  it('is a no-op for an empty batch', async () => {
    await new RedisStreamsTransport({ url: 'redis://x:6379' }).publish([]);

    expect(pipeline).not.toHaveBeenCalled();
  });
});
