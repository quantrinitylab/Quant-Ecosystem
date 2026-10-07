// ============================================================================
// Payments - Tax Document Service
// Generates 1099/tax documents for creators exceeding $600 threshold
// ============================================================================

import { z } from 'zod';
import type { TaxDocument, TaxDocumentType } from '../types';

const TAX_THRESHOLD = 600;

export const GenerateTaxDocSchema = z.object({
  creatorId: z.string().min(1),
  year: z.number().int().min(2020).max(2100),
  totalEarnings: z.number().nonnegative(),
});

/**
 * TaxDocumentService - Tax document generation for creators
 *
 * Generates 1099-NEC documents for creators whose annual earnings
 * exceed the $600 IRS threshold.
 */
export class TaxDocumentService {
  private readonly documents: Map<string, TaxDocument[]> = new Map();
  private readonly earningsData: Map<
    string,
    { tips: number; paywalls: number; storefront: number; subscriptions: number }
  > = new Map();

  /**
   * Generate a tax document for a creator
   */
  generateTaxDoc(params: { creatorId: string; year: number; totalEarnings: number }): TaxDocument {
    const validated = GenerateTaxDocSchema.parse(params);

    if (!this.isThresholdMet(validated.totalEarnings)) {
      throw new Error(
        `Earnings ($${validated.totalEarnings}) below $${TAX_THRESHOLD} threshold for 1099-NEC`,
      );
    }

    const docType: TaxDocumentType = '1099-NEC';

    const doc: TaxDocument = {
      id: `taxdoc_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      creatorId: validated.creatorId,
      year: validated.year,
      type: docType,
      totalEarnings: validated.totalEarnings,
      generatedAt: Date.now(),
      downloadUrl: `https://docs.quant.app/tax/${validated.creatorId}/${validated.year}/${docType}.pdf`,
    };

    if (!this.documents.has(validated.creatorId)) {
      this.documents.set(validated.creatorId, []);
    }
    this.documents.get(validated.creatorId)!.push(doc);

    return doc;
  }

  /**
   * Record earnings breakdown for a creator (used for summary)
   */
  recordEarnings(
    creatorId: string,
    year: number,
    source: 'tips' | 'paywalls' | 'storefront' | 'subscriptions',
    amount: number,
  ): void {
    const key = `${creatorId}:${year}`;
    if (!this.earningsData.has(key)) {
      this.earningsData.set(key, { tips: 0, paywalls: 0, storefront: 0, subscriptions: 0 });
    }
    const data = this.earningsData.get(key)!;
    data[source] += amount;
  }

  /**
   * Get earnings summary for a creator in a given year
   */
  getEarningsSummary(
    creatorId: string,
    year: number,
  ): {
    totalEarnings: number;
    tips: number;
    paywalls: number;
    storefront: number;
    subscriptions: number;
  } {
    const key = `${creatorId}:${year}`;
    const data = this.earningsData.get(key) || {
      tips: 0,
      paywalls: 0,
      storefront: 0,
      subscriptions: 0,
    };
    const totalEarnings = data.tips + data.paywalls + data.storefront + data.subscriptions;
    return { totalEarnings, ...data };
  }

  /**
   * Check if total earnings meet the 1099-NEC threshold ($600)
   */
  isThresholdMet(totalEarnings: number): boolean {
    return totalEarnings >= TAX_THRESHOLD;
  }

  /**
   * Get all tax documents for a creator
   */
  getDocuments(creatorId: string): TaxDocument[] {
    return (this.documents.get(creatorId) || []).sort((a, b) => b.generatedAt - a.generatedAt);
  }
}
