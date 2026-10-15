import fp from 'fastify-plugin';
import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';

/**
 * Global `Idempotency-Key` middleware (K4).
 *
 * Unifies the ad-hoc idempotency patterns scattered across the codebase
 * (quantads `credits-wallet.ts` ledger `actionKey`, quantai `webhook-dispatcher`
 * outbound header, quantchat `call-record` idempotent-by-construction) into one
 * cross-cutting Fastify plugin, following the same convention as the other
 * plugins in this directory (see `prisma.ts` / `README.md`).
 *
 * Behaviour (Stripe-style):
 *  - Opt-in per route: a route file calls `fastify.idempotency()` once and every
 *    mutating route (POST/PUT/PATCH/DELETE) registered afterwards honours the
 *    `Idempotency-Key` request header. Routes that never call it are untouched.
 *  - Required-key mode (WR-MAIL-104): a route file calls
 *    `fastify.idempotencyRequired()` — or sets per-route
 *    `config: { idempotencyRequired: true }` — and every mutating route
 *    registered afterwards REQUIRES a valid `Idempotency-Key`. A request with
 *    a missing key is rejected with 400 `IDEMPOTENCY_KEY_REQUIRED`, a
 *    malformed key with 400 `IDEMPOTENCY_KEY_INVALID`, both BEFORE the handler
 *    executes (zero mutation). This is what the canonical capability catalog
 *    (packages/app-registry/src/capabilities.ts: kind:'command' defaults
 *    idempotency.required=true) mandates for active commands.
 *  - First request with a key executes the handler; the response (status code,
 *    content-type and body) is stored for 24h under a key scoped to
 *    `<prefix>:<userId>:<method>:<routePath>:<key>`.
 *  - A repeat with the same key + same request fingerprint replays the stored
 *    response (with an `Idempotent-Replayed: true` header) instead of
 *    re-executing the handler — a retried message send / spend / upload can no
 *    longer double-create or double-charge.
 *  - A repeat with the same key but a *different* request fingerprint is
 *    rejected with 422 `IDEMPOTENCY_KEY_REUSE` (the key must identify one
 *    logical operation).
 *  - A repeat that arrives while the first request is still executing is
 *    rejected with 409 `IDEMPOTENCY_IN_FLIGHT` (+ `Retry-After`).
 *  - Only 2xx responses are cached. Any other outcome releases the key so the
 *    client can safely retry with the same key.
 *
 * Fail-closed contract (never fails open):
 *  - Storage is Redis when `redisClient` is provided (the same connection the
 *    rate limiter in `app.ts` uses), otherwise a bounded in-memory TTL store.
 *  - If the store itself errors (or a Redis call times out), requests carrying
 *    an `Idempotency-Key` get 503 `IDEMPOTENCY_STORE_UNAVAILABLE` instead of
 *    executing unguarded. Requests without the header are unaffected.
 *  - Without Redis the guarantee is per-instance; multi-instance deployments
 *    must configure `redisUrl` for cluster-wide safety (same caveat as the
 *    rate limiter).
 *
 * Durable operation ledger (fix/qm-idempotency-outbox-r3 — answers the
 * CODEX-REVIEW P0 on PR #1124):
 *  - The response cache used to be written AFTER the handler ran, and a failed
 *    cache write RELEASED the claim — so a lost response + retry could
 *    execute the mutation twice. That hole is closed two ways:
 *    1. `DbIdempotencyStore` persists the operation record in Postgres
 *       (`idempotency_operations`). Claim = INSERT under the primary-key
 *       uniqueness constraint: exactly one replica wins, enforced by the
 *       database, with no Redis required.
 *    2. `runIdempotentOperation()` runs claim + mutation + completed-outcome
 *       (+ any outbox rows the handler writes) in ONE database transaction.
 *       A store-write failure rolls the mutation back with it — the claim is
 *       never released while a mutation stands.
 *  - The generic plugin path (preHandler claim / onSend outcome) can never
 *    run inside the handler's transaction, so it is the durable claim +
 *    replay layer only: on an outcome-write failure it now KEEPS the claim
 *    (retries get 409 `IDEMPOTENCY_IN_FLIGHT`) instead of releasing it.
 *    Handlers whose mutation must be atomic with its outcome use
 *    `runIdempotentOperation()` with `request.idempotencyContext.operationId`.
 *  - The operation id is the scoped store key
 *    (`<prefix>:<userId>:<method>:<route>:<key>`): the client mints ONE
 *    durable id per logical action and reuses it across timeout, manual
 *    retry, reconnect/restart and offline-outbox replay (see
 *    `apps/quantmail/src/services/api-client.ts` pending-operation ledger).
 *  - `durableStoreRequired: true` makes required-key deployments fail
 *    readiness when the store is the per-instance memory fallback — no
 *    silent per-instance guarantee.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Request header carrying the client-generated idempotency key. */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/** Response header set when a stored response is replayed. */
export const IDEMPOTENT_REPLAYED_HEADER = 'idempotent-replayed';

/** Safe pattern for client-supplied keys: alphanumeric, `_`, `-`, max 128 chars. */
const SAFE_KEY_PATTERN = /^[\w\-]{1,128}$/;

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const DEFAULT_TTL_SECONDS = 24 * 3600;
const DEFAULT_PROCESSING_TTL_SECONDS = 300;
const DEFAULT_KEY_PREFIX = 'quant:idem';
const STORE_TIMEOUT_MS = 2000;
const MEMORY_STORE_MAX_ENTRIES = 10_000;

type StoredEntry =
  | { status: 'processing'; fingerprint: string; startedAt: number }
  | {
      status: 'completed';
      fingerprint: string;
      statusCode: number;
      headers: Record<string, string>;
      body: string;
    };

