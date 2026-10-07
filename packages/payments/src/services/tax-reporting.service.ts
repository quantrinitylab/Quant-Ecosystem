// ============================================================================
// Payments - Tax Reporting Service (K11 consolidation)
// ============================================================================
//
// Moved here from `@quant/creator-economy` (`src/payouts/tax-reporting.ts`) per
// docs/quant-architecture/decisions/economy-single-ownership.md: tax metadata is
// a money-movement concern owned by `@quant/payments` (alongside `TaxService`
// and `TaxDocumentService`), not by the deprecated creator-economy package.
// The class is unchanged; `@quant/creator-economy` keeps a deprecated
// re-export shim so existing imports keep working.
//
// Tracks per-creator monetization events and withholding status, and generates
// 1099 summaries from recorded earnings.
// ============================================================================

/** A single taxable earning event (narrowed structural view of the legacy `MonetizationEvent`). */
export interface TaxableEarningEvent {
  creatorId: string;
  amount: number;
  timestamp: Date;
}

export interface Tax1099 {
  creatorId: string;
  year: number;
  totalEarnings: number;
  withheld: number;
  netPayable: number;
  generatedAt: Date;
}

export interface WithholdingStatus {
  creatorId: string;
  rate: number;
  w9OnFile: boolean;
  lastUpdated: Date;
}

export class TaxReportingService {
  private events: TaxableEarningEvent[] = [];
  private withholdings = new Map<string, WithholdingStatus>();

  generate1099(creatorId: string, year: number): Tax1099 {
    const yearlyEarnings = this.getYearlyEarnings(creatorId, year);
    const withholding = this.getWithholdingStatus(creatorId);
    const withheld = yearlyEarnings * withholding.rate;

    return {
      creatorId,
      year,
      totalEarnings: yearlyEarnings,
      withheld,
      netPayable: yearlyEarnings - withheld,
      generatedAt: new Date(),
    };
  }

  getYearlyEarnings(creatorId: string, year: number): number {
    return this.events
      .filter((e) => e.creatorId === creatorId && e.timestamp.getFullYear() === year)
      .reduce((sum, e) => sum + e.amount, 0);
  }

  getWithholdingStatus(creatorId: string): WithholdingStatus {
    const existing = this.withholdings.get(creatorId);
    if (existing) return existing;

    return {
      creatorId,
      rate: 0.24,
      w9OnFile: false,
      lastUpdated: new Date(),
    };
  }

  setWithholdingStatus(status: WithholdingStatus): void {
    this.withholdings.set(status.creatorId, status);
  }

  addEvent(event: TaxableEarningEvent): void {
    this.events.push(event);
  }
}
