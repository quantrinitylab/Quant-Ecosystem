import type { AdCampaign, BillingModel } from '../types.js';

export class CompanyAdManager {
  private campaigns = new Map<string, AdCampaign>();

  createCampaign(
    advertiserId: string,
    budget: number,
    targetingCriteria: Record<string, string>,
    billingModel: BillingModel,
  ): AdCampaign {
    const campaign: AdCampaign = {
      id: crypto.randomUUID(),
      advertiserId,
      budget,
      spent: 0,
      billingModel,
      targetingCriteria,
      sponsored: true,
      status: 'active',
      createdAt: new Date(),
    };
    this.campaigns.set(campaign.id, campaign);
    return campaign;
  }

  pauseCampaign(campaignId: string): AdCampaign | null {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || campaign.status === 'exhausted') return null;
    campaign.status = 'paused';
    return campaign;
  }

  resumeCampaign(campaignId: string): AdCampaign | null {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || campaign.status !== 'paused') return null;
    campaign.status = 'active';
    return campaign;
  }

  getCampaign(campaignId: string): AdCampaign | undefined {
    return this.campaigns.get(campaignId);
  }

  getCampaignStats(campaignId: string): AdCampaign | undefined {
    return this.campaigns.get(campaignId);
  }

  addSpend(campaignId: string, amount: number): boolean {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || campaign.status !== 'active') return false;

    campaign.spent += amount;
    if (campaign.spent >= campaign.budget) {
      campaign.status = 'exhausted';
    }
    return true;
  }

  isActive(campaignId: string): boolean {
    const campaign = this.campaigns.get(campaignId);
    return campaign?.status === 'active';
  }
}