/**
 * Pluggable idempotency storage. Redis is the production implementation;
 * the in-memory store is the fallback (and the default when no Redis client
 * is configured, mirroring the rate limiter's Redis-or-memory approach).
 */
export interface IdempotencyStore {
  get(key: string): Promise<StoredEntry | null>;
  /**
   * Atomically claim `key` as in-flight. Resolves `true` when this caller won
   * the claim, `false` when the key was already claimed (lost the race).
   */
  claimProcessing(key: string, fingerprint: string, ttlMs: number): Promise<boolean>;
  setCompleted(
    key: string,
    entry: Extract<StoredEntry, { status: 'completed' }>,
    ttlMs: number,
  ): Promise<void>;
  release(key: string): Promise<void>;
  /**
   * Extend the TTL of an in-flight (`processing`) claim the caller owns —
   * the claim heartbeat. Resolves `false` when the key is not a live claim
   * with this fingerprint (someone else's claim is never extended).
   */
  extendProcessing(key: string, fingerprint: string, ttlMs: number): Promise<boolean>;
}

export interface IdempotencyPluginOptions {
  /** Shared Redis connection (the same one the rate limiter uses). */
  redisClient?: Redis;
  /** Custom store (test seam). Overrides `redisClient` when provided. */
  store?: IdempotencyStore;
  /** How long completed responses are replayable. Default: 24h. */
  ttlSeconds?: number;
  /** How long an in-flight claim blocks retries. Default: 5 minutes. */
  processingTtlSeconds?: number;
  /** Redis key namespace. Default: `quant:idem`. */
  keyPrefix?: string;
  /**
   * Fail readiness when required-key routes exist but the store is the
   * per-instance memory fallback. Required-key production deployments must
   * set this: without it a missing Redis/DB silently downgrades the
   * advertised retry guarantee to per-instance. Default: false (opt-in so
   * isolated route unit tests keep working).
   */
  durableStoreRequired?: boolean;
}

interface IdempotencyRequestContext {
  storeKey: string;
  fingerprint: string;
  /**
   * Durable operation id — identical to `storeKey`. Handlers that need the
   * mutation and its outcome to commit atomically pass this to
   * `runIdempotentOperation()`.
   */
  operationId: string;
  /**
   * True when the route runs in transactional mode
   * (`config.idempotencyTransactional`): the preHandler validated the key
   * and attached this context but did NOT claim — the claim happens inside
   * `handleIdempotentTransaction()`'s database transaction.
   */
  transactional: boolean;
  /** Generic-path claim heartbeat; cleared when the response is sent. */
  heartbeat?: NodeJS.Timeout;
}

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * Opt a route into `Idempotency-Key` handling. Prefer the one-line
     * `fastify.idempotency()` helper inside a route file over setting this
     * per route.
     */
    idempotency?: boolean;
    /**
     * Required-key mode (WR-MAIL-104): when true, the route rejects requests
     * with a missing or malformed `Idempotency-Key` with 4xx BEFORE the
     * handler executes. Implies `idempotency: true`. Set per route via
     * `config: { idempotencyRequired: true }`, or file-wide via
     * `fastify.idempotencyRequired()`.
     */
    idempotencyRequired?: boolean;
    /**
     * Transactional mode (fix/qm-idempotency-mail-routes, CODEX-REVIEW on
     * merged #1145): the route's handler owns the idempotency claim via
     * `handleIdempotentTransaction()` (claim + mutation + outcome + outbox in
     * ONE database transaction) instead of the generic preHandler claim. The
     * preHandler still validates the key (required-mode 400s), replays
     * completed outcomes, and answers 409/422 — but it NEVER claims, so the
     * same key is never pre-claimed twice. Routes that set this MUST route
     * their mutation through `handleIdempotentTransaction()`; a context left
     * behind at onSend is logged as an error (loud, not silent).
     */
    idempotencyTransactional?: boolean;
    /**
     * In-flight claim window for this route, in seconds. Default: 5 minutes.
     * Slow handlers (imports, large compose payloads) should declare an
     * honest TTL; the generic path additionally heartbeats the claim while
     * the handler runs, so a live handler's claim can never lapse mid-flight
     * and let a retry double-execute.
     */
    idempotencyProcessingTtlSeconds?: number;
  }

  interface FastifyInstance {
    /**
     * One-line opt-in for a route file: marks every mutating route registered
     * in this encapsulated context as idempotency-aware. Call it at the top of
     * the route plugin, before defining routes.
     */
    idempotency(): void;
    /**
     * One-line required-key opt-in for a route file: marks every mutating
     * route registered in this encapsulated context as requiring a valid
     * `Idempotency-Key` (missing/malformed → 4xx, zero mutation).
     */
    idempotencyRequired(): void;
  }

  interface FastifyRequest {
    idempotencyContext?: IdempotencyRequestContext;
  }
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

