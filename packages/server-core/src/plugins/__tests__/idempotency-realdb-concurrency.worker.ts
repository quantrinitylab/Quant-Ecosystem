/**
 * fix/qm-idempotency-mail-routes — real-database concurrency worker.
 *
 * This file is spawned in `node:worker_threads` (one OS thread per worker),
 * each opening its OWN connection to the same SQLite database file. It imports
 * the REAL production code under test (`runIdempotentOperation` /
 * `DbIdempotencyStore` from `../idempotency.ts`) — never a copy — and drives
 * it through a REAL database engine with REAL ACID transactions, REAL
 * concurrent connections and REAL lock contention (busy_timeout makes a loser
 * block on the winner's write lock, exactly like a Postgres row-lock wait;
 * the loser's INSERT then fails on the committed row's primary key).
 *
 * What is real here vs the FakeDb-modeled suites:
 *  - real: the helper under test, the store class under test, the SQL engine,
 *    the transaction boundaries, the unique-constraint enforcement, the
 *    cross-thread lock contention and blocking behavior;
 *  - modeled: the Prisma delegate SHAPE (this adapter speaks the
 *    `IdempotencyOperationTable` structural interface over SQL and maps
 *    SQLITE_CONSTRAINT_UNIQUE -> { code: 'P2002' } / missing row ->
 *    { code: 'P2025' }, the exact error contract production relies on);
 *  - residual difference vs production Postgres, stated honestly: SQLite
 *    serializes writers at database level while Postgres uses row-level
 *    locking, so this proves the helper's claim-race logic (claim inside the
 *    transaction, unique-constraint serialization, loser interprets the
 *    winner's row) — not Postgres's lock manager.
 *
 * Not a vitest test file itself (the `*.worker.ts` name keeps it out of the
 * test glob); the driver test spawns it with `execArgv: ['--import', tsx]`.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { parentPort, workerData } from 'node:worker_threads';

import {
  DbIdempotencyStore,
  IdempotencyConflictError,
  runIdempotentOperation,
  type IdempotencyDatabase,
  type IdempotencyOperationRow,
  type IdempotencyOperationTable,
} from '../idempotency';

// ---------------------------------------------------------------------------
// Prisma-shaped errors (codes stable across Prisma 5/6)
// ---------------------------------------------------------------------------

function prismaError(code: string, message: string): Error {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

// ---------------------------------------------------------------------------
// SQLite adapter implementing the production structural interfaces
// ---------------------------------------------------------------------------

interface RawRow {
  operation_id: string;
  fingerprint: string;
  status: string;
  response_status: number | null;
  response_headers: string | null;
  response_body: string | null;
  created_at: string;
  expires_at: string;
}

function toOperationRow(raw: RawRow): IdempotencyOperationRow {
  return {
    operationId: raw.operation_id,
    fingerprint: raw.fingerprint,
    status: raw.status,
    responseStatus: raw.response_status,
    responseHeaders: raw.response_headers,
    responseBody: raw.response_body,
    createdAt: new Date(raw.created_at),
    expiresAt: new Date(raw.expires_at),
  };
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  if (code === 'ERR_SQLITE_CONSTRAINT_PRIMARYKEY' || code === 'ERR_SQLITE_CONSTRAINT_UNIQUE') {
    return true;
  }
  return (
    err instanceof Error &&
    (err.message.includes('UNIQUE constraint failed') ||
      err.message.includes('PRIMARY KEY constraint failed'))
  );
}

interface WorkerTable extends IdempotencyOperationTable {
  /** Test probe: runs arbitrary SQL on the same connection/tx. */
  probeExec(sql: string): void;
  probeGet(sql: string): unknown;
}

