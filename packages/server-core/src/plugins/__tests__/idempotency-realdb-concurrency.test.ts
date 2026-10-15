/**
 * fix/qm-idempotency-mail-routes — REAL-DATABASE concurrency proofs for the
 * CODEX-REVIEW P0 on merged #1145.
 *
 * The r4 round proved `runIdempotentOperation()` / `DbIdempotencyStore`
 * against a FakeDb that MODELS Postgres semantics in memory. This suite goes
 * one level deeper: it drives the REAL production code
 * (`packages/server-core/src/plugins/idempotency.ts`, imported — never
 * copied) through a REAL database engine (`node:sqlite`, a genuine ACID
 * store, not a mock delegate) with REAL concurrent OS threads
 * (`node:worker_threads`, one connection per thread, WAL + busy_timeout so a
 * loser blocks on the winner's write lock like a Postgres row-lock wait and
 * then fails on the committed row's primary key).
 *
 * Proven here:
 *  1. N concurrent claimants on one operation id -> exactly one executes
 *     `work` (observable via an atomic probe counter incremented INSIDE the
 *     same transaction as the claim); every loser gets 409
 *     IDEMPOTENCY_IN_FLIGHT or a byte-identical replay — never a second
 *     execution.
 *  2. A retry after the outcome committed replays the stored response
 *     byte-identically (the truncated-200 / gateway-timeout client case).
 *  3. `work` throwing rolls the claim AND the mutation back atomically: the
 *     probe counter is unchanged, no operation row survives, and a retry
 *     re-executes cleanly with zero durable effect from the failed attempt.
 *  4. `DbIdempotencyStore.claimProcessing` under true thread concurrency:
 *     exactly one claimant wins.
 *
 * Honest scope note (also in the worker file): SQLite serializes writers at
 * database level while production Postgres uses row-level locking. What this
 * proves is the helper's claim-race LOGIC — claim inside the transaction,
 * losers serialize on the primary key and interpret the winner's row — not
 * Postgres's lock manager. The remaining step to full production proof is
 * running this same suite against Postgres (e.g. CI service container).
 */
import { describe, it, expect } from 'vitest';
import { Worker } from 'node:worker_threads';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import type { WorkerResult } from './idempotency-realdb-concurrency.worker';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const DDL = `
CREATE TABLE idempotency_operations (
  operation_id     TEXT PRIMARY KEY,
  fingerprint      TEXT NOT NULL,
  status           TEXT NOT NULL,
  response_status  INTEGER,
  response_headers TEXT,
  response_body    TEXT,
  created_at       TEXT NOT NULL,
  expires_at       TEXT NOT NULL
);
CREATE TABLE probe_counter (id TEXT PRIMARY KEY, n INTEGER NOT NULL);
INSERT INTO probe_counter (id, n) VALUES ('writes', 0);
`;

const workerUrl = new URL('./idempotency-realdb-concurrency.worker.ts', import.meta.url);
// tsx ships the ESM loader the worker needs to import the real .ts sources.
const tsxLoaderUrl = new URL(
  '../../../../../node_modules/tsx/dist/loader.mjs',
  import.meta.url,
);

if (!existsSync(tsxLoaderUrl)) {
  throw new Error(
    `[idempotency-realdb] tsx loader not found at ${tsxLoaderUrl} — cannot run worker threads`,
  );
}
const tsxLoaderHref = tsxLoaderUrl.href;

type WorkerMode = 'race' | 'replay' | 'rollback' | 'store-race';

interface RunOptions {
  dbPath: string;
  mode: WorkerMode;
  operationId: string;
  fingerprint: string;
  body?: string;
  holdMs?: number;
}

function runWorker(opts: RunOptions): Promise<WorkerResult> {
  return new Promise<WorkerResult>((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        fn();
      }
    };
    const worker = new Worker(workerUrl, {
      workerData: {
        dbPath: opts.dbPath,
        mode: opts.mode,
        operationId: opts.operationId,
        fingerprint: opts.fingerprint,
        body: opts.body ?? '',
        holdMs: opts.holdMs ?? 0,
      },
      execArgv: ['--import', tsxLoaderHref],
    });
    const timer = setTimeout(() => done(() => reject(new Error('worker timed out after 60s'))), 60_000);
    worker.once('message', (msg) => done(() => resolve(msg as WorkerResult)));
    worker.once('error', (err) => done(() => reject(err)));
    worker.once('exit', (code) =>
      done(() => reject(new Error(`worker exited with code ${code} before posting a result`))),
    );
  });
}

interface TestDb {
  dir: string;
  dbPath: string;
  /** Read the atomic probe counter (mutation executions). */
  probeCount(): number;
  /** Raw idempotency row, if any. */
  opRow(operationId: string): { status: string; response_body: string | null } | undefined;
  dispose(): void;
}