/** Bounded in-memory TTL store — fallback when Redis is unavailable. */
export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, { entry: StoredEntry; expiresAt: number }>();

  private evictExpired(now: number): void {
    for (const [key, value] of this.entries) {
      if (value.expiresAt <= now) this.entries.delete(key);
      // Map preserves insertion order; entries are roughly chronological, but
      // TTLs differ, so keep scanning — the map is bounded and small.
    }
  }

  private enforceBound(): void {
    while (this.entries.size > MEMORY_STORE_MAX_ENTRIES) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  async get(key: string): Promise<StoredEntry | null> {
    const now = Date.now();
    const found = this.entries.get(key);
    if (!found) return null;
    if (found.expiresAt <= now) {
      this.entries.delete(key);
      return null;
    }
    return found.entry;
  }

  async claimProcessing(key: string, fingerprint: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    this.evictExpired(now);
    const existing = this.entries.get(key);
    if (existing && existing.expiresAt > now) return false;
    this.entries.set(key, {
      entry: { status: 'processing', fingerprint, startedAt: now },
      expiresAt: now + ttlMs,
    });
    this.enforceBound();
    return true;
  }

  async setCompleted(
    key: string,
    entry: Extract<StoredEntry, { status: 'completed' }>,
    ttlMs: number,
  ): Promise<void> {
    this.evictExpired(Date.now());
    this.entries.set(key, { entry, expiresAt: Date.now() + ttlMs });
    this.enforceBound();
  }

  async release(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async extendProcessing(key: string, fingerprint: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    const found = this.entries.get(key);
    if (!found || found.expiresAt <= now) return false;
    if (found.entry.status !== 'processing' || found.entry.fingerprint !== fingerprint) {
      return false;
    }
    found.expiresAt = now + ttlMs;
    return true;
  }
}

/** Redis-backed store. `claimProcessing` uses `SET … NX` so concurrent
 *  claimants across instances cannot both win. */
export class RedisIdempotencyStore implements IdempotencyStore {
  // NOTE: explicit field + assignment instead of a TS parameter property
  // (`constructor(private readonly redis: Redis)`). This module is imported
  // by `idempotency-realdb-concurrency.worker.ts` inside a raw
  // `node:worker_threads` worker, where Node >= 22.18 strips types natively
  // and REJECTS parameter properties ("not supported in strip-only mode").
  private readonly redis: Redis;
  constructor(redis: Redis) {
    this.redis = redis;
  }

  private async withTimeout<T>(op: Promise<T>, what: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        op,
        new Promise<T>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`idempotency redis ${what} timed out`)),
            STORE_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async get(key: string): Promise<StoredEntry | null> {
    const raw = await this.withTimeout(this.redis.get(key), 'get');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredEntry;
      if (parsed && (parsed.status === 'processing' || parsed.status === 'completed')) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  async claimProcessing(key: string, fingerprint: string, ttlMs: number): Promise<boolean> {
    const value = JSON.stringify({
      status: 'processing',
      fingerprint,
      startedAt: Date.now(),
    });
    const result = await this.withTimeout(
      this.redis.set(key, value, 'PX', Math.max(1, Math.floor(ttlMs)), 'NX'),
      'claim',
    );
    return result === 'OK';
  }

  async setCompleted(
    key: string,
    entry: Extract<StoredEntry, { status: 'completed' }>,
    ttlMs: number,
  ): Promise<void> {
    await this.withTimeout(
      this.redis.set(key, JSON.stringify(entry), 'PX', Math.max(1, Math.floor(ttlMs))),
      'set',
    );
  }

  async release(key: string): Promise<void> {
    await this.withTimeout(this.redis.del(key), 'release');
  }

  async extendProcessing(key: string, fingerprint: string, ttlMs: number): Promise<boolean> {
    // Best-effort ownership check: only extend a live claim we hold. A lost
    // race here merely shortens one heartbeat interval; the next one retries.
    const raw = await this.withTimeout(this.redis.get(key), 'extend-get');
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as StoredEntry;
      if (parsed.status !== 'processing' || parsed.fingerprint !== fingerprint) return false;
    } catch {
      return false;
    }
    const extended = await this.withTimeout(
      this.redis.pexpire(key, Math.max(1, Math.floor(ttlMs))),
      'extend-expire',
    );
    return extended === 1;
  }
}

// ---------------------------------------------------------------------------
// Durable operation ledger (Postgres)
// ---------------------------------------------------------------------------

/** Row states in `idempotency_operations`. `failed` is retryable. */
export type IdempotencyOperationStatus = 'processing' | 'completed' | 'failed';

/**
 * One durable operation row. `responseHeaders` is the JSON text of the
 * stored response headers (TEXT column, not JSONB — keeps this interface
 * structurally compatible with the Prisma delegate without importing the
 * generated client).
 */
export interface IdempotencyOperationRow {
  operationId: string;
  fingerprint: string;
  status: string;
  responseStatus: number | null;
  responseHeaders: string | null;
  responseBody: string | null;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Minimal structural interface over the Prisma `idempotencyOperation`
 * delegate. The real delegate (`prisma.idempotencyOperation`) satisfies it
 * without this module importing `@quant/database`, which keeps the plugin
 * unit-testable without a generated client.
 */
export interface IdempotencyOperationTable {
  create(args: {
    data: {
      operationId: string;
      fingerprint: string;
      status: string;
      responseStatus?: number | null;
      responseHeaders?: string | null;
      responseBody?: string | null;
      expiresAt: Date;
    };
  }): Promise<unknown>;
  findUnique(args: {
    where: { operationId: string };
  }): Promise<IdempotencyOperationRow | null>;
  update(args: {
    where: { operationId: string };
    data: {
      status?: string;
      fingerprint?: string;
      responseStatus?: number | null;
      responseHeaders?: string | null;
      responseBody?: string | null;
      expiresAt?: Date;
    };
  }): Promise<unknown>;
  delete(args: { where: { operationId: string } }): Promise<unknown>;
}

/** Prisma error codes we interpret (stable across Prisma 5/6). */
const PRISMA_UNIQUE_VIOLATION = 'P2002';
const PRISMA_RECORD_NOT_FOUND = 'P2025';

function isPrismaCode(err: unknown, code: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === code
  );
}

/**
 * Postgres-backed `IdempotencyStore`. Claim = INSERT under the primary-key
 * uniqueness constraint, so concurrent claimants on any number of replicas
 * serialize in the database: exactly one wins. Expired claims are cleared
 * lazily on access.
 */
export class DbIdempotencyStore implements IdempotencyStore {
  // NOTE: explicit field + assignment instead of a TS parameter property —
  // see the note on RedisIdempotencyStore above. This class is exercised by
  // the real-database concurrency worker under Node >= 22.18 native
  // type-stripping, which rejects parameter properties.
  private readonly table: IdempotencyOperationTable;
  constructor(table: IdempotencyOperationTable) {
    this.table = table;
  }

