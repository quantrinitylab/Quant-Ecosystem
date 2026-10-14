/**
 * fix/qm-idempotency-outbox-r4 — durable idempotency proofs for the
 * CODEX-REVIEW P0 on PR #1124.
 *
 * The P0: (1) an ordinary retry minted K2 after K1's lost response, so the
 * server executed the mutation twice; (2) the completed-outcome store write
 * happened AFTER the mutation and a write failure RELEASED the claim, so a
 * retry could execute the mutation again.
 *
 * These tests prove the corrected contract with an in-memory stand-in for
 * Postgres that models the semantics the fix relies on:
 *  - claim = INSERT under a primary-key uniqueness constraint (P2002);
 *  - `$transaction` gives snapshot isolation: a concurrent transaction's
 *    INSERT on the same key BLOCKS until the holder commits/aborts (like
 *    Postgres), then raises P2002 (committed) or proceeds (aborted);
 *  - commit failure rolls the claim AND the mutation back together.
 *
 * No fake data: the fake models real database concurrency semantics, and the
 * assertions are on observable behavior (work executions, committed rows,
 * HTTP status codes), not on the fake's internals.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import idempotencyPlugin, {
  DbIdempotencyStore,
  IdempotencyConflictError,
  runIdempotentOperation,
  IDEMPOTENT_REPLAYED_HEADER,
  type IdempotencyDatabase,
  type IdempotencyOperationRow,
  type IdempotencyOperationTable,
} from '../idempotency';

// ---------------------------------------------------------------------------
// Prisma-shaped error helper (codes are stable across Prisma 5/6)
// ---------------------------------------------------------------------------

function prismaError(code: string, message?: string): Error {
  const err = new Error(message ?? `prisma ${code}`);
  (err as { code?: string }).code = code;
  return err;
}

const P2002 = () => prismaError('P2002', 'Unique constraint failed');
const P2025 = () => prismaError('P2025', 'Record not found');

// ---------------------------------------------------------------------------
// In-memory Postgres model
// ---------------------------------------------------------------------------

interface TxState {
  overlay: Map<string, IdempotencyOperationRow>;
  deleted: Set<string>;
  /** Tx-scoped side effects: only join the committed world on commit. */
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

/**
 * Models Postgres for the idempotency table:
 * - PK uniqueness (P2002) across committed rows AND uncommitted rows of
 *   other open transactions — a concurrent INSERT blocks until the holder
 *   settles, exactly like a real unique index;
 * - commit applies the overlay atomically; abort discards it;
 * - a commit-time failure (failNextCommit) aborts the whole transaction, so
 *   the claim and the mutation roll back together.
 */
class FakeDb implements IdempotencyDatabase {
  committed = new Map<string, IdempotencyOperationRow>();
  committedOutbox: string[] = [];
  openTxs = new Set<TxState>();
  failNextCommit: Error | null = null;

  /** Ambient (non-transactional) table access. */
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
        // Another open transaction holds an uncommitted row for this key:
        // block until it settles (Postgres unique-index behavior).
        for (const other of this.openTxs) {
          if (other === state) continue;
          if (other.overlay.has(data.operationId)) {
            await new Promise<void>((resolve) => other.waiters.push(resolve));
            if (other.outcome === 'committed' || this.committed.has(data.operationId)) {
              throw P2002();
            }
            break; // holder aborted: the key is free again
          }
        }
        if (this.committed.has(data.operationId)) throw P2002();
        state.overlay.set(data.operationId, rowFrom(data));
        return {};
      },
      findUnique: async ({ where }) =>
        state.overlay.get(where.operationId) ?? this.committed.get(where.operationId) ?? null,
      update: async ({ where, data }) => {
        const row =
          state.overlay.get(where.operationId) ?? this.committed.get(where.operationId);
        if (!row || state.deleted.has(where.operationId)) throw P2025();
        // Copy-on-write into the overlay so abort discards the change.
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

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function until(cond: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (cond()) return;
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 10));
  }
}