function makeTable(db: DatabaseSync): WorkerTable {
  return {
    create: async ({ data }) => {
      try {
        db.prepare(
          `INSERT INTO idempotency_operations
             (operation_id, fingerprint, status, response_status, response_headers, response_body, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          data.operationId,
          data.fingerprint,
          data.status,
          data.responseStatus ?? null,
          data.responseHeaders ?? null,
          data.responseBody ?? null,
          new Date().toISOString(),
          data.expiresAt.toISOString(),
        );
      } catch (err) {
        if (isUniqueViolation(err)) throw prismaError('P2002', 'Unique constraint failed on operation_id');
        throw err;
      }
      return {};
    },
    findUnique: async ({ where }) => {
      const raw = db
        .prepare(`SELECT * FROM idempotency_operations WHERE operation_id = ?`)
        .get(where.operationId) as RawRow | undefined;
      return raw ? toOperationRow(raw) : null;
    },
    update: async ({ where, data }) => {
      const sets: string[] = [];
      const vals: SQLInputValue[] = [];
      if (data.status !== undefined) {
        sets.push('status = ?');
        vals.push(data.status);
      }
      if (data.fingerprint !== undefined) {
        sets.push('fingerprint = ?');
        vals.push(data.fingerprint);
      }
      if (data.responseStatus !== undefined) {
        sets.push('response_status = ?');
        vals.push(data.responseStatus);
      }
      if (data.responseHeaders !== undefined) {
        sets.push('response_headers = ?');
        vals.push(data.responseHeaders);
      }
      if (data.responseBody !== undefined) {
        sets.push('response_body = ?');
        vals.push(data.responseBody);
      }
      if (data.expiresAt !== undefined) {
        sets.push('expires_at = ?');
        vals.push(data.expiresAt.toISOString());
      }
      if (sets.length === 0) return {};
      const res = db
        .prepare(`UPDATE idempotency_operations SET ${sets.join(', ')} WHERE operation_id = ?`)
        .run(...vals, where.operationId);
      if (res.changes === 0) throw prismaError('P2025', 'Record to update not found');
      return {};
    },
    delete: async ({ where }) => {
      db.prepare(`DELETE FROM idempotency_operations WHERE operation_id = ?`).run(where.operationId);
      return {};
    },
    probeExec: (sql: string) => {
      db.exec(sql);
    },
    probeGet: (sql: string) => {
      return db.prepare(sql).get();
    },
  };
}

function openDatabase(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  // busy_timeout FIRST: every statement below can block on another worker's
  // lock — including the journal_mode switch itself (it needs EXCLUSIVE while
  // a peer holds RESERVED). Without this, a contested switch throws
  // SQLITE_BUSY ("database is locked") immediately instead of waiting.
  db.exec(`PRAGMA busy_timeout=15000;`);
  // WAL: readers never block the writer. A loser BLOCKS on the winner's write
  // lock (like a Postgres row-lock wait) instead of failing fast — the loser's
  // INSERT then hits the committed row's primary key.
  db.exec(`PRAGMA journal_mode=WAL;`);
  db.exec(`PRAGMA synchronous=NORMAL;`);
  return db;
}

function makeDatabase(db: DatabaseSync): IdempotencyDatabase & { probeTable: WorkerTable } {
  const table = makeTable(db);
  return {
    idempotencyOperation: table,
    probeTable: table,
    $transaction: async <T>(fn: (tx: { idempotencyOperation: IdempotencyOperationTable }) => Promise<T>): Promise<T> => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const txTable = makeTable(db);
        const result = await fn({ idempotencyOperation: txTable });
        db.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          /* already rolled back */
        }
        throw err;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Worker modes
// ---------------------------------------------------------------------------

interface WorkerInput {
  dbPath: string;
  mode: 'race' | 'replay' | 'rollback' | 'store-race';
  operationId: string;
  fingerprint: string;
  /** Body the winner's work stores; losers must replay it byte-identically. */
  body: string;
  /** Milliseconds the winner holds its transaction open so losers pile up. */
  holdMs: number;
}

export interface WorkerResult {
  outcome: 'executed' | 'replayed' | 'conflict' | 'rolled-back' | 'store-won' | 'store-lost' | 'error';
  body?: string;
  statusCode?: number;
  code?: string;
  message?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const input = workerData as WorkerInput;
  const result: WorkerResult = { outcome: 'error' };
  let db: DatabaseSync | undefined;

  try {
    // Opened inside the try: a DB-open failure must surface as a reported
    // worker result, not an unhandled worker-thread crash.
    db = openDatabase(input.dbPath);
    const database = makeDatabase(db);
    if (input.mode === 'race' || input.mode === 'replay') {
      const opResult = await runIdempotentOperation(database, {
        operationId: input.operationId,
        fingerprint: input.fingerprint,
        work: async (tx) => {
          // The probe counter is incremented INSIDE the same transaction as
          // the claim: "exactly one execution" is observable as counter == 1
          // after the race, no matter how the losers were answered.
          (tx.idempotencyOperation as WorkerTable).probeExec(
            `UPDATE probe_counter SET n = n + 1 WHERE id = 'writes'`,
          );
          await sleep(input.holdMs);
          return {
            statusCode: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' },
            body: input.body,
          };
        },
      });
      result.outcome = opResult.replayed ? 'replayed' : 'executed';
      result.body = opResult.body;
      result.statusCode = opResult.statusCode;
    } else if (input.mode === 'rollback') {
      try {
        await runIdempotentOperation(database, {
          operationId: input.operationId,
          fingerprint: input.fingerprint,
          work: async (tx) => {
            (tx.idempotencyOperation as WorkerTable).probeExec(
              `UPDATE probe_counter SET n = n + 1 WHERE id = 'writes'`,
            );
            await sleep(50);
            throw new Error('boom: simulated handler failure');
          },
        });
        result.message = 'expected work to throw';
      } catch (err) {
        if (err instanceof Error && err.message === 'boom: simulated handler failure') {
          result.outcome = 'rolled-back';
        } else {
          throw err;
        }
      }
    } else if (input.mode === 'store-race') {
      const store = new DbIdempotencyStore(database.idempotencyOperation);
      await sleep(input.holdMs);
      const won = await store.claimProcessing(input.operationId, input.fingerprint, 60_000);
      result.outcome = won ? 'store-won' : 'store-lost';
    }
  } catch (err) {
    if (err instanceof IdempotencyConflictError) {
      result.outcome = 'conflict';
      result.code = err.code;
      result.statusCode = err.statusCode;
    } else {
      result.outcome = 'error';
      result.message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }

  parentPort?.postMessage(result);
}

void main();