  private toEntry(row: IdempotencyOperationRow): StoredEntry | null {
    if (row.expiresAt.getTime() <= Date.now()) return null;
    if (row.status === 'processing') {
      return {
        status: 'processing',
        fingerprint: row.fingerprint,
        startedAt: row.createdAt.getTime(),
      };
    }
    if (row.status === 'completed') {
      let headers: Record<string, string> = {};
      try {
        const parsed: unknown = row.responseHeaders ? JSON.parse(row.responseHeaders) : {};
        if (parsed && typeof parsed === 'object') {
          headers = parsed as Record<string, string>;
        }
      } catch {
        headers = {};
      }
      return {
        status: 'completed',
        fingerprint: row.fingerprint,
        statusCode: row.responseStatus ?? 200,
        headers,
        body: row.responseBody ?? '',
      };
    }
    // 'failed' (or any unknown state) is retryable: treated as absent.
    return null;
  }

  async get(key: string): Promise<StoredEntry | null> {
    const row = await this.table.findUnique({ where: { operationId: key } });
    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) {
      // Lazy expiry: the replay window lapsed; drop the row best-effort.
      await this.table.delete({ where: { operationId: key } }).catch(() => {});
      return null;
    }
    return this.toEntry(row);
  }

  async claimProcessing(key: string, fingerprint: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    try {
      await this.table.create({
        data: {
          operationId: key,
          fingerprint,
          status: 'processing',
          expiresAt: new Date(now + ttlMs),
        },
      });
      return true;
    } catch (err) {
      if (!isPrismaCode(err, PRISMA_UNIQUE_VIOLATION)) throw err;
      // Someone holds the id. A lapsed claim is clearable: drop it and try
      // once more; otherwise the live claim stands and we lost the race.
      const existing = await this.table.findUnique({ where: { operationId: key } });
      if (!existing || existing.expiresAt.getTime() > now) return false;
      await this.table.delete({ where: { operationId: key } }).catch(() => {});
      try {
        await this.table.create({
          data: {
            operationId: key,
            fingerprint,
            status: 'processing',
            expiresAt: new Date(now + ttlMs),
          },
        });
        return true;
      } catch (retryErr) {
        if (!isPrismaCode(retryErr, PRISMA_UNIQUE_VIOLATION)) throw retryErr;
        return false;
      }
    }
  }

  async setCompleted(
    key: string,
    entry: Extract<StoredEntry, { status: 'completed' }>,
    ttlMs: number,
  ): Promise<void> {
    const data = {
      status: 'completed' as const,
      fingerprint: entry.fingerprint,
      responseStatus: entry.statusCode,
      responseHeaders: JSON.stringify(entry.headers),
      responseBody: entry.body,
      expiresAt: new Date(Date.now() + ttlMs),
    };
    try {
      await this.table.update({ where: { operationId: key }, data });
    } catch (err) {
      if (!isPrismaCode(err, PRISMA_RECORD_NOT_FOUND)) throw err;
      // The claim row vanished between claim and completion (e.g. it
      // expired mid-handler). Re-create as completed so the retry that is
      // already past us still replays instead of re-executing.
      await this.table.create({
        data: { operationId: key, ...data },
      });
    }
  }

  async release(key: string): Promise<void> {
    await this.table.delete({ where: { operationId: key } }).catch(() => {});
  }

  async extendProcessing(key: string, fingerprint: string, ttlMs: number): Promise<boolean> {
    // Heartbeat: keep a live handler's claim from lapsing mid-flight (the
    // (c) double-execution window). Read-then-write is fine here — the
    // fingerprint + status check means we never extend a claim we do not
    // hold, and a lost race only shortens one heartbeat interval.
    const row = await this.table.findUnique({ where: { operationId: key } });
    if (!row) return false;
    if (row.expiresAt.getTime() <= Date.now()) return false;
    if (row.status !== 'processing' || row.fingerprint !== fingerprint) return false;
    await this.table.update({
      where: { operationId: key },
      data: { expiresAt: new Date(Date.now() + ttlMs) },
    });
    return true;
  }
}

/**
 * Structural minimum of PrismaClient for `runIdempotentOperation`: the
 * operation table plus `$transaction`. The real PrismaClient satisfies it.
 */
export interface IdempotencyDatabase {
  idempotencyOperation: IdempotencyOperationTable;
  $transaction<T>(
    fn: (tx: { idempotencyOperation: IdempotencyOperationTable }) => Promise<T>,
  ): Promise<T>;
}

/** The mutation outcome a handler commits alongside its idempotency record. */
export interface IdempotentWorkOutcome {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

export type IdempotentResult =
  | { replayed: true; statusCode: number; headers: Record<string, string>; body: string }
  | { replayed: false; statusCode: number; headers: Record<string, string>; body: string };

/**
 * Thrown by `runIdempotentOperation` when the operation id is already owned:
 * 409 `IDEMPOTENCY_IN_FLIGHT` (same fingerprint, still processing) or 422
 * `IDEMPOTENCY_KEY_REUSE` (same id, different fingerprint — the key must
 * identify one logical operation).
 */
export class IdempotencyConflictError extends Error {
  readonly code: 'IDEMPOTENCY_IN_FLIGHT' | 'IDEMPOTENCY_KEY_REUSE';
  readonly statusCode: 409 | 422;

  constructor(
    code: 'IDEMPOTENCY_IN_FLIGHT' | 'IDEMPOTENCY_KEY_REUSE',
    message: string,
  ) {
    super(message);
    this.name = 'IdempotencyConflictError';
    this.code = code;
    this.statusCode = code === 'IDEMPOTENCY_IN_FLIGHT' ? 409 : 422;
  }
}

const MAX_CLAIM_RACES = 3;

function parseStoredHeaders(raw: string | null): Record<string, string> {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string>;
  } catch {
    // fall through
  }
  return {};
}

