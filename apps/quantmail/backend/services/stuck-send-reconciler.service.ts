import { OutboundDeliveryPipeline } from './outbound-delivery.service';
import { MailOutboxEvents, emitOutbox } from '../lib/outbox-events';
import { versionedUpdate, type VersionedTx } from '../lib/optimistic-update';
import { VERSION_CONFLICT } from '../lib/mutation-context';

/**
 * Stuck-send reconciler (fix/qm-stuck-send-reconciler).
 *
 * Closes the crash window the flip-first send leaves open: the durable flip
 * (isSent=true, deliveryStatus='queued' + the outboundQueued outbox row)
 * commits BEFORE the delivery job is enqueued. A process loss in between —
 * or an enqueue that threw after the flip — leaves a row that is `queued`
 * with ZERO delivery jobs, and the send-once guard (`requireUnsent`) turns
 * every retry into 409 EMAIL_ALREADY_SENT. Without a reconciler that row is
 * stuck forever.
 *
 * Recovery contract (per the finding's expected outcomes):
 * - restart-before-enqueue recovery: `start()` runs one pass immediately on
 *   boot, then sweeps on an interval.
 * - two replicas: the claim below is an atomic conditional version write, so
 *   at most one replica re-enqueues a row; the queue itself dedupes by the
 *   deterministic job id (`outbound-delivery-<emailId>`), so even a raced
 *   re-enqueue cannot create a second job.
 * - queue-accept-then-timeout: a row whose job already exists in the queue
 *   (waiting, delayed, active, completed or failed — jobs are retained) is
 *   owned by the queue and is NOT re-enqueued; only a row with NO job record
 *   is a re-enqueue candidate.
 * - scheduled sends keep their schedule: a stuck row with a future `sentAt`
 *   is re-enqueued with the same sendAt + a matching delay, never fired early.
 * - UNKNOWN/partial outcomes are never touched: rows in `unknown`
 *   deliveryStatus are excluded from the scan entirely.
 * - no marking unsent work complete: the reconciler only ever re-enqueues
 *   (deliveryStatus stays 'queued'); it never writes delivered/deferred.
 */
export const STUCK_QUEUED_THRESHOLD_MS = 10 * 60_000;
export const RECONCILE_INTERVAL_MS = 5 * 60_000;
export const RECONCILE_BATCH_LIMIT = 100;

export interface StuckEmailRow {
  id: string;
  userId: string;
  version: number;
  isSent: boolean;
  deliveryStatus: string | null;
  sentAt: Date | null;
  updatedAt: Date;
}

/**
 * Minimal structural Prisma surface the reconciler needs. The real
 * PrismaClient satisfies it; tests use the same mock shape as the
 * EmailService suite (whose `$transaction` passes the mock itself as tx).
 */
export interface StuckSendPrisma {
  email: {
    findMany(args: unknown): Promise<StuckEmailRow[]>;
    findUnique(args: { where: { id: string } }): Promise<StuckEmailRow | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  outboxEvent: {
    create(args: unknown): Promise<unknown>;
  };
  $transaction<T>(cb: (tx: unknown) => Promise<T>): Promise<T>;
}

export interface ReconcileOutcome {
  scanned: number;
  requeued: number;
  skippedInFlight: number;
  skippedNotStuck: number;
  skippedClaimLost: number;
  errors: number;
}

export interface ReconcilerOptions {
  /** Injectable clock (tests). */
  now?: () => Date;
  /** How old a 'queued' row must be to count as stuck. */
  thresholdMs?: number;
  /** Max rows per sweep. */
  batchLimit?: number;
  /** Structured log sink; defaults to console. */
  log?: (level: 'info' | 'warn' | 'error', message: string, fields?: Record<string, unknown>) => void;
}

const defaultLog: ReconcilerOptions['log'] = (level, message, fields) => {
  // eslint-disable-next-line no-console
  console[level](`[stuck-send-reconciler] ${message}`, fields ?? '');
};

export class StuckSendReconciler {
  private readonly now: () => Date;
  private readonly thresholdMs: number;
  private readonly batchLimit: number;
  private readonly log: NonNullable<ReconcilerOptions['log']>;

