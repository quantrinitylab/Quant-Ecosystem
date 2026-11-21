import type { PrismaClient } from '@prisma/client';
import { DisappearingService } from './disappearing.service';

// ============================================================================
// QC-F-231 Slice B: MessageExpiryWorker — durable disappearing-message purge
//
// The old design (retired in Slice C) armed a per-request `setTimeout` in
// DisappearingService — timers bound to a request-scoped instance that died
// with every restart, and a `processExpiredMessages` with no production
// caller at all. Expiry was a promise the server could not keep.
//
// This worker is the durable replacement, modelled on ScheduledMessageWorker
// (constructor shape, overlap-guard, public testable tick, unref'd
// interval). The sweep itself is stateless (DisappearingService.
// processExpiredMessages reads/writes only the DB), so a fresh instance
// purges the same rows — restarts and multi-replica deploys are safe.
//
// Two layers protect expiry:
//   1. Serve-guarantee (MessageService.getMessages/searchMessages, D3):
//      expired rows are never served, even with this worker stopped.
//   2. This worker: physically purges expired rows every 30s.
//
// NOTE on the env gate (R3): the interval does NOT start when
// appConfig.env === 'test' (see app.ts wiring) — a live 30s sweeper must
// never run inside test suites. It is also never started twice: start()
// is idempotent.
// ============================================================================

export interface MessageExpiryWorkerOptions {
  /** Poll interval. Default 30_000. A 5s preset therefore purges at most
   * ~30s late — invisible next to the serve-guarantee. */
  intervalMs?: number;
  /** Rows per sweep batch (DisappearingService.processExpiredMessages arg). */
  batchSize?: number;
  /** Error sink so one failing tick never stops the worker loop. */
  onError?: (error: unknown) => void;
  /** Observability hook: fires after a tick that purged > 0 rows. */
  onPurged?: (count: number) => void;
}

/** Max sweep batches per tick — a huge backlog can never stall one tick. */
const MAX_BATCHES_PER_TICK = 20;

export class MessageExpiryWorker {
  private readonly service: DisappearingService;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly onError?: (error: unknown) => void;
  private readonly onPurged?: (count: number) => void;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(prisma: PrismaClient, options: MessageExpiryWorkerOptions = {}) {
    // One long-lived instance per worker (the old per-request instances
    // are gone in Slice C — the service is stateless now, so this is
    // safe to share).
    this.service = new DisappearingService(prisma);
    this.intervalMs = options.intervalMs ?? 30_000;
    this.batchSize = options.batchSize ?? 500;
    this.onError = options.onError;
    this.onPurged = options.onPurged;
  }

  /** Start the sweeper: one immediate tick, then the interval. Idempotent. */
  start(): void {
    if (this.timer) return;
    void this.tickOnce();
    this.timer = setInterval(() => {
      void this.tickOnce();
    }, this.intervalMs);
    // Never hold the process open for the sweeper alone.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tickOnce(): Promise<void> {
    try {
      const purged = await this.tick();
      if (purged > 0) {
        this.onPurged?.(purged);
      }
    } catch (err) {
      this.onError?.(err);
    }
  }

  /**
   * One sweep tick: purge expired rows in batches (cap 20/tick).
   * Public so tests can drive it deterministically without timers.
   * Overlap-guarded: a slow tick never runs concurrently with the next.
   */
  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      let total = 0;
      for (let i = 0; i < MAX_BATCHES_PER_TICK; i++) {
        const purged = await this.service.processExpiredMessages(this.batchSize);
        total += purged;
        if (purged < this.batchSize) break;
      }
      return total;
    } finally {
      this.running = false;
    }
  }
}