/**
 * Executes one logical operation with a durable, DB-transactional
 * idempotency guarantee.
 *
 * Contract (this is what closes the PR #1124 P0):
 *  - The SAME `operationId` is reused across timeout, manual retry,
 *    reconnect/restart and offline-outbox replay. A retry after the outcome
 *    committed replays the stored response; the work runs AT MOST once per
 *    committed outcome.
 *  - Claim + `work` + completed-outcome (+ any outbox rows `work` writes via
 *    `tx`) commit in ONE database transaction. There is no separate
 *    outcome-store write that can fail after the mutation: a failure
 *    anywhere rolls the claim back with the mutation, so the claim is NEVER
 *    released while a mutation stands, and a retry after rollback safely
 *    re-executes with zero durable effect from the failed attempt.
 *  - Concurrent claimants on any number of replicas serialize on the
 *    primary key: exactly one executes `work`; the loser reads the winner's
 *    row and replays it (or gets 409 while it is still processing).
 *
 * Rules for `work`: EVERY write it performs MUST go through `tx`. Writes
 * issued on the ambient client escape the transaction and void the atomicity
 * guarantee.
 *
 * Throws `IdempotencyConflictError` (409/422) when the id is owned by a
 * different logical operation or still in flight; rethrows anything `work`
 * threw after rolling back.
 */
export async function runIdempotentOperation(
  db: IdempotencyDatabase,
  opts: {
    operationId: string;
    fingerprint: string;
    /** Replay window for the completed outcome. Default: 24h. */
    ttlMs?: number;
    /** How long the in-flight claim blocks retries. Default: 5 minutes. */
    processingTtlMs?: number;
    work: (tx: { idempotencyOperation: IdempotencyOperationTable }) => Promise<IdempotentWorkOutcome>;
  },
): Promise<IdempotentResult> {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_SECONDS * 1000;
  const processingTtlMs = opts.processingTtlMs ?? DEFAULT_PROCESSING_TTL_SECONDS * 1000;

  for (let attempt = 0; attempt < MAX_CLAIM_RACES; attempt++) {
    const existing = await db.idempotencyOperation.findUnique({
      where: { operationId: opts.operationId },
    });

    if (existing) {
      const now = Date.now();
      const lapsed = existing.expiresAt.getTime() <= now;
      if (lapsed || existing.status === 'failed') {
        // Replay window over (or explicitly failed): clear and start over.
        await db.idempotencyOperation
          .delete({ where: { operationId: opts.operationId } })
          .catch(() => {});
        continue;
      }
      if (existing.status === 'completed') {
        if (existing.fingerprint !== opts.fingerprint) {
          throw new IdempotencyConflictError(
            'IDEMPOTENCY_KEY_REUSE',
            'This operation id was already used for a different request. Use a new id for a new operation.',
          );
        }
        return {
          replayed: true,
          statusCode: existing.responseStatus ?? 200,
          headers: parseStoredHeaders(existing.responseHeaders),
          body: existing.responseBody ?? '',
        };
      }
      // Still processing: same logical operation → wait-and-retry; anything
      // else is a key collision on a different operation.
      if (existing.fingerprint !== opts.fingerprint) {
        throw new IdempotencyConflictError(
          'IDEMPOTENCY_KEY_REUSE',
          'This operation id was already used for a different request. Use a new id for a new operation.',
        );
      }
      throw new IdempotencyConflictError(
        'IDEMPOTENCY_IN_FLIGHT',
        'A request with this operation id is already being processed. Wait and retry.',
      );
    }

    try {
      return await db.$transaction(async (tx) => {
        // Claim INSIDE the transaction: concurrent transactions serialize on
        // the primary key — exactly one wins; the loser blocks, then sees
        // the winner's committed row (or a clean slate after rollback).
        await tx.idempotencyOperation.create({
          data: {
            operationId: opts.operationId,
            fingerprint: opts.fingerprint,
            status: 'processing',
            expiresAt: new Date(Date.now() + processingTtlMs),
          },
        });
        const outcome = await opts.work(tx);
        const headers = outcome.headers ?? {};
        await tx.idempotencyOperation.update({
          where: { operationId: opts.operationId },
          data: {
            status: 'completed',
            responseStatus: outcome.statusCode,
            responseHeaders: JSON.stringify(headers),
            responseBody: outcome.body,
            expiresAt: new Date(Date.now() + ttlMs),
          },
        });
        return {
          replayed: false as const,
          statusCode: outcome.statusCode,
          headers,
          body: outcome.body,
        };
      });
    } catch (err) {
      if (err instanceof IdempotencyConflictError) throw err;
      if (!isPrismaCode(err, PRISMA_UNIQUE_VIOLATION)) throw err;
      // Lost the claim race inside the transaction: loop around and
      // interpret the winner's row (replay / 409 / 422).
    }
  }
  throw new Error(
    `idempotency: claim race did not settle after ${MAX_CLAIM_RACES} attempts for ${opts.operationId}`,
  );
}

/**
 * The transaction client `handleIdempotentTransaction` hands to route
 * handlers. At runtime it is the database's real transaction client; the
 * structural type keeps this module free of the generated Prisma client (see
 * `IdempotencyOperationTable`). Routes cast it to their client type
 * (`tx as unknown as PrismaClient`) — the same cast convention the mail
 * routes already use for `VersionedTx`.
 */
export type IdempotentTx = {
  idempotencyOperation: IdempotencyOperationTable;
} & Record<string, unknown>;

/**
 * In-flight claim window for transactional mail routes. The claim is
 * inserted INSIDE the same database transaction as the mutation, so it is
 * invisible to concurrent claimants until commit: a same-key request that
 * arrives mid-transaction blocks on the operation primary key and then
 * replays the committed outcome (or proceeds after a rollback) — it can
 * never steal a "lapsed" claim and double-execute. The TTL is therefore
 * hygiene, not a safety bound; 15 minutes comfortably covers the slowest
 * mail handler (large compose payloads) without pretending to bound them.
 */
