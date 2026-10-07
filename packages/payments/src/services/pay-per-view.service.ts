// ============================================================================
// Payments - Pay-Per-View Service
// Gates content behind one-time payments with 85/15 creator/platform split
// Uses integer-cent arithmetic internally to avoid floating-point drift.
// ============================================================================

import { z } from 'zod';
import type { PayPerViewPaywall, PayPerViewAccess, CurrencyCode } from '../types';

const CREATOR_SHARE = 0.85;

export const CreatePaywallSchema = z.object({
  creatorId: z.string().min(1),
  contentId: z.string().min(1),
  price: z.number().positive(),
  title: z.string().min(1),
  currency: z.string().optional(),
});

export const PurchaseAccessSchema = z.object({
  userId: z.string().min(1),
  contentId: z.string().min(1),
});

/** Convert a dollar amount to integer cents */
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Convert integer cents to a dollar amount */
function toDollars(cents: number): number {
  return cents / 100;
}

/**
 * PayPerViewService - Gates content behind one-time payments
 *
 * Creators can set a price for individual content. Users pay once to access.
 * Revenue is split 85/15 (creator/platform).
 * Revenue is tracked internally in integer cents to avoid floating-point drift.
 */
export class PayPerViewService {
  private readonly paywalls: Map<string, PayPerViewPaywall> = new Map();
  private readonly paywallsByContent: Map<string, PayPerViewPaywall> = new Map();
  private readonly accessRecords: Map<string, PayPerViewAccess[]> = new Map();
  /** Internal revenue in integer cents, keyed by paywall id */
  private readonly revenueCents: Map<string, number> = new Map();

  /**
   * Create a paywall for content
   */
  createPaywall(params: {
    creatorId: string;
    contentId: string;
    price: number;
    title: string;
    currency?: CurrencyCode;
  }): PayPerViewPaywall {
    const validated = CreatePaywallSchema.parse(params);

    if (this.paywallsByContent.has(validated.contentId)) {
      throw new Error(`Paywall already exists for content: ${validated.contentId}`);
    }

    const paywall: PayPerViewPaywall = {
      id: `ppv_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      creatorId: validated.creatorId,
      contentId: validated.contentId,
      price: validated.price,
      currency: (validated.currency as CurrencyCode) || 'USD',
      title: validated.title,
      accessCount: 0,
      revenue: 0,
      createdAt: Date.now(),
    };

    this.paywalls.set(paywall.id, paywall);
    this.paywallsByContent.set(paywall.contentId, paywall);
    this.revenueCents.set(paywall.id, 0);
    return paywall;
  }

  /**
   * Purchase access to gated content
   */
  purchaseAccess(params: { userId: string; contentId: string }): PayPerViewAccess {
    const validated = PurchaseAccessSchema.parse(params);

    const paywall = this.paywallsByContent.get(validated.contentId);
    if (!paywall) {
      throw new Error(`No paywall found for content: ${validated.contentId}`);
    }

    // Check for duplicate purchase
    const existing = this.accessRecords.get(validated.userId) || [];
    const alreadyPurchased = existing.some((a) => a.contentId === validated.contentId);
    if (alreadyPurchased) {
      throw new Error('Access already purchased for this content');
    }

    // Compute creator revenue in integer cents to avoid float drift
    const priceCents = toCents(paywall.price);
    const creatorRevenueCents = Math.round(priceCents * CREATOR_SHARE);

    const access: PayPerViewAccess = {
      id: `ppva_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      userId: validated.userId,
      paywallId: paywall.id,
      contentId: validated.contentId,
      paidAmount: paywall.price,
      purchasedAt: Date.now(),
    };

    // Update paywall stats using integer-cent accumulation
    paywall.accessCount += 1;
    const currentCents = this.revenueCents.get(paywall.id) ?? 0;
    const newCents = currentCents + creatorRevenueCents;
    this.revenueCents.set(paywall.id, newCents);
    paywall.revenue = toDollars(newCents);

    // Store access record
    if (!this.accessRecords.has(validated.userId)) {
      this.accessRecords.set(validated.userId, []);
    }
    this.accessRecords.get(validated.userId)!.push(access);

    return access;
  }

  /**
   * Check if a user has access to gated content
   */
  checkAccess(userId: string, contentId: string): boolean {
    const records = this.accessRecords.get(userId) || [];
    return records.some((a) => a.contentId === contentId);
  }

  /**
   * Get revenue for a creator across all paywalls
   */
  getRevenue(creatorId: string): { total: number; byContent: Map<string, number> } {
    let totalCents = 0;
    const byContent = new Map<string, number>();

    for (const [, paywall] of this.paywalls) {
      if (paywall.creatorId === creatorId) {
        const cents = this.revenueCents.get(paywall.id) ?? 0;
        totalCents += cents;
        byContent.set(paywall.contentId, toDollars(cents));
      }
    }

    return { total: toDollars(totalCents), byContent };
  }
}
