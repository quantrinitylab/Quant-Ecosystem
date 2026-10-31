// ============================================================================
// QuantChat — Disappearing Message Sweep Worker (Phase 1B)
//
// Durable, interval-based replacement for DisappearingService's in-memory
// setTimeout expiry. Every tick it calls
// DisappearingService.processExpiredMessagesWithDetails(), which reads due
// rows from the database — so expiry survives process restarts (the old
// in-memory timers did not).
//
// For every expired message the worker invokes the `onExpired` hook. The
// production wiring (app.ts) publishes a contract §18
// `chat.message.deleted.v1` envelope via publishConversationEvent so live
// clients remove the message immediately.
//
// Expired snap media is handed to the injected SnapMediaExpirer so later
// fetches answer 410 Gone (see media.service.ts).
//
// Single-instance note (hard rule: no BullMQ/Redis, in-process interval
// only): this worker claims no rows — it only sweeps rows whose expiresAt
// has passed, and the underlying updateMany is idempotent, so two replicas
// sweeping concurrently may double-publish the delete event but can never
// corrupt message state. Run one replica's sweeper in multi-instance
// deployments (or accept duplicate delete events; clients dedupe by
// event_id).
// ============================================================================

import type { PrismaClient } from '@prisma/client';
import {
  DisappearingService,
  type ExpiredMessageRecord,
  type SnapMediaExpirer,
} from './disappearing.service';

export const DISAPPEARING_SWEEP_INTERVAL_MS = 60_000; // 60s default

export interface DisappearingWorkerOptions {
  /**
   * Sweep interval override. app.ts may pass
   * Number(process.env['DISAPPEARING_SWEEP_INTERVAL_MS']) — a plain
   * constructor override keeps the class env-agnostic and testable.
   */
  intervalMs?: number;
  /**
   * Inject a pre-built DisappearingService (tests inject one over a fake
   * prisma). When omitted the worker builds one from `prisma`.
   */
  service?: DisappearingService;
  /**
   * Snap media expirer for expired messages (MediaService implements this
   * port). A media failure never fails the row expiry — the row delete is
   * committed first and media expiry is best-effort.
   */
  snapMediaExpirer?: SnapMediaExpirer;
  /**
   * Hook invoked once per expired message, after the row is marked
   * deleted. Production wiring publishes `chat.message.deleted.v1`.
   */
  onExpired?: (record: ExpiredMessageRecord) => void | Promise<void>;
  /** Error sink so one bad record never stops the sweep loop. */
  onError?: (error: unknown, record?: ExpiredMessageRecord) => void;
}

export class DisappearingMessageWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly intervalMs: number;
  private readonly service: DisappearingService;

  constructor(
    prisma: PrismaClient,
    private readonly options: DisappearingWorkerOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? DISAPPEARING_SWEEP_INTERVAL_MS;
    this.service = options.service ?? new DisappearingService(prisma);
  }

  /** Start the sweep loop. Safe to call once; subsequent calls are no-ops. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
    // Don't keep the process alive solely for this timer.
    if (typeof this.timer === 'object' && 'unref' in this.timer) {
      (this.timer as { unref: () => void }).unref();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Sweep every due expiry once. Exposed (no timers) so it can be driven
   * deterministically from tests. Returns the number of expired messages
   * processed this tick.
   */
  async tick(): Promise<number> {
    if (this.running) return 0; // prevent overlapping ticks on THIS instance
    this.running = true;
    let processed = 0;
    try {
      const expired = await this.service.processExpiredMessagesWithDetails(
        this.options.snapMediaExpirer,
      );
      for (const record of expired) {
        try {
          await this.options.onExpired?.(record);
          processed++;
        } catch (error) {
          this.options.onError?.(error, record);
        }
      }
    } catch (error) {
      this.options.onError?.(error);
    } finally {
      this.running = false;
    }
    return processed;
  }
}