  constructor(
    private readonly prisma: StuckSendPrisma,
    private readonly pipeline: OutboundDeliveryPipeline,
    options: ReconcilerOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.thresholdMs = options.thresholdMs ?? STUCK_QUEUED_THRESHOLD_MS;
    this.batchLimit = options.batchLimit ?? RECONCILE_BATCH_LIMIT;
    this.log = options.log ?? defaultLog;
  }

  /**
   * One reconcile pass: find stuck-queued rows and re-enqueue the ones the
   * queue does not already own. Never throws — per-row failures are counted
   * and logged so one bad row cannot wedge the sweep.
   */
  async reconcileOnce(at?: Date): Promise<ReconcileOutcome> {
    const now = at ?? this.now();
    const cutoff = new Date(now.getTime() - this.thresholdMs);
    const outcome: ReconcileOutcome = {
      scanned: 0,
      requeued: 0,
      skippedInFlight: 0,
      skippedNotStuck: 0,
      skippedClaimLost: 0,
      errors: 0,
    };

    let candidates: StuckEmailRow[];
    try {
      candidates = await this.prisma.email.findMany({
        where: {
          isSent: true,
          deliveryStatus: 'queued',
          updatedAt: { lt: cutoff },
        },
        orderBy: { updatedAt: 'asc' },
        take: this.batchLimit,
      });
    } catch (error) {
      this.log('error', 'stuck scan failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      outcome.errors += 1;
      return outcome;
    }
    outcome.scanned = candidates.length;

    for (const row of candidates) {
      try {
        const result = await this.reconcileRow(row, cutoff, now);
        if (result === 'requeued') outcome.requeued += 1;
        else if (result === 'in-flight') outcome.skippedInFlight += 1;
        else if (result === 'claim-lost') outcome.skippedClaimLost += 1;
        else outcome.skippedNotStuck += 1;
      } catch (error) {
        outcome.errors += 1;
        this.log('error', 'reconcile row failed', {
          emailId: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (outcome.requeued > 0 || outcome.errors > 0) {
      this.log('info', 'reconcile pass complete', { ...outcome });
    }
    return outcome;
  }

  /**
   * Reconcile one candidate row. Returns the disposition for outcome counting.
   */
  private async reconcileRow(
    row: StuckEmailRow,
    cutoff: Date,
    now: Date,
  ): Promise<'requeued' | 'in-flight' | 'not-stuck' | 'claim-lost'> {
    // Queue-ownership probe FIRST (no DB write yet): if the deterministic job
    // still exists in any state, the queue owns this row — not stuck.
    // This also covers queue-accept-then-timeout: the job WAS accepted before
    // the enqueue call timed out, so re-enqueueing would be pointless.
    let jobExists = false;
    try {
      jobExists = await this.pipeline.hasJob(row.id);
    } catch (error) {
      // A Redis blip must not flip a row into a re-enqueue storm: fail closed
      // and let the next pass retry.
      this.log('warn', 'queue probe failed; skipping row this pass', {
        emailId: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'not-stuck';
    }
    if (jobExists) {
      return 'in-flight';
    }

    // Claim the row inside a transaction: re-read + atomic conditional
    // version write. A concurrent writer (undo-send reclaiming the row, or
    // the other replica's reconciler) bumps the version and this claim loses
    // with VERSION_CONFLICT instead of re-enqueueing something it should not.
    // The claim also refreshes updatedAt, so a row whose re-enqueue fails is
    // naturally debounced for another full threshold before the next attempt.
    let current: StuckEmailRow | null;
    try {
      current = await this.prisma.$transaction(async (tx) => {
        const fresh = await (tx as unknown as StuckSendPrisma).email.findUnique({
          where: { id: row.id },
        });
        if (
          !fresh ||
          !fresh.isSent ||
          fresh.deliveryStatus !== 'queued' ||
          fresh.updatedAt >= cutoff
        ) {
          return null;
        }
        await versionedUpdate<StuckEmailRow>(tx as unknown as VersionedTx, {
          id: row.id,
          resource: 'Email',
          notFoundCode: 'EMAIL_NOT_FOUND',
          notFoundMessage: 'Email not found',
          expectedVersion: fresh.version,
          data: {},
        });
        return fresh;
      });
    } catch (error) {
      if ((error as { code?: string })?.code === VERSION_CONFLICT) {
        return 'claim-lost';
      }
      throw error;
    }
    if (!current) {
      return 'not-stuck';
    }

    // Re-enqueue (idempotent: the deterministic job id dedupes even if two
    // replicas both get here). A future sentAt keeps its schedule — pass the
    // same sendAt + delay the original send computed, so a stuck scheduled
    // send is never fired early.
    const enqueueOptions: { sendAt?: Date; delayMs?: number } = {};
    if (current.sentAt && current.sentAt.getTime() > now.getTime()) {
      enqueueOptions.sendAt = current.sentAt;
      enqueueOptions.delayMs = current.sentAt.getTime() - now.getTime();
    }
    await this.pipeline.enqueueSend(current.userId, current.id, enqueueOptions);

    // K1-style audit: the re-enqueue is durable in the queue now; record the
    // matching outbox row. Reuses the spec'd `mail.outbound.queued.v1` name —
    // the row IS being queued (again) — with `reconciled: true` so consumers
    // can distinguish a recovery re-queue from the original send.
    await this.prisma.$transaction(async (tx) => {
      await emitOutbox(tx as unknown as object, {
        event: MailOutboxEvents.outboundQueued,
        aggregateType: 'Email',
        aggregateId: current.id,
        payload: {
          userId: current.userId,
          deliveryStatus: 'queued',
          reconciled: true,
          reason: 'stuck-send-reconciler',
        },
      });
    });

    this.log('info', 're-enqueued stuck send', {
      emailId: current.id,
      userId: current.userId,
      scheduled: Boolean(enqueueOptions.sendAt),
    });
    return 'requeued';
  }

  /**
   * Run one pass immediately (restart recovery) and then on an interval.
   * Overlapping ticks are skipped — a slow pass never stacks. Returns an
   * async stop function.
   */
  start(intervalMs: number = RECONCILE_INTERVAL_MS): () => Promise<void> {
    let stopped = false;
    let running = false;
    const tick = async (): Promise<void> => {
      if (stopped || running) return;
      running = true;
      try {
        await this.reconcileOnce();
      } catch (error) {
        this.log('error', 'reconcile tick failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        running = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), intervalMs);
    // eslint-disable-next-line no-console
    console.log(
      `[stuck-send-reconciler] started (threshold=${this.thresholdMs}ms, interval=${intervalMs}ms)`,
    );
    return async () => {
      stopped = true;
      clearInterval(timer);
    };
  }
}

/**
 * Production wiring: build the pipeline against the durable queue and start
 * the reconciler. Call once per process (worker.ts and server.ts both do —
 * the reconciler is idempotent and two-replica-safe, so running it in both
 * entrypoints is harmless).
 */
export function startStuckSendReconciler(
  prisma: StuckSendPrisma,
  options: ReconcilerOptions & { intervalMs?: number } = {},
): () => Promise<void> {
  const pipeline = new OutboundDeliveryPipeline(
    prisma as unknown as ConstructorParameters<typeof OutboundDeliveryPipeline>[0],
    OutboundDeliveryPipeline.createQueue(),
  );
  const reconciler = new StuckSendReconciler(prisma, pipeline, options);
  return reconciler.start(options.intervalMs);
}