export const TRANSACTIONAL_PROCESSING_TTL_MS = 15 * 60 * 1000;

/**
 * Runs a transactional-mode route handler's mutation through
 * `runIdempotentOperation()` using the validated idempotency context the
 * preHandler attached. USE ONLY on routes with
 * `config: { idempotencyRequired: true, idempotencyTransactional: true }`
 * (the preHandler validates the key and attaches the context but never
 * claims for those routes — claiming here is the single ownership point).
 *
 * The handler's `work` receives the transaction client: EVERY write it
 * performs MUST go through `tx`. Writes issued on the ambient client escape
 * the transaction and void the atomicity guarantee.
 *
 * Sends the response itself (including the `Idempotent-Replayed` header on
 * replays); the stored body is the exact JSON string of the original
 * response, so a replay is byte-identical. A 409/422 from the helper is
 * rendered as the matching error envelope; anything `work` threw (after
 * rollback) propagates to the error handler, and the key is released so the
 * client can retry the same logical operation with the same key.
 */
export async function handleIdempotentTransaction(
  request: FastifyRequest,
  reply: FastifyReply,
  db: IdempotencyDatabase,
  opts: {
    /** In-flight claim window. Default: `TRANSACTIONAL_PROCESSING_TTL_MS`. */
    processingTtlMs?: number;
    work: (tx: IdempotentTx) => Promise<{ statusCode: number; payload: unknown }>;
  },
): Promise<void> {
  const ctx = request.idempotencyContext;
  if (!ctx?.transactional) {
    throw new Error(
      '[idempotency] handleIdempotentTransaction requires a route with ' +
        '`config: { idempotencyTransactional: true }` — the preHandler validates ' +
        'the key and attaches the context it consumes.',
    );
  }

  let result: IdempotentResult;
  try {
    result = await runIdempotentOperation(db, {
      operationId: ctx.operationId,
      fingerprint: ctx.fingerprint,
      processingTtlMs: opts.processingTtlMs ?? TRANSACTIONAL_PROCESSING_TTL_MS,
      work: async (tx) => {
        const { statusCode, payload } = await opts.work(tx as IdempotentTx);
        return {
          statusCode,
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body: JSON.stringify(payload),
        };
      },
    });
  } catch (err) {
    if (err instanceof IdempotencyConflictError) {
      if (err.code === 'IDEMPOTENCY_IN_FLIGHT') void reply.header('Retry-After', '1');
      await reply.code(err.statusCode).send({
        success: false,
        error: { code: err.code, message: err.message },
      });
      return;
    }
    throw err;
  }

  // Consumed: the onSend guard treats a lingering transactional context as
  // "handler forgot the helper" and logs an error.
  request.idempotencyContext = undefined;
  if (result.replayed) void reply.header(IDEMPOTENT_REPLAYED_HEADER, 'true');
  const contentType = result.headers['content-type'];
  if (contentType) void reply.header('content-type', contentType);
  // The stored body is the exact JSON string Fastify serialized for the
  // original response: send it verbatim (a string payload is not
  // re-serialized) so a replay is byte-identical.
  await reply.code(result.statusCode).send(result.body);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stableFingerprint(request: FastifyRequest): string {
  let bodyPart = '';
  try {
    bodyPart = JSON.stringify(request.body ?? null) ?? '';
  } catch {
    bodyPart = '';
  }
  // Multipart/file uploads don't stringify deterministically; fold the
  // content headers in so a different payload can't silently reuse a key.
  const contentType = request.headers['content-type'] ?? '';
  const contentLength = request.headers['content-length'] ?? '';
  return createHash('sha256')
    .update(`${contentType}\n${contentLength}\n${bodyPart}`)
    .digest('hex');
}

function storeKeyFor(prefix: string, request: FastifyRequest, key: string): string {
  const auth = (request as unknown as { auth?: { userId?: string } }).auth;
  const userId = auth?.userId && typeof auth.userId === 'string' ? auth.userId : 'anonymous';
  // Scope per user + route so a key can never leak across users or endpoints.
  const routePath = request.routeOptions?.url ?? request.url.split('?')[0] ?? 'unknown';
  return `${prefix}:${userId}:${request.method}:${routePath}:${key}`;
}

function keyReuseError(reply: FastifyReply): FastifyReply {
  return reply.code(422).send({
    success: false,
    error: {
      code: 'IDEMPOTENCY_KEY_REUSE',
      message:
        'This Idempotency-Key was already used for a different request. ' +
        'Use a new key for a new operation.',
    },
  });
}

function inFlightError(reply: FastifyReply): FastifyReply {
  void reply.header('Retry-After', '1');
  return reply.code(409).send({
    success: false,
    error: {
      code: 'IDEMPOTENCY_IN_FLIGHT',
      message:
        'A request with this Idempotency-Key is already being processed. ' +
        'Wait and retry, or poll for the result.',
    },
  });
}

function storeUnavailable(reply: FastifyReply): FastifyReply {
  // Fail closed: never execute a keyed request unguarded.
  return reply.code(503).send({
    success: false,
    error: {
      code: 'IDEMPOTENCY_STORE_UNAVAILABLE',
      message:
        'The idempotency store is unavailable, so this request cannot be ' +
        'executed safely. Please retry shortly.',
    },
  });
}

function keyRequiredError(reply: FastifyReply): FastifyReply {
  // WR-MAIL-104: required-key routes fail BEFORE handler execution — the
  // caller must supply a client-generated key for every mutating call.
  return reply.code(400).send({
    success: false,
    error: {
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      message:
        'This operation requires an Idempotency-Key request header. ' +
        'Generate a unique key per operation (e.g. a UUID) and send it with ' +
        'every mutating request.',
    },
  });
}

function keyInvalidError(reply: FastifyReply): FastifyReply {
  return reply.code(400).send({
    success: false,
    error: {
      code: 'IDEMPOTENCY_KEY_INVALID',
      message:
        'The Idempotency-Key header is malformed. Keys must be 1-128 ' +
        'characters: letters, digits, `_` or `-`.',
    },
  });
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

async function idempotencyPlugin(fastify: FastifyInstance, opts: IdempotencyPluginOptions) {
  const ttlMs = (opts.ttlSeconds ?? DEFAULT_TTL_SECONDS) * 1000;
  const prefix = opts.keyPrefix ?? DEFAULT_KEY_PREFIX;
  const store: IdempotencyStore =
    opts.store ?? (opts.redisClient ? new RedisIdempotencyStore(opts.redisClient) : new MemoryIdempotencyStore());

  // Tracks whether any route requires an Idempotency-Key, so
  // `durableStoreRequired` can fail readiness instead of silently running a
  // required-key deployment on the per-instance memory fallback.
  let requiredKeyRouteSeen = false;
  fastify.addHook('onRoute', (routeOptions) => {
    const config = routeOptions.config as { idempotencyRequired?: boolean } | undefined;
    if (config?.idempotencyRequired === true) requiredKeyRouteSeen = true;
  });

  if (opts.durableStoreRequired === true) {
    fastify.addHook('onReady', async () => {
      if (requiredKeyRouteSeen && store instanceof MemoryIdempotencyStore) {
        throw new Error(
          '[idempotency] durableStoreRequired: required-key routes are registered ' +
            'but the store is the per-instance memory fallback, which cannot serialize ' +
            'two replicas and loses every claim on restart. Configure the durable ' +
            'DbIdempotencyStore (Postgres idempotency_operations) or a shared Redis ' +
            'before serving required-key traffic.',
        );
      }
    });
  }

  // One-line opt-in for route files. Runs inside the caller's encapsulated
  // context, so only routes registered in that file are marked.
  fastify.decorate('idempotency', function (this: FastifyInstance) {
    this.addHook('onRoute', (routeOptions) => {
      routeOptions.config = { ...(routeOptions.config as object | undefined), idempotency: true };
    });
  });
  // One-line required-key opt-in for route files. Implies idempotency.
  fastify.decorate('idempotencyRequired', function (this: FastifyInstance) {
    this.addHook('onRoute', (routeOptions) => {
      routeOptions.config = {
        ...(routeOptions.config as object | undefined),
        idempotency: true,
        idempotencyRequired: true,
      };
    });
  });
  // Claim heartbeats for the generic path: a timer per in-flight request that
  // extends the claim's TTL while the handler runs. Cleared in onSend (and,
  // as a backstop for hijacked replies, in onResponse).
  const heartbeatTimers = new WeakMap<FastifyRequest, NodeJS.Timeout>();

  function stopHeartbeat(request: FastifyRequest): void {
    const timer = heartbeatTimers.get(request);
    if (timer) {
      clearInterval(timer);
      heartbeatTimers.delete(request);
    }
    const ctx = request.idempotencyContext;
    if (ctx?.heartbeat) {
      clearInterval(ctx.heartbeat);
      ctx.heartbeat = undefined;
    }
  }

  function startHeartbeat(
    request: FastifyRequest,
    fingerprint: string,
    sKey: string,
    ttlMs: number,
  ): void {
    // Extend at ~1/3 of the TTL so a single missed beat never lapses the
    // claim; the 60s cap keeps the steady-state write rate trivial.
    const everyMs = Math.min(60_000, Math.max(250, Math.floor(ttlMs / 3)));
    const timer = setInterval(() => {
      store.extendProcessing(sKey, fingerprint, ttlMs).catch((err) => {
        request.log.warn(
          { err, operationId: sKey },
          'idempotency claim heartbeat failed; claim may lapse mid-handler',
        );
      });
    }, everyMs);
    heartbeatTimers.set(request, timer);
    const ctx = request.idempotencyContext;
    if (ctx) ctx.heartbeat = timer;
  }

  fastify.addHook('onResponse', async (request: FastifyRequest) => {
    stopHeartbeat(request);
  });

  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const config = request.routeOptions?.config as
      | {
          idempotency?: boolean;
          idempotencyRequired?: boolean;
          idempotencyTransactional?: boolean;
          idempotencyProcessingTtlSeconds?: number;
        }
      | undefined;
    // `idempotencyRequired: true` implies enabled, so per-route config works
    // even in files that never called fastify.idempotency().
    if (config?.idempotency !== true && config?.idempotencyRequired !== true) return;
    if (!MUTATING_METHODS.has(request.method)) return;

    // Per-route claim window (honest TTL for slow handlers) > plugin
    // default > 5-minute built-in.
    const routeTtlMs =
      (config?.idempotencyProcessingTtlSeconds ?? opts.processingTtlSeconds ?? DEFAULT_PROCESSING_TTL_SECONDS) *
      1000;

    const rawKey = request.headers[IDEMPOTENCY_KEY_HEADER];
    const key = typeof rawKey === 'string' ? rawKey : undefined;

    if (config?.idempotencyRequired === true) {
      // WR-MAIL-104 required-key semantics: missing or malformed key fails
      // BEFORE the handler executes — zero mutation, honest 4xx.
      if (!key) {
        keyRequiredError(reply);
        return;
      }
      if (!SAFE_KEY_PATTERN.test(key)) {
        keyInvalidError(reply);
        return;
      }
    } else if (!key || !SAFE_KEY_PATTERN.test(key)) {
      // No (or malformed) key → plain execution; idempotency is strictly
      // opt-in per request as well as per route in honor-key-if-present mode.
      return;
    }

    const fingerprint = stableFingerprint(request);
    const sKey = storeKeyFor(prefix, request, key);

    let existing: StoredEntry | null;
    try {
      existing = await store.get(sKey);
    } catch (err) {
      request.log.error({ err }, 'idempotency store get failed');
      storeUnavailable(reply);
      return;
    }

    if (existing?.status === 'completed') {
      if (existing.fingerprint !== fingerprint) {
        keyReuseError(reply);
        return;
      }
      request.log.info('idempotent replay');
      void reply.header(IDEMPOTENT_REPLAYED_HEADER, 'true');
      const contentType = existing.headers['content-type'];
      if (contentType) void reply.header('content-type', contentType);
      await reply.code(existing.statusCode).send(existing.body);
      return;
    }

    if (existing?.status === 'processing') {
      if (existing.fingerprint !== fingerprint) {
        keyReuseError(reply);
        return;
      }
      inFlightError(reply);
      return;
    }

    if (config?.idempotencyTransactional === true) {
      // Transactional ownership (fix/qm-idempotency-mail-routes): the handler
      // claims inside runIdempotentOperation's database transaction via
      // handleIdempotentTransaction(). NEVER pre-claim here — a pre-claimed
      // key would make the helper see our own 'processing' row and answer
      // 409 IDEMPOTENCY_IN_FLIGHT to the first attempt. A concurrent
      // same-key request that also reaches its handler serializes on the
      // operation primary key inside the helper: exactly one executes.
      request.idempotencyContext = {
        storeKey: sKey,
        fingerprint,
        operationId: sKey,
        transactional: true,
      };
      return;
    }

    let claimed: boolean;
    try {
      claimed = await store.claimProcessing(sKey, fingerprint, routeTtlMs);
    } catch (err) {
      request.log.error({ err }, 'idempotency store claim failed');
      storeUnavailable(reply);
      return;
    }
    if (!claimed) {
      // Lost a concurrent race for the same key.
      inFlightError(reply);
      return;
    }

    request.idempotencyContext = {
      storeKey: sKey,
      fingerprint,
      operationId: sKey,
      transactional: false,
    };
    // (c): a live handler's claim must never lapse mid-flight — without the
    // heartbeat, a handler slower than the claim TTL lets a retry reclaim the
    // key and execute the mutation a second time.
    startHeartbeat(request, fingerprint, sKey, routeTtlMs);
  });

  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const ctx = request.idempotencyContext;
    if (!ctx) return payload;
    // The handler is done: a live handler's claim no longer needs heartbeats.
    stopHeartbeat(request);
    // Capture once; a replayed response never reaches here with a context.
    request.idempotencyContext = undefined;

    if (ctx.transactional) {
      // Fail-closed signal: a transactional route whose handler never
      // consumed this context through handleIdempotentTransaction() executed
      // its mutation with NO idempotency claim at all. Loud error, never
      // silent acceptance.
      request.log.error(
        { operationId: ctx.operationId, route: request.routeOptions?.url },
        'idempotencyTransactional route completed without handleIdempotentTransaction — mutation ran unguarded',
      );
      return payload;
    }

    try {
      if (reply.statusCode >= 200 && reply.statusCode < 300 && typeof payload === 'string') {
        const headers: Record<string, string> = {};
        const contentType = reply.getHeader('content-type');
        if (typeof contentType === 'string') headers['content-type'] = contentType;
        await store.setCompleted(
          ctx.storeKey,
          {
            status: 'completed',
            fingerprint: ctx.fingerprint,
            statusCode: reply.statusCode,
            headers,
            body: payload,
          },
          ttlMs,
        );
      } else {
        // Non-2xx (or non-serialisable payload): release the key so the client
        // can retry the same logical operation with the same key.
        await store.release(ctx.storeKey);
      }
    } catch (err) {
      // P0 fix (CODEX-REVIEW on PR #1124): a failed outcome write MUST NOT
      // release the claim. The mutation may already be committed; releasing
      // would let a retry execute it a second time. Keep the 'processing'
      // claim (TTL-bounded) so a retry gets 409 IDEMPOTENCY_IN_FLIGHT
      // instead of a second execution. With the durable DbIdempotencyStore
      // the authoritative record survives regardless; handlers that need the
      // outcome atomic with the mutation use runIdempotentOperation().
      request.log.error(
        { err, operationId: ctx.operationId },
        'idempotency outcome store write failed; claim retained, retry will see in-flight',
      );
    }
    return payload;
  });
}