const OP = 'op-proof-1';
const FP = 'fp-proof-1';

/**
 * The fake transaction attaches an `outbox` array that only joins the
 * committed world on commit — the test's stand-in for the mutation's
 * durable side effects (delivery job / outbox row).
 */
function txOutbox(tx: { idempotencyOperation: IdempotencyOperationTable }): string[] {
  return (tx as unknown as { outbox: string[] }).outbox;
}

// ---------------------------------------------------------------------------
// runIdempotentOperation — the P0 proofs
// ---------------------------------------------------------------------------

describe('runIdempotentOperation (CODEX-REVIEW P0 proofs)', () => {
  let db: FakeDb;

  beforeEach(() => {
    db = new FakeDb();
  });

  it('timeout-after-commit: a retry with the same operation id replays the stored outcome, work runs once', async () => {
    let workCalls = 0;
    const work = async (tx: { idempotencyOperation: IdempotencyOperationTable }) => {
      workCalls++;
      txOutbox(tx).push('delivery-job-1'); // the mutation's durable effect
      return { statusCode: 202, headers: { 'content-type': 'application/json' }, body: '{"queued":true}' };
    };

    // First attempt commits; the HTTP response is lost (timeout). We
    // deliberately ignore the result — the server-side state is what matters.
    const first = await runIdempotentOperation(db, {
      operationId: OP,
      fingerprint: FP,
      work,
    });
    expect(first.replayed).toBe(false);
    expect(first.statusCode).toBe(202);

    // The user's retry carries the SAME durable operation id (the client
    // pending-operation ledger reuses K1 — see api-client tests).
    const retry = await runIdempotentOperation(db, {
      operationId: OP,
      fingerprint: FP,
      work,
    });

    expect(retry.replayed).toBe(true);
    expect(retry.statusCode).toBe(202);
    expect(retry.body).toBe('{"queued":true}');
    expect(workCalls).toBe(1); // the mutation executed exactly once
    expect(db.committedOutbox).toEqual(['delivery-job-1']); // one delivery job
  });

  it('store-write failure: the failed attempt leaves zero durable state and the retry re-executes honestly', async () => {
    let workCalls = 0;
    const work = async (tx: { idempotencyOperation: IdempotencyOperationTable }) => {
      workCalls++;
      txOutbox(tx).push(`delivery-job-attempt-${workCalls}`);
      return { statusCode: 202, body: '{"queued":true}' };
    };

    // The store write fails at commit (disk error / failover). Claim +
    // mutation + outcome are one transaction, so everything rolls back.
    db.failNextCommit = new Error('simulated commit failure');
    await expect(
      runIdempotentOperation(db, { operationId: OP, fingerprint: FP, work }),
    ).rejects.toThrow('simulated commit failure');

    // Honest state: no completed row, no dangling claim — the retry is NOT
    // told "already done" and is NOT stuck behind a phantom claim.
    expect(db.committed.get(OP)).toBeUndefined();
    expect(db.committedOutbox).toEqual([]);

    // Retry with the same operation id: safe re-execution, exactly one
    // committed effect across both attempts.
    const retry = await runIdempotentOperation(db, {
      operationId: OP,
      fingerprint: FP,
      work,
    });
    expect(retry.replayed).toBe(false);
    expect(retry.statusCode).toBe(202);
    expect(workCalls).toBe(2); // attempt 1 rolled back, attempt 2 committed
    expect(db.committedOutbox).toEqual(['delivery-job-attempt-2']);
    const row = db.committed.get(OP);
    expect(row?.status).toBe('completed');
  });

  it('two replicas, one key: the loser blocks on the PK and replays the winner — single effect', async () => {
    let workCalls = 0;
    const gate = deferred();

    // Replica A starts, claims inside its transaction, then stalls mid-work
    // (slow handler) while holding the uncommitted claim.
    const replicaA = runIdempotentOperation(db, {
      operationId: OP,
      fingerprint: FP,
      work: async (tx) => {
        workCalls++;
        txOutbox(tx).push('delivery-job-A');
        await gate.promise;
        return { statusCode: 202, body: '{"from":"A"}' };
      },
    });

    // Wait until A's claim INSERT has landed in its open transaction.
    await until(() => [...db.openTxs].some((tx) => tx.overlay.has(OP)));

    // Replica B arrives with the same key while A is still in flight.
    const replicaB = runIdempotentOperation(db, {
      operationId: OP,
      fingerprint: FP,
      work: async (tx) => {
        workCalls++;
        txOutbox(tx).push('delivery-job-B');
        return { statusCode: 202, body: '{"from":"B"}' };
      },
    });

    // A finishes and commits.
    gate.resolve();
    const [a, b] = await Promise.all([replicaA, replicaB]);

    expect(a.replayed).toBe(false);
    expect(a.body).toBe('{"from":"A"}');
    // B lost the PK race, then replayed A's committed outcome.
    expect(b.replayed).toBe(true);
    expect(b.statusCode).toBe(202);
    expect(b.body).toBe('{"from":"A"}');
    // Exactly one execution, one delivery job: no double-send.
    expect(workCalls).toBe(1);
    expect(db.committedOutbox).toEqual(['delivery-job-A']);
  });

  it('same key, different payload: 422 IDEMPOTENCY_KEY_REUSE (the key identifies ONE logical operation)', async () => {
    await runIdempotentOperation(db, {
      operationId: OP,
      fingerprint: FP,
      work: async () => ({ statusCode: 200, body: 'first' }),
    });

    const err = await runIdempotentOperation(db, {
      operationId: OP,
      fingerprint: 'fp-DIFFERENT-payload',
      work: async () => ({ statusCode: 200, body: 'second' }),
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(IdempotencyConflictError);
    expect((err as IdempotencyConflictError).code).toBe('IDEMPOTENCY_KEY_REUSE');
    expect((err as IdempotencyConflictError).statusCode).toBe(422);
  });

  it('a work() throw rolls back the claim: the next attempt is a clean re-execution, not a 409', async () => {
    let calls = 0;
    const flaky = async (tx: { idempotencyOperation: IdempotencyOperationTable }) => {
      calls++;
      if (calls === 1) throw new Error('handler blew up mid-mutation');
      txOutbox(tx).push('delivery-job-ok');
      return { statusCode: 200, body: 'ok' };
    };

    await expect(
      runIdempotentOperation(db, { operationId: OP, fingerprint: FP, work: flaky }),
    ).rejects.toThrow('handler blew up mid-mutation');
    expect(db.committed.get(OP)).toBeUndefined();

    const retry = await runIdempotentOperation(db, {
      operationId: OP,
      fingerprint: FP,
      work: flaky,
    });
    expect(retry.replayed).toBe(false);
    expect(calls).toBe(2);
    expect(db.committedOutbox).toEqual(['delivery-job-ok']);
  });
});

// ---------------------------------------------------------------------------
// DbIdempotencyStore — unit behavior over the table
// ---------------------------------------------------------------------------

describe('DbIdempotencyStore', () => {
  let db: FakeDb;
  let store: DbIdempotencyStore;

  beforeEach(() => {
    db = new FakeDb();
    store = new DbIdempotencyStore(db.idempotencyOperation);
  });

  it('claim race: exactly one claimant wins', async () => {
    const [a, b] = await Promise.all([
      store.claimProcessing('k1', 'fp', 60_000),
      store.claimProcessing('k1', 'fp', 60_000),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it('setCompleted then get: replays status, headers and body verbatim', async () => {
    expect(await store.claimProcessing('k1', 'fp', 60_000)).toBe(true);
    await store.setCompleted(
      'k1',
      {
        status: 'completed',
        fingerprint: 'fp',
        statusCode: 202,
        headers: { 'content-type': 'application/json' },
        body: '{"queued":true}',
      },
      24 * 3600_000,
    );
    const entry = await store.get('k1');
    expect(entry?.status).toBe('completed');
    if (entry?.status === 'completed') {
      expect(entry.statusCode).toBe(202);
      expect(entry.headers).toEqual({ 'content-type': 'application/json' });
      expect(entry.body).toBe('{"queued":true}');
    }
  });

  it('expired rows are treated as absent (replay window lapsed)', async () => {
    await db.idempotencyOperation.create({
      data: {
        operationId: 'k-old',
        fingerprint: 'fp',
        status: 'completed',
        responseStatus: 200,
        responseBody: 'stale',
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    expect(await store.get('k-old')).toBeNull();
    // Lazy expiry also cleaned the row.
    expect(db.committed.get('k-old')).toBeUndefined();
  });

  it('an expired in-flight claim can be reclaimed', async () => {
    await db.idempotencyOperation.create({
      data: {
        operationId: 'k-lapsed',
        fingerprint: 'fp',
        status: 'processing',
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    expect(await store.claimProcessing('k-lapsed', 'fp', 60_000)).toBe(true);
  });

  it('release drops the row', async () => {
    expect(await store.claimProcessing('k1', 'fp', 60_000)).toBe(true);
    await store.release('k1');
    expect(await store.get('k1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Plugin integration: replay / in-flight / outcome-write failure / readiness
// ---------------------------------------------------------------------------

const IDEM_ROUTE = '/idem-test';

function buildPluginApp(store: DbIdempotencyStore): {
  app: FastifyInstance;
  handlerRuns: { count: number };
} {
  const app: FastifyInstance = Fastify({ logger: false });
  const handlerRuns = { count: 0 };
  void app.register(idempotencyPlugin, { store: store as DbIdempotencyStore });
  app.post(
    IDEM_ROUTE,
    { config: { idempotencyRequired: true } },
    async (request, reply) => {
      handlerRuns.count++;
      const gate = (request as unknown as { __gate?: Promise<void> }).__gate;
      if (gate) await gate;
      return reply.code(200).send({ ok: true, run: handlerRuns.count });
    },
  );
  return { app, handlerRuns };
}

describe('idempotency plugin with the durable store', () => {
  let db: FakeDb;

  beforeEach(() => {
    db = new FakeDb();
  });

  it('same key twice: handler runs once, second response is a replay', async () => {
    const { app, handlerRuns } = buildPluginApp(new DbIdempotencyStore(db.idempotencyOperation));
    await app.ready();

    const first = await app.inject({
      method: 'POST',
      url: IDEM_ROUTE,
      headers: { 'idempotency-key': 'KEY-replay-1' },
      payload: { op: 'send' },
    });
    expect(first.statusCode).toBe(200);
    expect(first.headers[IDEMPOTENT_REPLAYED_HEADER]).toBeUndefined();

    const second = await app.inject({
      method: 'POST',
      url: IDEM_ROUTE,
      headers: { 'idempotency-key': 'KEY-replay-1' },
      payload: { op: 'send' },
    });
    expect(second.statusCode).toBe(200);
    expect(second.headers[IDEMPOTENT_REPLAYED_HEADER]).toBe('true');
    expect(second.json()).toEqual(first.json());
    expect(handlerRuns.count).toBe(1);

    await app.close();
  });

  it('same key, different body: 422 IDEMPOTENCY_KEY_REUSE', async () => {
    const { app } = buildPluginApp(new DbIdempotencyStore(db.idempotencyOperation));
    await app.ready();

    const first = await app.inject({
      method: 'POST',
      url: IDEM_ROUTE,
      headers: { 'idempotency-key': 'KEY-reuse-1' },
      payload: { op: 'send' },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: IDEM_ROUTE,
      headers: { 'idempotency-key': 'KEY-reuse-1' },
      payload: { op: 'DIFFERENT-payload' },
    });
    expect(second.statusCode).toBe(422);
    expect(second.json().error.code).toBe('IDEMPOTENCY_KEY_REUSE');

    await app.close();
  });

  it('in-flight key: concurrent retry gets 409 IDEMPOTENCY_IN_FLIGHT, handler still runs once', async () => {
    const gate = deferred();
    const app: FastifyInstance = Fastify({ logger: false });
    const handlerRuns = { count: 0 };
    void app.register(idempotencyPlugin, { store: new DbIdempotencyStore(db.idempotencyOperation) });
    app.addHook('preHandler', async (request) => {
      (request as unknown as { __gate?: Promise<void> }).__gate = gate.promise;
    });
    app.post(IDEM_ROUTE, { config: { idempotencyRequired: true } }, async (request, reply) => {
      handlerRuns.count++;
      await (request as unknown as { __gate?: Promise<void> }).__gate;
      return reply.code(200).send({ ok: true });
    });
    await app.ready();

    const first = app.inject({
      method: 'POST',
      url: IDEM_ROUTE,
      headers: { 'idempotency-key': 'KEY-inflight-1' },
      payload: { op: 'send' },
    });
    // Wait until the first request has claimed the key (still in flight).
    await until(() => db.committed.size === 1);

    const second = await app.inject({
      method: 'POST',
      url: IDEM_ROUTE,
      headers: { 'idempotency-key': 'KEY-inflight-1' },
      payload: { op: 'send' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('IDEMPOTENCY_IN_FLIGHT');

    gate.resolve();
    const firstRes = await first;
    expect(firstRes.statusCode).toBe(200);
    expect(handlerRuns.count).toBe(1);

    await app.close();
  });

  it('P0 regression: a failed outcome-store write KEEPS the claim (retry gets 409, never a second execution)', async () => {
    // The old code released the claim when the outcome write failed — a retry
    // (even with K1) would then execute the mutation a second time.
    class FailingOutcomeStore extends DbIdempotencyStore {
      override async setCompleted(): Promise<void> {
        throw new Error('simulated outcome store failure');
      }
    }
    const { app, handlerRuns } = buildPluginApp(new FailingOutcomeStore(db.idempotencyOperation));
    await app.ready();

    const first = await app.inject({
      method: 'POST',
      url: IDEM_ROUTE,
      headers: { 'idempotency-key': 'KEY-failwrite-1' },
      payload: { op: 'send' },
    });
    // The client still gets its 200: the mutation ran. The failure is only in
    // persisting the completed outcome.
    expect(first.statusCode).toBe(200);
    expect(handlerRuns.count).toBe(1);

    // Retry with the same key: the claim was retained, so the server answers
    // 409 in-flight instead of executing the mutation again.
    const second = await app.inject({
      method: 'POST',
      url: IDEM_ROUTE,
      headers: { 'idempotency-key': 'KEY-failwrite-1' },
      payload: { op: 'send' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('IDEMPOTENCY_IN_FLIGHT');
    expect(handlerRuns.count).toBe(1);

    await app.close();
  });

  it('durableStoreRequired: readiness fails on the per-instance memory fallback', async () => {
    const app: FastifyInstance = Fastify({ logger: false });
    await app.register(idempotencyPlugin, { durableStoreRequired: true });
    app.post(IDEM_ROUTE, { config: { idempotencyRequired: true } }, async (_req, reply) =>
      reply.code(200).send({ ok: true }),
    );
    await expect(app.ready()).rejects.toThrow(/durableStoreRequired/);
    await app.close();
  });

  it('durableStoreRequired: readiness passes with the durable DB store', async () => {
    const app: FastifyInstance = Fastify({ logger: false });
    await app.register(idempotencyPlugin, {
      store: new DbIdempotencyStore(db.idempotencyOperation),
      durableStoreRequired: true,
    });
    app.post(IDEM_ROUTE, { config: { idempotencyRequired: true } }, async (_req, reply) =>
      reply.code(200).send({ ok: true }),
    );
    await app.ready();
    await app.close();
  });
});
