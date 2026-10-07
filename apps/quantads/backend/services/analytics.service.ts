import type { PrismaClient } from '../types';
import { createAppError } from '@quant/server-core';

export interface CampaignMetrics {
  campaignId: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  ctr: number;
  cpc: number;
  conversionRate: number;
}

export interface DailyReport {
  advertiserId: string;
  date: string;
  totalImpressions: number;
  totalClicks: number;
  totalSpend: number;
  activeCampaigns: number;
}

export interface ROIResult {
  campaignId: string;
  totalSpend: number;
  totalConversions: number;
  roi: number;
}

export class AnalyticsService {
  constructor(private readonly prisma: PrismaClient) {}

  async getCampaignMetrics(
    campaignId: string,
    _dateRange?: { start: Date; end: Date },
  ): Promise<CampaignMetrics> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || campaign.deletedAt) {
      throw createAppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    const ctr =
      campaign.totalImpressions > 0 ? campaign.totalClicks / campaign.totalImpressions : 0;
    const cpc = campaign.totalClicks > 0 ? campaign.totalSpend / campaign.totalClicks : 0;
    const conversionRate =
      campaign.totalClicks > 0 ? campaign.totalConversions / campaign.totalClicks : 0;

    return {
      campaignId: campaign.id,
      impressions: campaign.totalImpressions,
      clicks: campaign.totalClicks,
      conversions: campaign.totalConversions,
      spend: campaign.totalSpend,
      ctr,
      cpc,
      conversionRate,
    };
  }

  async getDailyReport(advertiserId: string, _date: string): Promise<DailyReport> {
    const campaigns = await this.prisma.campaign.findMany({
      where: { advertiserId, deletedAt: null },
    });

    const totalImpressions = campaigns.reduce(
      (sum: number, c: { totalImpressions: number }) => sum + c.totalImpressions,
      0,
    );
    const totalClicks = campaigns.reduce(
      (sum: number, c: { totalClicks: number }) => sum + c.totalClicks,
      0,
    );
    const totalSpend = campaigns.reduce(
      (sum: number, c: { totalSpend: number }) => sum + c.totalSpend,
      0,
    );
    const activeCampaigns = campaigns.filter(
      (c: { status: string }) => c.status === 'ACTIVE',
    ).length;

    return {
      advertiserId,
      date: _date,
      totalImpressions,
      totalClicks,
      totalSpend,
      activeCampaigns,
    };
  }

  async getROI(campaignId: string): Promise<ROIResult> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || campaign.deletedAt) {
      throw createAppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    // ROI = (conversions value - spend) / spend
    // Using conversions count as a proxy for value
    const roi = campaign.totalSpend > 0 ? campaign.totalConversions / campaign.totalSpend : 0;

    return {
      campaignId: campaign.id,
      totalSpend: campaign.totalSpend,
      totalConversions: campaign.totalConversions,
      roi,
    };
  }

  async getImpressions(
    campaignId: string,
    _dateRange?: { start: Date; end: Date },
  ): Promise<{ campaignId: string; impressions: number }> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || campaign.deletedAt) {
      throw createAppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    return { campaignId: campaign.id, impressions: campaign.totalImpressions };
  }

  async getClicks(
    campaignId: string,
    _dateRange?: { start: Date; end: Date },
  ): Promise<{ campaignId: string; clicks: number }> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || campaign.deletedAt) {
      throw createAppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    return { campaignId: campaign.id, clicks: campaign.totalClicks };
  }

  async getConversions(
    campaignId: string,
    _dateRange?: { start: Date; end: Date },
  ): Promise<{ campaignId: string; conversions: number }> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || campaign.deletedAt) {
      throw createAppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    return { campaignId: campaign.id, conversions: campaign.totalConversions };
  }

  async getCostReport(
    campaignId: string,
    _dateRange?: { start: Date; end: Date },
  ): Promise<{ campaignId: string; totalSpend: number; cpc: number; cpm: number }> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || campaign.deletedAt) {
      throw createAppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    const cpc = campaign.totalClicks > 0 ? campaign.totalSpend / campaign.totalClicks : 0;
    const cpm =
      campaign.totalImpressions > 0 ? (campaign.totalSpend / campaign.totalImpressions) * 1000 : 0;

    return {
      campaignId: campaign.id,
      totalSpend: campaign.totalSpend,
      cpc,
      cpm,
    };
  }
}
