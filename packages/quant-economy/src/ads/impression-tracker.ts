import type { AdClick, AdImpression } from '../types.js';
import type { CompanyAdManager } from './campaign-manager.js';

export interface CampaignMetrics {
  impressions: number;
  clicks: number;
  ctr: number;
  spend: number;
}

export class ImpressionClickTracker {
  private impressions: AdImpression[] = [];
  private clicks: AdClick[] = [];
  private campaignManager: CompanyAdManager;

  private cpmRate = 5; // cost per 1000 impressions
  private cpcRate = 1; // cost per click

  constructor(campaignManager: CompanyAdManager, config?: { cpmRate?: number; cpcRate?: number }) {
    this.campaignManager = campaignManager;
    if (config?.cpmRate !== undefined) this.cpmRate = config.cpmRate;
    if (config?.cpcRate !== undefined) this.cpcRate = config.cpcRate;
  }

  recordImpression(campaignId: string, userId: string): boolean {
    if (!this.campaignManager.isActive(campaignId)) {
      return false;
    }

    const campaign = this.campaignManager.getCampaign(campaignId);
    if (!campaign) return false;

    if (campaign.billingModel === 'CPM') {
      this.campaignManager.addSpend(campaignId, this.cpmRate / 1000);
    }

    this.impressions.push({ campaignId, userId, timestamp: new Date() });
    return true;
  }

  recordClick(campaignId: string, userId: string): boolean {
    if (!this.campaignManager.isActive(campaignId)) {
      return false;
    }

    const campaign = this.campaignManager.getCampaign(campaignId);
    if (!campaign) return false;

    if (campaign.billingModel === 'CPC') {
      this.campaignManager.addSpend(campaignId, this.cpcRate);
    }

    this.clicks.push({ campaignId, userId, timestamp: new Date() });
    return true;
  }

  getCampaignMetrics(campaignId: string): CampaignMetrics {
    const impressions = this.impressions.filter((i) => i.campaignId === campaignId).length;
    const clicks = this.clicks.filter((c) => c.campaignId === campaignId).length;
    const ctr = impressions > 0 ? clicks / impressions : 0;
    const campaign = this.campaignManager.getCampaign(campaignId);
    const spend = campaign?.spent ?? 0;

    return { impressions, clicks, ctr, spend };
  }
}
