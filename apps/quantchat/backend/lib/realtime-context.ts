// ============================================================================
// QuantChat — Shared realtime context (backplane + presence + Redis)
// ============================================================================
//
// The realtime backplane and presence manager were previously created INSIDE
// the websocket route plugin, which made them unreachable by the DeliveryWorker
// (W3) that also needs them to fan HTTP-posted messages to online recipients
// and to push offline ones. This factory centralises their creation so the
// websocket layer AND the DeliveryWorker share the SAME backplane + presence
// instances (one Redis client, one presence ZSET, one set of channel
// subscriptions) — the single source of truth required for at-least-once
// delivery across the cluster.
//
// With REDIS_URL set the backplane/presence are Redis-backed (cross-instance);
// without it they fall back to single-node in-memory behaviour so local dev and
// tests run with no external dependency.
// ============================================================================

import Redis from 'ioredis';
import { PresenceManager } from '@quant/realtime/presence';
import {
  InProcessBackplane,
  RedisRealtimeBackplane,
  backplaneRetryStrategy,
  type RealtimeBackplane,
} from '../services/realtime-backplane';

/** Minimal logger surface used for backplane/presence diagnostics. */
export interface RealtimeContextLogger {
  error: (obj: unknown, msg?: string) => void;
  warn: (msg: string) => void;
  info: (msg: string) => void;
}

/** The shared realtime primitives decorated onto the app. */
export interface RealtimeContext {
  /** The Redis client backing the backplane + presence, or null in single-node mode. */
  redis: Redis | null;
  /** Cross-instance realtime fan-out (Redis pub/sub, or in-process no-op). */
  backplane: RealtimeBackplane;
  /** Cluster-wide presence (Redis ZSET, or in-memory single-node). */
  presence: PresenceManager;
}

/**
 * Create the shared realtime context. Uses the Redis-backed backplane/presence
 * when `REDIS_URL` is configured (with bounded exponential-backoff reconnect),
 * otherwise the single-node in-process fallbacks. ioredis owns reconnection;
 * `maxRetriesPerRequest: null` keeps individual commands from erroring mid-outage.
 */
export function createRealtimeContext(log?: RealtimeContextLogger): RealtimeContext {
  const redisUrl = process.env['REDIS_URL'];
  let redis: Redis | null = null;
  let backplane: RealtimeBackplane;

  if (redisUrl) {
    redis = new Redis(redisUrl, {
      lazyConnect: false,
      maxRetriesPerRequest: null,
      retryStrategy: (times: number) => backplaneRetryStrategy(times),
    });
    redis.on('error', (err: Error) => {
      log?.error({ err }, 'realtime backplane Redis connection error');
    });
    const redisBackplane = new RedisRealtimeBackplane(redis);
    redisBackplane.onHealthChange((healthy: boolean) => {
      if (healthy) {
        log?.info('realtime backplane connected; cross-instance fan-out healthy');
      } else {
        log?.warn(
          'realtime backplane disconnected; degraded to single-node mode (local delivery only)',
        );
      }
    });
    backplane = redisBackplane;
  } else {
    backplane = new InProcessBackplane();
  }

  const presence = new PresenceManager(
    redis
      ? {
          redis,
          onReadFailure: (userId: string, err: unknown) => {
            log?.error({ err, userId }, 'presence redis read failed; treating as offline');
          },
        }
      : {},
  );

  return { redis, backplane, presence };
}
