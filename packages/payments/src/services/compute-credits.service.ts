// ============================================================================
// Payments - Compute Credits Service
// Quant Compute Credits for pay-per-AI-action billing
// ============================================================================
//
// MIGRATION (unified credits economy, Task 5.1)
//   This service no longer keeps its own in-memory `Map<>` balances or a
//   `Math.random()` usage id (both forbidden on a money path). It now DELEGATES
//   to the shared, durable append-only ledger via `@quant/credits` CreditWallet:
//     • purchaseCredits -> wallet.credit (PURCHASED bucket)
//     • deductCredits   -> wallet.debit  (idempotency key = crypto id)
//     • getBalance / lifetime totals / usage history are DERIVED from the
//       authoritative ledger (wallet.listEntries), not a parallel store.
//   The AI action -> credit cost table is unchanged.

import { z } from 'zod';
import { CreditWallet, type OwnerRef, type OwnershipPrincipal } from '@quant/credits';
import type { ComputeCredits, CreditUsage, AIActionType } from '../types';

/** Credit costs per AI action type */
export const AI_ACTION_COSTS: Record<AIActionType, number> = {
  gpt4: 10,
  gpt35: 2,
  claude3: 8,
  llama3: 1,
  stable_diffusion: 15,
  whisper: 5,
  custom: 3,
};

export const PurchaseCreditsSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().positive(),
});

export const DeductCreditsSchema = z.object({
  userId: z.string().min(1),
  actionType: z.enum([
    'gpt4',
    'gpt35',
    'claude3',
    'llama3',
    'stable_diffusion',
    'whisper',
    'custom',
  ]),
  description: z.string().optional(),
});

/** Provenance prefix that tags a compute-action debit in the shared ledger. */
const COMPUTE_SOURCE_PREFIX = 'compute';

/**
 * ComputeCreditsService - Quant Compute Credits for AI actions, backed by the
 * shared durable credit ledger.
 *
 * Users purchase credits and spend them on AI-powered actions; each action type
 * has a fixed credit cost. Balances and history are derived from the ledger.
 */
export class ComputeCreditsService {
  constructor(private readonly wallet: CreditWallet) {}

  private owner(userId: string): OwnerRef {
    return { ownerId: userId, ownerType: 'user' };
  }

  private principal(userId: string): OwnershipPrincipal {
    // The user reads/spends their own compute-credit wallet.
    return { principalId: userId };
  }

  /** Purchase credits for a user (credited to the PURCHASED bucket). */
  async purchaseCredits(params: { userId: string; amount: number }): Promise<ComputeCredits> {
    const validated = PurchaseCreditsSchema.parse(params);
    await this.wallet.credit(this.owner(validated.userId), {
      amount: validated.amount,
      kind: 'purchase',
      reason: 'compute credits purchase',
    });
    return this.getBalance(validated.userId);
  }

  /** Deduct credits for an AI action (fixed cost per action type). */
  async deductCredits(params: {
    userId: string;
    actionType: AIActionType;
    description?: string;
  }): Promise<CreditUsage> {
    const validated = DeductCreditsSchema.parse(params);
    const cost = AI_ACTION_COSTS[validated.actionType];

    // Preserve the legacy "never purchased" signal: a user with no ledger
    // history has no balance to spend.
    const entries = await this.wallet.listEntries(
      this.principal(validated.userId),
      this.owner(validated.userId),
    );
    if (entries.length === 0) {
      throw new Error('No credit balance found for user');
    }

    const description = validated.description || `${validated.actionType} action`;
    try {
      // Idempotency key is a fresh crypto id per action (no Math.random).
      await this.wallet.debit(
        this.owner(validated.userId),
        cost,
        `${COMPUTE_SOURCE_PREFIX}:${globalThis.crypto.randomUUID()}`,
        { sourceRef: `${COMPUTE_SOURCE_PREFIX}:${validated.actionType}`, reason: description },
      );
    } catch (err) {
      // Map the ledger's fail-closed OUT_OF_CREDITS to the legacy message.
      const code = (err as { code?: string })?.code;
      if (code === 'OUT_OF_CREDITS') {
        throw new Error(
          `Insufficient credits: need ${cost}, have ${(await this.getBalance(validated.userId)).balance}`,
        );
      }
      throw err;
    }

    return {
      id: globalThis.crypto.randomUUID(),
      userId: validated.userId,
      actionType: validated.actionType,
      creditsUsed: cost,
      description,
      timestamp: Date.now(),
    };
  }

  /** Current credit balance + lifetime totals, derived from the ledger. */
  async getBalance(userId: string): Promise<ComputeCredits> {
    const entries = await this.wallet.listEntries(this.principal(userId), this.owner(userId));
    let balance = 0;
    let totalPurchased = 0;
    let totalUsed = 0;
    let lastPurchaseAt: number | undefined;
    let lastUsageAt: number | undefined;
    for (const e of entries) {
      const amount = Number.isFinite(e.amount) ? e.amount : 0;
      balance += amount;
      const ts = new Date(e.createdAt).getTime();
      if (e.entryType === 'purchase') {
        totalPurchased += amount;
        lastPurchaseAt = lastPurchaseAt == null ? ts : Math.max(lastPurchaseAt, ts);
      } else if (e.entryType === 'debit') {
        totalUsed += Math.abs(amount);
        lastUsageAt = lastUsageAt == null ? ts : Math.max(lastUsageAt, ts);
      }
    }
    const result: ComputeCredits = {
      userId,
      balance: Math.max(0, balance),
      totalPurchased,
      totalUsed,
    };
    if (lastPurchaseAt != null) result.lastPurchaseAt = lastPurchaseAt;
    if (lastUsageAt != null) result.lastUsageAt = lastUsageAt;
    return result;
  }

  /** Usage history (newest first), derived from the ledger's compute debits. */
  async getUsageHistory(userId: string): Promise<CreditUsage[]> {
    const entries = await this.wallet.listEntries(this.principal(userId), this.owner(userId));
    const usages: CreditUsage[] = [];
    for (const e of entries) {
      if (e.entryType !== 'debit') continue;
      const src = typeof e.sourceRef === 'string' ? e.sourceRef : '';
      if (!src.startsWith(`${COMPUTE_SOURCE_PREFIX}:`)) continue;
      const actionType = src.slice(COMPUTE_SOURCE_PREFIX.length + 1) as AIActionType;
      usages.push({
        id: e.id,
        userId,
        actionType,
        creditsUsed: Math.abs(Number.isFinite(e.amount) ? e.amount : 0),
        description: e.reason ?? `${actionType} action`,
        timestamp: new Date(e.createdAt).getTime(),
      });
    }
    // listEntries is already newest-first.
    return usages;
  }
}
