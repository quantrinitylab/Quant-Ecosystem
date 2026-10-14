/**
 * fix/qm-idempotency-mail-routes-r4 — transactional idempotency proofs for the
 * CODEX-REVIEW P0 on merged #1145 ("Mail routes do not call the new
 * transactional idempotency helper").
 *
 * Round 1 built `handleIdempotentTransaction()` (claim + mutation + outcome +
 * outbox in ONE database transaction); round 4 wires it into the mail routes
 * (PUT /emails/:id, POST /emails/:id/archive, POST /emails/:id/restore).
 *
 * These tests prove the helper's contract with an in-memory stand-in for
 * Postgres that models the semantics the fix relies on (same model as
 * idempotency-durable.test.ts):
 *  - claim = INSERT under a primary-key uniqueness constraint (P2002);
 *  - `$transaction` gives snapshot isolation: a concurrent transaction's
 *    INSERT on the same key BLOCKS until the holder commits/aborts;
 *  - commit failure rolls the claim AND the mutation back together.
 *
 * No fake data: the fake models real database concurrency semantics, and the
 * assertions are on observable behavior (work executions, committed rows,
 * HTTP status codes, replayed bodies), not on the fake's internals.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

import idempotencyPlugin, {
  DbIdempotencyStore,
  handleIdempotentTransaction,
  IDEMPOTENT_REPLAYED_HEADER,
  type IdempotencyDatabase,
  type IdempotencyOperationRow,
  type IdempotencyOperationTable,
} from '../idempotency';

// ---------------------------------------------------------------------------
// Prisma-shaped error helpers (codes are stable across Prisma 5/6)
// ---------------------------------------------------------------------------

function prismaError(code: string, message?: string): Error {
  const err = new Error(message ?? `prisma ${code}`);
  (err as { code?: string }).code = code;
  return err;
}

const P2002 = () => prismaError('P2002', 'Unique constraint failed');
const P2025 = () => prismaError('P2025', 'Record not found');

// ---------------------------------------------------------------------------
// In-memory Postgres model (mirrors idempotency-durable.test.ts)
// ---------------------------------------------------------------------------

interface TxState {
  overlay: Map<string, IdempotencyOperationRow>;
  deleted: Set<string>;
  outbox: string[];
  outcome: 'committed' | 'aborted' | null;
  waiters: Array<() => void>;
}

function rowFrom(data: {
  operationId: string;
  fingerprint: string;
  status: string;
  responseStatus?: number | null;
  responseHeaders?: string | null;
  responseBody?: string | null;
  expiresAt: Date;
}): IdempotencyOperationRow {
  return {
    operationId: data.operationId,
    fingerprint: data.fingerprint,
    status: data.status,
    responseStatus: data.responseStatus ?? null,
    responseHeaders: data.responseHeaders ?? null,
    responseBody: data.responseBody ?? null,
    createdAt: new Date(),
    expiresAt: data.expiresAt,
  };
}

class FakeDb implements IdempotencyDatabase {
  committed = new Map<string, IdempotencyOperationRow>();
  committedOutbox: string[] = [];
  openTxs = new Set<TxState>();
  failNextCommit: Error | null = null;

  readonly idempotencyOperation: IdempotencyOperationTable = {
    create: async ({ data }) => {
      if (this.committed.has(data.operationId)) throw P2002();
      this.committed.set(data.operationId, rowFrom(data));
      return {};
    },
    findUnique: async ({ where }) => this.committed.get(where.operationId) ?? null,
    update: async ({ where, data }) => {
      const row = this.committed.get(where.operationId);
      if (!row) throw P2025();
      if (data.status !== undefined) row.status = data.status;
      if (data.fingerprint !== undefined) row.fingerprint = data.fingerprint;
      if (data.responseStatus !== undefined) row.responseStatus = data.responseStatus;
      if (data.responseHeaders !== undefined) row.responseHeaders = data.responseHeaders;
      if (data.responseBody !== undefined) row.responseBody = data.responseBody;
      if (data.expiresAt !== undefined) row.expiresAt = data.expiresAt;
      return {};
    },
    delete: async ({ where }) => {
      this.committed.delete(where.operationId);
      return {};
    },
  };

  async $transaction<T>(
    fn: (tx: { idempotencyOperation: IdempotencyOperationTable; outbox: string[] }) => Promise<T>,
  ): Promise<T> {
    const state: TxState = {
      overlay: new Map(),
      deleted: new Set(),
      outbox: [],
      outcome: null,
      waiters: [],
    };
    this.openTxs.add(state);
    const table: IdempotencyOperationTable = {
      create: async ({ data }) => {
        if (this.committed.has(data.operationId)) throw P2002();
        if (state.overlay.has(data.operationId)) throw P2002();
        for (const other of this.openTxs) {
          if (other === state) continue;
          if (other.overlay.has(data.operationId)) {
            await new Promise<void>((resolve) => other.waiters.push(resolve));
            if (other.outcome === 'committed' || this.committed.has(data.operationId)) {
              throw P2002();
            }
            break;
          }
        }
        if (this.committed.has(data.operationId)) throw P2002();
        state.overlay.set(data.operationId, rowFrom(data));
        return {};
      },
      findUnique: async ({ where }) =>
        state.overlay.get(where.operationId) ?? this.committed.get(where.operationId) ?? null,
      update: async ({ where, data }) => {
        const row = state.overlay.get(where.operationId) ?? this.committed.get(where.operationId);
        if (!row || state.deleted.has(where.operationId)) throw P2025();
        const next: IdempotencyOperationRow = { ...row };
        if (data.status !== undefined) next.status = data.status;
        if (data.fingerprint !== undefined) next.fingerprint = data.fingerprint;
        if (data.responseStatus !== undefined) next.responseStatus = data.responseStatus;
        if (data.responseHeaders !== undefined) next.responseHeaders = data.responseHeaders;
        if (data.responseBody !== undefined) next.responseBody = data.responseBody;
        if (data.expiresAt !== undefined) next.expiresAt = data.expiresAt;
        state.overlay.set(where.operationId, next);
        return {};
      },
      delete: async ({ where }) => {
        state.overlay.delete(where.operationId);
        state.deleted.add(where.operationId);
        return {};
      },
    };
    try {
      const result = await fn({ idempotencyOperation: table, outbox: state.outbox });
      if (this.failNextCommit) {
        const failure = this.failNextCommit;
        this.failNextCommit = null;
        throw failure;
      }
      for (const key of state.deleted) this.committed.delete(key);
      for (const [key, row] of state.overlay) this.committed.set(key, row);
      this.committedOutbox.push(...state.outbox);
      state.outcome = 'committed';
      return result;
    } catch (err) {
      state.outcome = 'aborted';
      throw err;
    } finally {
      this.openTxs.delete(state);
      for (const wake of state.waiters) wake();
    }
  }
}

function txOutbox(tx: { idempotencyOperation: IdempotencyOperationTable }): string[] {
  return (tx as unknown as { outbox: string[] }).outbox;
}

// ---------------------------------------------------------------------------
// Test app: a transactional mail-style route (archive pattern)
// ---------------------------------------------------------------------------

const KEY = 'idem-key-abc123';
const OTHER_KEY = 'idem-key-xyz789';

async function buildApp(db: FakeDb, opts?: { blockInWork?: () => Promise<void>; failWorkOnce?: boolean }) {
  const app = Fastify({ logger: false });
  // Production wiring: DbIdempotencyStore over the same table the helper
  // transacts against (cf. packages/server-core/src/app.ts).
  await app.register(idempotencyPlugin, { store: new DbIdempotencyStore(db.idempotencyOperation) });

  app.addHook('onRequest', async (request: FastifyRequest) => {
    (request as unknown as { auth?: { userId: string } }).auth = { userId: 'user-1' };
  });

  let executions = 0;
  let releaseWork: (() => void) | null = null;
  let workCalls = 0;

  await app.register(async (instance: FastifyInstance) => {
    instance.post(
      '/archive',
      { config: { idempotencyRequired: true, idempotencyTransactional: true } },
      async (request, reply) => {
        await handleIdempotentTransaction(request, reply, db, {
          work: async (tx) => {
            executions += 1;
            workCalls += 1;
            if (opts?.blockInWork && workCalls === 1) {
              await new Promise<void>((resolve) => {
                releaseWork = resolve;
              });
            }
            if (opts?.failWorkOnce && workCalls === 1) {
              throw new Error('simulated mutation failure');
            }
            // The route's durable side effect, inside the same transaction.
            txOutbox(tx).push(`archived:${executions}`);
            return { statusCode: 200, payload: { success: true, n: executions } };
          },
        });
      },
    );
  });

  return {
    app,
    db,
    execCount: () => executions,
    releaseWork: () => releaseWork?.(),
  };
}

function postArchive(app: FastifyInstance, key?: string, body: unknown = { id: 'email-1' }) {
  return app.inject({
    method: 'POST',
    url: '/archive',
    headers: {
      'content-type': 'application/json',
      ...(key ? { 'idempotency-key': key } : {}),
    },
    payload: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// handleIdempotentTransaction — the r4 proofs
// ---------------------------------------------------------------------------

describe('handleIdempotentTransaction (fix/qm-idempotency-mail-routes-r4)', () => {
  let db: FakeDb;
  beforeEach(() => {
    db = new FakeDb();
  });

  it('runs the mutation once; a retry with the same key replays the stored outcome byte-identically', async () => {
    const { app, execCount } = await buildApp(db);
    const first = await postArchive(app, KEY);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ success: true, n: 1 });

    const second = await postArchive(app, KEY);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ success: true, n: 1 });
    expect(second.headers[IDEMPOTENT_REPLAYED_HEADER]).toBe('true');
    // The mutation (and its outbox side effect) executed exactly once.
    expect(execCount()).toBe(1);
    expect(db.committedOutbox).toEqual(['archived:1']);
    await app.close();
  });

  it('a work() throw rolls the claim back with the mutation: the retry re-executes cleanly, no 409', async () => {
    const { app } = await buildApp(db, { failWorkOnce: true });
    const first = await postArchive(app, KEY);
    expect(first.statusCode).toBe(500);

    const second = await postArchive(app, KEY);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ success: true, n: 2 });
    // The failed attempt left zero durable state (no claim, no outbox row).
    expect(db.committedOutbox).toEqual(['archived:2']);
    await app.close();
  });

  it('a concurrent same-key request waits on the claim, then replays the winner — single execution', async () => {
    const { app, db: tdb, releaseWork } = await buildApp(db, {
      blockInWork: async () => {},
    });
    const firstPromise = postArchive(app, KEY);
    // Let the first request reach the blocked work() (claim inserted, tx open).
    const start = Date.now();
    while (tdb.openTxs.size === 0 && Date.now() - start < 5000) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(tdb.openTxs.size).toBe(1);
    const secondPromise = postArchive(app, KEY);
    // Give the second request time to arrive and block on the open transaction.
    await new Promise((r) => setTimeout(r, 100));
    releaseWork();
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ success: true, n: 1 });
    // The loser serialized on the operation primary key and replayed.
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ success: true, n: 1 });
    expect(second.headers[IDEMPOTENT_REPLAYED_HEADER]).toBe('true');
    expect(tdb.committedOutbox).toEqual(['archived:1']);
    await app.close();
  });

  it('commit failure rolls the claim AND the mutation back together: retry re-executes with zero durable effect', async () => {
    const { app } = await buildApp(db);
    db.failNextCommit = new Error('simulated commit failure');
    const first = await postArchive(app, KEY);
    expect(first.statusCode).toBe(500);

    const second = await postArchive(app, KEY);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ success: true, n: 2 });
    expect(db.committedOutbox).toEqual(['archived:2']);
    await app.close();
  });

  it('missing key is rejected 400 with zero mutation (required-key semantics preserved)', async () => {
    const { app, execCount } = await buildApp(db);
    const res = await postArchive(app, undefined);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(execCount()).toBe(0);
    await app.close();
  });

  it('same key + different payload is 422 IDEMPOTENCY_KEY_REUSE (the key identifies one logical operation)', async () => {
    const { app } = await buildApp(db);
    const first = await postArchive(app, KEY, { id: 'email-1' });
    expect(first.statusCode).toBe(200);
    const second = await postArchive(app, KEY, { id: 'email-2' });
    expect(second.statusCode).toBe(422);
    expect(second.json().error.code).toBe('IDEMPOTENCY_KEY_REUSE');
    await app.close();
  });

  it('different keys are independent operations', async () => {
    const { app } = await buildApp(db);
    const first = await postArchive(app, KEY);
    const second = await postArchive(app, OTHER_KEY);
    expect(first.json()).toEqual({ success: true, n: 1 });
    expect(second.json()).toEqual({ success: true, n: 2 });
    await app.close();
  });

  it('throws when the route was not configured idempotencyTransactional (fail-closed wiring)', async () => {
    const app = Fastify({ logger: false });
    await app.register(idempotencyPlugin, { store: new DbIdempotencyStore(db.idempotencyOperation) });
    let thrown: unknown = null;
    await app.register(async (instance: FastifyInstance) => {
      // Generic (non-transactional) route calling the transactional helper.
      instance.post('/plain', { config: { idempotencyRequired: true } }, async (request, reply) => {
        try {
          await handleIdempotentTransaction(request, reply, db, {
            work: async () => ({ statusCode: 200, payload: {} }),
          });
        } catch (err) {
          thrown = err;
          throw err;
        }
      });
    });
    const res = await app.inject({
      method: 'POST',
      url: '/plain',
      headers: { 'content-type': 'application/json', 'idempotency-key': KEY },
      payload: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(500);
    expect(String((thrown as Error)?.message)).toContain('idempotencyTransactional');
    await app.close();
  });
});
