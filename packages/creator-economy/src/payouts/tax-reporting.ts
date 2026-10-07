import type { MonetizationEvent } from '../types.js';

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
  private events: MonetizationEvent[] = [];
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

  addEvent(event: MonetizationEvent): void {
    this.events.push(event);
  }
}
