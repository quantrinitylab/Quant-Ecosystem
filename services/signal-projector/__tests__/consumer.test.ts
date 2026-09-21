import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

import { SignalConsumer, parseEntry } from '../src/consumer.js';
import type { SignalStore } from '../src/consumer.js';
import { projectEvent, type InterestSignal } from '../src/projection.js';

/** Redis stores stream fields as a flat [k,v,k,v] array. */
function fields(over: Record<string, string> = {}): string[] {
  const base: Record<string, string> = {
    eventId: 'evt-1',
    eventType: 'Video.liked',
    aggregateId: 'vid-1',
    occurredAt: '2026-01-01T00:00:00.000Z',
    payload: JSON.stringify({ userId: 'user-1', creatorId: 'creator-9', category: 'music' }),
    ...over,
  };
  return Object.entries(base).flat();
}

function redisDouble(batches: unknown[]) {
  const xack = vi.fn().mockResolvedValue(1);
  const xautoclaim = vi.fn().mockResolvedValue(['0-0', []]);
  const xpending = vi.fn().mockResolvedValue([]);
  const xadd = vi.fn().mockResolvedValue('1-0');
  const queue = [...batches];
  return {
    xreadgroup: vi.fn().mockImplementation(() => Promise.resolve(queue.shift() ?? null)),
    xautoclaim,
    xpending,
    xadd,
    xack,
    xgroup: vi.fn().mockResolvedValue('OK'),
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
}

function storeDouble(): SignalStore & { saved: InterestSignal[] } {
  const saved: InterestSignal[] = [];
  return {
    saved,
    save: vi.fn().mockImplementation((s: InterestSignal) => {
      saved.push(s);
      return Promise.resolve(true);
    }),
  };
}

const OPTS = { redisUrl: 'redis://x:6379', streams: ['outbox.Video'] };

describe('SignalConsumer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('folds a delivered event and acknowledges it', async () => {
    const redis = redisDouble([[['outbox.Video', [['1-0', fields()]]]]]);
    const store = storeDouble();

    const result = await new SignalConsumer(store, OPTS, redis as never).readOnce();

    expect(result).toEqual({ read: 1, saved: 1, skipped: 0 });
    expect(store.saved[0]!.userId).toBe('user-1');
    expect(redis.xack).toHaveBeenCalledWith('outbox.Video', 'signal-projector', '1-0');
  });

  it('acknowledges an event it cannot project, so it cannot loop forever', async () => {
    // An unrecognised event left unacked would sit in the pending list and be
    // redelivered on every claim — one unknown event would stall the group.
    const redis = redisDouble([
      [['outbox.Video', [['1-0', fields({ eventType: 'Video.transcoded' })]]]],
    ]);
    const store = storeDouble();

    const result = await new SignalConsumer(store, OPTS, redis as never).readOnce();

    expect(result).toEqual({ read: 1, saved: 0, skipped: 1 });
    expect(store.save).not.toHaveBeenCalled();
    expect(redis.xack).toHaveBeenCalledWith('outbox.Video', 'signal-projector', '1-0');
  });

  it('acknowledges a malformed entry too', async () => {
    const redis = redisDouble([[['outbox.Video', [['1-0', ['eventId', 'evt-1']]]]]]);
    const store = storeDouble();

    const result = await new SignalConsumer(store, OPTS, redis as never).readOnce();

    expect(result.skipped).toBe(1);
    expect(redis.xack).toHaveBeenCalled();
  });

  it('does NOT acknowledge a failed write, so redelivery retries it', async () => {
    // Safe because the store is idempotent on eventId: replaying the entry cannot
    // double-count the signal.
    const redis = redisDouble([[['outbox.Video', [['1-0', fields()]]]]]);
    const store = storeDouble();
    (store.save as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));

    const result = await new SignalConsumer(store, OPTS, redis as never).readOnce();

    expect(result).toEqual({ read: 1, saved: 0, skipped: 0 });
    expect(redis.xack).not.toHaveBeenCalled();
  });

  it('reports nothing read when the block window expires empty', async () => {
    const redis = redisDouble([null]);
    expect(await new SignalConsumer(storeDouble(), OPTS, redis as never).readOnce()).toEqual({
      read: 0,
      saved: 0,
      skipped: 0,
    });
  });

  it('counts a duplicate as read but not saved', async () => {
    // The store returns false when ON CONFLICT DO NOTHING matched an already
    // folded event.
    const redis = redisDouble([[['outbox.Video', [['1-0', fields()]]]]]);
    const store = storeDouble();
    (store.save as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const result = await new SignalConsumer(store, OPTS, redis as never).readOnce();

    expect(result).toEqual({ read: 1, saved: 0, skipped: 0 });
    expect(redis.xack).toHaveBeenCalled();
  });

  describe('claimPending and DLQ', () => {
    it('claims pending unacked entries and processes them', async () => {
      const redis = redisDouble([]);
      redis.xautoclaim.mockResolvedValue(['0-0', [['1-0', fields()]]]);
      redis.xpending.mockResolvedValue([['1-0', 'consumer-1', 15000, 2]]);
      const store = storeDouble();

      const consumer = new SignalConsumer(store, OPTS, redis as never);
      const result = await consumer.claimPending('outbox.Video');

      expect(result).toEqual({ claimed: 1, saved: 1, dlq: 0 });
      expect(redis.xautoclaim).toHaveBeenCalledWith(
        'outbox.Video',
        'signal-projector',
        expect.any(String),
        10000,
        '0-0',
        'COUNT',
        100,
      );
      expect(redis.xack).toHaveBeenCalledWith('outbox.Video', 'signal-projector', '1-0');
      expect(consumer.getMetrics().dlqCount).toBe(0);
    });

    it('routes an entry to DLQ when delivery count exceeds maxDeliveries', async () => {
      const redis = redisDouble([]);
      redis.xautoclaim.mockResolvedValue(['0-0', [['1-0', fields()]]]);
      redis.xpending.mockResolvedValue([['1-0', 'consumer-1', 50000, 6]]);
      const store = storeDouble();

      const consumer = new SignalConsumer(store, { ...OPTS, maxDeliveries: 5 }, redis as never);
      const result = await consumer.claimPending('outbox.Video');

      expect(result).toEqual({ claimed: 1, saved: 0, dlq: 1 });
      expect(redis.xadd).toHaveBeenCalledWith(
        'outbox.Video.DLQ',
        '*',
        ...fields(),
        'dlqReason',
        'MAX_DELIVERIES_EXCEEDED',
        'dlqOriginalStream',
        'outbox.Video',
        'dlqOriginalEntryId',
        '1-0',
      );
      expect(redis.xack).toHaveBeenCalledWith('outbox.Video', 'signal-projector', '1-0');
      expect(store.save).not.toHaveBeenCalled();
      expect(consumer.getMetrics().dlqCount).toBe(1);
    });

    it('tracks write failure metrics on save error during claim', async () => {
      const redis = redisDouble([]);
      redis.xautoclaim.mockResolvedValue(['0-0', [['1-0', fields()]]]);
      redis.xpending.mockResolvedValue([['1-0', 'consumer-1', 15000, 2]]);
      const store = storeDouble();
      (store.save as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db error'));

      const consumer = new SignalConsumer(store, OPTS, redis as never);
      const result = await consumer.claimPending('outbox.Video');

      expect(result).toEqual({ claimed: 1, saved: 0, dlq: 0 });
      expect(redis.xack).not.toHaveBeenCalled();
      expect(consumer.getMetrics().writeFailures).toBe(1);
    });
  });

  describe('connect', () => {
    it('creates the group with MKSTREAM so it can start before any producer fires', async () => {
      const redis = redisDouble([]);
      await new SignalConsumer(storeDouble(), OPTS, redis as never).connect();
      expect(redis.xgroup).toHaveBeenCalledWith(
        'CREATE',
        'outbox.Video',
        'signal-projector',
        '0',
        'MKSTREAM',
      );
    });

    it('treats BUSYGROUP as success, since a previous run created the group', async () => {
      const redis = redisDouble([]);
      redis.xgroup.mockRejectedValue(new Error('BUSYGROUP Consumer Group name already exists'));
      await expect(
        new SignalConsumer(storeDouble(), OPTS, redis as never).connect(),
      ).resolves.toBeUndefined();
    });

    it('propagates any other group error', async () => {
      const redis = redisDouble([]);
      redis.xgroup.mockRejectedValue(new Error('NOAUTH'));
      await expect(
        new SignalConsumer(storeDouble(), OPTS, redis as never).connect(),
      ).rejects.toThrow('NOAUTH');
    });
  });
});

