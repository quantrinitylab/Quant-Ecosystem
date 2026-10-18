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
//   fix/qm-quantgit-cijob-persist: the 'completed' event also carries the
//   ci-runner's PipelineRunResult return value, from which this module
//   persists the per-job CiJob rows (name/status/captured logs) — the only
//   write path for CiJob, since the runner never touches the DB by design.
//   Without this, the job breakdown and the job-scoped logs endpoint were
//   always empty. The runner reports failed pipelines via the return value
//   (it no longer throws on job failure), so 'completed' + a failed summary
//   flips the run to FAILED, not SUCCESS.
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
  ciJob: {
    upsert(args: {
      where: { id: string };
      create: {
        id: string;
        runId: string;
        name: string;
        status: string;
        logs: string | null;
      };
      update: { name: string; status: string; logs: string | null };
    }): Promise<unknown>;
  };
}

export type CiRunQueueEventName = 'active' | 'completed' | 'failed';

/**
 * BullMQ QueueEvents payload for 'active' / 'completed' / 'failed'. The
 * 'completed' event also carries the worker's return value — for ci-runs
 * that is the ci-runner's PipelineRunResult ({ jobs: Record<string,
 * JobExecutionSummary> }) which is the ONLY source of per-job names,
 * statuses and captured stdout/stderr (the runner never touches the DB).
 */
export interface CiRunQueueEventArgs {
  jobId?: string;
  returnvalue?: unknown;
}

export interface CiRunQueueEventsLike {
  on(event: 'error', listener: (err: Error) => void): unknown;
  on(event: CiRunQueueEventName, listener: (args: CiRunQueueEventArgs) => void): unknown;
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
 * Runner-side job status -> CiJob CIStatus. 'skipped' has no exact CIStatus
 * counterpart (jobs never went through RUNNING); CANCELLED is the closest
 * honest mapping — the job did not execute.
 */
const RUNNER_JOB_STATUS_TO_CI_STATUS: Record<string, string> = {
  success: 'SUCCESS',
  failed: 'FAILED',
  skipped: 'CANCELLED',
};

/**
 * Cap for persisted per-job logs. A CI job can dump megabytes of stdout;
 * persisting it unbounded would bloat the ci_jobs table and slow the
 * job-scoped logs endpoint. 250k chars is plenty for a log view, and the
 * cap is documented here rather than silently truncating mid-pipeline.
 */
const MAX_PERSISTED_LOG_CHARS = 250_000;

/** One job entry inside the ci-runner PipelineRunResult return value. */
interface RunnerJobSummary {
  name?: unknown;
  status?: unknown;
  result?: { stdout?: unknown; stderr?: unknown } | null;
}

/** Defensively extract the job summaries from a queue 'completed' return value. */
function parseRunnerJobSummaries(returnvalue: unknown): Array<{ key: string; summary: RunnerJobSummary }> {
  if (typeof returnvalue !== 'object' || returnvalue === null) return [];
  const jobs = (returnvalue as { jobs?: unknown }).jobs;
  if (typeof jobs !== 'object' || jobs === null || Array.isArray(jobs)) return [];
  return Object.entries(jobs as Record<string, unknown>)
    .filter((entry): entry is [string, RunnerJobSummary] => {
      const [, summary] = entry;
      return typeof summary === 'object' && summary !== null;
    })
    .map(([key, summary]) => ({ key, summary }));
}

/** Combine a job's captured stdout/stderr into the CiJob.logs text form. */
function combineJobLogs(summary: RunnerJobSummary): string | null {
  const result = summary.result;
  const stdout = typeof result?.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result?.stderr === 'string' ? result.stderr : '';
  const combined = stdout + (stdout && stderr ? '\n' : '') + stderr;
  if (!combined) return null;
  return combined.length > MAX_PERSISTED_LOG_CHARS
    ? combined.slice(0, MAX_PERSISTED_LOG_CHARS)
    : combined;
}

/**
 * Persist per-job rows from the ci-runner's PipelineRunResult return value.
 *
 * fix/qm-quantgit-cijob-persist: CiJob had only readers (ci.ts job endpoints
 * + getRunStatus) and zero writers repo-wide, so the per-job breakdown and
 * the job-scoped logs endpoint were always empty. The ci-runner never
 * touches the DB by design, so this backend-side sync on the BullMQ
 * 'completed' event is where the rows get written — from the runner's
 * return value, the only place that knows the job names/statuses/logs.
 *
 * Rows use a deterministic id (`${runId}:${jobName}`) so a redelivered
 * 'completed' event upserts instead of duplicating. startedAt/completedAt
 * are NOT fabricated — the runner result carries no per-job timestamps, so
 * they stay null. Malformed return values are ignored (no throw): the run
 * status flip must never fail because a worker sent unexpected data.
 */
export async function syncCiJobRowsFromRunnerResult(
  store: CiRunStatusStore,
  runId: string,
  returnvalue: unknown,
): Promise<void> {
  for (const { key, summary } of parseRunnerJobSummaries(returnvalue)) {
    const name = typeof summary.name === 'string' && summary.name ? summary.name : key;
    const runnerStatus = typeof summary.status === 'string' ? summary.status : '';
    const status = RUNNER_JOB_STATUS_TO_CI_STATUS[runnerStatus];
    if (!name || !status) continue;
    const logs = combineJobLogs(summary);
    await store.ciJob.upsert({
      where: { id: `${runId}:${name}` },
      create: { id: `${runId}:${name}`, runId, name, status, logs },
      update: { name, status, logs },
    });
  }
}

/**
 * Read the pipeline outcome the ci-runner reported in its return value.
 * Returns 'failed' only for a well-formed runner summary that says so;
 * anything else (missing value, old worker, foreign payload) yields null
 * and the caller falls back to the event-name mapping.
 */
function runnerReportedStatus(returnvalue: unknown): 'success' | 'failed' | null {
  if (typeof returnvalue !== 'object' || returnvalue === null) return null;
  const status = (returnvalue as { status?: unknown }).status;
  return status === 'success' || status === 'failed' ? status : null;
}

/**
 * Apply one BullMQ queue event to the CiRun row (and, on 'completed', sync
 * the per-job CiJob rows from the runner's return value).
 *
 * The ci-runner returns its PipelineRunResult instead of throwing on job
 * failure (fix/qm-quantgit-cijob-persist), so a 'completed' event can carry
 * a *failed* pipeline: the run flips to FAILED, not SUCCESS. A 'completed'
 * event with no (or a malformed) return value — e.g. from a pre-fix worker —
 * keeps the old mapping to SUCCESS.
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
  returnvalue?: unknown,
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
  const terminalStatus =
    event === 'completed'
      ? (runnerReportedStatus(returnvalue) === 'failed' ? 'FAILED' : 'SUCCESS')
      : 'FAILED';
  await store.ciRun.updateMany({
    where: { id: jobId, status: { in: ['PENDING', 'RUNNING'] } },
    data: { status: terminalStatus, completedAt: now },
  });
  if (event === 'completed') {
    // Job rows come only from the runner's return value. Malformed payloads
    // are filtered inside the sync (no throw); a store failure propagates to
    // the caller's error logging and is recoverable by event redelivery
    // because the upserts are idempotent.
    await syncCiJobRowsFromRunnerResult(store, jobId, returnvalue);
  }
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

  const handle = (event: CiRunQueueEventName) => (args: CiRunQueueEventArgs) => {
    void applyCiRunQueueEvent(store, event, args.jobId, args.returnvalue).catch((err) => {
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