function createTestDb(): TestDb {
  const dir = mkdtempSync(join(tmpdir(), 'idem-realdb-'));
  const dbPath = join(dir, 'idempotency.db');
  const setup = new DatabaseSync(dbPath);
  setup.exec(DDL);
  setup.close();
  const query = <T>(fn: (db: DatabaseSync) => T): T => {
    const db = new DatabaseSync(dbPath);
    try {
      return fn(db);
    } finally {
      db.close();
    }
  };
  return {
    dir,
    dbPath,
    probeCount: () =>
      query((db) => (db.prepare(`SELECT n FROM probe_counter WHERE id = 'writes'`).get() as { n: number }).n),
    opRow: (operationId: string) =>
      query(
        (db) =>
          db
            .prepare(`SELECT status, response_body FROM idempotency_operations WHERE operation_id = ?`)
            .get(operationId) as { status: string; response_body: string | null } | undefined,
      ),
    dispose: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const OP_ID = 'quant:idem:race-user:POST:/emails/batch:race-key-1';
const FINGERPRINT = 'fingerprint-race-1';
const BODY = JSON.stringify({ success: true, data: { count: 3 } });

// ---------------------------------------------------------------------------
// Proofs
// ---------------------------------------------------------------------------

describe('idempotency real-database concurrency (fix/qm-idempotency-mail-routes)', () => {
  it(
    '8 concurrent claimants: exactly one executes, losers get 409 or a byte-identical replay',
    { timeout: 120_000 },
    async () => {
      const tdb = createTestDb();
      try {
        const results = await Promise.all(
          Array.from({ length: 8 }, () =>
            runWorker({
              dbPath: tdb.dbPath,
              mode: 'race',
              operationId: OP_ID,
              fingerprint: FINGERPRINT,
              body: BODY,
              holdMs: 250,
            }),
          ),
        );

        for (const r of results) {
          expect(
            r.outcome,
            `unexpected worker outcome: ${r.outcome} ${r.message ?? ''}`,
          ).toMatch(/^(executed|replayed|conflict)$/);
        }

        const executed = results.filter((r) => r.outcome === 'executed');
        expect(executed).toHaveLength(1);

        // The mutation ran AT MOST once: the probe increment commits in the
        // same transaction as the claim, so a second execution is impossible.
        expect(tdb.probeCount()).toBe(1);

        for (const r of results) {
          if (r.outcome === 'replayed') {
            // Byte-identical: the exact stored string, not a re-serialization.
            expect(r.body).toBe(BODY);
            expect(r.statusCode).toBe(200);
          } else if (r.outcome === 'conflict') {
            expect(r.code).toBe('IDEMPOTENCY_IN_FLIGHT');
            expect(r.statusCode).toBe(409);
          }
        }

        // The committed row is the durable proof a later retry would replay.
        const row = tdb.opRow(OP_ID);
        expect(row?.status).toBe('completed');
        expect(row?.response_body).toBe(BODY);
      } finally {
        tdb.dispose();
      }
    },
  );

  it(
    'retry after commit replays the stored outcome byte-identically (truncated-200 client case)',
    { timeout: 120_000 },
    async () => {
      const tdb = createTestDb();
      try {
        const first = await runWorker({
          dbPath: tdb.dbPath,
          mode: 'race',
          operationId: OP_ID,
          fingerprint: FINGERPRINT,
          body: BODY,
        });
        expect(first.outcome).toBe('executed');

        // The client's first response body was truncated, so it retries with
        // the SAME key (K1 retained): the server must replay, not re-execute.
        const retry = await runWorker({
          dbPath: tdb.dbPath,
          mode: 'replay',
          operationId: OP_ID,
          fingerprint: FINGERPRINT,
          body: BODY,
        });
        expect(retry.outcome).toBe('replayed');
        expect(retry.body).toBe(BODY);
        expect(retry.statusCode).toBe(200);
        expect(tdb.probeCount()).toBe(1);
      } finally {
        tdb.dispose();
      }
    },
  );

  it(
    'work throwing rolls the claim and the mutation back atomically; retry re-executes cleanly',
    { timeout: 120_000 },
    async () => {
      const tdb = createTestDb();
      try {
        const failed = await runWorker({
          dbPath: tdb.dbPath,
          mode: 'rollback',
          operationId: OP_ID,
          fingerprint: FINGERPRINT,
          body: BODY,
        });
        expect(failed.outcome).toBe('rolled-back');

        // Atomicity: the probe increment rolled back WITH the claim — no
        // durable effect from the failed attempt, and no orphan claim row
        // that would 409 a legitimate retry.
        expect(tdb.probeCount()).toBe(0);
        expect(tdb.opRow(OP_ID)).toBeUndefined();

        const retry = await runWorker({
          dbPath: tdb.dbPath,
          mode: 'race',
          operationId: OP_ID,
          fingerprint: FINGERPRINT,
          body: BODY,
        });
        expect(retry.outcome).toBe('executed');
        expect(tdb.probeCount()).toBe(1);
        expect(tdb.opRow(OP_ID)?.status).toBe('completed');
      } finally {
        tdb.dispose();
      }
    },
  );

  it(
    'DbIdempotencyStore.claimProcessing under true thread concurrency: exactly one winner',
    { timeout: 120_000 },
    async () => {
      const tdb = createTestDb();
      try {
        const results = await Promise.all(
          Array.from({ length: 8 }, () =>
            runWorker({
              dbPath: tdb.dbPath,
              mode: 'store-race',
              operationId: OP_ID,
              fingerprint: FINGERPRINT,
            }),
          ),
        );
        for (const r of results) {
          expect(r.outcome, `unexpected: ${r.outcome} ${r.message ?? ''}`).toMatch(
            /^(store-won|store-lost)$/,
          );
        }
        expect(results.filter((r) => r.outcome === 'store-won')).toHaveLength(1);
        expect(tdb.opRow(OP_ID)?.status).toBe('processing');
      } finally {
        tdb.dispose();
      }
    },
  );
});