describe('parseEntry', () => {
  it('parses the envelope cdc-relay writes', () => {
    const parsed = parseEntry(fields());
    expect(parsed?.eventType).toBe('Video.liked');
    expect(parsed?.payload['userId']).toBe('user-1');
  });

  it('returns null when a required envelope field is missing', () => {
    for (const missing of ['eventId', 'eventType', 'aggregateId', 'occurredAt']) {
      const f = fields();
      const idx = f.indexOf(missing);
      f[idx + 1] = '';
      expect(parseEntry(f), `missing ${missing} must not parse`).toBeNull();
    }
  });

  it('returns null on unparseable payload JSON rather than throwing', () => {
    expect(parseEntry(fields({ payload: '{not json' }))).toBeNull();
  });

  it('treats a non-object payload as empty, leaving the rejection to projection', () => {
    // Deliberate split of responsibility: parseEntry validates the ENVELOPE, and
    // an array is a valid JSON document, so it parses. Whether the CONTENT is
    // usable is projectEvent's judgement, and it will skip this for having no
    // actor. Rejecting here as well would put the same rule in two places.
    const parsed = parseEntry(fields({ payload: '[1,2]' }));
    expect(parsed?.payload).toEqual({});
    expect(projectEvent(parsed!)).toBeNull();
  });

  it('tolerates an absent payload', () => {
    const f = Object.entries({
      eventId: 'e',
      eventType: 'Video.liked',
      aggregateId: 'a',
      occurredAt: '2026-01-01T00:00:00.000Z',
    }).flat();
    expect(parseEntry(f)?.payload).toEqual({});
  });
});
