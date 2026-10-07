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
}

interface IdempotencyRequestContext {
  storeKey: string;
  fingerprint: string;
}

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * Opt a route into `Idempotency-Key` handling. Prefer the one-line
     * `fastify.idempotency()` helper inside a route file over setting this
     * per route.
     */
    idempotency?: boolean;
  }

  interface FastifyInstance {
    /**
     * One-line opt-in for a route file: marks every mutating route registered
     * in this encapsulated context as idempotency-aware. Call it at the top of
     * the route plugin, before defining routes.
     */
    idempotency(): void;
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
}

/** Redis-backed store. `claimProcessing` uses `SET … NX` so concurrent
 *  claimants across instances cannot both win. */
export class RedisIdempotencyStore implements IdempotencyStore {
  constructor(private readonly redis: Redis) {}

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

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

async function idempotencyPlugin(fastify: FastifyInstance, opts: IdempotencyPluginOptions) {
  const ttlMs = (opts.ttlSeconds ?? DEFAULT_TTL_SECONDS) * 1000;
  const processingTtlMs = (opts.processingTtlSeconds ?? DEFAULT_PROCESSING_TTL_SECONDS) * 1000;
  const prefix = opts.keyPrefix ?? DEFAULT_KEY_PREFIX;
  const store: IdempotencyStore =
    opts.store ?? (opts.redisClient ? new RedisIdempotencyStore(opts.redisClient) : new MemoryIdempotencyStore());

  // One-line opt-in for route files. Runs inside the caller's encapsulated
  // context, so only routes registered in that file are marked.
  fastify.decorate('idempotency', function (this: FastifyInstance) {
    this.addHook('onRoute', (routeOptions) => {
      routeOptions.config = { ...(routeOptions.config as object | undefined), idempotency: true };
    });
  });
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const config = request.routeOptions?.config as { idempotency?: boolean } | undefined;
    if (config?.idempotency !== true) return;
    if (!MUTATING_METHODS.has(request.method)) return;

    const rawKey = request.headers[IDEMPOTENCY_KEY_HEADER];
    const key = typeof rawKey === 'string' ? rawKey : undefined;
    // No (or malformed) key → plain execution; idempotency is strictly opt-in
    // per request as well as per route.
    if (!key || !SAFE_KEY_PATTERN.test(key)) return;

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

    let claimed: boolean;
    try {
      claimed = await store.claimProcessing(sKey, fingerprint, processingTtlMs);
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

    request.idempotencyContext = { storeKey: sKey, fingerprint };
  });

  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const ctx = request.idempotencyContext;
    if (!ctx) return payload;
    // Capture once; a replayed response never reaches here with a context.
    request.idempotencyContext = undefined;

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
      request.log.error({ err }, 'idempotency store write failed; releasing key');
      try {
        await store.release(ctx.storeKey);
      } catch {
        // Best effort — the processing claim expires on its own TTL.
      }
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
 * encapsulated context as idempotency-aware.
 *
 * Safe to call when the plugin is not registered (e.g. isolated route unit
 * tests that build a bare Fastify instance): it no-ops instead of throwing.
 */
export function enableIdempotency(fastify: FastifyInstance): void {
  if (typeof fastify.idempotency === 'function') {
    fastify.idempotency();
  }
}
