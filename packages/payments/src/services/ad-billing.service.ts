// ============================================================================
// Payments - Ad Billing Service
// Campaign budget management, impression/click/conversion billing with caps
// ============================================================================

import { z } from 'zod';
import type { AdBillingRecord, AdCampaign } from '../types';

export const CreateCampaignSchema = z.object({
  advertiserId: z.string().min(1),
  name: z.string().min(1),
  budget: z.number().positive(),
  dailyBudget: z.number().positive(),
  cpm: z.number().nonnegative(),
  cpc: z.number().nonnegative(),
  cpa: z.number().nonnegative(),
});

export const RecordImpressionSchema = z.object({
  campaignId: z.string().min(1),
});

/**
 * AdBillingService - Campaign budget management and billing
 *
 * Manages ad campaigns with budget caps. Records impressions, clicks,
 * and conversions with cost calculations (CPM, CPC, CPA).
 * Enforces daily and total budget limits.
 */
export class AdBillingService {
  private readonly campaigns: Map<string, AdCampaign> = new Map();
  private readonly billingRecords: AdBillingRecord[] = [];

  /**
   * Create a new ad campaign with budget constraints
   */
  createCampaign(params: {
    advertiserId: string;
    name: string;
    budget: number;
    dailyBudget: number;
    cpm: number;
    cpc: number;
    cpa: number;
  }): AdCampaign {
    const validated = CreateCampaignSchema.parse(params);

    const campaign: AdCampaign = {
      id: `camp_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      advertiserId: validated.advertiserId,
      name: validated.name,
      budget: validated.budget,
      dailyBudget: validated.dailyBudget,
      spent: 0,
      dailySpent: 0,
      cpm: validated.cpm,
      cpc: validated.cpc,
      cpa: validated.cpa,
      status: 'active',
      impressions: 0,
      clicks: 0,
      conversions: 0,
      createdAt: Date.now(),
    };

    this.campaigns.set(campaign.id, campaign);
    return { ...campaign };
  }

  /**
   * Record an ad impression, billing at CPM rate (cost per 1000 impressions)
   */
  recordImpression(campaignId: string): AdBillingRecord | null {
    RecordImpressionSchema.parse({ campaignId });
    const campaign = this.campaigns.get(campaignId);

    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    if (campaign.status !== 'active') {
      throw new Error(`Campaign is not active: ${campaign.status}`);
    }

    const cost = campaign.cpm / 1000;

    if (!this.canSpend(campaign, cost)) {
      campaign.status = 'exhausted';
      return null;
    }

    campaign.impressions += 1;
    campaign.spent += cost;
    campaign.dailySpent += cost;

    const record: AdBillingRecord = {
      id: `adbill_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      campaignId,
      type: 'impression',
      cost,
      timestamp: Date.now(),
    };

    this.billingRecords.push(record);
    return record;
  }

  /**
   * Record an ad click, billing at CPC rate
   */
  recordClick(campaignId: string): AdBillingRecord | null {
    const campaign = this.campaigns.get(campaignId);

    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    if (campaign.status !== 'active') {
      throw new Error(`Campaign is not active: ${campaign.status}`);
    }

    const cost = campaign.cpc;

    if (!this.canSpend(campaign, cost)) {
      campaign.status = 'exhausted';
      return null;
    }

    campaign.clicks += 1;
    campaign.spent += cost;
    campaign.dailySpent += cost;

    const record: AdBillingRecord = {
      id: `adbill_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      campaignId,
      type: 'click',
      cost,
      timestamp: Date.now(),
    };

    this.billingRecords.push(record);
    return record;
  }

  /**
   * Record a conversion, billing at CPA rate
   */
  recordConversion(campaignId: string): AdBillingRecord | null {
    const campaign = this.campaigns.get(campaignId);

    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    if (campaign.status !== 'active') {
      throw new Error(`Campaign is not active: ${campaign.status}`);
    }

    const cost = campaign.cpa;

    if (!this.canSpend(campaign, cost)) {
      campaign.status = 'exhausted';
      return null;
    }

    campaign.conversions += 1;
    campaign.spent += cost;
    campaign.dailySpent += cost;

    const record: AdBillingRecord = {
      id: `adbill_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      campaignId,
      type: 'conversion',
      cost,
      timestamp: Date.now(),
    };

    this.billingRecords.push(record);
    return record;
  }

  /**
   * Get campaign stats
   */
  getCampaignStats(campaignId: string): AdCampaign {
    const campaign = this.campaigns.get(campaignId);

    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    return { ...campaign };
  }

  /**
   * Pause a campaign
   */
  pauseCampaign(campaignId: string): AdCampaign {
    const campaign = this.campaigns.get(campaignId);

    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    campaign.status = 'paused';
    return { ...campaign };
  }

  /**
   * Reset daily spend counters (called by scheduler)
   */
  resetDailySpend(): void {
    for (const campaign of this.campaigns.values()) {
      campaign.dailySpent = 0;
      if (campaign.status === 'exhausted' && campaign.spent < campaign.budget) {
        // Check that remaining budget can serve at least one event at the cheapest rate
        const remaining = campaign.budget - campaign.spent;
        const cheapestRate = this.getCheapestRate(campaign);
        if (cheapestRate > 0 && remaining >= cheapestRate) {
          campaign.status = 'active';
        }
        // If cheapestRate is 0 (all rates are zero) or remaining < cheapestRate, stay exhausted
      }
    }
  }

  private getCheapestRate(campaign: AdCampaign): number {
    const rates: number[] = [];
    if (campaign.cpm > 0) rates.push(campaign.cpm / 1000);
    if (campaign.cpc > 0) rates.push(campaign.cpc);
    if (campaign.cpa > 0) rates.push(campaign.cpa);

    if (rates.length === 0) return 0;
    return Math.min(...rates);
  }

  private canSpend(campaign: AdCampaign, cost: number): boolean {
    if (campaign.spent + cost > campaign.budget) {
      return false;
    }
    if (campaign.dailySpent + cost > campaign.dailyBudget) {
      return false;
    }
    return true;
  }
}
