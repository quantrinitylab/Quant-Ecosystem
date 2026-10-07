/**
 * QuantMail dependency-health wiring (K12 — reliability).
 *
 * Declares the 12 spec'd dependencies from
 * `docs/quant-architecture/products/quantmail/backend/health-dependencies.md`
 * against the shared {@link DependencyRegistry} from `@quant/server-core`.
 *
 * Honesty contract (no invented health data):
 * - postgres: real `SELECT 1` round-trip with measured latency.
 * - redis: real `PING` over a lazily-created client, only when `REDIS_URL` is
 *   set; otherwise `not_configured`.
 * - kafka / search-index / qdrant / imap: not wired in this deployment, so
 *   they report `not_configured` — never fake-healthy.
 * - object-storage / smtp: configured via env but with no cheap live probe in
 *   scope, so they report `unknown` when configured.
 * - calendar / drive / contacts / quanty-runtime: in-process modules
 *   (`kind: 'internal'`) — explicitly labelled as such, not as remote health.
 *
 * Every dependency carries its declared degraded-mode behavior (spec M16).
 */
import { DependencyRegistry, type DependencyDefinition } from '@quant/server-core';
import Redis from 'ioredis';

interface PrismaProbe {
  $queryRawUnsafe: (query: string) => Promise<unknown>;
}

export interface QuantMailDependencyOptions {
  prisma: PrismaProbe;
  redisUrl?: string;
}

/**
 * Process-wide lazily-created Redis probe client. Created only when REDIS_URL
 * is configured; a single idle connection per backend process. Fail-fast
 * options so a dead Redis fails the probe instead of hanging it — the
 * registry's probe timeout is the final backstop.
 */
let redisProbeClient: Redis | null = null;

function getRedisProbeClient(redisUrl: string): Redis {
  if (!redisProbeClient) {
    redisProbeClient = new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: 1500,
      maxRetriesPerRequest: 0,
    });
    redisProbeClient.on('error', () => {
      // Swallowed: probe failures are reported via the health endpoint, and an
      // unhandled 'error' event would crash the process.
    });
  }
  return redisProbeClient;
}

/** Test seam: drop the cached probe client between tests. */
export function __resetRedisProbeClientForTests(): void {
  const client = redisProbeClient;
  redisProbeClient = null;
  try {
    client?.disconnect();
  } catch {
    // ignore
  }
}

function internalDep(name: string, degradedMode: string): DependencyDefinition {
  return {
    name,
    kind: 'internal',
    configured: true,
    degradedMode,
    // In-process module: no remote endpoint exists to probe. The explicit
    // kind/detail labelling is the honest representation — not remote health.
    probe: async () => ({ ok: true, detail: 'in-process module; shares process health' }),
  };
}

export function createQuantMailDependencyRegistry(
  opts: QuantMailDependencyOptions,
): DependencyRegistry {
  const registry = new DependencyRegistry();
  const { prisma, redisUrl } = opts;

  const sesConfigured = Boolean(
    process.env['SES_ACCESS_KEY_ID'] && process.env['SES_REGION'] && process.env['SES_SECRET_ACCESS_KEY'],
  );
  const objectStorageConfigured = Boolean(process.env['S3_BUCKET']);

  const defs: DependencyDefinition[] = [
    {
      name: 'postgres',
      kind: 'external',
      configured: true,
      degradedMode:
        'API cannot serve reads or writes; /readyz reports unavailable; inbox, thread and send flows fail fast with 503.',
      latencyDegradedMs: 500,
      breaker: { failureThreshold: 3, resetTimeoutMs: 15_000 },
      probe: async () => {
        await prisma.$queryRawUnsafe('SELECT 1');
        return { ok: true };
      },
    },
    {
      name: 'redis',
      kind: 'external',
      configured: Boolean(redisUrl),
      degradedMode:
        'Rate limiting falls back to in-memory; BullMQ outbound queue falls back to synchronous send; idempotency keys disabled (client retries may duplicate).',
      latencyDegradedMs: 200,
      breaker: { failureThreshold: 3, resetTimeoutMs: 15_000 },
      ...(redisUrl
        ? {
            probe: async () => {
              const pong = await getRedisProbeClient(redisUrl).ping();
              return { ok: pong === 'PONG', detail: pong === 'PONG' ? undefined : `unexpected PING reply: ${pong}` };
            },
          }
        : {}),
    },
    {
      name: 'kafka',
      kind: 'external',
      configured: false,
      degradedMode:
        'Event relay disabled; the Postgres outbox table remains the durable event log for future consumers (outbox spine, Phase 1).',
    },
    {
      name: 'search-index',
      kind: 'external',
      configured: false,
      degradedMode:
        'No dedicated search cluster wired; search runs on Postgres full-text/trigram queries without vector ranking.',
    },
    {
      name: 'qdrant',
      kind: 'external',
      configured: false,
      degradedMode:
        'Semantic memory / vector similarity features disabled; keyword search only.',
    },
    {
      name: 'object-storage',
      kind: 'external',
      configured: objectStorageConfigured,
      degradedMode:
        'Attachment upload/download fails with a clear error; drafts still autosave without attachments.',
      // Configured via S3_BUCKET, but no S3 client is in scope here to run a
      // live probe against — honestly reported as `unknown`, not healthy.
    },
    {
      name: 'smtp',
      kind: 'external',
      configured: sesConfigured,
      degradedMode:
        'Outbound mail stays queued in BullMQ with retry/backoff; senders see the message as queued, not failed.',
      // AWS SES credentials configured, but no live SES probe (no SES client
      // in scope) — honestly reported as `unknown`, not healthy.
    },
    {
      name: 'imap',
      kind: 'external',
      configured: false,
      degradedMode:
        'External mailbox import/sync for connected accounts pauses; QuantMail-native mail is unaffected.',
    },
    internalDep(
      'calendar',
      'Calendar routes return 503; mail flows are unaffected.',
    ),
    internalDep(
      'drive',
      'Drive routes return 503; already-stored attachments remain downloadable via direct links.',
    ),
    internalDep(
      'contacts',
      'Contact autocomplete falls back to recent recipients derived from mail headers.',
    ),
    internalDep(
      'quanty-runtime',
      'Quanty task submission is rejected with 503; core mail flows are unaffected.',
    ),
  ];

  for (const def of defs) registry.register(def);
  return registry;
}

/** The 12 spec'd dependency names, in spec order. */
export const QUANTMAIL_DEPENDENCY_NAMES = [
  'postgres',
  'redis',
  'kafka',
  'search-index',
  'qdrant',
  'object-storage',
  'smtp',
  'imap',
  'calendar',
  'drive',
  'contacts',
  'quanty-runtime',
] as const;
