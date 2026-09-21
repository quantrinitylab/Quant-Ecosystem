import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

import { OutboxPoller, buildPoolConfig, type QueryablePool } from '../src/outbox-poller.js';
import type { EventTransport, OutboxRecord } from '../src/transport.js';

describe('buildPoolConfig', () => {
  it('enables TLS even with no CA, because RDS rejects unencrypted connections', () => {
    // Regression: `pg` connects in the clear by default (Prisma does not), so the
    // first working build was rejected with SQLSTATE 28000 once per second — which
    // looks like bad credentials and is actually "no encryption".
    const cfg = buildPoolConfig({ DATABASE_URL: 'postgresql://u:p@h:5432/d' });
    expect(cfg.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('verifies the server when a CA is supplied', () => {
    const cfg = buildPoolConfig({
      DATABASE_URL: 'postgresql://u:p@h:5432/d',
      DATABASE_CA_CERT: '---CA---',
    });
    expect(cfg.ssl).toEqual({ ca: '---CA---', rejectUnauthorized: true });
  });

  it('passes the connection string through', () => {
    expect(buildPoolConfig({ DATABASE_URL: 'postgresql://u:p@h:5432/d' }).connectionString).toBe(
      'postgresql://u:p@h:5432/d',
    );
  });
});

interface Row {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
}

const ROWS: Row[] = [
  {
    id: 'evt-1',
    aggregateType: 'User',
    aggregateId: 'user-123',
    eventType: 'User.created',
    payload: { name: 'John' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  },
  {
    id: 'evt-2',
    aggregateType: 'User',
    aggregateId: 'user-123',
    eventType: 'User.deleted',
    payload: { reason: 'gdpr' },
    createdAt: new Date('2026-01-01T00:00:01.000Z'),
  },
];

/**
 * A pool double that records every statement in order, so transaction shape
 * (BEGIN / claim / mark / COMMIT vs ROLLBACK) can be asserted.
 */
function poolDouble(rows: Row[], sharedLog?: string[]) {
  const log = sharedLog ?? [];
  const release = vi.fn();
  const query = vi.fn().mockImplementation((sql: string) => {
    const text = String(sql).trim();
    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
      log.push(text);
      return Promise.resolve({ rows: [] });
    }
    if (text.startsWith('SELECT')) {
      log.push('claim');
      return Promise.resolve({ rows });
    }
    if (text.startsWith('UPDATE')) {
      log.push('mark');
      return Promise.resolve({ rows: [] });
    }
    log.push('other');
    return Promise.resolve({ rows: [] });
  });
  const pool: QueryablePool = {
    connect: vi.fn().mockResolvedValue({ query, release } as never),
    end: vi.fn().mockResolvedValue(undefined),
  };
  return { pool, query, release, log };
}

function fakeTransport(log?: string[]): EventTransport & { published: OutboxRecord[][] } {
  const published: OutboxRecord[][] = [];
  return {
    name: 'fake',
    published,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockImplementation((records: OutboxRecord[]) => {
      log?.push('publish');
      published.push(records);
      return Promise.resolve();
    }),
  };
}

describe('OutboxPoller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('claims, publishes, marks, then commits — in that order', async () => {
    const log: string[] = [];
    const transport = fakeTransport(log);
    const { pool, release } = poolDouble(ROWS, log);

    await new OutboxPoller(transport, 1000, 50, pool).pollOnce();

    // Publishing must precede the mark, or a transport failure would lose the batch.
    expect(log).toEqual(['BEGIN', 'claim', 'publish', 'mark', 'COMMIT']);
    expect(transport.published[0]).toHaveLength(2);
    expect(release).toHaveBeenCalled();
  });

  it('claims with FOR UPDATE SKIP LOCKED so replicas cannot double-publish', async () => {
    const transport = fakeTransport();
    const { pool, query } = poolDouble(ROWS);

    await new OutboxPoller(transport, 1000, 50, pool).pollOnce();

    const claim = query.mock.calls.map((c) => String(c[0])).find((s) => s.includes('SELECT'));
    expect(claim).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(claim).toMatch(/"publishedAt" IS NULL/);
    // Prisma created camelCase columns, so identifiers must stay quoted.
    expect(claim).toMatch(/"aggregateType"/);
  });

  it('carries eventType and eventId, which the previous relay dropped', async () => {
    // Regression: the old relay published bare JSON.stringify(payload) into a
    // topic named only after the aggregate type, so these two rows were
    // indistinguishable to any consumer.
    const transport = fakeTransport();
    const { pool } = poolDouble(ROWS);

    await new OutboxPoller(transport, 1000, 50, pool).pollOnce();

    const batch = transport.published[0]!;
    expect(batch.map((r) => r.eventType)).toEqual(['User.created', 'User.deleted']);
    expect(batch.map((r) => r.eventId)).toEqual(['evt-1', 'evt-2']);
    expect(batch[0]!.occurredAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('rolls back and does not mark when the transport throws', async () => {
    const log: string[] = [];
    const transport = fakeTransport(log);
    (transport.publish as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('broker down'));
    const { pool } = poolDouble(ROWS, log);

    // pollOnce swallows the error (it is a background loop) but must not mark.
    await expect(
      new OutboxPoller(transport, 1000, 50, pool).pollOnce(),
    ).resolves.toBeUndefined();

    expect(log).toContain('ROLLBACK');
    expect(log).not.toContain('mark');
    expect(log).not.toContain('COMMIT');
  });

  it('commits without publishing when there is nothing to claim', async () => {
    const log: string[] = [];
    const transport = fakeTransport(log);
    const { pool } = poolDouble([], log);

    await new OutboxPoller(transport, 1000, 50, pool).pollOnce();

    expect(transport.publish).not.toHaveBeenCalled();
    expect(log).toEqual(['BEGIN', 'claim', 'COMMIT']);
  });

  it('releases the connection even when the batch fails', async () => {
    const transport = fakeTransport();
    (transport.publish as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'));
    const { pool, release } = poolDouble(ROWS);

    await new OutboxPoller(transport, 1000, 50, pool).pollOnce();

    // A leaked client per failed tick would exhaust the pool within minutes.
    expect(release).toHaveBeenCalled();
  });

  it('skips an overlapping tick instead of claiming twice', async () => {
    const transport = fakeTransport();
    let unblock!: () => void;
    // `publish` is reached only after connect/BEGIN/claim have awaited, so the
    // test must wait for it to actually be entered before releasing it —
    // unblocking eagerly leaves the gate unset and the first tick never settles.
    let publishEntered!: () => void;
    const entered = new Promise<void>((resolve) => { publishEntered = resolve; });
    (transport.publish as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          unblock = resolve;
          publishEntered();
        }),
    );
    const { pool } = poolDouble(ROWS);

    const poller = new OutboxPoller(transport, 1000, 50, pool);
    const first = poller.pollOnce();
    await entered;
    await poller.pollOnce(); // must return immediately, mid-flight
    unblock();
    await first;

    expect(transport.publish).toHaveBeenCalledTimes(1);
    expect(pool.connect).toHaveBeenCalledTimes(1);
  });
});
