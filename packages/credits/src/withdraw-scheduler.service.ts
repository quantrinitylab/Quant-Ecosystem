// ============================================================================
// WithdrawSchedulerService — daily auto-withdraw batch over PayoutService.
// Part of @quant/credits.
// ============================================================================
//
// MODEL
//   Owners can opt in (AutoWithdrawSetting, default OFF) to automatically cash
//   out their EARNED credits once a day. This service runs the daily batch:
//   for each opted-in owner it computes the withdrawable balance and, when it
//   meets the owner's minimum threshold, requests a withdrawal through the
//   existing PayoutService (which enforces no-overdraw, the daily limit,
//   compliance holds, fail-closed provider checks and refund-on-failure).
//
//   IDEMPOTENCY
//     • Batch level: each run is keyed by UTC day (WithdrawSchedulerRun.utcDay
//       is @unique). A completed run for the day is returned as-is, never
//       reprocessed — so a duplicate cron fire does not double-withdraw.
//     • Owner level: getWithdrawable already nets out prior non-failed payouts,
//       so a retry after a partial-failure run never re-withdraws credits that
//       a prior payout already reserved.
//
//   FAIL-SOFT BATCH
//     A single owner's failure (rail error, limit exceeded, out of credits) is
//     recorded and the batch continues; it never aborts the whole run or
//     fabricates a success. The live payout rail call is needs-staging.

import { createAppError } from './errors';
import type { Credits } from './pricing-engine.service';
import type { OwnerRef } from './credit-wallet.service';
import type { PayoutMethod } from './payout-service';
import type { OwnershipPrincipal } from './ownership-authz';

/**
 * The slice of PayoutService the scheduler depends on. Declared structurally so
 * the scheduler is unit-testable with a lightweight fake; the real PayoutService
 * satisfies it at the call site.
 */
export interface WithdrawPayoutPort {
  getWithdrawable(caller: OwnershipPrincipal, ownerRef: OwnerRef): Promise<Credits>;
  requestWithdrawal(
    caller: OwnershipPrincipal,
    ownerRef: OwnerRef,
    args: { amountCredits: Credits; method: PayoutMethod; destination?: string },
  ): Promise<unknown>;
}

/** A persisted auto-withdraw rule (mirrors the Prisma `AutoWithdrawSetting`). */
export interface AutoWithdrawSettingRow {
  id: string;
  ownerRef: string;
  ownerType: string;
  tenantId: string | null;
  enabled: boolean;
  method: string;
  destination: string | null;
  minThresholdCredits: number;
}

/** A persisted daily batch record (mirrors the Prisma `WithdrawSchedulerRun`). */
export interface WithdrawSchedulerRunRow {
  id: string;
  utcDay: string;
  status: string;
  ownersConsidered: number;
  withdrawn: number;
  skipped: number;
  failed: number;
  error: string | null;
  startedAt: Date | string;
  finishedAt: Date | string | null;
}

/** The minimal Prisma surface the scheduler needs (typed structurally). */
export interface WithdrawSchedulerPrisma {
  autoWithdrawSetting: {
    findMany(args: { where?: Record<string, unknown> }): Promise<AutoWithdrawSettingRow[]>;
  };
  withdrawSchedulerRun: {
    findUnique(args: { where: { utcDay: string } }): Promise<WithdrawSchedulerRunRow | null>;
    create(args: { data: Record<string, unknown> }): Promise<WithdrawSchedulerRunRow>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<WithdrawSchedulerRunRow>;
  };
}

/** The outcome of a daily batch. */
export interface WithdrawRunSummary {
  utcDay: string;
  status: 'completed';
  ownersConsidered: number;
  withdrawn: number;
  skipped: number;
  failed: number;
}

export interface WithdrawSchedulerOptions {
  /** UTC clock seam (overridable for deterministic tests). */
  now?: () => Date;
  /** Id generator seam (overridable for deterministic tests). */
  generateId?: () => string;
}

const VALID_METHODS: ReadonlySet<string> = new Set<PayoutMethod>(['upi', 'crypto', 'bank']);
const UTC_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export class WithdrawSchedulerService {
  private readonly now: () => Date;
  private readonly generateId: () => string;

  constructor(
    private readonly prisma: WithdrawSchedulerPrisma,
    private readonly payouts: WithdrawPayoutPort,
    options: WithdrawSchedulerOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.generateId = options.generateId ?? (() => globalThis.crypto.randomUUID());
  }

  /**
   * Run (or resume) the auto-withdraw batch for a UTC day. Idempotent: a
   * completed run for the day is returned without reprocessing.
   *
   * @throws 400 INVALID_UTC_DAY when an explicit `utcDay` is malformed.
   */
  async runDaily(utcDay?: string): Promise<WithdrawRunSummary> {
    const day = utcDay ?? this.now().toISOString().slice(0, 10);
    if (!UTC_DAY_RE.test(day)) {
      throw createAppError('utcDay must be a YYYY-MM-DD UTC-day string', 400, 'INVALID_UTC_DAY');
    }

    // BATCH IDEMPOTENCY: a completed run for this day is a no-op.
    const existing = await this.prisma.withdrawSchedulerRun.findUnique({ where: { utcDay: day } });
    if (existing && existing.status === 'completed') {
      return this.toSummary(existing);
    }

    const run =
      existing ??
      (await this.prisma.withdrawSchedulerRun.create({
        data: { id: this.generateId(), utcDay: day, status: 'running' },
      }));

    const settings = await this.prisma.autoWithdrawSetting.findMany({ where: { enabled: true } });

    let withdrawn = 0;
    let skipped = 0;
    let failed = 0;
    let firstError: string | undefined;

    for (const setting of settings) {
      const ownerRef: OwnerRef = {
        ownerId: setting.ownerRef,
        ownerType: setting.ownerType === 'org' ? 'org' : 'user',
        ...(setting.tenantId ? { tenantId: setting.tenantId } : {}),
      };
      // The scheduler executes the owner's OWN standing instruction.
      const caller: OwnershipPrincipal = { principalId: setting.ownerRef };

      try {
        const method = VALID_METHODS.has(setting.method) ? (setting.method as PayoutMethod) : 'upi';
        const withdrawable: Credits = await this.payouts.getWithdrawable(caller, ownerRef);
        const threshold = Math.max(1, setting.minThresholdCredits);

        if (withdrawable < threshold) {
          skipped += 1;
          continue;
        }

        await this.payouts.requestWithdrawal(caller, ownerRef, {
          amountCredits: withdrawable,
          method,
          ...(setting.destination ? { destination: setting.destination } : {}),
        });
        withdrawn += 1;
      } catch (err) {
        failed += 1;
        if (!firstError) {
          firstError = err instanceof Error ? err.message : String(err);
        }
      }
    }

    const finished = await this.prisma.withdrawSchedulerRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        ownersConsidered: settings.length,
        withdrawn,
        skipped,
        failed,
        ...(firstError ? { error: firstError } : {}),
        finishedAt: this.now(),
      },
    });

    return this.toSummary(finished);
  }

  private toSummary(row: WithdrawSchedulerRunRow): WithdrawRunSummary {
    return {
      utcDay: row.utcDay,
      status: 'completed',
      ownersConsidered: row.ownersConsidered,
      withdrawn: row.withdrawn,
      skipped: row.skipped,
      failed: row.failed,
    };
  }
}
