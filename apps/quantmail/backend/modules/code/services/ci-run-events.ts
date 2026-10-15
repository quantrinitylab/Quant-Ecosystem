// ============================================================================
// QuantCode module — ci-runs queue events -> CiRun status sync
// quantmail-superhub · fix/qm-quantgit-ci-runs
// ============================================================================
//
// PURPOSE
//   The `ci-runs` BullMQ consumer (services/ci-runner) executes pipelines but
//   never touches the database, so without this listener every triggered run
//   sat PENDING forever and branch-protection status checks could never go
//   green (merge-eligibility blocks merge unless ciStatus === 'SUCCESS').
//
//   This module closes that loop from the backend side: it subscribes to the
//   `ci-runs` queue events and flips the CiRun row
//   PENDING -> RUNNING -> SUCCESS | FAILED. The producer enqueues with
//   `jobId = runId` (see createQueueCiRunnerPort), so each event's jobId IS
//   the run id — no extra correlation state needed.
//
//   Started once from the backend boot (see app.ts); the once-guard makes a
//   second start a no-op so double route registration can never attach two
//   listeners.

import { QueueEvents, CI_RUNS_QUEUE_NAME } from '@quant/queue';

/** Redis connection for the ci-runs queue (same env contract as the producer). */
export function ciRedisConnection(): { host: string; port: number } {
  return {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: Number(process.env['REDIS_PORT'] ?? 6379),
  };
}

/**
 * Minimal prisma surface this module needs. Structural (not PrismaClient) so
 * unit tests can use a plain stub and the module never imports the generated
 * client directly.
 */
export interface CiRunStatusStore {
  ciRun: {
    updateMany(args: {
      where: { id: string; status?: { in: string[] } };
      data: { status: string; startedAt?: Date; completedAt?: Date };
    }): Promise<{ count: number }>;
  };
}

export type CiRunQueueEventName = 'active' | 'completed' | 'failed';

export interface CiRunQueueEventsLike {
  on(event: 'error', listener: (err: Error) => void): unknown;
  on(event: CiRunQueueEventName, listener: (args: { jobId?: string }) => void): unknown;
  close(): Promise<void>;
}

export interface CiRunStatusSyncLogger {
  error(...args: unknown[]): void;
}

export interface StartCiRunStatusSyncOptions {
  /** Test seam: supply a fake events source instead of a real QueueEvents. */
  createEvents?: () => CiRunQueueEventsLike;
  /** Defaults to console; production passes the Fastify (pino) logger. */
  logger?: CiRunStatusSyncLogger;
}

/**
 * Apply one BullMQ queue event to the CiRun row.
 *
 * Transitions are guarded to non-terminal states (PENDING/RUNNING) so a
 * stale or redelivered event can never clobber a SUCCESS/FAILED/CANCELLED
 * row — e.g. a duplicate 'active' after a manual cancel leaves CANCELLED
 * intact.
 */
export async function applyCiRunQueueEvent(
  store: CiRunStatusStore,
  event: CiRunQueueEventName,
  jobId: string | undefined,
): Promise<void> {
  if (!jobId) return;
  const now = new Date();
  if (event === 'active') {
    await store.ciRun.updateMany({
      where: { id: jobId, status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'RUNNING', startedAt: now },
    });
    return;
  }
  await store.ciRun.updateMany({
    where: { id: jobId, status: { in: ['PENDING', 'RUNNING'] } },
    data: { status: event === 'completed' ? 'SUCCESS' : 'FAILED', completedAt: now },
  });
}

let started = false;

/**
 * Subscribe to ci-runs queue events and keep CiRun rows in sync.
 * Returns a stop function (wired to Fastify onClose by the caller), or null
 * when there is nothing to start (no store, or already started).
 */
export function startCiRunStatusSync(
  store: CiRunStatusStore | null | undefined,
  options: StartCiRunStatusSyncOptions = {},
): (() => Promise<void>) | null {
  if (!store || started) return null;
  started = true;

  const logger = options.logger ?? console;
  const events = options.createEvents
    ? options.createEvents()
    : new QueueEvents(CI_RUNS_QUEUE_NAME, { connection: ciRedisConnection() });

  let errorLogged = false;
  events.on('error', (err) => {
    // Redis down at boot (or blipping mid-run): stay alive and keep the
    // BullMQ reconnect loop going instead of crashing the API process. Runs
    // keep their PENDING/RUNNING state until events flow again. Log only the
    // first error per process to avoid spamming on every reconnect attempt.
    if (!errorLogged) {
      errorLogged = true;
      logger.error(`[ci-run-status-sync] queue events error: ${err.message}`);
    }
  });

  const handle = (event: CiRunQueueEventName) => (args: { jobId?: string }) => {
    void applyCiRunQueueEvent(store, event, args.jobId).catch((err) => {
      logger.error(
        `[ci-run-status-sync] failed to apply '${event}' for job ${args.jobId ?? '<unknown>'}:`,
        err,
      );
    });
  };
  events.on('active', handle('active'));
  events.on('completed', handle('completed'));
  events.on('failed', handle('failed'));

  return () => events.close();
}

/** Test-only: reset the once-guard between suites. */
export function __resetCiRunStatusSyncForTests(): void {
  started = false;
}
