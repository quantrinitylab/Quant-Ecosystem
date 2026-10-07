// ============================================================================
// Payments - Stripe Connect Service
// Express accounts for creator onboarding and payouts
// ============================================================================

import Stripe from 'stripe';
import { z } from 'zod';
import type { CreatorAccount, CreatorAccountStatus } from '../types';

export const CreateCreatorAccountSchema = z.object({
  creatorId: z.string().min(1),
  email: z.string().email(),
  country: z.string().min(2).max(2),
});

export const TransferToCreatorSchema = z.object({
  accountId: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.string().min(3).max(3),
});

export const CreatePayoutSchema = z.object({
  accountId: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.string().min(3).max(3),
});

export interface StripeConnectConfig {
  secretKey: string;
  platformAccountId?: string;
}

/**
 * StripeConnectService - Express accounts for creator onboarding
 *
 * Provides Stripe Connect integration for creating creator accounts,
 * managing onboarding, transferring funds, and initiating payouts.
 */
export class StripeConnectService {
  private readonly stripe: Stripe;
  private accounts: Map<string, CreatorAccount> = new Map();

  constructor(config: StripeConnectConfig) {
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
    });
  }

  /**
   * Create an Express account for a creator and return onboarding link
   */
  async createCreatorAccount(params: {
    creatorId: string;
    email: string;
    country: string;
  }): Promise<CreatorAccount> {
    const validated = CreateCreatorAccountSchema.parse(params);

    const account = await this.stripe.accounts.create({
      type: 'express',
      email: validated.email,
      country: validated.country,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    const accountLink = await this.stripe.accountLinks.create({
      account: account.id,
      refresh_url: `https://platform.example.com/reauth`,
      return_url: `https://platform.example.com/onboarding/complete`,
      type: 'account_onboarding',
    });

    const creatorAccount: CreatorAccount = {
      id: `ca_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      creatorId: validated.creatorId,
      stripeAccountId: account.id,
      status: 'pending',
      email: validated.email,
      country: validated.country,
      onboardingUrl: accountLink.url,
      createdAt: Date.now(),
    };

    this.accounts.set(creatorAccount.id, creatorAccount);
    return creatorAccount;
  }

  /**
   * Get account verification status
   */
  async getAccountStatus(
    accountId: string,
  ): Promise<{ status: CreatorAccountStatus; details: string }> {
    if (!accountId) throw new Error('accountId is required');

    const account = await this.stripe.accounts.retrieve(accountId);

    let status: CreatorAccountStatus = 'pending';
    let details = 'Account is pending verification';

    if (account.charges_enabled && account.payouts_enabled) {
      status = 'active';
      details = 'Account is fully verified and active';
    } else if (account.requirements?.disabled_reason) {
      status = 'restricted';
      details = `Account restricted: ${account.requirements.disabled_reason}`;
    }

    return { status, details };
  }

  /**
   * Transfer funds to a creator's connected account
   */
  async transferToCreator(params: {
    accountId: string;
    amount: number;
    currency: string;
  }): Promise<Stripe.Transfer> {
    const validated = TransferToCreatorSchema.parse(params);

    return this.stripe.transfers.create({
      amount: validated.amount,
      currency: validated.currency,
      destination: validated.accountId,
    });
  }

  /**
   * Initiate a payout from a connected account to their bank
   */
  async createPayout(params: {
    accountId: string;
    amount: number;
    currency: string;
  }): Promise<Stripe.Payout> {
    const validated = CreatePayoutSchema.parse(params);

    return this.stripe.payouts.create(
      {
        amount: validated.amount,
        currency: validated.currency,
      },
      {
        stripeAccount: validated.accountId,
      },
    );
  }
}
