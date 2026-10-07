// ============================================================================
// Payments - Tip Service
// One-tap tips with preset amounts and 95/5 revenue split
// ============================================================================

import { z } from 'zod';
import type { TipRecord } from '../types';

/** Preset tip amounts */
export const PRESET_TIP_AMOUNTS = [1, 2, 5, 10, 20, 50] as const;

const TIP_CREATOR_SHARE = 0.95;

export const SendTipSchema = z.object({
  fromUserId: z.string().min(1),
  toCreatorId: z.string().min(1),
  amount: z.number().positive(),
  message: z.string().max(500).optional(),
});

/**
 * TipService - One-tap tipping for creators
 *
 * Supports preset amounts ($1, $2, $5, $10, $20, $50) and custom amounts.
 * Records tips with a 95/5 creator/platform split.
 */
export class TipService {
  private readonly tips: TipRecord[] = [];

  /**
   * Send a tip from a user to a creator
   */
  sendTip(params: {
    fromUserId: string;
    toCreatorId: string;
    amount: number;
    message?: string;
  }): TipRecord {
    const validated = SendTipSchema.parse(params);

    if (validated.fromUserId === validated.toCreatorId) {
      throw new Error('Cannot tip yourself');
    }

    const creatorShare = Math.round(validated.amount * TIP_CREATOR_SHARE * 100) / 100;
    const platformShare = Math.round((validated.amount - creatorShare) * 100) / 100;

    const tip: TipRecord = {
      id: `tip_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      fromUserId: validated.fromUserId,
      toCreatorId: validated.toCreatorId,
      amount: validated.amount,
      creatorShare,
      platformShare,
      message: validated.message,
      createdAt: Date.now(),
    };

    this.tips.push(tip);
    return tip;
  }

  /**
   * Get tips received by a creator
   */
  getTipsReceived(
    creatorId: string,
    options?: {
      startDate?: number;
      endDate?: number;
      limit?: number;
    },
  ): TipRecord[] {
    let results = this.tips.filter((t) => t.toCreatorId === creatorId);

    if (options?.startDate) {
      results = results.filter((t) => t.createdAt >= options.startDate!);
    }
    if (options?.endDate) {
      results = results.filter((t) => t.createdAt <= options.endDate!);
    }

    results.sort((a, b) => b.createdAt - a.createdAt);

    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Get tips sent by a user
   */
  getTipsSent(
    userId: string,
    options?: {
      startDate?: number;
      endDate?: number;
      limit?: number;
    },
  ): TipRecord[] {
    let results = this.tips.filter((t) => t.fromUserId === userId);

    if (options?.startDate) {
      results = results.filter((t) => t.createdAt >= options.startDate!);
    }
    if (options?.endDate) {
      results = results.filter((t) => t.createdAt <= options.endDate!);
    }

    results.sort((a, b) => b.createdAt - a.createdAt);

    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }
}
