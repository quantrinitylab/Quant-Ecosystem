// ============================================================================
// @quant/queue — Redis PubSub publisher for CI build log streaming
// fix/qm-ci-logs-redis-publish
// ============================================================================
//
// PURPOSE
//   The ci-runner's LogStreamer batches build stdout/stderr and publishes to
//   `channel:ci:build:<buildId>:logs`, which the QuantMail backend's
//   /api/ci/builds/:id/logs SSE endpoint subscribes to. The LogStreamer
//   accepts any `RedisLogPublisher`; this factory builds the production one
//   on top of this package's own ioredis dependency (no new dependencies, no
//   lockfile churn).
//
//   Env contract mirrors the rest of the repo (ci-logs.ts, ci-run-events.ts):
//     REDIS_URL wins; otherwise redis://REDIS_HOST:REDIS_PORT (localhost:6379).
//
//   Connection failures reject the publish promise (never hang, never throw
//   synchronously); the LogStreamer swallows publish errors by design so a
//   dead Redis degrades to "no live stream" instead of failing the build.
// ============================================================================
import Redis from 'ioredis';

/** Minimal publisher surface (structural — matches the ci-runner LogStreamer seam). */
export interface LogRedisPublisher {
  publish(channel: string, message: string): Promise<number>;
  close(): Promise<void>;
}

export interface LogRedisPublisherOptions {
  /** Full redis:// URL. Overrides REDIS_URL and host/port. */
  url?: string;
  /** Overrides REDIS_HOST. */
  host?: string;
  /** Overrides REDIS_PORT. */
  port?: number;
  /** TCP connect timeout in ms (default 5000). Lower it in tests. */
  connectTimeoutMs?: number;
}

type EnvLike = Record<string, string | undefined>;

const DEFAULT_CONNECT_TIMEOUT_MS = 5000;

/**
 * Resolve the Redis URL from explicit overrides, then env. Pure and unit-testable.
 */
export function resolveLogRedisUrl(
  env: EnvLike,
  overrides: Pick<LogRedisPublisherOptions, 'url' | 'host' | 'port'> = {},
): string {
  if (overrides.url) return overrides.url;
  const envUrl = env['REDIS_URL'];
  if (envUrl) return envUrl;
  const host = overrides.host ?? env['REDIS_HOST'] ?? 'localhost';
  const port = overrides.port ?? Number(env['REDIS_PORT'] ?? 6379);
  return `redis://${host}:${port}`;
}

/**
 * Create a lazily-connecting Redis publisher. The first publish connects;
 * a dropped connection reconnects on the next publish (bounded retries).
 */
export function createLogRedisPublisher(
  options: LogRedisPublisherOptions = {},
  env: EnvLike = process.env,
): LogRedisPublisher {
  const url = resolveLogRedisUrl(env, options);
  const redis = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 2,
    connectTimeout: options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    // Bounded reconnects: after a few attempts give up so a dead Redis
    // surfaces as a rejected publish instead of hanging the worker.
    retryStrategy: (times: number) => (times > 3 ? null : Math.min(times * 200, 2000)),
  });

  // ioredis emits 'error' on failed connects; without a listener the
  // EventEmitter throws and would take down the worker process.
  redis.on('error', () => {
    /* publish() surfaces the failure to the caller; nothing to do here */
  });

  let connecting: Promise<void> | null = null;
  const ensureConnected = (): Promise<void> => {
    if (redis.status === 'ready') return Promise.resolve();
    if (!connecting) {
      connecting = redis.connect().then(
        () => undefined,
        (err: unknown) => {
          connecting = null; // allow the next publish to retry
          throw err;
        },
      );
    }
    return connecting;
  };

  return {
    async publish(channel: string, message: string): Promise<number> {
      await ensureConnected();
      return redis.publish(channel, message);
    },
    async close(): Promise<void> {
      connecting = null;
      redis.disconnect();
    },
  };
}