export default fp(idempotencyPlugin, {
  name: 'idempotency',
});

/**
 * One-line opt-in for route files: `enableIdempotency(fastify);` at the top of
 * the route plugin. Marks every mutating route registered afterwards in that
 * encapsulated context as idempotency-aware (honor-key-if-present).
 *
 * Safe to call when the plugin is not registered (e.g. isolated route unit
 * tests that build a bare Fastify instance): it no-ops instead of throwing.
 */
export function enableIdempotency(fastify: FastifyInstance): void {
  if (typeof fastify.idempotency === 'function') {
    fastify.idempotency();
  }
}

/**
 * One-line REQUIRED-key opt-in for route files: `requireIdempotency(fastify);`
 * at the top of the route plugin. Marks every mutating route registered
 * afterwards in that encapsulated context as requiring a valid
 * `Idempotency-Key` — missing/malformed keys are rejected with 4xx BEFORE the
 * handler executes (WR-MAIL-104). Use for route files whose routes are all
 * active catalog commands; otherwise prefer per-route
 * `config: { idempotencyRequired: true }`.
 *
 * Safe to call when the plugin is not registered: it no-ops instead of
 * throwing.
 */
export function requireIdempotency(fastify: FastifyInstance): void {
  if (typeof fastify.idempotencyRequired === 'function') {
    fastify.idempotencyRequired();
  }
}
