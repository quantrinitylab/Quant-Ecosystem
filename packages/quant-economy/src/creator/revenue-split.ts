import type { RevenueSplit } from '../types.js';

interface SaleRecord {
  id: string;
  creatorId: string;
  saleAmount: number;
  creatorAmount: number;
  platformAmount: number;
  timestamp: Date;
}

export class RevenueSplitEngine {
  private sales: SaleRecord[] = [];
  private creatorSplitRatio: number;

  constructor(creatorSplitRatio = 0.7) {
    this.creatorSplitRatio = creatorSplitRatio;
  }

  calculateSplit(saleAmount: number): RevenueSplit {
    const creatorAmount = Math.round(saleAmount * this.creatorSplitRatio * 100) / 100;
    const platformAmount = Math.round(saleAmount * (1 - this.creatorSplitRatio) * 100) / 100;
    return { creatorAmount, platformAmount };
  }

  recordSale(creatorId: string, saleAmount: number): SaleRecord {
    const split = this.calculateSplit(saleAmount);
    const record: SaleRecord = {
      id: crypto.randomUUID(),
      creatorId,
      saleAmount,
      creatorAmount: split.creatorAmount,
      platformAmount: split.platformAmount,
      timestamp: new Date(),
    };
    this.sales.push(record);
    return record;
  }

  getCreatorEarnings(creatorId: string): number {
    return this.sales
      .filter((s) => s.creatorId === creatorId)
      .reduce((sum, s) => sum + s.creatorAmount, 0);
  }

  getSales(creatorId: string): SaleRecord[] {
    return this.sales.filter((s) => s.creatorId === creatorId);
  }
}
