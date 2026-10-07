// ============================================================================
// QuantAds - Daily publisher payout scheduler
// ============================================================================
//
// Pays publishers for the ad clicks they delivered. Earnings are computed ONLY
// from non-fraud, billable AdClickEvents (the fraud-flagged ones recorded by
// ClickFraudService are excluded), so click-farm clicks never earn payouts.
//
// Mirrors the credits WithdrawSchedulerService (#454):
//   • Idempotent per UTC day — PublisherPayoutRun.utcDay is unique; a completed
//     run is returned, never reprocessed (duplicate cron fire = no double-pay).
//   • Event-level idempotency — each click is marked paidOut once it has been
//     paid, so it is never counted in a later run.
//   • Threshold-gated — publishers below the minimum payout are skipped (dust).
//   • Fail-soft — one publisher's failure is recorded and the batch continues.
//
// The credit itself goes through an injected PublisherWalletPort (wired to the
// QuantAds @quant/quant-economy CoinWallet at boot). Consolidation onto the
// durable @quant/credits ledger is a separate wave; the durable parts here are
// the paidOut flag and the run record. Live payout rail = needs-staging.

export interface AdClickEventRow {
  id: string;
  publisherId: string | null;
  billable: boolean;
  paidOut: boolean;
}

export interface PublisherPayoutRunRow {
  id: string;
  utcDay: string;
  status: string;
  publishersConsidered: number;
  paid: number;
  skipped: number;
  failed: number;
  totalCreditsPaid: number;
  error: string | null;
  startedAt: Date | string;
  finishedAt: Date | string | null;
}

/** Structural Prisma slice the scheduler needs (real PrismaClient satisfies it). */
export interface PublisherPayoutPrisma {
  adClickEvent: {
    findMany(args: { where?: Record<string, unknown> }): Promise<AdClickEventRow[]>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  publisherPayoutRun: {
    findUnique(args: { where: { utcDay: string } }): Promise<PublisherPayoutRunRow | null>;
    create(args: { data: Record<string, unknown> }): Promise<PublisherPayoutRunRow>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<PublisherPayoutRunRow>;
  };
}

/** Credits a publisher's wallet. Wired to CoinWallet.creditCoins at boot. */
export interface PublisherWalletPort {
  credit(publisherId: string, amountCredits: number, idempotencyKey: string): void | Promise<void>;
}

export interface PublisherPayoutSummary {
  utcDay: string;
  status: 'completed';
  publishersConsidered: number;
  paid: number;
  skipped: number;
  failed: number;
  totalCreditsPaid: number;
}

export interface PublisherPayoutOptions {
  /** Credits earned per billable click (whole credits). Default 1. */
  creditsPerClick?: number;
  /** Minimum payout; publishers below this are skipped (dust). Default 1. */
  minPayoutCredits?: number;
  now?: () => Date;
  generateId?: () => string;
}

const UTC_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export class PublisherPayoutSchedulerService {
  private readonly creditsPerClick: number;
  private readonly minPayoutCredits: number;
  private readonly now: () => Date;
  private readonly generateId: () => string;

  constructor(
    private readonly prisma: PublisherPayoutPrisma,
    private readonly wallet: PublisherWalletPort,
    options: PublisherPayoutOptions = {},
  ) {
    this.creditsPerClick = options.creditsPerClick ?? 1;
    this.minPayoutCredits = Math.max(1, options.minPayoutCredits ?? 1);
    this.now = options.now ?? (() => new Date());
    this.generateId = options.generateId ?? (() => globalThis.crypto.randomUUID());
  }

  /**
   * Run (or resume) the daily publisher-payout batch. Idempotent: a completed
   * run for the day is returned without reprocessing.
   */
  async runDaily(utcDay?: string): Promise<PublisherPayoutSummary> {
    const day = utcDay ?? this.now().toISOString().slice(0, 10);
    if (!UTC_DAY_RE.test(day)) {
      const err = new Error('utcDay must be a YYYY-MM-DD UTC-day string');
      (err as { statusCode?: number }).statusCode = 400;
      throw err;
    }

    const existing = await this.prisma.publisherPayoutRun.findUnique({ where: { utcDay: day } });
    if (existing && existing.status === 'completed') {
      return this.toSummary(existing);
    }
    const run =
      existing ??
      (await this.prisma.publisherPayoutRun.create({
        data: { id: this.generateId(), utcDay: day, status: 'running' },
      }));

    // Only non-fraud, billable, not-yet-paid, attributed clicks earn payouts.
    const clicks = await this.prisma.adClickEvent.findMany({
      where: { billable: true, paidOut: false, publisherId: { not: null } },
    });

    // Tally billable clicks per publisher.
    const counts = new Map<string, number>();
    for (const c of clicks) {
      if (!c.publisherId) continue;
      counts.set(c.publisherId, (counts.get(c.publisherId) ?? 0) + 1);
    }

    let paid = 0;
    let skipped = 0;
    let failed = 0;
    let totalCreditsPaid = 0;
    let firstError: string | undefined;

    for (const [publisherId, clickCount] of counts) {
      const earnings = clickCount * this.creditsPerClick;
      if (earnings < this.minPayoutCredits) {
        skipped += 1;
        continue;
      }
      try {
        // Credit first (idempotent by publisher+day), then mark the publisher's
        // clicks paid so a retry never double-pays.
        await this.wallet.credit(publisherId, earnings, `pub-payout:${publisherId}:${day}`);
        await this.prisma.adClickEvent.updateMany({
          where: { publisherId, billable: true, paidOut: false },
          data: { paidOut: true },
        });
        paid += 1;
        totalCreditsPaid += earnings;
      } catch (err) {
        failed += 1;
        if (!firstError) firstError = err instanceof Error ? err.message : String(err);
      }
    }

    const finished = await this.prisma.publisherPayoutRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        publishersConsidered: counts.size,
        paid,
        skipped,
        failed,
        totalCreditsPaid,
        ...(firstError ? { error: firstError } : {}),
        finishedAt: this.now(),
      },
    });

    return this.toSummary(finished);
  }

  private toSummary(row: PublisherPayoutRunRow): PublisherPayoutSummary {
    return {
      utcDay: row.utcDay,
      status: 'completed',
      publishersConsidered: row.publishersConsidered,
      paid: row.paid,
      skipped: row.skipped,
      failed: row.failed,
      totalCreditsPaid: row.totalCreditsPaid,
    };
  }
}
